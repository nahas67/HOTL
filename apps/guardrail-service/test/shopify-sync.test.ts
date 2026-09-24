import { describe, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { ConnectorError, type CommerceConnector } from '@hotl/connector-sdk';
import { createEngine } from '../src/engine.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import type { ShopifyOAuthService } from '../src/shopify-oauth.js';
import { shopifyData } from '../src/shopify-state.js';

const actor = { type: 'owner' as const, id: 'owner-one' }, secret = 'fixture-shopify-webhook-secret';
async function fixture() {
  const engine = await createEngine(), id = randomUUID(), now = new Date('2026-09-17T12:00:00.000Z');
  await engine.extensionTransaction('integration.fixture', {}, actor, 'seed', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'workspace', pending: [], installations: [{ id, workspaceId: 'workspace', ownerId: actor.id, shop: 'fixture.myshopify.com', clientId: 'fixture', revision: 1, scopes: ['read_products', 'write_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(), expiresAt: '2026-09-18T12:00:00.000Z', refreshExpiresAt: '2026-10-01T12:00:00.000Z', encryptedTokens: 'fixture' }] }; return {};
  });
  const connector = {
    listProducts: vi.fn(async () => ({ items: [{ provider: 'shopify', externalId: 'gid://shopify/Product/1', title: 'Provider item', handle: 'item', status: 'active', updatedAt: now.toISOString(), variants: 'separate' }], nextCursor: null })),
    listVariants: vi.fn(async () => ({ items: [{ provider: 'shopify', externalId: 'gid://shopify/ProductVariant/2', productId: 'gid://shopify/Product/1', title: 'Standard', sku: 'SKU', price: { amount: '100.0', currency: 'USD' }, options: [] }], nextCursor: null })),
    listInventory: vi.fn(async () => ({ items: [], nextCursor: null })), listOrders: vi.fn(async () => ({ items: [], nextCursor: null })),
  } as unknown as CommerceConnector;
  const oauth = { accessToken: async () => ({ shop: 'fixture.myshopify.com', accessToken: 'fixture', revision: 1, scopes: ['read_products'] }), list: async () => ({ installations: [] }) } as unknown as ShopifyOAuthService;
  const service = new ShopifyCommerceService(engine, oauth, { webhookSecret: secret, now: () => now, connector: () => connector, port: () => ({ read: vi.fn(), write: vi.fn(), locations: async () => [{ id: 'location-1', name: 'Warehouse', isActive: true }] }) });
  const body = Buffer.from('{"id":1,"updated_at":"2020-01-01T00:00:00Z","title":"untrusted old title"}');
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  return { engine, id, now, connector, oauth, service, body, signature };
}
describe('Shopify durable inbox and reconciliation worker', () => {
  it('acknowledges only durable intake, deduplicates body and delivery, and imports authoritative state', async () => {
    const f = await fixture(); const before = (await f.engine.snapshot()).products;
    expect(await f.service.webhook(f.id, f.body, f.signature, 'delivery-1', 'products/update')).toMatchObject({ accepted: true, duplicate: false });
    expect(f.connector.listProducts).not.toHaveBeenCalled();
    expect(await f.service.webhook(f.id, f.body, f.signature, 'delivery-2', 'products/update')).toMatchObject({ duplicate: true });
    const changed = Buffer.from('{"id":2}'), changedSignature = createHmac('sha256', secret).update(changed).digest('base64');
    await expect(f.service.webhook(f.id, changed, changedSignature, 'delivery-1', 'products/update')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await f.service.workOnce()).toMatchObject({ status: 'COMPLETED', variants: 1, orderScopeGranted: false });
    const state = await f.engine.snapshot(), data = shopifyData(state);
    expect(data.inbox).toHaveLength(1); expect(data.variants[0]).toMatchObject({ price: '100.00', revision: 1 });
    expect(data.snapshots[0].products[0]).toMatchObject({ title: 'Provider item' });
    expect(state.products).toEqual(before); expect(f.connector.listOrders).not.toHaveBeenCalled();
    expect(JSON.stringify(await f.service.overview(actor))).not.toContain('encryptedTokens');
  });
  it('rejects invalid signatures and ownership without provider calls or durable intake', async () => {
    const f = await fixture();
    await expect(f.service.webhook(f.id, f.body, 'invalid', 'delivery', 'products/update')).rejects.toMatchObject({ code: 'INVALID_WEBHOOK' });
    await expect(f.service.queueSync(f.id, { type: 'owner', id: 'other' }, 'other')).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_NOT_FOUND' });
    expect(shopifyData(await f.engine.snapshot()).inbox).toEqual([]); expect(f.connector.listProducts).not.toHaveBeenCalled();
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
    await f.engine.extensionTransaction('integration.fixture.crash', {}, actor, 'crash', state => { const job = shopifyData(state).jobs[0]; job.status = 'RUNNING'; job.claim = 'lost-worker'; job.leaseUntil = '2026-09-17T11:59:00.000Z'; job.attempts = 1; return {}; });
    expect(await f.service.workOnce()).toMatchObject({ jobId: queued.jobId, status: 'COMPLETED' });
    expect(await f.service.workOnce()).toEqual({ idle: true }); expect(f.connector.listProducts).toHaveBeenCalledTimes(1);
  });
  it('an uninstall delivery cannot delete credentials or merchant state using an unsigned topic', async () => {
    const f = await fixture();
    await f.service.webhook(f.id, f.body, f.signature, 'uninstall', 'app/uninstalled'); await f.service.workOnce();
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
