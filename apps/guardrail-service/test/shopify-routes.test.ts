import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';
import { shopifyData } from '../src/shopify-state.js';
import type { EngineState } from '../src/types.js';

const base = '/api/guardrails/v1/shopify';
const secret = 'http-fixture-shopify-secret-not-real';
const shop = 'http-fixture.myshopify.com';
const encryptedFixture = [Buffer.alloc(12, 1).toString('base64'), Buffer.alloc(16, 2).toString('base64'), Buffer.from('{}').toString('base64')].join('.');
const ownerHeaders = { 'x-hotl-internal-token': 'http-fixture-internal', 'idempotency-key': 'http-fixture-key' };
const directories: string[] = [];
const servers: Awaited<ReturnType<typeof createServer>>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    const path = resolve(directory);
    if (!path.startsWith(`${resolve(tmpdir())}${sep}hotl-shopify-http-`)) throw new Error('Unsafe fixture cleanup');
    await rm(path, { recursive: true, force: true });
  }
});

async function fixture() {
  vi.stubEnv('SHOPIFY_CLIENT_ID', 'http-fixture-client');
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', secret);
  vi.stubEnv('SHOPIFY_REDIRECT_URI', 'https://hotl.example.org/api/shopify/oauth/callback');
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('SHOPIFY_WORKER_ENABLED', 'false');
  vi.stubEnv('SHOPIFY_RECONCILIATION_MODE', 'OWNER_MANUAL');
  vi.stubEnv('SHOPIFY_SCOPES', 'read_products,write_products,read_inventory,read_locations');
  const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error('Unexpected external request in HTTP fixture'); });
  vi.stubGlobal('fetch', fetch);
  const directory = await mkdtemp(join(tmpdir(), 'hotl-shopify-http-')); directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  const engine = await createEngine({ filePath, seed: false });
  const app = await createServer({ engine, mode: 'simulation', internalToken: ownerHeaders['x-hotl-internal-token'], workspaceId: 'http-workspace' });
  servers.push(app);
  const start = async () => {
    const response = await app.inject({ method: 'POST', url: `${base}/install`, headers: ownerHeaders, payload: { shop } });
    expect(response.statusCode).toBe(200);
    const state = new URL(response.json().authorizationUrl).searchParams.get('state')!;
    const fields = { code: 'http-fixture-code', shop, state, timestamp: String(Math.floor(Date.now() / 1000)) };
    const canonical = Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
    const query = new URLSearchParams({ ...fields, hmac: createHmac('sha256', secret).update(canonical).digest('hex') }).toString();
    return { response, query, cookie: String(response.headers['set-cookie']).split(';')[0] };
  };
  const install = async () => {
    const started = await start();
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ access_token: 'http-fixture-access-token', refresh_token: 'http-fixture-refresh-token', scope: 'write_products,read_inventory,read_locations', expires_in: 3600, refresh_token_expires_in: 7_776_000 })));
    const response = await app.inject({ url: `/api/shopify/oauth/callback?${started.query}`, headers: { cookie: started.cookie } });
    expect(response.statusCode).toBe(200);
    return { ...started, callback: response, id: response.json().installationId as string };
  };
  return { app, engine, filePath, fetch, start, install };
}

function addInstallationFixture(state: EngineState, installationId: string) {
  const now = new Date(), installedAt = now.toISOString();
  state.extensions ??= {};
  state.extensions.shopifyOAuth = { version: 1, workspaceId: 'http-workspace', pending: [], installations: [{
    id: installationId, workspaceId: 'http-workspace', ownerId: 'simulation-owner', shop, clientId: 'http-fixture-client',
    revision: 1, scopes: ['read_products', 'write_products'], status: 'INSTALLED', createdAt: installedAt,
    installedAt, expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    refreshExpiresAt: new Date(now.getTime() + 86_400_000).toISOString(), encryptedTokens: encryptedFixture,
  }] };
}

describe('Shopify HTTP authorization and delivery boundaries', () => {
  it('does not present simulation endpoints as live ingress or database readiness', async () => {
    const f = await fixture();
    expect((await f.app.inject({ url: '/health/ready' })).statusCode).toBe(503);
    const ingress = await f.app.inject({ url: '/api/shopify/webhooks/health' });
    expect(ingress.statusCode).toBe(503);
    expect(ingress.json()).toMatchObject({ status: 'not_ready', ingressReady: false, workerReady: false, reconciliationReady: false });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('honors an explicitly disabled reconciliation mode on the owner worker route', async () => {
    const f = await fixture();
    vi.stubEnv('SHOPIFY_RECONCILIATION_MODE', 'DISABLED');
    const response = await f.app.inject({ method: 'POST', url: `${base}/worker`, headers: ownerHeaders, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SHOPIFY_WORKER_DISABLED');
    expect(shopifyData(await f.engine.snapshot()).jobs).toEqual([]);
  });

  it('requires authenticated owners across every private Shopify route', async () => {
    const f = await fixture(), id = randomUUID();
    const paths = ['install', `installations/${id}/sync`, `installations/${id}/subscriptions/ensure`, `installations/${id}/disconnect`, 'economics', 'prices/propose', `prices/${id}/execute`, `prices/${id}/reconcile`, `prices/${id}/cancel`, `prices/${id}/investigations`, 'worker'];
    for (const headers of [{}, { ...ownerHeaders, 'x-hotl-agent-id': 'marketing_agent' }]) {
      const expected = 'x-hotl-agent-id' in headers ? 403 : 401;
      expect((await f.app.inject({ url: '/api/shopify', headers })).statusCode).toBe(expected);
      for (const path of paths) expect((await f.app.inject({ method: 'POST', url: `${base}/${path}`, headers, payload: {} })).statusCode, path).toBe(expected);
    }
    expect(f.fetch).not.toHaveBeenCalled();
    expect(shopifyData(await f.engine.snapshot()).jobs).toEqual([]);
  });

  it('rejects unknown body fields and invalid resource identifiers before mutation', async () => {
    const f = await fixture(), id = randomUUID(), before = await f.engine.snapshot();
    for (const path of [`installations/${id}/sync`, `prices/${id}/execute`, `prices/${id}/reconcile`, 'worker']) {
      const response = await f.app.inject({ method: 'POST', url: `${base}/${path}`, headers: ownerHeaders, payload: { bypass: true } });
      expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    for (const [path, payload] of [['install', { shop, ownerId: 'spoofed-owner' }], [`installations/${id}/subscriptions/ensure`, { topic: 'products/update', force: true }], [`installations/${id}/disconnect`, { expectedRevision: 1, force: true }], [`prices/${id}/cancel`, { reason: 'Cancel this pending proposal', force: true }], [`prices/${id}/cancel`, { reason: 'short' }], [`prices/${id}/investigations`, { expectedStatus: 'UNKNOWN', expectedReconciliationAt: null, expectedReconciliationRevision: null, nextStep: 'KEEP_RESOURCE_BLOCKED', note: 'Provider evidence is still being collected.', evidence: [], clearLock: true }], ['installations/not-a-uuid/sync', {}]] as const) {
      expect((await f.app.inject({ method: 'POST', url: `${base}/${path}`, headers: ownerHeaders, payload })).statusCode).toBe(400);
    }
    expect(await f.engine.snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it('requires bounded idempotency keys before worker passes, execution, or installation', async () => {
    const f = await fixture(), before = await f.engine.snapshot();
    for (const key of ['', 'k'.repeat(201)]) {
      for (const path of ['worker', `prices/${randomUUID()}/execute`, `prices/${randomUUID()}/cancel`, `prices/${randomUUID()}/investigations`, `installations/${randomUUID()}/subscriptions/ensure`, 'install']) {
        const payload = path === 'install' ? { shop } : path.endsWith('/cancel') ? { reason: 'Cancel this pending proposal' } : path.endsWith('/ensure') ? { topic: 'products/update' } : path.endsWith('/investigations') ? { expectedStatus: 'UNKNOWN', expectedReconciliationAt: null, expectedReconciliationRevision: null, nextStep: 'KEEP_RESOURCE_BLOCKED', note: 'Provider evidence is still being collected.', evidence: [] } : {};
        const response = await f.app.inject({ method: 'POST', url: `${base}/${path}`, headers: { ...ownerHeaders, 'idempotency-key': key }, payload });
        expect(response.json().error.code, path).toBe('IDEMPOTENCY_KEY_REQUIRED');
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
      }
    }
    expect(await f.engine.snapshot()).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it('cancels an owner proposal through HTTP once and preserves its audit after restart', async () => {
    const f = await fixture(), id = randomUUID(), installationId = randomUUID();
    const reason = 'Owner withdrew the proposed staging price';
    await f.engine.extensionTransaction('integration.http-fixture.price', { id }, { type: 'owner', id: 'simulation-owner' }, 'seed-price', state => {
      addInstallationFixture(state, installationId);
      shopifyData(state).operations.push({
        id, ownerId: 'simulation-owner', installationRevision: 1,
        input: { installationId, variantId: 'gid://shopify/ProductVariant/123', expectedRevision: 1,
          expectedConstitutionVersion: 1, price: '110.00', reason: 'Previously reviewed price proposal' },
        before: { installationId, ownerId: 'simulation-owner', variantId: 'gid://shopify/ProductVariant/123',
          productId: 'gid://shopify/Product/12', title: 'Fixture item', sku: 'FIXTURE', price: '100.00',
          currency: 'USD', providerRevision: new Date().toISOString(), observedAt: new Date().toISOString(),
          revision: 1, requestId: null },
        createdAt: new Date().toISOString(), status: 'PENDING',
      });
      return { seeded: true };
    });
    const url = `${base}/prices/${id}/cancel`;
    const cancelled = await f.app.inject({ method: 'POST', url, headers: ownerHeaders, payload: { reason } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ decision: 'allow', operationId: id, status: 'CANCELLED' });
    const repeated = await f.app.inject({ method: 'POST', url, headers: ownerHeaders, payload: { reason } });
    expect(repeated.json()).toEqual(cancelled.json());
    expect((await f.app.inject({ method: 'POST', url, headers: { ...ownerHeaders, 'idempotency-key': 'new-cancel-key' }, payload: { reason } })).json().error.code).toBe('OPERATION_NOT_CANCELLABLE');
    const restored = await createEngine({ filePath: f.filePath, seed: false });
    const state = await restored.snapshot();
    expect(shopifyData(state).operations[0]).toMatchObject({ status: 'CANCELLED', cancellation: { reason, actorId: 'simulation-owner' } });
    expect(state.audit.filter(event => event.eventType === 'shopify.price.cancelled')).toHaveLength(1);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('records an unresolved investigation through the owner HTTP route without clearing the lock', async () => {
    const f = await fixture(), id = randomUUID(), installationId = randomUUID();
    await f.engine.extensionTransaction('integration.http-fixture.unknown-price', { id }, { type: 'owner', id: 'simulation-owner' }, 'seed-unknown', state => {
      addInstallationFixture(state, installationId);
      shopifyData(state).operations.push({ id, ownerId: 'simulation-owner', installationRevision: 1,
        input: { installationId, variantId: 'gid://shopify/ProductVariant/123', expectedRevision: 1, expectedConstitutionVersion: 1,
          price: '110.00', reason: 'Owner reviewed the staging price proposal' },
        before: { installationId, ownerId: 'simulation-owner', variantId: 'gid://shopify/ProductVariant/123', productId: 'gid://shopify/Product/12',
          title: 'Fixture', sku: 'FIXTURE', price: '100.00', currency: 'USD', providerRevision: new Date().toISOString(), observedAt: new Date().toISOString(), revision: 1, requestId: null },
        createdAt: new Date().toISOString(), status: 'UNKNOWN', receipt: {
          provider: 'shopify', environment: 'staging', operationId: id, workspaceId: 'http-workspace', actorId: 'simulation-owner',
          authorization: { constitutionVersion: 1, resourceRevision: 1, installationRevision: 1 },
          dispatchedAt: new Date().toISOString(), completedAt: new Date().toISOString(), requestId: null,
          before: { variantId: 'gid://shopify/ProductVariant/123', productId: 'gid://shopify/Product/12', price: '100.00',
            currency: 'USD', providerRevision: new Date().toISOString(), requestId: null }, requestedPrice: '110.00', outcome: 'UNKNOWN',
        } });
      return { seeded: true };
    });
    const body = { expectedStatus: 'UNKNOWN', expectedReconciliationAt: null, expectedReconciliationRevision: null, nextStep: 'KEEP_RESOURCE_BLOCKED',
      note: 'The owner will wait for authoritative provider event evidence.', evidence: [] };
    const response = await f.app.inject({ method: 'POST', url: `${base}/prices/${id}/investigations`, headers: ownerHeaders, payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'UNKNOWN', lockRetained: true, verifiedProviderEvidence: false });
    expect((await f.app.inject({ url: '/api/shopify', headers: ownerHeaders })).json().operations[0].investigations).toHaveLength(1);
    const state = await (await createEngine({ filePath: f.filePath, seed: false })).snapshot();
    expect(shopifyData(state).operations[0].status).toBe('UNKNOWN');
    expect(state.audit.filter(event => event.eventType === 'shopify.price.investigation-recorded')).toHaveLength(1);
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('rejects missing, duplicate, and mismatched browser cookies without consuming the callback', async () => {
    const f = await fixture(), started = await f.start();
    for (const cookie of ['', `${started.cookie}; ${started.cookie}`, 'hotl_shopify_oauth=incorrect']) {
      const response = await f.app.inject({ url: `/api/shopify/oauth/callback?${started.query}`, headers: { cookie } });
      expect(response.statusCode).toBe(403); expect(response.json().error.code).toBe('SHOPIFY_CALLBACK_INVALID');
    }
    expect(f.fetch).not.toHaveBeenCalled();
    expect((await f.app.inject({ url: '/api/shopify', headers: ownerHeaders })).json().installations[0].status).toBe('AUTHORIZING');
  });

  it('does not disclose or mutate another owner installation through guessed IDs', async () => {
    const f = await fixture(), installed = await f.install();
    await f.engine.extensionTransaction('integration.http-fixture.transfer', {}, { type: 'owner', id: 'simulation-owner' }, 'fixture-transfer', state => {
      const auth = state.extensions!.shopifyOAuth as { installations: { ownerId: string }[] };
      auth.installations[0].ownerId = 'different-owner';
      for (const job of shopifyData(state).jobs) job.ownerId = 'different-owner';
      return {};
    });
    const overview = await f.app.inject({ url: '/api/shopify', headers: ownerHeaders });
    expect(overview.statusCode).toBe(200); expect(overview.json().installations).toEqual([]); expect(overview.json().jobs).toEqual([]);
    for (const operation of ['sync', 'disconnect']) {
      const response = await f.app.inject({ method: 'POST', url: `${base}/installations/${installed.id}/${operation}`, headers: { ...ownerHeaders, 'idempotency-key': `other-owner-${operation}` }, payload: operation === 'disconnect' ? { expectedRevision: 2 } : {} });
      expect(response.statusCode).toBe(404); expect(response.json().error.code).toBe('SHOPIFY_INSTALLATION_NOT_FOUND');
    }
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('finishes a browser-bound callback, clears its cookie, and durably queues initial synchronization', async () => {
    const f = await fixture(), installed = await f.install();
    expect(String(installed.response.headers['set-cookie'])).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(installed.callback.headers['cache-control']).toBe('no-store');
    expect(installed.callback.headers['set-cookie']).toBe('hotl_shopify_oauth=; Path=/api/shopify/oauth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    const restarted = await createEngine({ filePath: f.filePath, seed: false });
    expect(shopifyData(await restarted.snapshot()).jobs).toMatchObject([{ installationId: installed.id, status: 'PENDING' }]);
    const overview = await f.app.inject({ url: '/api/shopify', headers: ownerHeaders });
    expect(overview.json().installations[0]).toMatchObject({ id: installed.id, status: 'INSTALLED' });
    for (const sensitive of ['encryptedTokens', 'http-fixture-access-token', 'http-fixture-refresh-token', secret]) expect(overview.body).not.toContain(sensitive);
    expect(await readFile(f.filePath, 'utf8')).not.toContain('http-fixture-access-token');
    expect((await f.app.inject({ url: `/api/shopify/oauth/callback?${installed.query}`, headers: { cookie: installed.cookie } })).json().error.code).toBe('SHOPIFY_STATE_CONSUMED');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('verifies exact raw bytes, persists before 202, and deduplicates webhook redelivery after restart', async () => {
    const f = await fixture(), installed = await f.install();
    const body = `{ "id": 123, "title": "café", "description": "${'x'.repeat(140_000)}" }\n`;
    const headers = { 'content-type': 'application/json', 'x-shopify-hmac-sha256': createHmac('sha256', secret).update(body).digest('base64'), 'x-shopify-webhook-id': 'http-delivery-1', 'x-shopify-topic': 'products/update' };
    const url = `/api/shopify/webhooks/${installed.id}`;
    const changed = await f.app.inject({ method: 'POST', url, headers, payload: JSON.stringify(JSON.parse(body)) });
    expect(changed.statusCode).toBe(401); expect(changed.json().error.code).toBe('INVALID_WEBHOOK');
    expect(shopifyData(await f.engine.snapshot()).inbox).toEqual([]);
    const accepted = await f.app.inject({ method: 'POST', url, headers, payload: body });
    expect(accepted.statusCode).toBe(202); expect(accepted.json()).toMatchObject({ accepted: true, duplicate: false });
    await f.app.close();
    const restored = await createEngine({ filePath: f.filePath, seed: false });
    expect(shopifyData(await restored.snapshot()).inbox).toMatchObject([{ status: 'PENDING', installationId: installed.id }]);
    const app = await createServer({ engine: restored, mode: 'simulation', workspaceId: 'http-workspace', internalToken: ownerHeaders['x-hotl-internal-token'] }); servers.push(app);
    const repeated = await app.inject({ method: 'POST', url, headers, payload: body });
    expect(repeated.statusCode).toBe(202); expect(repeated.json()).toEqual(accepted.json());
    const newDelivery = await app.inject({ method: 'POST', url, headers: { ...headers, 'x-shopify-webhook-id': 'http-delivery-2' }, payload: body });
    expect(newDelivery.statusCode).toBe(202); expect(newDelivery.json().duplicate).toBe(true);
    expect(shopifyData(await restored.snapshot()).inbox).toHaveLength(1);
    expect(shopifyData(await restored.snapshot()).variants).toEqual([]);
    expect(await readFile(f.filePath, 'utf8')).not.toContain('café');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a validly signed changed-body replay and oversized webhook before intake', async () => {
    const f = await fixture(), installed = await f.install(), url = `/api/shopify/webhooks/${installed.id}`;
    const deliver = (payload: string) => f.app.inject({ method: 'POST', url, payload, headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': createHmac('sha256', secret).update(payload).digest('base64'), 'x-shopify-webhook-id': 'http-fixed-delivery', 'x-shopify-topic': 'products/update' } });
    expect((await deliver('{"id":1}')).statusCode).toBe(202);
    const changed = await deliver('{"id":2}');
    expect(changed.statusCode).toBe(409); expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await deliver(JSON.stringify({ id: 3, padding: 'x'.repeat(2 * 1024 * 1024) }))).statusCode).toBe(413);
    expect(shopifyData(await f.engine.snapshot()).inbox).toHaveLength(1);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
