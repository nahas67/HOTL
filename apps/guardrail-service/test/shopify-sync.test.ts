import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectorError, type CommerceConnector } from '@hotl/connector-sdk';
import { createEngine } from '../src/engine.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import { shopifyWebhookMac, type ShopifyOAuthService } from '../src/shopify-oauth.js';
import { shopifyData } from '../src/shopify-state.js';

const actor = { type: 'owner' as const, id: 'owner-one' }, secret = 'fixture-shopify-webhook-secret';
// The callback URL is installation-bound, so every delivery must present its MAC.
const MAC_KEY_BUFFER = Buffer.alloc(32, 9);
const MAC_KEY = MAC_KEY_BUFFER.toString('base64');
const macFor = (installationId: string) => shopifyWebhookMac(MAC_KEY_BUFFER, installationId);
const encryptedFixture = [Buffer.alloc(12, 1).toString('base64'), Buffer.alloc(16, 2).toString('base64'), Buffer.from('{}').toString('base64')].join('.');
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(filePath?: string) {
  const engine = await createEngine(filePath ? { filePath, seed: false } : {}), id = randomUUID(), now = new Date('2026-09-17T12:00:00.000Z');
  await engine.extensionTransaction('integration.fixture', {}, actor, 'seed', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'workspace', pending: [], installations: [{ id, workspaceId: 'workspace', ownerId: actor.id, shop: 'fixture.myshopify.com', clientId: 'fixture', revision: 1, scopes: ['read_products', 'write_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(), expiresAt: '2026-09-18T12:00:00.000Z', refreshExpiresAt: '2026-10-01T12:00:00.000Z', encryptedTokens: encryptedFixture }] }; return {};
  });
  const connector = {
    listProducts: vi.fn(async () => ({ items: [{ provider: 'shopify', externalId: 'gid://shopify/Product/1', title: 'Provider item', handle: 'item', status: 'active', updatedAt: now.toISOString(), variants: 'separate' }], nextCursor: null })),
    listVariants: vi.fn(async () => ({ items: [{ provider: 'shopify', externalId: 'gid://shopify/ProductVariant/2', productId: 'gid://shopify/Product/1', title: 'Standard', sku: 'SKU', price: { amount: '100.0', currency: 'USD' }, options: [] }], nextCursor: null })),
    listInventory: vi.fn(async () => ({ items: [], nextCursor: null })), listOrders: vi.fn(async () => ({ items: [], nextCursor: null })),
  } as unknown as CommerceConnector;
  const oauth = { accessToken: async () => ({ shop: 'fixture.myshopify.com', accessToken: 'fixture', revision: 1, scopes: ['read_products'] }), list: async () => ({ installations: [] }) } as unknown as ShopifyOAuthService;
  const service = new ShopifyCommerceService(engine, oauth, { webhookSecret: secret, encryptionKey: MAC_KEY, now: () => now, connector: () => connector, port: () => ({ read: vi.fn(), write: vi.fn(), locations: async () => [{ id: 'location-1', name: 'Warehouse', isActive: true }] }) });
  const body = Buffer.from('{"id":1,"updated_at":"2020-01-01T00:00:00Z","title":"untrusted old title"}');
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  return { engine, id, now, connector, oauth, service, body, signature };
}
describe('Shopify durable inbox and reconciliation worker', () => {
  it('acknowledges only durable intake, deduplicates body and delivery, and imports authoritative state', async () => {
    const f = await fixture(); const before = (await f.engine.snapshot()).products;
    expect(await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'delivery-1', 'products/update')).toMatchObject({ accepted: true, duplicate: false });
    expect(f.connector.listProducts).not.toHaveBeenCalled();
    expect(await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'delivery-2', 'products/update')).toMatchObject({ duplicate: true });
    const changed = Buffer.from('{"id":2}'), changedSignature = createHmac('sha256', secret).update(changed).digest('base64');
    await expect(f.service.webhook(f.id, macFor(f.id), changed, changedSignature, 'delivery-1', 'products/update')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await f.service.workOnce()).toMatchObject({ status: 'COMPLETED', variants: 1, orderScopeGranted: false });
    const state = await f.engine.snapshot(), data = shopifyData(state);
    expect(data.inbox).toMatchObject([{ status: 'RECONCILED', syncJobId: data.jobs[0].id, queuedAt: expect.any(String), reconciledAt: expect.any(String) }]); expect(data.variants[0]).toMatchObject({ price: '100.00', revision: 1 });
    expect(data.snapshots[0].products[0]).toMatchObject({ title: 'Provider item' });
    expect(state.products).toEqual(before); expect(f.connector.listOrders).not.toHaveBeenCalled();
    expect(JSON.stringify(await f.service.overview(actor))).not.toContain('encryptedTokens');
  });
  it('rejects invalid signatures and ownership without provider calls or durable intake', async () => {
    const f = await fixture();
    await expect(f.service.webhook(f.id, macFor(f.id), f.body, 'invalid', 'delivery', 'products/update')).rejects.toMatchObject({ code: 'INVALID_WEBHOOK' });
    await expect(f.service.queueSync(f.id, { type: 'owner', id: 'other' }, 'other')).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_NOT_FOUND' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toEqual([]); expect(f.connector.listProducts).not.toHaveBeenCalled();
  });
  it('records accepted webhook intake as pending until a worker actually reconciles it', async () => {
    const f = await fixture();
    const received = await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'pending-delivery', 'products/update');
    expect(received).toMatchObject({ accepted: true, duplicate: false });
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'PENDING', attempts: 0 }]);
    expect(f.connector.listProducts).not.toHaveBeenCalled();
  });
  it('deduplicates a repeated delivery while the original event is actively reconciling', async () => {
    const f = await fixture();
    await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'in-flight-delivery', 'products/update');
    let announceStarted!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { announceStarted = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const list = vi.mocked(f.connector.listProducts).getMockImplementation();
    if (!list) throw new Error('Shopify product-list fixture is missing.');
    vi.mocked(f.connector.listProducts).mockImplementation(async input => { announceStarted(); await gate; return list(input); });
    const work = f.service.workOnce();
    await started;
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'RECONCILING', attempts: 1 }]);
    expect(await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'same-body-new-delivery', 'products/update')).toMatchObject({ duplicate: true });
    expect(shopifyData(await f.engine.snapshot()).inbox).toHaveLength(1);
    release();
    await expect(work).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'RECONCILED' }]);
  });
  it('restarts between webhook receipt and sync without applying the webhook body', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-shopify-webhook-restart-')); directories.push(directory);
    const filePath = join(directory, 'ledger.json'), f = await fixture(filePath);
    await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'restart-delivery', 'products/update');
    const restarted = await createEngine({ filePath, seed: false });
    const persisted = shopifyData(await restarted.snapshot()).inbox;
    expect(persisted).toMatchObject([{ status: 'PENDING' }]);
    expect(persisted[0]).not.toHaveProperty('syncJobId');
    const resumed = new ShopifyCommerceService(restarted, f.oauth, { webhookSecret: secret, encryptionKey: MAC_KEY, now: () => f.now,
      connector: () => f.connector, port: () => ({ read: vi.fn(), write: vi.fn(), locations: async () => [{ id: 'location-1', name: 'Warehouse', isActive: true }] }) });
    expect(await resumed.workOnce()).toMatchObject({ status: 'COMPLETED' });
    expect(shopifyData(await restarted.snapshot()).inbox).toMatchObject([{ status: 'RECONCILED', syncJobId: expect.any(String) }]);
  });
  it('tracks retryable provider failures and dead-letters the webhook after the bounded retry budget', async () => {
    const f = await fixture();
    await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'retry-delivery', 'products/update');
    vi.mocked(f.connector.listProducts).mockRejectedValue(new ConnectorError('RATE_LIMITED'));
    expect(await f.service.workOnce()).toMatchObject({ status: 'PENDING', reason: 'RATE_LIMITED' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'RETRY_PENDING', attempts: 1, errorCode: 'RATE_LIMITED' }]);
    f.now.setTime(f.now.getTime() + 5001);
    expect(await f.service.workOnce()).toMatchObject({ status: 'PENDING', reason: 'RATE_LIMITED' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'RETRY_PENDING', attempts: 2 }]);
    f.now.setTime(f.now.getTime() + 10001);
    expect(await f.service.workOnce()).toMatchObject({ status: 'FAILED', reason: 'RATE_LIMITED' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toMatchObject([{ status: 'DEAD_LETTER', attempts: 3, errorCode: 'RATE_LIMITED' }]);
  });
  it('retry backoff and exhausted attempts preserve the last canonical snapshot', async () => {
    const f = await fixture(); await f.service.queueSync(f.id, actor, 'first'); await f.service.workOnce();
    const saved = shopifyData(await f.engine.snapshot()).variants;
    vi.mocked(f.connector.listProducts).mockRejectedValue(new ConnectorError('RATE_LIMITED'));
    await f.service.queueSync(f.id, actor, 'next');
    expect(await f.service.workOnce()).toMatchObject({ status: 'PENDING', reason: 'RATE_LIMITED' });
    expect(await f.service.workOnce()).toEqual({ idle: true });
    f.now.setTime(f.now.getTime() + 5001); expect(await f.service.workOnce()).toMatchObject({ status: 'PENDING' });
    f.now.setTime(f.now.getTime() + 10001); expect(await f.service.workOnce()).toMatchObject({ status: 'FAILED' });
    expect(shopifyData(await f.engine.snapshot()).variants).toEqual(saved);
  });
  it('credential changes during synchronization discard the imported snapshot', async () => {
    const f = await fixture();
    const original = f.connector.listInventory;
    f.connector.listInventory = vi.fn(async () => {
      await f.engine.extensionTransaction('integration.fixture.disconnect', {}, actor, 'disconnect', state => { const auth = state.extensions!.shopifyOAuth as { installations: { revision: number; status: string }[] }; auth.installations[0].revision++; auth.installations[0].status = 'DISCONNECTED'; return {}; });
      return original();
    });
    await f.service.queueSync(f.id, actor, 'sync');
    expect(await f.service.workOnce()).toMatchObject({ status: 'FAILED', reason: 'SHOPIFY_INSTALLATION_CHANGED' });
    expect(shopifyData(await f.engine.snapshot()).variants).toEqual([]);
  });
  it('a crash lease can resume reads and duplicate worker passes do not repeat a completed job', async () => {
    const f = await fixture(); const queued = await f.service.queueSync(f.id, actor, 'sync');
    await f.engine.extensionTransaction('integration.fixture.crash', {}, actor, 'crash', state => { const job = shopifyData(state).jobs[0]; job.status = 'RUNNING'; job.claim = randomUUID(); job.leaseUntil = '2026-09-17T11:59:00.000Z'; job.attempts = 1; return {}; });
    expect(await f.service.workOnce()).toMatchObject({ jobId: queued.jobId, status: 'COMPLETED' });
    expect(await f.service.workOnce()).toEqual({ idle: true }); expect(f.connector.listProducts).toHaveBeenCalledTimes(1);
  });
  it('an uninstall delivery cannot delete credentials or merchant state using an unsigned topic', async () => {
    const f = await fixture();
    await f.service.webhook(f.id, macFor(f.id), f.body, f.signature, 'uninstall', 'app/uninstalled'); await f.service.workOnce();
    expect((await f.engine.snapshot()).extensions!.shopifyOAuth).toMatchObject({ installations: [{ status: 'INSTALLED' }] });
    expect(shopifyData(await f.engine.snapshot()).variants).toHaveLength(1);
  });
  it('pagination cycles fail the entire snapshot instead of publishing partial imports', async () => {
    const f = await fixture();
    vi.mocked(f.connector.listProducts).mockResolvedValue({ items: [], nextCursor: 'same-cursor' });
    await f.service.queueSync(f.id, actor, 'sync');
    expect(await f.service.workOnce()).toMatchObject({ status: 'FAILED', reason: 'SYNC_CURSOR_INVALID' }); expect(shopifyData(await f.engine.snapshot()).snapshots).toEqual([]);
  });
});

/**
 * A crash between the third claim commit and its result commit leaves a RUNNING job
 * with attempts=3 and an expired lease. Its recovery branch must still produce a VALID
 * ledger, or every later worker pass throws on that job and the whole workspace stops
 * reconciling while the linked inbox evidence stays non-terminal forever.
 */
describe('Shopify exhausted-crash recovery and stranded inbox evidence', () => {
  const crashedAt = '2026-09-17T11:00:00.000Z';
  async function seedCrash(engine: Awaited<ReturnType<typeof createEngine>>, installationId: string, extra?: (data: ReturnType<typeof shopifyData>, jobId: string) => void) {
    const jobId = randomUUID(), eventId = randomUUID();
    await engine.extensionTransaction('integration.fixture.crashed', {}, actor, `crash-${randomUUID()}`, state => {
      const data = shopifyData(state);
      data.jobs.push({ id: jobId, installationId, ownerId: actor.id, status: 'RUNNING', attempts: 3, createdAt: crashedAt,
        leaseUntil: '2026-09-17T11:30:00.000Z', claim: randomUUID() });
      data.inbox.push({ id: eventId, installationId, ownerId: actor.id, digest: 'a'.repeat(64), deliveryId: 'crash-delivery',
        topic: 'products/update', receivedAt: crashedAt, status: 'RECONCILING', attempts: 3, syncJobId: jobId,
        queuedAt: crashedAt, reconciliationStartedAt: crashedAt });
      extra?.(data, jobId);
      return { seeded: true };
    });
    return { jobId, eventId };
  }

  it('retires the exhausted job without leaving a claim, so the next pass still runs', async () => {
    const f = await fixture();
    const { jobId, eventId } = await seedCrash(f.engine, f.id);
    expect(await f.service.workOnce()).toMatchObject({ claimed: false, status: 'FAILED' });
    const data = shopifyData(await f.engine.snapshot());
    expect(data.jobs.find(job => job.id === jobId)).toMatchObject({ status: 'FAILED', errorCode: 'SYNC_ATTEMPTS_EXHAUSTED' });
    expect(data.jobs.find(job => job.id === jobId)).not.toHaveProperty('claim');
    // A non-terminal event would keep counting against the webhook backlog ceiling.
    expect(data.inbox.find(event => event.id === eventId)).toMatchObject({ status: 'FAILED', errorCode: 'SYNC_ATTEMPTS_EXHAUSTED' });
    expect(await f.service.workOnce()).toEqual({ idle: true });
    expect(shopifyData(await f.engine.snapshot()).jobs.find(job => job.id === jobId)).toMatchObject({ status: 'FAILED' });
    expect(f.connector.listProducts).not.toHaveBeenCalled();
    expect((await f.engine.snapshot()).audit.some(event => event.eventType === 'integration.shopify.sync.claimed')).toBe(true);
  });

  it('retires the crashed job cleanly and still drains unrelated work on the next pass', async () => {
    const f = await fixture();
    await seedCrash(f.engine, f.id);
    const queued = await f.service.queueSync(f.id, actor, 'unrelated-sync');
    // The regression: this pass used to leave a claim on a terminal job, which made the
    // whole ledger invalid so every later pass threw and the workspace wedged. It must
    // return normally instead.
    expect(await f.service.workOnce()).toMatchObject({ claimed: false, status: 'FAILED' });
    expect(f.connector.listProducts).not.toHaveBeenCalled();
    // One job is retired per pass by design, so the unrelated sync drains on the next tick
    // rather than in the retirement pass. What matters is that the worker still makes
    // progress instead of being wedged.
    await f.service.workOnce();
    expect(shopifyData(await f.engine.snapshot()).jobs.find(job => job.id === queued.jobId)?.status).toBe('COMPLETED');
    expect(f.connector.listProducts).toHaveBeenCalledTimes(1);
  });

  it('resolves evidence stranded on a failed job and reconciles evidence stranded on a completed job', async () => {
    const f = await fixture();
    await f.service.queueSync(f.id, actor, 'failing-sync');
    const seeded = shopifyData(await f.engine.snapshot()).jobs[0];
    const failedQueued = randomUUID(), failedReconciling = randomUUID();
    await f.engine.extensionTransaction('integration.fixture.stranded', {}, actor, 'stranded-failed', state => {
      const data = shopifyData(state), job = data.jobs[0];
      job.status = 'FAILED'; job.errorCode = 'PROVIDER_STATE_INCOMPLETE'; job.completedAt = '2026-09-17T11:05:00.000Z';
      delete job.claim; delete job.leaseUntil;
      data.inbox.push({ id: failedQueued, installationId: f.id, ownerId: actor.id, digest: 'b'.repeat(64), deliveryId: 'stranded-queued',
        topic: 'products/update', receivedAt: crashedAt, status: 'RECONCILIATION_QUEUED', attempts: 0, syncJobId: job.id, queuedAt: crashedAt });
      data.inbox.push({ id: failedReconciling, installationId: f.id, ownerId: actor.id, digest: 'c'.repeat(64), deliveryId: 'stranded-reconciling',
        topic: 'products/update', receivedAt: crashedAt, status: 'RECONCILING', attempts: 1, syncJobId: job.id, queuedAt: crashedAt, reconciliationStartedAt: crashedAt });
      return { seeded: true };
    });
    await f.service.workOnce();
    let data = shopifyData(await f.engine.snapshot());
    expect(data.inbox.find(event => event.id === failedQueued)).toMatchObject({ status: 'FAILED', errorCode: 'PROVIDER_STATE_INCOMPLETE' });
    expect(data.inbox.find(event => event.id === failedReconciling)).toMatchObject({ status: 'FAILED', errorCode: 'PROVIDER_STATE_INCOMPLETE' });
    expect(data.jobs.find(job => job.id === seeded.id)).toMatchObject({ status: 'FAILED' });

    await f.service.queueSync(f.id, actor, 'completing-sync');
    await f.service.workOnce();
    const completing = shopifyData(await f.engine.snapshot()).jobs.find(job => job.status === 'COMPLETED')!;
    const recovered = randomUUID();
    await f.engine.extensionTransaction('integration.fixture.stranded', {}, actor, 'stranded-completed', state => {
      shopifyData(state).inbox.push({ id: recovered, installationId: f.id, ownerId: actor.id, digest: 'd'.repeat(64), deliveryId: 'stranded-completed',
        topic: 'products/update', receivedAt: crashedAt, status: 'RECONCILIATION_QUEUED', attempts: 0, syncJobId: completing.id, queuedAt: crashedAt });
      return { seeded: true };
    });
    await f.service.workOnce();
    data = shopifyData(await f.engine.snapshot());
    expect(data.inbox.find(event => event.id === recovered)).toMatchObject({ status: 'RECONCILED', reconciledAt: completing.completedAt });
    // The sweep is durable, audited and idempotent: a repeat pass must not churn the ledger.
    const auditBefore = (await f.engine.snapshot()).audit.length;
    expect(await f.service.workOnce()).toEqual({ idle: true });
    expect((await f.engine.snapshot()).audit.length).toBe(auditBefore);
  });
});
