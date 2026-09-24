import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEngine, type EngineOptions } from '../src/engine.js';
import { shopifyData, type MerchantVariant } from '../src/shopify-state.js';
import { ShopifyCommerceService } from '../src/shopify-service.js';
import type { ShopifyOAuthService } from '../src/shopify-oauth.js';
import type { ShopifyPricePort } from '../src/shopify-provider.js';
import type { RuntimeStateStore } from '../src/stores/types.js';
import type { EngineState } from '../src/types.js';

// Transactional adapter fixture: failures can occur before commit or after commit
// but before its acknowledgement. A fresh engine sees only the committed snapshot.
class FaultingStore implements RuntimeStateStore {
  private state: EngineState | null = null;
  fault?: { event: string; afterCommit: boolean };
  async read() { return structuredClone(this.state); }
  async close() {}
  async transaction<T>(callback: (state: EngineState | null) => Promise<{ state: EngineState; result: T }>) {
    const previousLength = this.state?.audit.length ?? 0;
    const next = await callback(structuredClone(this.state));
    const fault = this.fault && next.state.audit.slice(previousLength).some(entry => entry.eventType === this.fault?.event) ? this.fault : undefined;
    if (fault) this.fault = undefined;
    if (!fault || fault.afterCommit) this.state = structuredClone(next.state);
    if (fault) throw new Error(fault.afterCommit ? 'Commit acknowledgement lost' : 'Commit rejected');
    return structuredClone(next);
  }
}

const dirs: string[] = [];
const actor = { type: 'owner' as const, id: 'merchant-owner' };
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(extra: Partial<EngineOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-price-')); dirs.push(directory);
  const filePath = join(directory, 'state.json'), installationId = randomUUID(), now = new Date('2026-09-17T12:00:00.000Z');
  let stopped = false;
  const options: EngineOptions = { filePath, initializeEmptyFile: true, mode: 'live', seed: false, now: () => now, shopifyStagingShops: ['staging-shop.myshopify.com'], killSwitchReader: async () => ({ engaged: stopped }), ...extra };
  const engine = await createEngine(options);
  const variant: MerchantVariant = { installationId, ownerId: actor.id, variantId: 'gid://shopify/ProductVariant/123', productId: 'gid://shopify/Product/12', title: 'Test item', sku: 'T-1', price: '100.00', currency: 'USD', providerRevision: now.toISOString(), observedAt: now.toISOString(), revision: 1, requestId: 'fixture-read', economics: { landedCost: 30, estimatedCac: 5, category: 'Home', evidence: 'Owner supplied test cost', validUntil: '2026-09-18T12:00:00.000Z' } };
  await engine.extensionTransaction('integration.fixture', {}, actor, 'seed', state => {
    state.extensions!.shopifyOAuth = { version: 1, workspaceId: 'workspace', pending: [], installations: [{ id: installationId, workspaceId: 'workspace', ownerId: actor.id, shop: 'staging-shop.myshopify.com', clientId: 'fixture-client', revision: 1, scopes: ['read_products', 'write_products'], status: 'INSTALLED', createdAt: now.toISOString(), installedAt: now.toISOString(), expiresAt: '2026-09-18T12:00:00.000Z', refreshExpiresAt: '2026-10-01T12:00:00.000Z', encryptedTokens: 'fixture-not-a-real-token' }] };
    shopifyData(state).variants.push(structuredClone(variant)); return { seeded: true };
  });
  variant.developmentStore = true;
  let remote = { ...variant };
  const port: ShopifyPricePort = { read: vi.fn(async () => ({ ...remote })), write: vi.fn(async (_productId, _id, price) => { remote = { ...remote, price, providerRevision: '2026-09-17T12:00:01.000Z' }; return { requestId: 'fixture-write' }; }), locations: async () => [] };
  const oauth = { accessToken: async () => ({ shop: 'staging-shop.myshopify.com', accessToken: 'fixture-token', revision: 1, scopes: ['write_products'] }) } as unknown as ShopifyOAuthService;
  const service = new ShopifyCommerceService(engine, oauth, { webhookSecret: 'fixture-secret', port: () => port, now: () => now });
  const input = { installationId, variantId: variant.variantId, expectedRevision: 1, expectedConstitutionVersion: 1, price: '110.00', reason: 'Owner-reviewed staging price experiment' };
  return { engine, options, port, oauth, service, input, variant, now, setKill: () => { stopped = true; }, changeRemote: (price: string) => { remote = { ...remote, price, providerRevision: '2026-09-17T12:00:02.000Z' }; } };
}
describe('guarded Shopify staging price execution', () => {
  it('durably proposes, dispatches once, reconciles, audits and replays without another write', async () => {
    const f = await fixture();
    const proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    expect(proposal).toMatchObject({ decision: 'allow', status: 'PENDING' });
    expect(f.port.write).not.toHaveBeenCalled();
    expect(await f.service.execute(String(proposal.operationId), actor)).toMatchObject({ decision: 'allow', status: 'CONFIRMED', receipt: { environment: 'staging', requestId: 'fixture-write', after: { price: '110.00' } } });
    await f.service.execute(String(proposal.operationId), actor);
    const restart = await createEngine(f.options);
    expect(await restart.prepareShopifyPrice(f.input, actor, 'proposal')).toEqual(proposal);
    expect(f.port.write).toHaveBeenCalledTimes(1);
    const state = await restart.snapshot();
    expect(shopifyData(state).variants[0]).toMatchObject({ revision: 2, price: '110.00' });
    expect(state.audit.some(e => e.eventType === 'shopify.price.executed')).toBe(true);
    await expect(restart.prepareShopifyPrice({ ...f.input, price: '111.00' }, actor, 'proposal')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('competing callers acquire at most one durable dispatch claim', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    await Promise.all([f.service.execute(String(proposal.operationId), actor), f.service.execute(String(proposal.operationId), actor)]);
    expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it('crash after durable claim never resends, even after restart', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    await f.engine.claimShopifyPrice(String(proposal.operationId), actor);
    const restarted = new ShopifyCommerceService(await createEngine(f.options), f.oauth, { webhookSecret: 'fixture', port: () => f.port });
    expect(await restarted.execute(String(proposal.operationId), actor)).toMatchObject({ dispatchRepeated: false, operation: { status: 'DISPATCHING' } });
    expect(f.port.write).not.toHaveBeenCalled();
  });
  it('a rejected dispatch-claim commit cannot send to the provider and can safely retry', async () => {
    const store = new FaultingStore();
    const f = await fixture({ filePath: undefined, store, initializeEmptyStore: true });
    const proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId);
    store.fault = { event: 'shopify.price.claimed', afterCommit: false };
    await expect(f.service.execute(id, actor)).rejects.toThrow('Commit rejected');
    expect(f.port.write).not.toHaveBeenCalled();
    const restartedEngine = await createEngine(f.options);
    const restored = await restartedEngine.snapshot();
    expect(shopifyData(restored).operations[0].status).toBe('PENDING');
    expect(restored.audit.some(event => event.eventType === 'shopify.price.claimed')).toBe(false);
    const restarted = new ShopifyCommerceService(restartedEngine, f.oauth, { webhookSecret: 'fixture', port: () => f.port });
    expect(await restarted.execute(id, actor)).toMatchObject({ decision: 'allow', status: 'CONFIRMED' });
    expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('never resends after provider success and a result-commit failure (committed: %s)', async afterCommit => {
    const store = new FaultingStore();
    const f = await fixture({ filePath: undefined, store, initializeEmptyStore: true });
    const proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId);
    store.fault = { event: 'shopify.price.executed', afterCommit };
    await expect(f.service.execute(id, actor)).rejects.toThrow(afterCommit ? 'Commit acknowledgement lost' : 'Commit rejected');
    expect(f.port.write).toHaveBeenCalledTimes(1);
    expect(await f.port.read(f.input.variantId)).toMatchObject({ price: f.input.price });

    const restartedEngine = await createEngine(f.options);
    const restarted = new ShopifyCommerceService(restartedEngine, f.oauth, { webhookSecret: 'fixture', port: () => f.port });
    const status = afterCommit ? 'CONFIRMED' : 'DISPATCHING';
    expect(await restarted.execute(id, actor)).toMatchObject({ dispatchRepeated: false, operation: { status } });
    expect(await restarted.execute(id, actor, 'fresh-http-key')).toMatchObject({ dispatchRepeated: false, operation: { status } });
    expect(await restarted.reconcile(id, actor, 'reconcile')).toMatchObject({ providerWritePerformed: false, operation: { status, reconciliation: { matchesTarget: true } } });
    const restored = await restartedEngine.snapshot();
    expect(restored.audit.filter(event => event.eventType === 'shopify.price.claimed')).toHaveLength(1);
    expect(restored.audit.filter(event => event.eventType === 'shopify.price.executed')).toHaveLength(afterCommit ? 1 : 0);
    expect(shopifyData(restored).operations[0].receipt?.outcome).toBe(afterCommit ? 'CONFIRMED' : undefined);
    if (!afterCommit) expect(await restartedEngine.prepareShopifyPrice(f.input, actor, 'replacement')).toMatchObject({ decision: 'deny', reason: 'PROVIDER_OPERATION_UNRESOLVED' });
    expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it('lost provider response remains unknown, blocks new writes, and reconciles without claiming causality', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    f.port.write = vi.fn(async () => { f.changeRemote('110.00'); throw new Error('lost response'); });
    expect(await f.service.execute(String(proposal.operationId), actor)).toMatchObject({ decision: 'unknown', status: 'UNKNOWN' });
    expect(await f.service.reconcile(String(proposal.operationId), actor, 'reconcile')).toMatchObject({ providerWritePerformed: false, operation: { status: 'UNKNOWN', reconciliation: { matchesTarget: true } } });
    expect(await f.engine.prepareShopifyPrice(f.input, actor, 'new-proposal')).toMatchObject({ reason: 'PROVIDER_OPERATION_UNRESOLVED' });
    await f.service.execute(String(proposal.operationId), actor); expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it('records an owner investigation against current reconciliation without releasing an unknown price', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId);
    f.port.write = vi.fn(async () => { f.changeRemote('110.00'); throw new Error('lost response'); });
    await f.service.execute(id, actor);
    await f.service.reconcile(id, actor, 'observe');
    const operation = shopifyData(await f.engine.snapshot()).operations[0];
    const input = { expectedStatus: 'UNKNOWN', expectedReconciliationAt: operation.reconciliation!.at, expectedReconciliationRevision: operation.reconciliation!.revision!,
      nextStep: 'CONTACT_SHOPIFY_SUPPORT', note: 'Owner will request the exact provider event record before deciding any further action.',
      evidence: [{ source: 'SHOPIFY_SUPPORT', reference: 'support-case-12345' }] };
    const saved = await f.engine.recordShopifyPriceInvestigation(id, input, actor, 'review');
    expect(saved).toMatchObject({ decision: 'allow', status: 'UNKNOWN', lockRetained: true, verifiedProviderEvidence: false });
    const restarted = await createEngine(f.options);
    expect(await restarted.recordShopifyPriceInvestigation(id, input, actor, 'review')).toEqual(saved);
    const state = await restarted.snapshot(), reviewed = shopifyData(state).operations[0];
    expect(reviewed.status).toBe('UNKNOWN');
    expect(reviewed.investigations).toHaveLength(1);
    expect(reviewed.investigations![0]).toMatchObject({ reviewerId: actor.id, nextStep: 'CONTACT_SHOPIFY_SUPPORT', verifiedProviderEvidence: false,
      reconciliation: { matchesTarget: true } });
    expect(state.audit.filter(event => event.eventType === 'shopify.price.investigation-recorded')).toHaveLength(1);
    expect(JSON.stringify(state.audit.filter(event => event.eventType === 'shopify.price.investigation-recorded'))).not.toContain(input.note);
    expect(await restarted.prepareShopifyPrice(f.input, actor, 'replacement')).toMatchObject({ reason: 'PROVIDER_OPERATION_UNRESOLVED' });
    await f.service.reconcile(id, actor, 'same-clock-observation');
    expect(shopifyData(await f.engine.snapshot()).operations[0].reconciliation!.at).toBe(input.expectedReconciliationAt);
    await expect(restarted.recordShopifyPriceInvestigation(id, input, actor, 'stale-review')).rejects.toMatchObject({ code: 'INVESTIGATION_EVIDENCE_CHANGED' });
    expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it('rejects stale, foreign, malformed, or replay-altered investigation notes', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId);
    const input = { expectedStatus: 'DISPATCHING', expectedReconciliationAt: null, expectedReconciliationRevision: null, nextStep: 'INVESTIGATE_PROVIDER_LOGS',
      note: 'Owner is reviewing the durable dispatch claim and provider request logs.', evidence: [] };
    await expect(f.engine.recordShopifyPriceInvestigation(id, input, actor, 'pending')).rejects.toMatchObject({ code: 'INVESTIGATION_STATE_CHANGED' });
    await f.engine.claimShopifyPrice(id, actor);
    await expect(f.engine.recordShopifyPriceInvestigation(id, input, { type: 'owner', id: 'other' }, 'foreign')).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await expect(f.engine.recordShopifyPriceInvestigation(id, input, { type: 'agent', id: 'marketing_agent' }, 'agent')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(f.engine.recordShopifyPriceInvestigation(id, { ...input, note: 'short' }, actor, 'short')).rejects.toThrow();
    await expect(f.engine.recordShopifyPriceInvestigation(id, { ...input, force: true }, actor, 'force')).rejects.toThrow();
    await expect(f.engine.recordShopifyPriceInvestigation(id, { ...input, expectedReconciliationAt: new Date().toISOString() }, actor, 'stale')).rejects.toMatchObject({ code: 'INVESTIGATION_EVIDENCE_CHANGED' });
    await f.engine.recordShopifyPriceInvestigation(id, input, actor, 'review');
    await expect(f.engine.recordShopifyPriceInvestigation(id, { ...input, note: `${input.note} Additional text.` }, actor, 'review')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(shopifyData(await f.engine.snapshot()).operations[0].status).toBe('DISPATCHING');
    expect(f.port.write).not.toHaveBeenCalled();
  });
  it.each([
    ['disabled capability', { shopifyStagingShops: [] }, 'SHOPIFY_STAGING_CAPABILITY_DISABLED'],
    ['missing kill reader', { killSwitchReader: undefined }, 'KILL_SWITCH_UNAVAILABLE'],
    ['unreachable kill', { killSwitchReader: async () => { throw new Error('outage'); } }, 'KILL_SWITCH_UNAVAILABLE'],
    ['engaged kill', { killSwitchReader: async () => ({ engaged: true }) }, 'KILL_SWITCH_ENGAGED'],
  ] as const)('denies %s', async (_name, options, reason) => {
    const f = await fixture(options); expect(await f.engine.prepareShopifyPrice(f.input, actor, 'deny')).toMatchObject({ decision: 'deny', reason }); expect(f.port.write).not.toHaveBeenCalled();
  });
  it.each([
    [{ price: '20.00' }, 'MARGIN_BELOW_FLOOR'], [{ price: '150.00' }, 'PRICE_CHANGE_LIMIT_EXCEEDED'],
    [{ expectedRevision: 9 }, 'RESOURCE_CHANGED'], [{ expectedConstitutionVersion: 9 }, 'CONSTITUTION_CHANGED'],
  ])('denies invalid economics or revision %j', async (change, reason) => {
    const f = await fixture(); expect(await f.engine.prepareShopifyPrice({ ...f.input, ...change }, actor, 'deny')).toMatchObject({ reason });
  });
  it('requires fresh canonical state and fresh cost evidence', async () => {
    const f = await fixture(); f.now.setTime(f.now.getTime() + 120001);
    expect(await f.engine.prepareShopifyPrice(f.input, actor, 'stale')).toMatchObject({ reason: 'STALE_PROVIDER_STATE' });
    await f.engine.extensionTransaction('integration.fixture.expire', {}, actor, 'expire', state => { const v = shopifyData(state).variants[0]; v.observedAt = f.now.toISOString(); v.economics!.validUntil = '2026-09-16T00:00:00.000Z'; return {}; });
    expect(await f.engine.prepareShopifyPrice(f.input, actor, 'cost')).toMatchObject({ reason: 'COST_EVIDENCE_REQUIRED' });
  });
  it('checks pause, policy edits and provider owner edits immediately before dispatch', async () => {
    for (const cause of ['pause', 'policy', 'provider']) {
      const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
      if (cause === 'pause') await f.engine.setPause(true, { reason: 'owner interruption' }, actor, 'pause');
      if (cause === 'policy') await f.engine.updateConstitution({ expectedVersion: 1, reason: 'Owner changes active policy', maxPriceChangePct: 10 }, actor, 'policy');
      if (cause === 'provider') f.changeRemote('102.00');
      expect(await f.service.execute(String(proposal.operationId), actor)).toMatchObject({ decision: 'deny', status: 'DENIED' }); expect(f.port.write).not.toHaveBeenCalled();
    }
  });
  it('rechecks kill after provider preflight and refuses agent or foreign owner calls', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    f.port.read = vi.fn(async () => { f.setKill(); return f.variant; });
    expect(await f.service.execute(String(proposal.operationId), actor)).toMatchObject({ reason: 'KILL_SWITCH_ENGAGED' }); expect(f.port.write).not.toHaveBeenCalled();
    await expect(f.engine.prepareShopifyPrice(f.input, { type: 'agent', id: 'sourcing_agent' }, 'agent')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(f.service.execute(String(proposal.operationId), { type: 'owner', id: 'other' })).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });
  it('compensation is a new authorization and refuses a later merchant edit', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    await f.service.execute(String(proposal.operationId), actor);
    const compensation = await f.engine.prepareShopifyPrice({ ...f.input, price: '100.00', expectedRevision: 2, compensationFor: proposal.operationId }, actor, 'compensate');
    expect(compensation.decision).toBe('allow'); f.changeRemote('115.00');
    expect(await f.service.execute(String(compensation.operationId), actor)).toMatchObject({ reason: 'PROVIDER_RESOURCE_CHANGED' }); expect(f.port.write).toHaveBeenCalledTimes(1);
  });
  it('refuses a normal merchant store even when its hostname was allowlisted for staging', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    f.port.read = vi.fn(async () => ({ ...f.variant, developmentStore: false }));
    expect(await f.service.execute(String(proposal.operationId), actor)).toMatchObject({ reason: 'DEVELOPMENT_STORE_REQUIRED' }); expect(f.port.write).not.toHaveBeenCalled();
  });
  it('withdraws an unclaimed proposal durably, permits fresh planning and never replays cancellation as execution', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId), body = { reason: 'Owner withdrew the price experiment' };
    const cancelled = await f.engine.cancelShopifyPrice(id, body, actor, 'cancel');
    expect(cancelled).toMatchObject({ decision: 'allow', operationId: id, status: 'CANCELLED' });
    const restartedEngine = await createEngine(f.options);
    expect(await restartedEngine.cancelShopifyPrice(id, body, actor, 'cancel')).toEqual(cancelled);
    const restored = await restartedEngine.snapshot();
    expect(shopifyData(restored).operations[0]).toMatchObject({ status: 'CANCELLED', cancellation: { reason: body.reason, at: f.now.toISOString(), actorId: actor.id } });
    expect(restored.audit.filter(event => event.eventType === 'shopify.price.cancelled')).toHaveLength(1);
    const restarted = new ShopifyCommerceService(restartedEngine, f.oauth, { webhookSecret: 'fixture', port: () => f.port });
    expect(await restarted.execute(id, actor)).toMatchObject({ dispatchRepeated: false, operation: { status: 'CANCELLED' } });
    expect(await restartedEngine.claimShopifyPrice(id, actor)).toMatchObject({ claimed: false, status: 'CANCELLED' });
    expect(await restartedEngine.prepareShopifyPrice(f.input, actor, 'fresh-proposal')).toMatchObject({ decision: 'allow', status: 'PENDING' });
    await expect(restartedEngine.cancelShopifyPrice(id, { reason: 'Different cancellation justification' }, actor, 'cancel')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.port.write).not.toHaveBeenCalled();
  });
  it('allows withdrawal during pause and kill without inspecting provider credentials', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    await f.engine.setPause(true, { reason: 'Owner stops pending experiments' }, actor, 'pause'); f.setKill();
    const accessToken = vi.spyOn(f.oauth, 'accessToken');
    expect(await f.engine.cancelShopifyPrice(String(proposal.operationId), { reason: 'Owner withdraws after emergency stop' }, actor, 'cancel')).toMatchObject({ status: 'CANCELLED' });
    expect(accessToken).not.toHaveBeenCalled(); expect(f.port.write).not.toHaveBeenCalled();
  });
  it('enforces ownership, strict input and idempotency before cancelling a proposal', async () => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId), body = { reason: 'Owner withdraws this proposal' };
    await expect(f.engine.cancelShopifyPrice(id, body, { type: 'agent', id: 'sourcing_agent' }, 'agent')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(f.engine.cancelShopifyPrice(id, body, { type: 'owner', id: 'foreign' }, 'foreign')).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    await expect(f.engine.cancelShopifyPrice(id, { reason: 'short' }, actor, 'short')).rejects.toThrow();
    await expect(f.engine.cancelShopifyPrice(id, { ...body, status: 'PENDING' }, actor, 'extra')).rejects.toThrow();
    await expect(f.engine.cancelShopifyPrice(id, body, actor, '')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(shopifyData(await f.engine.snapshot()).operations[0].status).toBe('PENDING');
  });
  it.each(['DISPATCHING', 'UNKNOWN', 'CONFIRMED'] as const)('cannot cancel %s or clear its execution history', async status => {
    const f = await fixture(), proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal');
    const id = String(proposal.operationId);
    if (status === 'DISPATCHING') await f.engine.claimShopifyPrice(id, actor);
    else {
      if (status === 'UNKNOWN') f.port.write = vi.fn(async () => { throw new Error('Response lost'); });
      await f.service.execute(id, actor);
    }
    const before = await f.engine.snapshot();
    await expect(f.engine.cancelShopifyPrice(id, { reason: 'Attempt to clear an existing dispatch' }, actor, 'cancel')).rejects.toMatchObject({ code: 'OPERATION_NOT_CANCELLABLE' });
    expect(await f.engine.snapshot()).toEqual(before);
  });
  it('keeps the pending proposal intact when its cancellation cannot commit', async () => {
    const store = new FaultingStore(), f = await fixture({ filePath: undefined, store, initializeEmptyStore: true });
    const proposal = await f.engine.prepareShopifyPrice(f.input, actor, 'proposal'), id = String(proposal.operationId);
    store.fault = { event: 'shopify.price.cancelled', afterCommit: false };
    const body = { reason: 'Owner withdraws pending experiment' };
    await expect(f.engine.cancelShopifyPrice(id, body, actor, 'cancel')).rejects.toThrow('Commit rejected');
    const restarted = await createEngine(f.options);
    expect(shopifyData(await restarted.snapshot()).operations[0].status).toBe('PENDING');
    expect(await restarted.cancelShopifyPrice(id, body, actor, 'cancel')).toMatchObject({ status: 'CANCELLED' });
    expect(f.port.write).not.toHaveBeenCalled();
  });
});
