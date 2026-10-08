import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@hotl/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';

// These assertions cover guarantees the 2026-10-09 audit found were asserted in the code but
// not enforced. Each one fails against the pre-fix engine.

const owner: Actor = { type: 'owner', id: 'authz-owner' };
const orderAgent: Actor = { type: 'agent', id: 'order_agent' };
const sourcingAgent: Actor = { type: 'agent', id: 'sourcing_agent' };
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function ledger() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-engine-authz-'));
  directories.push(directory);
  return createEngine({ filePath: join(directory, 'ledger.json'), initializeEmptyFile: true });
}
const cart = (productId: string) => ({ items: [{ productId, quantity: 1 }], customer: { name: 'Authz Buyer', email: 'authz@example.test' } });

describe('engine-level authorization and provenance', () => {
  it('denies checkout to an agent outside the commerce scope and changes nothing', async () => {
    const engine = await ledger();
    const before = await engine.snapshot();
    const result = await engine.checkout(cart(before.products[0].id), sourcingAgent, 'scope-denied-checkout');
    expect(result).toMatchObject({ decision: 'deny', reason: 'AGENT_SCOPE_REQUIRED' });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(before.orders.length);
    expect(after.baseRevenue).toBe(before.baseRevenue);
    expect(after.products.map(p => p.inventory)).toEqual(before.products.map(p => p.inventory));
  });

  it('denies an in-scope agent checkout that carries no Constitution binding', async () => {
    const engine = await ledger();
    const before = await engine.snapshot();
    const result = await engine.checkout(cart(before.products[0].id), orderAgent, 'unbound-checkout');
    expect(result).toMatchObject({ decision: 'deny', reason: 'AGENT_CONTEXT_REQUIRED' });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(before.orders.length);
    expect(after.products.map(p => p.inventory)).toEqual(before.products.map(p => p.inventory));
  });

  it('denies a stale Constitution binding rather than acting on a superseded policy', async () => {
    const engine = await ledger();
    const stale = (await engine.snapshot()).constitution!.version;
    const before = await engine.snapshot();
    await engine.updateConstitution({ expectedVersion: stale, mode: 'SUPERVISED', reason: 'Move the policy on before the caller arrives' }, owner, 'policy-moved-on');
    const result = await engine.checkout({ ...cart((await engine.snapshot()).products[0].id), expectedConstitutionVersion: stale }, orderAgent, 'stale-binding-checkout');
    expect(result).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED' });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(before.orders.length);
    expect(after.products.map(p => p.inventory)).toEqual(before.products.map(p => p.inventory));
  });

  it('still lets an owner check out without a version binding', async () => {
    const engine = await ledger();
    const before = await engine.snapshot();
    const result = await engine.checkout(cart(before.products[0].id), owner, 'owner-checkout');
    expect(result.decision).toBe('allow');
    expect((await engine.snapshot()).orders).toHaveLength(before.orders.length + 1);
  });

  it('does not let a refused request consume another caller\'s idempotency key', async () => {
    const engine = await ledger();
    const before = await engine.snapshot();
    const product = before.products[0];
    // A refusal must not permanently burn the key for everyone else.
    const refused = await engine.checkout(cart(product.id), sourcingAgent, 'shared-key-0001');
    expect(refused).toMatchObject({ decision: 'deny', reason: 'AGENT_SCOPE_REQUIRED' });
    // The owner reusing the very same key is unaffected, and the request is genuinely evaluated.
    const ownerResult = await engine.checkout(cart(product.id), owner, 'shared-key-0001');
    expect(ownerResult.decision).toBe('allow');
    expect(ownerResult).not.toHaveProperty('replayed');
    // A successful operation still records, so a real replay is still suppressed.
    const replayed = await engine.checkout(cart(product.id), owner, 'shared-key-0001');
    expect(replayed).toMatchObject({ decision: 'allow', replayed: true });
    expect((await engine.snapshot()).orders).toHaveLength(before.orders.length + 1);
  });

  it('separates measured metrics from fabricated telemetry (rule 6)', async () => {
    const engine = await ledger();
    const telemetry = await engine.telemetry();
    // Anything derived from the persisted ledger.
    expect(telemetry.metrics).toHaveProperty('revenue');
    expect(telemetry.metrics).toHaveProperty('orders');
    expect(telemetry.metrics).toHaveProperty('adSpend');
    // Nothing fabricated may appear alongside measured values under the same key.
    for (const fabricated of ['margin', 'marginChange', 'revenueChange', 'ordersChange']) {
      expect(telemetry.metrics).not.toHaveProperty(fabricated);
    }
    // ...and it must be present, labelled, rather than silently dropped.
    expect(telemetry.synthetic).toMatchObject({ margin: expect.any(Number), chart: expect.any(Array) });
    expect(telemetry.synthetic.note).toMatch(/not observed commerce data/i);
    expect(telemetry).not.toHaveProperty('chart');
  });
});
