import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingReadiness, runActiveStagingProbes } from '../scripts/staging-readiness.mjs';

const good = () => ({
  HOTL_MODE: 'live', GUARDRAIL_WORKSPACE_ID: '11111111-1111-4111-8111-111111111111',
  GUARDRAIL_DATABASE_URL: 'postgresql://scoped@db.example.com/hotl', GUARDRAIL_AUTHORIZATION_VERSION: '1',
  SUPABASE_URL: 'https://auth.example.com', OWNER_USER_IDS: 'owner-1',
  AGENT_JWT_KEYS: JSON.stringify({ key1: 'x'.repeat(32) }), HOTL_PUBLIC_ORIGIN: 'https://owner.example.com',
  SHOPIFY_REDIRECT_URI: 'https://owner.example.com/api/shopify/oauth/callback',
  SHOPIFY_WEBHOOK_ORIGIN: 'https://hooks.example.com', SHOPIFY_CLIENT_ID: 'fixture-app', SHOPIFY_CLIENT_SECRET: 'fixture-secret-16',
  SHOPIFY_STAGING_SHOPS: 'pilot.myshopify.com', SHOPIFY_SCOPES: 'read_products,write_products,read_inventory,read_locations',
  SHOPIFY_RECONCILIATION_MODE: 'OWNER_MANUAL', HOTL_BACKUP_RESTORE_TARGET: 'staging-restore-drill-2026',
  HOTL_GUARDRAIL_READINESS_URL: 'https://guardrails.example.com/health/ready',
  HOTL_SHOPIFY_INGRESS_READINESS_URL: 'https://hooks.example.com/api/shopify/webhooks/health',
  KILL_SWITCH_STATE_URL: 'https://emergency.example.com/state',
  CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  KILL_SWITCH_URL: 'https://emergency.example.com', KILL_SWITCH_READ_TOKEN: 'fixture-independent-reader',
});

test('only a complete isolated HTTPS and scoped configuration passes static review', () => {
  const result = checkStagingReadiness(good());
  assert.equal(result.readyForOperatorReview, true);
  assert.deepEqual(result.staticConfiguration, { status: 'VERIFIED', evidenceScope: 'STATIC_CONFIGURATION_ONLY', missing: [] });
  assert.deepEqual(result.workerReadiness, { ingress: 'READY', worker: 'MANUAL_ONLY', reconciliation: 'MANUAL_ONLY', mode: 'OWNER_MANUAL' });
  assert.equal(result.activeProbes.status, 'NOT_RUN');
  assert.equal(result.externalStagingVerified, false);
});

test('default simulation, local callback, initialization switch and absent controls block staging', () => {
  const input = good();
  Object.assign(input, { HOTL_MODE: 'simulation', HOTL_PUBLIC_ORIGIN: 'http://localhost:3000',
    SHOPIFY_REDIRECT_URI: 'http://localhost:3000/api/shopify/oauth/callback',
    GUARDRAIL_INITIALIZE_EMPTY_DATABASE: 'true', KILL_SWITCH_READ_TOKEN: 'hotl-demo-kill-read-token' });
  const result = checkStagingReadiness(input);
  assert.equal(result.readyForOperatorReview, false);
  assert.deepEqual(new Set(result.failures.map(item => item.field)), new Set([
    'HOTL_MODE', 'GUARDRAIL_INITIALIZE_EMPTY_DATABASE', 'HOTL_PUBLIC_ORIGIN', 'SHOPIFY_REDIRECT_URI', 'KILL_SWITCH_READ_TOKEN',
  ]));
});

test('reports field names without echoing credential values', () => {
  const input = good();
  input.SHOPIFY_CLIENT_SECRET = '';
  input.AGENT_JWT_KEYS = '{invalid';
  input.CONNECTOR_ENCRYPTION_KEY = 'not-a-key';
  const output = JSON.stringify(checkStagingReadiness(input));
  assert.match(output, /SHOPIFY_CLIENT_SECRET/);
  assert.doesNotMatch(output, /not-a-key|fixture-independent-reader|postgresql:\/\//);
});

test('requires the runtime minimum Shopify client-secret length without treating the fixture as provider proof', () => {
  const input = good();
  for (let length = 1; length < 16; length++) {
    input.SHOPIFY_CLIENT_SECRET = 'x'.repeat(length);
    const result = checkStagingReadiness(input);
    assert.ok(result.failures.some(item => item.field === 'SHOPIFY_CLIENT_SECRET'), `length ${length} should block`);
  }
  input.SHOPIFY_CLIENT_SECRET = 'x'.repeat(16);
  const acceptedShape = checkStagingReadiness(input);
  assert.ok(!acceptedShape.failures.some(item => item.field === 'SHOPIFY_CLIENT_SECRET'));
  assert.equal(acceptedShape.externalStagingVerified, false);
  assert.equal(acceptedShape.activeProbes.status, 'NOT_RUN');
});

test('rejects IP-literal and local webhook origins even when they use HTTPS', () => {
  const input = good();
  input.SHOPIFY_WEBHOOK_ORIGIN = 'https://192.168.1.10';
  assert.equal(checkStagingReadiness(input).readyForOperatorReview, false);
  assert.ok(checkStagingReadiness(input).failures.some(item => item.field === 'SHOPIFY_WEBHOOK_ORIGIN'));
});

test('reports machine-readable missing configuration while keeping external verification false', () => {
  const result = checkStagingReadiness({});
  assert.equal(result.staticConfiguration.status, 'BLOCKED');
  assert.ok(result.staticConfiguration.missing.some(item => item.field === 'SHOPIFY_STAGING_SHOPS'));
  assert.ok(result.staticConfiguration.missing.some(item => item.field === 'SHOPIFY_RECONCILIATION_MODE'));
  assert.equal(result.externalStagingVerified, false);
});

test('active probes are opt-in, read-only GET requests, and preserve manual-worker status', async () => {
  const input = good();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/shopify/oauth/callback')) return { ok: false, status: 403, json: async () => ({}) };
    const body = String(url).endsWith('/health/ready')
      ? { status: 'ready', persistence: 'available', workspaceBinding: 'verified', runtimeRole: 'non-superuser-no-bypassrls', runtimeDdl: 'denied', killReader: 'reachable' }
      : String(url).endsWith('/state') ? { engaged: false, mode: 'live' }
        : { status: 'ready', ingressReady: true, workerReady: false, reconciliationReady: true, reconciliationMode: 'OWNER_MANUAL' };
    return { ok: true, status: 200, json: async () => body };
  };
  assert.equal(checkStagingReadiness(input).activeProbes.status, 'NOT_RUN');
  const active = await runActiveStagingProbes(input, { fetchImpl });
  assert.equal(active.status, 'PARTIALLY_VERIFIED');
  assert.equal(active.results.length, 4);
  assert.ok(active.results.every(item => item.status === 'VERIFIED'));
  assert.ok(active.results.some(item => item.worker === 'MANUAL_ONLY'));
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'error'));
  assert.equal(calls.find(call => call.url.endsWith('/state')).options.headers.authorization, 'Bearer fixture-independent-reader');
  assert.equal(JSON.stringify(active).includes('fixture-independent-reader'), false);
});

// Rule 3: the independent emergency plane must be a real deployment. A simulation-mode
// instance started with the repository's published demo credentials must not be able to
// satisfy the probe, even though it answers a well-formed /state body.
test('the emergency-plane probe rejects a simulation-mode kill service', async () => {
  const input = good();
  const fetchImpl = async url => {
    if (String(url).endsWith('/api/shopify/oauth/callback')) return { ok: false, status: 403, json: async () => ({}) };
    const body = String(url).endsWith('/health/ready')
      ? { status: 'ready', persistence: 'available', workspaceBinding: 'verified', runtimeRole: 'non-superuser-no-bypassrls', runtimeDdl: 'denied', killReader: 'reachable' }
      : String(url).endsWith('/state') ? { engaged: false, mode: 'simulation' }
        : { status: 'ready', ingressReady: true, workerReady: false, reconciliationReady: true, reconciliationMode: 'OWNER_MANUAL' };
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await runActiveStagingProbes(input, { fetchImpl });
  const kill = result.results.find(item => item.name === 'INDEPENDENT_KILL_STATE_READER');
  assert.equal(kill.status, 'BLOCKED');
  // The whole preflight must fail closed, not merely flag one probe.
  assert.equal(result.status, 'BLOCKED');
  // A well-formed response from the wrong emergency plane must never read as external proof.
  assert.equal(checkStagingReadiness(input).externalStagingVerified, false);
});

test('active probes block on absent endpoints and reject unsafe URLs without making requests', async () => {
  let count = 0;
  const missing = await runActiveStagingProbes({}, { fetchImpl: async () => { count++; throw new Error('unexpected request'); } });
  assert.equal(missing.status, 'BLOCKED');
  assert.deepEqual(missing.missing, ['HOTL_GUARDRAIL_READINESS_URL', 'HOTL_SHOPIFY_INGRESS_READINESS_URL', 'SHOPIFY_REDIRECT_URI', 'KILL_SWITCH_STATE_URL']);
  const input = good(); input.KILL_SWITCH_STATE_URL = 'http://127.0.0.1/state';
  const unsafe = await runActiveStagingProbes(input, { fetchImpl: async () => { count++; throw new Error('unexpected request'); } });
  assert.equal(unsafe.status, 'BLOCKED');
  assert.equal(count, 0);
});

test('guardrail active probe rejects a readiness response that omits the live no-DDL check', async () => {
  const input = good();
  const active = await runActiveStagingProbes(input, {
    fetchImpl: async url => {
      const isCallback = String(url).endsWith('/api/shopify/oauth/callback');
      const body = String(url).endsWith('/health/ready')
        ? { status: 'ready', persistence: 'available', workspaceBinding: 'verified', runtimeRole: 'non-superuser-no-bypassrls', killReader: 'reachable' }
        : String(url).endsWith('/state') ? { engaged: false }
          : { status: 'ready', ingressReady: true, workerReady: false, reconciliationReady: true, reconciliationMode: 'OWNER_MANUAL' };
      return { ok: !isCallback, status: isCallback ? 403 : 200, json: async () => body };
    },
  });
  assert.equal(active.status, 'BLOCKED');
  assert.equal(active.results.find(item => item.name === 'GUARDRAIL_DATABASE_WORKSPACE_AND_KILL_READER')?.status, 'BLOCKED');
});

test('durable worker and explicitly disabled modes are reported separately', () => {
  const input = good(); input.SHOPIFY_RECONCILIATION_MODE = 'DURABLE_BACKGROUND';
  assert.deepEqual(checkStagingReadiness(input).workerReadiness, { ingress: 'READY', worker: 'READY', reconciliation: 'READY', mode: 'DURABLE_BACKGROUND' });
  input.SHOPIFY_RECONCILIATION_MODE = 'DISABLED';
  assert.deepEqual(checkStagingReadiness(input).workerReadiness, { ingress: 'READY', worker: 'BLOCKED', reconciliation: 'BLOCKED', mode: 'DISABLED' });
});

test('validates finite overlap separately from a verified post-revocation grace', () => {
  const input = good(), now = Date.now();
  input.SHOPIFY_PREVIOUS_CLIENT_SECRET = 'old-fixture-secret';
  input.SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(checkStagingReadiness(input).failures.some(item => item.field.startsWith('SHOPIFY_PREVIOUS_CLIENT_SECRET')), false);
  input.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT = new Date(now - 30_000).toISOString();
  input.SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL = new Date(now + 30 * 60 * 1000).toISOString();
  assert.equal(checkStagingReadiness(input).failures.some(item => item.field.startsWith('SHOPIFY_PREVIOUS_CLIENT_SECRET')), false);
  input.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT = new Date(now + 30_000).toISOString();
  assert.ok(checkStagingReadiness(input).failures.some(item => item.field === 'SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT'));
});
