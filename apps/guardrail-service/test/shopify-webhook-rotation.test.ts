import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import { shopifyData } from '../src/shopify-state.js';
import type { ShopifyOAuthService } from '../src/shopify-oauth.js';

const actor = { type: 'owner' as const, id: 'rotation-owner' };
const oauth = {} as ShopifyOAuthService;
const currentSecret = 'current-webhook-fixture';
const previousSecret = 'previous-webhook-fixture';
const body = Buffer.from('{"id":123}');
const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('base64');

describe('Shopify webhook secret rotation', () => {
  it('accepts the previous signature only inside the explicit window, then keeps current signatures valid', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const engine = await createEngine({ seed: false, now: () => now });
    const installationId = randomUUID();
    await engine.extensionTransaction('integration.fixture', {}, actor, 'rotation-seed', state => {
      state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'rotation-workspace', pending: [], installations: [{
        id: installationId, workspaceId: 'rotation-workspace', ownerId: actor.id, shop: 'rotation.myshopify.com', clientId: 'fixture',
        revision: 1, scopes: ['read_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(),
        expiresAt: '2026-09-25T10:00:00.000Z', refreshExpiresAt: '2026-10-01T10:00:00.000Z', encryptedTokens: 'fixture',
      }] };
      return { seeded: true };
    });
    const service = new ShopifyCommerceService(engine, oauth, {
      webhookSecret: currentSecret, previousWebhookSecret: previousSecret,
      previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z', now: () => now,
    });
    expect(await service.webhook(installationId, body, sign(previousSecret), 'old-delivery', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: false });
    now.setTime(Date.parse('2026-09-24T10:30:01.000Z'));
    await expect(service.webhook(installationId, body, sign(previousSecret), 'late-old-delivery', 'products/update'))
      .rejects.toMatchObject({ code: 'INVALID_WEBHOOK' });
    expect(await service.webhook(installationId, body, sign(currentSecret), 'current-delivery', 'products/update'))
      .toMatchObject({ accepted: true });
    expect(shopifyData(await engine.snapshot()).inbox).toHaveLength(1);
    const audit = JSON.stringify((await engine.snapshot()).audit);
    expect(audit).not.toContain(previousSecret);
    expect(audit).not.toContain(currentSecret);
  });

  it('fails startup for incomplete, indefinite, or non-distinct rotation configuration', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const engine = await createEngine({ seed: false, now: () => now });
    for (const rotation of [
      { previousWebhookSecret: previousSecret },
      { previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z' },
      { previousWebhookSecret: previousSecret, previousWebhookSecretValidUntil: '2026-09-24T12:00:00.000Z' },
      { previousWebhookSecret: currentSecret, previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z' },
    ]) expect(() => new ShopifyCommerceService(engine, oauth, { webhookSecret: currentSecret, now: () => now, ...rotation }))
      .toThrowError(expect.objectContaining({ code: 'SHOPIFY_WEBHOOK_ROTATION_INVALID' }));
  });
});
