// Gate C preflight v2. Static configuration and explicit read-only HTTPS probes
// are separate evidence classes; neither performs a Shopify write or proves the Gate C drill.
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const shop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const localHost = hostname => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;
const present = value => typeof value === 'string' && value.trim().length > 0;
const publicHttps = value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && !localHost(parsed.hostname) ? parsed : null;
  } catch { return null; }
};
const canonicalDate = value => {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
};
const activeProbeRequirements = [
  'HOTL_GUARDRAIL_READINESS_URL',
  'HOTL_SHOPIFY_INGRESS_READINESS_URL',
  'SHOPIFY_REDIRECT_URI',
  'KILL_SWITCH_STATE_URL',
];
const activeProbeLimitations = [
  'RUNTIME_DATABASE_DDL_PRIVILEGES',
  'KILL_DEPLOYMENT_LOGICAL_INDEPENDENCE',
  'BACKUP_RESTORE_DRILL',
  'SHOPIFY_DEVELOPMENT_STORE_CONNECTIVITY',
  'SHOPIFY_PROVIDER_WEBHOOK_DELIVERY',
];

export function checkStagingReadiness(env) {
  const failures = [];
  const requireField = (name, valid, reason) => { if (!valid) failures.push({ field: name, reason }); };
  requireField('HOTL_MODE', env.HOTL_MODE === 'live', 'Must be live; the local simulation is not an external proof environment.');
  requireField('GUARDRAIL_WORKSPACE_ID', uuid.test(env.GUARDRAIL_WORKSPACE_ID ?? ''), 'A dedicated canonical workspace UUID is required.');
  let database;
  try { database = new URL(env.GUARDRAIL_DATABASE_URL); } catch { /* reported below */ }
  requireField('GUARDRAIL_DATABASE_URL', database && ['postgres:', 'postgresql:'].includes(database.protocol) && present(database.hostname) && present(database.username), 'A dedicated guardrail PostgreSQL login is required.');
  requireField('GUARDRAIL_INITIALIZE_EMPTY_DATABASE', env.GUARDRAIL_INITIALIZE_EMPTY_DATABASE !== 'true', 'Remove first-initialization permission after provisioning.');
  requireField('GUARDRAIL_INITIALIZE_EMPTY_FILE', env.GUARDRAIL_INITIALIZE_EMPTY_FILE !== 'true', 'File initialization cannot substitute for the staging database.');
  requireField('SUPABASE_URL', !!publicHttps(env.SUPABASE_URL), 'Owner issuer must be a trusted HTTPS origin.');
  requireField('OWNER_USER_IDS', present(env.OWNER_USER_IDS) || present(env.SUPABASE_OWNER_IDS), 'An explicit owner allowlist is required.');
  requireField('GUARDRAIL_AUTHORIZATION_VERSION', /^[1-9]\d*$/.test(env.GUARDRAIL_AUTHORIZATION_VERSION ?? ''), 'A positive authorization version is required.');
  let agentKeys;
  try { agentKeys = JSON.parse(env.AGENT_JWT_KEYS); } catch { /* reported below */ }
  requireField('AGENT_JWT_KEYS', agentKeys && typeof agentKeys === 'object' && !Array.isArray(agentKeys) && Object.keys(agentKeys).length > 0 && Object.values(agentKeys).every(value => typeof value === 'string' && value.length >= 32), 'A scoped signing-key ring is required.');
  const cockpit = publicHttps(env.HOTL_PUBLIC_ORIGIN);
  requireField('HOTL_PUBLIC_ORIGIN', cockpit && cockpit.pathname === '/', 'A trusted HTTPS owner origin is required.');
  const callback = publicHttps(env.SHOPIFY_REDIRECT_URI);
  requireField('SHOPIFY_REDIRECT_URI', callback && cockpit && callback.origin === cockpit.origin && callback.pathname === '/api/shopify/oauth/callback', 'The exact owner HTTPS callback must match the cockpit origin.');
  const webhook = publicHttps(env.SHOPIFY_WEBHOOK_ORIGIN);
  requireField('SHOPIFY_WEBHOOK_ORIGIN', webhook && webhook.pathname === '/', 'A public HTTPS guardrail webhook origin is required.');
  requireField('SHOPIFY_CLIENT_ID', present(env.SHOPIFY_CLIENT_ID), 'A development app ID is required.');
  requireField('SHOPIFY_CLIENT_SECRET', typeof env.SHOPIFY_CLIENT_SECRET === 'string' && env.SHOPIFY_CLIENT_SECRET.length >= 16, 'A development app secret of at least 16 characters is required in the guardrail environment.');
  requireField('SHOPIFY_STAGING_SHOPS', (env.SHOPIFY_STAGING_SHOPS ?? '').split(',').filter(Boolean).length === 1 && shop.test((env.SHOPIFY_STAGING_SHOPS ?? '').trim()), 'Exactly one explicitly allowlisted myshopify.com development store is required.');
  const scopes = new Set((env.SHOPIFY_SCOPES ?? '').split(',').map(value => value.trim()));
  requireField('SHOPIFY_SCOPES', ['read_products', 'write_products', 'read_inventory', 'read_locations'].every(value => scopes.has(value)), 'Required pilot read and product-write scopes are missing.');
  const encryption = env.CONNECTOR_ENCRYPTION_KEY ?? '';
  const decoded = Buffer.from(encryption, 'base64');
  requireField('CONNECTOR_ENCRYPTION_KEY', decoded.length === 32 && decoded.toString('base64') === encryption, 'A 32-byte base64 connector key is required.');
  const kill = publicHttps(env.KILL_SWITCH_URL);
  requireField('KILL_SWITCH_URL', !!kill && kill.pathname === '/' && (!cockpit || kill.origin !== cockpit.origin) && (!webhook || kill.origin !== webhook.origin), 'The emergency reader must use a trusted HTTPS root origin separate from the owner and webhook origins.');
  requireField('KILL_SWITCH_READ_TOKEN', present(env.KILL_SWITCH_READ_TOKEN) && env.KILL_SWITCH_READ_TOKEN !== 'hotl-demo-kill-read-token', 'A non-demo emergency read credential is required.');
  requireField('HOTL_BACKUP_RESTORE_TARGET', present(env.HOTL_BACKUP_RESTORE_TARGET), 'A named staging backup/restore target is required; this check does not prove a restore.');

  const mode = env.SHOPIFY_RECONCILIATION_MODE;
  requireField('SHOPIFY_RECONCILIATION_MODE', ['DURABLE_BACKGROUND', 'OWNER_MANUAL', 'DISABLED'].includes(mode), 'Choose DURABLE_BACKGROUND, OWNER_MANUAL for a deliberately operated drill, or DISABLED.');
  if (present(env.SHOPIFY_PREVIOUS_CLIENT_SECRET)) {
    const revokedAt = canonicalDate(env.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT);
    const validUntil = canonicalDate(env.SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL);
    const bounded = validUntil !== null && (revokedAt === null
      ? validUntil <= Date.now() + 30 * 24 * 60 * 60 * 1000
      : revokedAt <= Date.now() && validUntil > revokedAt && validUntil - revokedAt <= 60 * 60 * 1000);
    requireField('SHOPIFY_PREVIOUS_CLIENT_SECRET', env.SHOPIFY_PREVIOUS_CLIENT_SECRET !== env.SHOPIFY_CLIENT_SECRET, 'The previous and current app secrets must differ.');
    requireField('SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT', !present(env.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT) || (revokedAt !== null && revokedAt <= Date.now()), 'If recorded, Shopify-side revocation must be a canonical UTC timestamp in the past.');
    requireField('SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL', bounded && validUntil > Date.now(), 'The overlap deadline must be future-dated and within 30 days, or within one hour after verified revocation.');
  } else if (present(env.SHOPIFY_PREVIOUS_CLIENT_SECRET_REVOKED_AT) || present(env.SHOPIFY_PREVIOUS_CLIENT_SECRET_VALID_UNTIL)) {
    requireField('SHOPIFY_PREVIOUS_CLIENT_SECRET', false, 'Rotation timestamps cannot be configured without the previous secret.');
  }

  const ingressFields = new Set(['SHOPIFY_WEBHOOK_ORIGIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_STAGING_SHOPS']);
  const ingressFailures = failures.filter(item => ingressFields.has(item.field));
  const reconciliationMode = ['DURABLE_BACKGROUND', 'OWNER_MANUAL', 'DISABLED'].includes(mode) ? mode : 'DISABLED';
  const ingressReady = ingressFailures.length === 0;
  const workerReady = ingressReady && reconciliationMode === 'DURABLE_BACKGROUND';
  const reconciliationReady = ingressReady && reconciliationMode !== 'DISABLED';
  const missing = failures.map(item => ({ ...item }));
  return {
    schemaVersion: 2,
    staticConfiguration: { status: failures.length ? 'BLOCKED' : 'VERIFIED', evidenceScope: 'STATIC_CONFIGURATION_ONLY', missing },
    workerReadiness: {
      ingress: ingressReady ? 'READY' : 'BLOCKED',
      worker: workerReady ? 'READY' : reconciliationMode === 'OWNER_MANUAL' && ingressReady ? 'MANUAL_ONLY' : 'BLOCKED',
      reconciliation: reconciliationReady ? (reconciliationMode === 'OWNER_MANUAL' ? 'MANUAL_ONLY' : 'READY') : 'BLOCKED',
      mode: reconciliationMode,
    },
    activeProbes: { status: 'NOT_RUN', required: activeProbeRequirements, notProbed: activeProbeLimitations, results: [] },
    externalStagingVerified: false,
    readyForOperatorReview: failures.length === 0,
    failures,
  };
}

function safeProbeUrl(value, pathname) {
  const parsed = publicHttps(value);
  return parsed && parsed.pathname === pathname ? parsed : null;
}

export async function runActiveStagingProbes(env, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const required = activeProbeRequirements.filter(name => !present(env[name]));
  if (required.length) return { status: 'BLOCKED', required: activeProbeRequirements, notProbed: activeProbeLimitations, missing: required, results: [] };
  const guardrail = safeProbeUrl(env.HOTL_GUARDRAIL_READINESS_URL, '/health/ready');
  const ingress = safeProbeUrl(env.HOTL_SHOPIFY_INGRESS_READINESS_URL, '/api/shopify/webhooks/health');
  const callback = safeProbeUrl(env.SHOPIFY_REDIRECT_URI, '/api/shopify/oauth/callback');
  const kill = safeProbeUrl(env.KILL_SWITCH_STATE_URL, '/state');
  if (!guardrail || !ingress || !callback || !kill || !present(env.KILL_SWITCH_READ_TOKEN)) {
    return { status: 'BLOCKED', required: activeProbeRequirements, notProbed: activeProbeLimitations, missing: ['HTTPS endpoints with the exact read-only paths and KILL_SWITCH_READ_TOKEN'], results: [] };
  }
  const probes = [
    { name: 'GUARDRAIL_DATABASE_WORKSPACE_AND_KILL_READER', url: guardrail, headers: {}, check: (response, body) => response.ok && body.status === 'ready' && body.persistence === 'available' && body.workspaceBinding === 'verified' && body.runtimeRole === 'non-superuser-no-bypassrls' && body.runtimeDdl === 'denied' && body.killReader === 'reachable' },
    { name: 'SHOPIFY_INGRESS_AND_RECONCILIATION_MODE', url: ingress, headers: {}, check: (response, body) => response.ok && body.status === 'ready' && body.ingressReady === true && body.reconciliationReady === true },
    { name: 'SHOPIFY_OAUTH_CALLBACK_ROUTE', url: callback, headers: {}, check: response => response.status === 403 },
    { name: 'INDEPENDENT_KILL_STATE_READER', url: kill, headers: { authorization: `Bearer ${env.KILL_SWITCH_READ_TOKEN}` }, check: (response, body) => response.ok && typeof body.engaged === 'boolean' },
  ];
  const results = await Promise.all(probes.map(async probe => {
    try {
      const response = await fetchImpl(probe.url, { method: 'GET', headers: probe.headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      let body = {};
      try { body = await response.json(); } catch { /* response details are intentionally not retained */ }
      const passed = probe.check(response, body);
      return { name: probe.name, status: passed ? 'VERIFIED' : 'BLOCKED', httpStatus: response.status,
        ...(probe.name === 'SHOPIFY_INGRESS_AND_RECONCILIATION_MODE' && body.reconciliationMode === 'OWNER_MANUAL' ? { mode: 'OWNER_MANUAL', worker: 'MANUAL_ONLY' } : {}) };
    } catch {
      return { name: probe.name, status: 'BLOCKED', reason: 'UNREACHABLE_OR_INVALID_RESPONSE' };
    }
  }));
  return { status: results.every(item => item.status === 'VERIFIED') ? 'PARTIALLY_VERIFIED' : 'BLOCKED', required: activeProbeRequirements, notProbed: activeProbeLimitations, missing: [], results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const active = process.argv.includes('--active');
  const json = process.argv.includes('--json');
  const result = checkStagingReadiness(process.env);
  if (active) result.activeProbes = await runActiveStagingProbes(process.env);
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    for (const failure of result.failures) process.stdout.write(`STATIC ${failure.field}: ${failure.reason}\n`);
    if (active) for (const probe of result.activeProbes.results) process.stdout.write(`ACTIVE ${probe.name}: ${probe.status}${probe.httpStatus ? ` (HTTP ${probe.httpStatus})` : ''}\n`);
    process.stdout.write(result.readyForOperatorReview
      ? 'Static configuration verified only; external staging and the Shopify drill remain unverified.\n'
      : 'Static staging configuration blocked. No Shopify mutation was attempted.\n');
    if (!active) process.stdout.write('Read-only HTTPS probes were not run; pass --active to request them explicitly.\n');
  }
  process.exitCode = result.readyForOperatorReview && (!active || result.activeProbes.status === 'PARTIALLY_VERIFIED') ? 0 : 1;
}
