import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import { createEngine } from '../src/engine.js';
import { createServer } from '../src/server.js';
import { shopifyData } from '../src/shopify-state.js';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';
const issuer = 'https://isolation-fixture.supabase.co/auth/v1';
const shopify = '/api/guardrails/v1/shopify';
const guardrails = '/api/guardrails/v1';
const servers: Awaited<ReturnType<typeof createServer>>[] = [];
let ownerPrivateKey: CryptoKey;
let ownerKeyResolver: JWTVerifyGetKey;

beforeAll(async () => {
  const keys = await generateKeyPair('ES256');
  ownerPrivateKey = keys.privateKey;
  ownerKeyResolver = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), alg: 'ES256', kid: 'isolation-key' }] });
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function token(ownerId: string, workspaceId: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: ownerId, iss: issuer, aud: 'authenticated', iat: now, exp: now + 300,
    session_id: `session-${ownerId}-${workspaceId}`,
    app_metadata: { role: 'owner', workspace_id: workspaceId, authorization_version: 1 },
  }).setProtectedHeader({ alg: 'ES256', kid: 'isolation-key' }).sign(ownerPrivateKey);
}

async function fixture(workspaceId: string, ownerId: string) {
  vi.stubEnv('SHOPIFY_CLIENT_ID', 'isolation-fixture-client');
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'isolation-fixture-client-secret');
  vi.stubEnv('SHOPIFY_REDIRECT_URI', 'https://isolation.example.test/api/shopify/oauth/callback');
  vi.stubEnv('SHOPIFY_WEBHOOK_ORIGIN', 'https://isolation.example.test');
  vi.stubEnv('CONNECTOR_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
  vi.stubEnv('SHOPIFY_WORKER_ENABLED', 'false');
  const external = vi.fn<typeof globalThis.fetch>(async () => { throw new Error('Provider request escaped isolation test'); });
  vi.stubGlobal('fetch', external);
  const engine = await createEngine({ mode: 'live', seed: false });
  const installationId = randomUUID(), operationId = randomUUID(), unresolvedId = randomUUID();
  const variantId = 'gid://shopify/ProductVariant/123';
  const observedAt = new Date().toISOString();
  const variant = {
    installationId, ownerId, variantId, productId: 'gid://shopify/Product/12', title: 'Private fixture item',
    sku: 'PRIVATE-SKU', price: '100.00', currency: 'USD', providerRevision: observedAt,
    requestId: null, revision: 1, observedAt,
  };
  const { installationId: _installationId, ownerId: _ownerId, title: _title, sku: _sku, revision: _revision, observedAt: _observedAt, ...beforeObservation } = variant;
  const afterObservation = { ...beforeObservation, price: '105.00', providerRevision: new Date(Date.parse(observedAt) + 1000).toISOString() };
  const input = { installationId, variantId, expectedRevision: 1, expectedConstitutionVersion: 1,
    price: '105.00', reason: 'Owner reviewed the private fixture price' };
  await engine.extensionTransaction('integration.isolation.seed', { installationId }, { type: 'owner', id: ownerId }, `seed-${workspaceId}-${ownerId}`, state => {
    state.extensions ??= {};
    state.extensions.shopifyOAuth = { version: 1, workspaceId, installations: [{
      id: installationId, workspaceId, ownerId, shop: 'isolation-fixture.myshopify.com',
      clientId: 'isolation-fixture-client', revision: 1, scopes: ['read_products', 'write_products'],
      status: 'INSTALLED', createdAt: observedAt, installedAt: observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 86400000).toISOString(),
      refreshExpiresAt: new Date(Date.parse(observedAt) + 86400000 * 7).toISOString(),
      encryptedTokens: [Buffer.alloc(12, 1).toString('base64'), Buffer.alloc(16, 2).toString('base64'), Buffer.from('{}').toString('base64')].join('.'),
    }], pending: [] };
    const commerce = shopifyData(state);
    commerce.variants.push(variant);
    commerce.snapshots.push({ installationId, ownerId, observedAt, products: [], inventory: [], orders: [], locations: [] });
    commerce.jobs.push({ id: randomUUID(), installationId, ownerId, status: 'PENDING', attempts: 0, createdAt: observedAt });
    commerce.inbox.push({ id: randomUUID(), installationId, ownerId, digest: createHash('sha256').update('private-digest').digest('hex'), deliveryId: 'private-delivery',
      topic: 'products/update', receivedAt: observedAt, status: 'PENDING', attempts: 0 });
    commerce.operations.push({ id: operationId, ownerId, installationRevision: 1, input, before: variant,
      createdAt: observedAt, status: 'CONFIRMED', receipt: {
        provider: 'shopify', environment: 'staging', operationId, workspaceId, actorId: ownerId,
        authorization: { constitutionVersion: 1, resourceRevision: 1, installationRevision: 1 },
        dispatchedAt: observedAt, completedAt: observedAt, requestId: 'private-provider-request',
        before: beforeObservation, after: afterObservation, requestedPrice: '105.00', outcome: 'CONFIRMED',
      } });
    commerce.operations.push({ id: unresolvedId, ownerId, installationRevision: 1, input, before: variant,
      createdAt: observedAt, status: 'UNKNOWN', receipt: { provider: 'shopify', environment: 'staging', operationId: unresolvedId, workspaceId, actorId: ownerId,
        authorization: { constitutionVersion: 1, resourceRevision: 1, installationRevision: 1 }, dispatchedAt: observedAt, completedAt: observedAt,
        requestId: null, before: beforeObservation, requestedPrice: '105.00', outcome: 'UNKNOWN' }, investigations: [{
        id: randomUUID(), at: observedAt, reviewerId: ownerId, expectedStatus: 'UNKNOWN',
        expectedReconciliationAt: null, expectedReconciliationRevision: null,
        nextStep: 'KEEP_RESOURCE_BLOCKED', note: 'Provider result still needs independent confirmation.',
        evidence: [{ source: 'INTERNAL_AUDIT', reference: 'private-audit-record' }],
        reconciliation: null, verifiedProviderEvidence: false,
      }] });
    state.interrupts.push({ id: `approval-${ownerId}`, runId: `run-${ownerId}`, threadId: `run-${ownerId}`,
      category: 'refund_escrow', title: 'Private approval', summary: 'Owner review required', agentName: 'Support agent',
      priority: 'high', payload: { orderId: `order-${ownerId}`, amount: 42 }, status: 'pending',
      createdAt: observedAt, expiresAt: null, requiredAction: 'approve|reject|modify' });
    return { seeded: true };
  });
  const app = await createServer({ engine, mode: 'live', workspaceId, ownerUserIds: ['owner-a', 'owner-b'],
    supabaseUrl: 'https://isolation-fixture.supabase.co', ownerKeyResolver });
  servers.push(app);
  return { app, engine, installationId, operationId, unresolvedId, external };
}

const headers = (credential: string, key = randomUUID()) => ({ authorization: `Bearer ${credential}`, 'idempotency-key': key });

describe('Gate B5 signed workspace and owner isolation', () => {
  it('denies a validly signed owner of the other workspace before reads or mutations', async () => {
    const a = await fixture(workspaceA, 'owner-a');
    const b = await fixture(workspaceB, 'owner-b');
    const foreign = await token('owner-b', workspaceB);
    const before = await a.engine.snapshot();
    const reads = ['/api/shopify', '/api/products', '/api/audit-log', '/api/interrupts', '/api/overview'];
    for (const url of reads) {
      const response = await a.app.inject({ url: `${url}?workspaceId=${workspaceB}`, headers: headers(foreign) });
      expect(response.statusCode, url).toBe(403);
      expect(response.json().error.code, url).toBe('WORKSPACE_REQUIRED');
      expect(response.body).not.toContain(a.installationId);
    }
    const mutations = [
      [`${shopify}/installations/${a.installationId}/sync`, {}],
      [`${shopify}/installations/${a.installationId}/subscriptions/ensure`, { topic: 'products/update' }],
      [`${shopify}/installations/${a.installationId}/disconnect`, { expectedRevision: 1 }],
      [`${shopify}/economics`, { installationId: a.installationId }],
      [`${shopify}/prices/propose`, { installationId: a.installationId }],
      [`${shopify}/prices/${a.operationId}/execute`, {}],
      [`${shopify}/prices/${a.operationId}/reconcile`, {}],
      [`${shopify}/prices/${a.unresolvedId}/cancel`, { reason: 'Owner cancellation is not authorized here' }],
      [`${shopify}/prices/${a.unresolvedId}/investigations`, {}],
      [`${guardrails}/interrupts/approval-owner-a/resolve`, { decision: 'approve' }],
    ] as const;
    for (const [url, payload] of mutations) {
      const response = await a.app.inject({ method: 'POST', url, headers: headers(foreign), payload });
      expect(response.statusCode, url).toBe(403);
      expect(response.json().error.code, url).toBe('WORKSPACE_REQUIRED');
    }
    expect(await a.engine.snapshot()).toEqual(before);
    expect(a.external).not.toHaveBeenCalled();
    expect(b.external).not.toHaveBeenCalled();
  });

  it('denies the reverse workspace direction and ignores client-selected workspace headers', async () => {
    const a = await fixture(workspaceA, 'owner-a');
    const b = await fixture(workspaceB, 'owner-b');
    const foreign = await token('owner-a', workspaceA);
    const response = await b.app.inject({ url: '/api/shopify', headers: {
      ...headers(foreign), 'x-hotl-workspace-id': workspaceB, 'x-workspace-id': workspaceB,
    } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('WORKSPACE_REQUIRED');
    expect(response.body).not.toContain(b.installationId);
    expect(a.external).not.toHaveBeenCalled();
    expect(b.external).not.toHaveBeenCalled();
  });

  it('filters another owner within the same workspace and denies guessed Shopify IDs', async () => {
    const a = await fixture(workspaceA, 'owner-a');
    const otherOwner = await token('owner-b', workspaceA);
    const overview = await a.app.inject({ url: '/api/shopify', headers: headers(otherOwner) });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({ installations: [], variants: [], jobs: [], inbox: [], operations: [], subscriptionAttempts: [] });
    expect(overview.body).not.toContain(a.installationId);
    expect(overview.body).not.toContain('private-provider-request');
    const attempts = [
      [`${shopify}/installations/${a.installationId}/sync`, {}],
      [`${shopify}/installations/${a.installationId}/subscriptions/ensure`, { topic: 'products/update' }],
      [`${shopify}/installations/${a.installationId}/disconnect`, { expectedRevision: 1 }],
      [`${shopify}/prices/${a.operationId}/execute`, {}],
      [`${shopify}/prices/${a.operationId}/reconcile`, {}],
      [`${shopify}/prices/${a.unresolvedId}/cancel`, { reason: 'Another owner cannot cancel this proposal' }],
      [`${shopify}/prices/${a.unresolvedId}/investigations`, {
        expectedStatus: 'UNKNOWN', expectedReconciliationAt: null, expectedReconciliationRevision: null,
        nextStep: 'KEEP_RESOURCE_BLOCKED', note: 'Another owner cannot annotate this operation.', evidence: [],
      }],
    ] as const;
    const before = await a.engine.snapshot();
    for (const [url, payload] of attempts) {
      const response = await a.app.inject({ method: 'POST', url, headers: headers(otherOwner), payload });
      expect(response.statusCode, url).toBe(404);
      expect(['SHOPIFY_INSTALLATION_NOT_FOUND', 'OPERATION_NOT_FOUND'], url).toContain(response.json().error.code);
    }
    expect(await a.engine.snapshot()).toEqual(before);
    expect(a.external).not.toHaveBeenCalled();
  });
});
