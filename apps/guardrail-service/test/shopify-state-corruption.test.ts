import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';
import { shopifyData } from '../src/shopify-state.js';

const actor = { type: 'owner' as const, id: 'state-corruption-owner' };
const encryptedFixture = [Buffer.alloc(12, 1).toString('base64'), Buffer.alloc(16, 2).toString('base64'), Buffer.from('{}').toString('base64')].join('.');
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-shopify-corrupt-')); dirs.push(directory);
  const filePath = join(directory, 'state.json'), now = '2026-09-28T10:00:00.000Z';
  const engine = await createEngine({ filePath, initializeEmptyFile: true, seed: false });
  const installationId = randomUUID(), operationId = randomUUID(), variantId = 'gid://shopify/ProductVariant/123';
  const before = { installationId, ownerId: actor.id, variantId, productId: 'gid://shopify/Product/12', title: 'Fixture', sku: 'SKU',
    price: '100.00', currency: 'USD', providerRevision: now, requestId: null, revision: 1, observedAt: now };
  const observation = { variantId, productId: before.productId, price: '100.00', currency: 'USD', providerRevision: now, requestId: null };
  const after = { ...observation, price: '105.00', providerRevision: '2026-09-28T10:00:01.000Z' };
  await engine.extensionTransaction('integration.fixture.shopify-state', {}, actor, 'seed-shopify-state', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'workspace', pending: [], installations: [{ id: installationId,
      workspaceId: 'workspace', ownerId: actor.id, shop: 'fixture.myshopify.com', clientId: 'fixture', revision: 1,
      scopes: ['read_products', 'write_products'], status: 'INSTALLED', createdAt: now, installedAt: now,
      expiresAt: '2026-09-29T10:00:00.000Z', refreshExpiresAt: '2026-10-01T10:00:00.000Z', encryptedTokens: encryptedFixture }] };
    const data = shopifyData(state);
    data.variants.push(before);
    data.jobs.push({ id: randomUUID(), installationId, ownerId: actor.id, status: 'PENDING', attempts: 0, createdAt: now });
    data.inbox.push({ id: randomUUID(), installationId, ownerId: actor.id, digest: 'a'.repeat(64), deliveryId: 'fixture-delivery',
      topic: 'products/update', receivedAt: now, status: 'PENDING', attempts: 0 });
    data.operations.push({ id: operationId, ownerId: actor.id, installationRevision: 1,
      input: { installationId, variantId, expectedRevision: 1, expectedConstitutionVersion: 1, price: '105.00', reason: 'Owner reviewed fixture price state' },
      before, createdAt: now, status: 'CONFIRMED', receipt: { provider: 'shopify', environment: 'staging', operationId,
        workspaceId: 'workspace', actorId: actor.id, authorization: { constitutionVersion: 1, resourceRevision: 1, installationRevision: 1 },
        dispatchedAt: now, completedAt: '2026-09-28T10:00:01.000Z', requestId: 'fixture-request', before: observation,
        requestedPrice: '105.00', after, outcome: 'CONFIRMED' } });
    return { seeded: true };
  });
  return { filePath, operationId };
}

async function assertDeniedWithoutRewrite(corrupt: (state: Record<string, any>, operationId: string) => void) {
  const f = await fixture();
  const state = JSON.parse(await readFile(f.filePath, 'utf8')) as Record<string, any>;
  corrupt(state, f.operationId);
  await writeFile(f.filePath, JSON.stringify(state, null, 2), 'utf8');
  const corruptedBytes = await readFile(f.filePath);
  await expect(createEngine({ filePath: f.filePath, seed: false })).rejects.toMatchObject({ code: 'SHOPIFY_STATE_INVALID' });
  expect(await readFile(f.filePath)).toEqual(corruptedBytes);
}

describe('persisted Shopify state fails closed at restart', () => {
  it('rejects malformed merchant variants without replacing the corrupted ledger', async () => {
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.variants[0].variantId = 'not-a-shopify-id'; });
  });
  it('rejects malformed money and dangling installation references', async () => {
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.variants[0].price = '1e3'; });
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.variants[0].installationId = randomUUID(); });
  });
  it('rejects malformed OAuth UUIDs and workspace-crossed installation records', async () => {
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyOAuth.installations[0].id = 'not-a-uuid'; });
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyOAuth.installations[0].workspaceId = 'another-workspace'; });
  });
  it('rejects unknown operation status values', async () => {
    await assertDeniedWithoutRewrite((state, id) => { state.extensions.shopifyCommerce.operations.find((item: any) => item.id === id).status = 'SENT'; });
  });
  it('rejects impossible provider receipt shapes', async () => {
    await assertDeniedWithoutRewrite((state, id) => { state.extensions.shopifyCommerce.operations.find((item: any) => item.id === id).receipt.after = null; });
  });
  it('rejects malformed webhook inbox dates and digests', async () => {
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.inbox[0].receivedAt = 'yesterday'; });
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.inbox[0].digest = 'private'; });
  });
  it('rejects malformed sync jobs and unsupported future extension versions', async () => {
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.jobs[0].status = 'WORKING'; });
    await assertDeniedWithoutRewrite(state => { state.extensions.shopifyCommerce.version = 99; });
  });
  it('rejects an inbox event whose reconciliation link does not exist', async () => {
    await assertDeniedWithoutRewrite(state => {
      Object.assign(state.extensions.shopifyCommerce.inbox[0], { status: 'RECONCILED', syncJobId: randomUUID(),
        queuedAt: '2026-09-28T10:00:01.000Z', reconciledAt: '2026-09-28T10:00:02.000Z' });
    });
  });
});
