import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEngine, type EngineOptions } from '../src/engine.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import { shopifyData } from '../src/shopify-state.js';
import type { ShopifyOAuthService } from '../src/shopify-oauth.js';
import type { ShopifyWebhookPort, ProviderSubscription } from '../src/shopify-webhooks.js';

const actor = { type: 'owner' as const, id: 'webhook-owner' }, topic = 'products/update' as const;
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-webhook-')); dirs.push(directory);
  const id = randomUUID(), shop = 'staging-shop.myshopify.com', now = new Date('2026-09-23T12:00:00.000Z');
  let killed = false, developmentStore = true, responseLost = false;
  const options: EngineOptions = { filePath: join(directory, 'state.json'), initializeEmptyFile: true, mode: 'live', seed: false,
    shopifyStagingShops: [shop], killSwitchReader: async () => ({ engaged: killed }), now: () => now };
  const engine = await createEngine(options);
  await engine.extensionTransaction('integration.fixture', {}, actor, 'seed', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'workspace', pending: [], installations: [{ id, workspaceId: 'workspace', ownerId: actor.id,
      shop, clientId: 'fixture', revision: 1, scopes: ['read_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(),
      expiresAt: '2026-09-24T12:00:00.000Z', refreshExpiresAt: '2026-10-01T12:00:00.000Z', encryptedTokens: 'fixture' }] };
    return { seeded: true };
  });
  const remote: ProviderSubscription[] = [];
  const port: ShopifyWebhookPort = {
    list: vi.fn(async () => ({ shop, developmentStore, subscriptions: structuredClone(remote) })),
    create: vi.fn(async (_topic, uri) => {
      const subscription: ProviderSubscription = { id: 'gid://shopify/WebhookSubscription/1', topic: 'PRODUCTS_UPDATE', uri, format: 'JSON' };
      remote.push(subscription);
      if (responseLost) throw new Error('Response lost after provider commit');
      return { subscription, requestId: 'provider-request', rejected: false };
    }),
  };
  const oauth = { accessToken: async () => ({ shop, accessToken: 'fixture-token', revision: 1, scopes: ['read_products'] }), list: async () => ({ installations: [] }) } as unknown as ShopifyOAuthService;
  const makeService = (using = engine) => new ShopifyCommerceService(using, oauth, { webhookSecret: 'fixture', webhookOrigin: 'https://hooks.example.com', webhookPort: () => port, now: () => now });
  return { engine, options, id, shop, remote, port, makeService, kill: () => { killed = true; }, normalStore: () => { developmentStore = false; }, loseResponse: () => { responseLost = true; } };
}

describe('Shopify shop-scoped webhook registration', () => {
  it('claims durably, creates once, verifies authoritative readback, and treats later calls as observation', async () => {
    const f = await fixture(), service = f.makeService();
    expect(await service.ensureWebhook(f.id, topic, actor, 'ensure-1')).toMatchObject({ decision: 'allow', status: 'CONFIRMED', providerWritePerformed: true });
    expect(f.port.create).toHaveBeenCalledTimes(1);
    expect(await service.ensureWebhook(f.id, topic, actor, 'ensure-2')).toMatchObject({ decision: 'allow', status: 'OBSERVED', providerWritePerformed: false });
    expect(f.port.create).toHaveBeenCalledTimes(1);
    const attempts = shopifyData(await f.engine.snapshot()).subscriptionAttempts!;
    expect(attempts).toHaveLength(1); expect(attempts[0]).toMatchObject({ status: 'CONFIRMED', providerId: 'gid://shopify/WebhookSubscription/1' });
    expect((await f.engine.snapshot()).audit.some(event => event.eventType === 'integration.shopify.webhook.subscription-result')).toBe(true);
  });
  it('keeps a lost response blocked after restart even when a later read does not see the subscription', async () => {
    const f = await fixture(), service = f.makeService(); f.loseResponse();
    expect(await service.ensureWebhook(f.id, topic, actor, 'ensure-lost')).toMatchObject({ decision: 'deny', status: 'UNKNOWN' });
    f.remote.length = 0;
    const restart = await createEngine(f.options);
    expect(await f.makeService(restart).ensureWebhook(f.id, topic, actor, 'ensure-after-restart')).toMatchObject({ decision: 'deny', reason: 'WEBHOOK_PROVISION_UNRESOLVED' });
    expect(f.port.create).toHaveBeenCalledTimes(1);
    expect(shopifyData(await restart.snapshot()).subscriptionAttempts![0].status).toBe('UNKNOWN');
  });
  it('does not create when an exact subscription appears between initial read and dispatch', async () => {
    const f = await fixture();
    let calls = 0;
    vi.mocked(f.port.list).mockImplementation(async () => {
      calls++;
      if (calls === 2) f.remote.push({ id: 'gid://shopify/WebhookSubscription/9', topic: 'PRODUCTS_UPDATE',
        uri: `https://hooks.example.com/api/shopify/webhooks/${f.id}`, format: 'JSON' });
      return { shop: f.shop, developmentStore: true, subscriptions: structuredClone(f.remote) };
    });
    expect(await f.makeService().ensureWebhook(f.id, topic, actor, 'race')).toMatchObject({ status: 'REJECTED', errorCode: 'WEBHOOK_ALREADY_EXISTS', providerWritePerformed: false });
    expect(f.port.create).not.toHaveBeenCalled();
    expect(await f.makeService().ensureWebhook(f.id, topic, actor, 'observe')).toMatchObject({ status: 'OBSERVED' });
  });
  it('refuses a different shop-scoped endpoint for the same topic', async () => {
    const f = await fixture();
    f.remote.push({ id: 'gid://shopify/WebhookSubscription/10', topic: 'PRODUCTS_UPDATE', uri: 'https://other.example.com/hook', format: 'JSON' });
    await expect(f.makeService().ensureWebhook(f.id, topic, actor, 'conflict')).rejects.toMatchObject({ code: 'SHOPIFY_WEBHOOK_CONFLICT' });
    expect(f.port.create).not.toHaveBeenCalled();
  });
  it('can re-provision after Shopify no longer lists a previously confirmed subscription', async () => {
    const f = await fixture(), service = f.makeService();
    expect(await service.ensureWebhook(f.id, topic, actor, 'first')).toMatchObject({ status: 'CONFIRMED' });
    f.remote.length = 0;
    expect(await service.ensureWebhook(f.id, topic, actor, 'replacement')).toMatchObject({ status: 'CONFIRMED' });
    expect(f.port.create).toHaveBeenCalledTimes(2);
    expect(shopifyData(await f.engine.snapshot()).subscriptionAttempts).toHaveLength(2);
  });
  it('denies normal stores, emergency stop, wrong owner, and invalid callback origin before provider writes', async () => {
    const f = await fixture(); f.normalStore();
    await expect(f.makeService().ensureWebhook(f.id, topic, actor, 'normal')).rejects.toMatchObject({ code: 'SHOPIFY_DEVELOPMENT_STORE_REQUIRED' });
    await expect(f.makeService().ensureWebhook(f.id, 'inventory_levels/update', actor, 'scope')).rejects.toMatchObject({ code: 'SHOPIFY_SCOPES_MISSING' });
    f.kill();
    await expect(f.makeService().ensureWebhook(f.id, topic, actor, 'kill')).rejects.toMatchObject({ code: 'KILL_SWITCH_ENGAGED' });
    await expect(f.makeService().ensureWebhook(f.id, topic, { type: 'owner', id: 'other' }, 'other')).rejects.toMatchObject({ code: 'SHOPIFY_INSTALLATION_NOT_FOUND' });
    const wrongOrigin = new ShopifyCommerceService(f.engine, { accessToken: async () => ({ shop: f.shop, accessToken: 'fixture', revision: 1 }) } as unknown as ShopifyOAuthService,
      { webhookSecret: 'fixture', webhookOrigin: 'http://localhost:4000', webhookPort: () => f.port });
    await expect(wrongOrigin.ensureWebhook(f.id, topic, actor, 'origin')).rejects.toMatchObject({ code: 'SHOPIFY_WEBHOOK_ORIGIN_INVALID' });
    expect(f.port.create).not.toHaveBeenCalled();
  });
});
