import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorError, connectorManifests, type CanonicalProduct, type CommerceConnector } from '@hotl/connector-sdk';
import { createEngine } from '../src/engine.js';
import { IntegrationService } from '../src/integration-service.js';
import type { Actor } from '@hotl/schemas';

const actor: Actor = { type: 'owner', id: 'owner-one' };
const input = { label: 'Read-only store', provider: 'shopify', credentials: { shop: 'merchant.myshopify.com', accessToken: 'test-secret-token-never-exposed' } };
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) { const path = resolve(dir); if (!path.startsWith(resolve(tmpdir())) || !path.includes('hotl-integrations-')) throw new Error('Unsafe fixture cleanup'); await rm(path, { recursive: true, force: true }); } });
const product: CanonicalProduct = { provider: 'shopify', externalId: 'gid://shopify/Product/1', title: 'Actual provider fixture', handle: 'product', status: 'active', updatedAt: '2026-09-09T00:00:00Z', variants: 'separate' };
function connector(fetchProducts: CommerceConnector['listProducts'] = async () => ({ items: [product], nextCursor: null })): CommerceConnector {
  return { manifest: connectorManifests.shopify, health: async () => ({ provider: 'shopify', status: 'connected', checkedAt: new Date().toISOString(), checkedCapabilities: ['catalog.read'], error: null }), listProducts: fetchProducts, listOrders: async () => ({ items: [], nextCursor: null }), listVariants: async () => ({ items: [], nextCursor: null }), listInventory: async () => ({ items: [], nextCursor: null }), listOrderLines: async () => ({ items: [], nextCursor: null }), requireCapability: capability => { if (capability.endsWith('write')) throw new ConnectorError('CAPABILITY_UNAVAILABLE'); } };
}
async function fixture(factory = () => connector()) {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-integrations-')); dirs.push(directory);
  const filePath = join(directory, 'ledger.json'), keyPath = join(directory, 'key');
  const engine = await createEngine({ filePath, seed: false });
  return { engine, filePath, keyPath, service: new IntegrationService(engine, { keyPath, connectorFactory: factory }) };
}
describe('guarded integration storage and durable sync', () => {
  it('encrypts credentials, binds identity and replays registration without leaking secrets to audit or API', async () => {
    const { service, engine, filePath } = await fixture();
    const registered = await service.register(input, actor, 'register');
    expect(await service.register(input, actor, 'register')).toEqual({ ...registered, replayed: true });
    expect(await readFile(filePath, 'utf8')).not.toContain(input.credentials.accessToken);
    expect(JSON.stringify(await service.list(actor))).not.toMatch(/encryptedCredentials|test-secret/);
    expect(JSON.stringify((await engine.snapshot()).audit)).not.toContain(input.credentials.accessToken);
    await expect(service.register(input, { type: 'agent', id: 'sourcing_agent' }, 'agent-register')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    const id = (registered.connection as { id: string }).id;
    await expect(service.sync(id, { expectedRevision: 1 }, { type: 'owner', id: 'other-owner' }, 'foreign')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_FOUND' });
  });
  it('syncs real adapter results and a replay does not fetch again; provider failure preserves prior data', async () => {
    let calls = 0, failed = false;
    const { service } = await fixture(() => connector(async () => { calls++; if (failed) throw new ConnectorError('AUTHENTICATION_FAILED'); return { items: [product], nextCursor: null }; }));
    const registered = await service.register(input, actor, 'register'); const id = (registered.connection as { id: string }).id;
    const success = await service.sync(id, { expectedRevision: 1 }, actor, 'sync');
    expect(success.connection).toMatchObject({ status: 'CONNECTED', productCount: 1, revision: 2 });
    await service.sync(id, { expectedRevision: 1 }, actor, 'sync'); expect(calls).toBe(1);
    failed = true;
    const failure = await service.sync(id, { expectedRevision: 2 }, actor, 'sync-again');
    expect(failure.connection).toMatchObject({ status: 'AUTH_REQUIRED', productCount: 1 });
    expect(failure.sync).toMatchObject({ status: 'failed', error: { code: 'AUTHENTICATION_FAILED' } });
    expect((await service.catalog(actor)).products).toHaveLength(1);
  });
  it('manual disconnect wins against an in-flight sync and preserves the saved catalog', async () => {
    let release!: () => void, entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const { service } = await fixture(() => connector(async () => { entered(); await held; return { items: [product], nextCursor: null }; }));
    const registered = await service.register(input, actor, 'register'); const id = (registered.connection as { id: string }).id;
    const pending = service.sync(id, { expectedRevision: 1 }, actor, 'sync'); await enteredPromise;
    await service.disconnect(id, { expectedRevision: 2, reason: 'Owner takes manual control' }, actor, 'disconnect'); release();
    const completed = await pending;
    expect(completed.connection).toMatchObject({ status: 'DISCONNECTED', productCount: 0, enabled: false });
    expect(completed.sync).toMatchObject({ status: 'failed', error: { code: 'INTEGRATION_CHANGED' } });
  });
  it('rejects a missing or swapped vault key after restart instead of resetting stored credentials', async () => {
    const { service, engine, keyPath } = await fixture();
    const registered = await service.register(input, actor, 'register'); const id = (registered.connection as { id: string }).id;
    await unlink(keyPath);
    const restarted = new IntegrationService(engine, { keyPath, connectorFactory: () => connector() });
    const result = await restarted.sync(id, { expectedRevision: 1 }, actor, 'missing-key-sync');
    expect(result.sync).toMatchObject({ status: 'failed', error: { code: 'VAULT_KEY_MISSING' } });
    await expect(readFile(keyPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects cyclic pagination without publishing a partial catalog', async () => {
    const { service } = await fixture(() => connector(async () => ({ items: [product], nextCursor: 'same-cursor' })));
    const registered = await service.register(input, actor, 'register'); const id = (registered.connection as { id: string }).id;
    const result = await service.sync(id, { expectedRevision: 1 }, actor, 'cyclic-sync');
    expect(result.connection).toMatchObject({ status: 'DEGRADED', productCount: 0 });
    expect(result.sync).toMatchObject({ status: 'failed', error: { code: 'INVALID_RESPONSE' } });
  });
});
