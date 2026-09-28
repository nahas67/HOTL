import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import { shopifyData } from '../src/shopify-state.js';
import type { ShopifyOAuthService } from '../src/shopify-oauth.js';

const actor = { type: 'owner' as const, id: 'rotation-owner' };
const oauth = {} as ShopifyOAuthService;
const currentSecret = 'current-webhook-fixture';
const previousSecret = 'previous-webhook-fixture';
const encryptedFixture = [Buffer.alloc(12, 1).toString('base64'), Buffer.alloc(16, 2).toString('base64'), Buffer.from('{}').toString('base64')].join('.');
const body = Buffer.from('{"id":123}');
const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('base64');
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function seed(engine: Awaited<ReturnType<typeof createEngine>>, now: Date) {
  const installationId = randomUUID();
  await engine.extensionTransaction('integration.fixture', {}, actor, 'rotation-seed', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'rotation-workspace', pending: [], installations: [{
      id: installationId, workspaceId: 'rotation-workspace', ownerId: actor.id, shop: 'rotation.myshopify.com', clientId: 'fixture',
      revision: 1, scopes: ['read_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(),
      expiresAt: '2026-09-25T10:00:00.000Z', refreshExpiresAt: '2026-10-01T10:00:00.000Z', encryptedTokens: encryptedFixture,
    }] };
    return { seeded: true };
  });
  return installationId;
}

describe('Shopify webhook secret rotation', () => {
  it('accepts both active secrets through overlap, then the old key for at most one hour after verified revocation', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const directory = await mkdtemp(join(tmpdir(), 'hotl-shopify-rotation-')); directories.push(directory);
    const filePath = join(directory, 'state.json');
    const engine = await createEngine({ filePath, initializeEmptyFile: true, seed: false, now: () => now });
    const installationId = await seed(engine, now);
    const overlap = { webhookSecret: currentSecret, previousWebhookSecret: previousSecret,
      previousWebhookSecretValidUntil: '2026-10-01T10:00:00.000Z', now: () => now };
    const service = new ShopifyCommerceService(engine, oauth, overlap);
    expect(await service.webhook(installationId, body, sign(previousSecret), 'old-before-restart', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: false });
    expect(await service.webhook(installationId, body, sign(currentSecret), 'current-during-overlap', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: true });

    now.setTime(Date.parse('2026-09-24T10:10:00.000Z'));
    const restartedEngine = await createEngine({ filePath, seed: false, now: () => now });
    const restartedService = new ShopifyCommerceService(restartedEngine, oauth, overlap);
    expect(await restartedService.webhook(installationId, body, sign(previousSecret), 'old-after-restart', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: true });
    await expect(restartedService.webhook(installationId, body, sign('invalid-webhook-fixture'), 'invalid', 'products/update'))
      .rejects.toMatchObject({ code: 'INVALID_WEBHOOK' });

    now.setTime(Date.parse('2026-09-24T10:40:00.000Z'));
    const postRevocation = { webhookSecret: currentSecret, previousWebhookSecret: previousSecret,
      previousWebhookSecretRevokedAt: '2026-09-24T10:30:00.000Z',
      previousWebhookSecretValidUntil: '2026-09-24T11:15:00.000Z', now: () => now };
    const revokedService = new ShopifyCommerceService(restartedEngine, oauth, postRevocation);
    expect(await revokedService.webhook(installationId, body, sign(previousSecret), 'old-after-revocation', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: true });
    now.setTime(Date.parse('2026-09-24T11:15:01.000Z'));
    await expect(revokedService.webhook(installationId, body, sign(previousSecret), 'old-after-transition', 'products/update'))
      .rejects.toMatchObject({ code: 'INVALID_WEBHOOK' });
    expect(await revokedService.webhook(installationId, body, sign(currentSecret), 'current-after-transition', 'products/update'))
      .toMatchObject({ accepted: true, duplicate: true });
    expect(shopifyData(await restartedEngine.snapshot()).inbox).toHaveLength(1);
    const audit = JSON.stringify((await restartedEngine.snapshot()).audit);
    expect(audit).not.toContain(previousSecret);
    expect(audit).not.toContain(currentSecret);
  });

  it('fails startup for incomplete, malformed, indefinite, expired, or inconsistent rotation configuration', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');
    const engine = await createEngine({ seed: false, now: () => now });
    for (const rotation of [
      { previousWebhookSecret: previousSecret },
      { previousWebhookSecret: previousSecret, previousWebhookSecretValidUntil: '2026-10-25T10:00:00.000Z' },
      { previousWebhookSecretRevokedAt: '2026-09-24T10:00:00.000Z' },
      { previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z' },
      { previousWebhookSecret: previousSecret, previousWebhookSecretRevokedAt: 'not-a-date', previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z' },
      { previousWebhookSecret: previousSecret, previousWebhookSecretRevokedAt: '2026-09-24T10:30:00.000Z', previousWebhookSecretValidUntil: '2026-09-24T11:00:00.000Z' },
      { previousWebhookSecret: previousSecret, previousWebhookSecretRevokedAt: '2026-09-24T10:00:00.000Z', previousWebhookSecretValidUntil: '2026-09-24T11:00:01.000Z' },
      { previousWebhookSecret: previousSecret, previousWebhookSecretRevokedAt: '2026-09-24T10:00:00.000Z', previousWebhookSecretValidUntil: '2026-09-24T09:59:00.000Z' },
      { previousWebhookSecret: currentSecret, previousWebhookSecretRevokedAt: '2026-09-24T10:00:00.000Z', previousWebhookSecretValidUntil: '2026-09-24T10:30:00.000Z' },
    ]) expect(() => new ShopifyCommerceService(engine, oauth, { webhookSecret: currentSecret, now: () => now, ...rotation }))
      .toThrowError(expect.objectContaining({ code: 'SHOPIFY_WEBHOOK_ROTATION_INVALID' }));
  });
});
