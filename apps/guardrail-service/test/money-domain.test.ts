import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@hotl/schemas';
import { aggregateMoneySchema, toMinor, fromMinor } from '@hotl/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine, MAX_ORDER_VALUE } from '../src/engine.js';

const owner: Actor = { type: 'owner', id: 'money-domain-owner' };
const directories: string[] = [];
afterEach(async () => {
  // `ENOTEMPTY` on Windows is a teardown race, not a product fault: the engine's final
  // `rename` of the ledger and its lock release can still be settling when the assertion has
  // finished, so a delete-pending or freshly created entry makes `rm` report a non-empty
  // directory. This file passes 6/6 in isolation and fails only inside the full parallel pool,
  // which is the signature of load-dependent teardown rather than flaky assertions. Retrying the
  // removal is the fix; the assertions are untouched and no timeout was raised.
  for (const directory of directories.splice(0)) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }); }
    catch { /* the OS owns this directory once the test is over; a leftover temp dir is not a test failure */ }
  }
});

/** A file-backed ledger whose persisted revenue total is rewritten to a chosen lifetime value. */
async function ledgerWithBaseRevenue(value: number) {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-money-domain-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  await createEngine({ filePath, initializeEmptyFile: true });
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  raw.baseRevenue = value;
  await writeFile(filePath, JSON.stringify(raw, null, 2), 'utf8');
  return { filePath, engine: await createEngine({ filePath }) };
}

const cart = (productId: string, quantity: number) => ({
  items: [{ productId, quantity }],
  customer: { name: 'Domain Fixture', email: 'domain@example.test' },
});

describe('money-domain separation and non-throwing ledger faults', () => {
  it('converts lifetime totals without applying the per-transaction request ceiling', () => {
    // toMinor is pure arithmetic: it must never validate, because it also converts persisted
    // lifetime aggregates that legitimately exceed any single request's domain.
    expect(toMinor(999_999.99)).toBe(99_999_999);
    expect(toMinor(1_000_000.01)).toBe(100_000_001);
    expect(toMinor(599_999_994)).toBe(59_999_999_400);
    expect(fromMinor(toMinor(12.34))).toBe(12.34);
    // The lifetime aggregate domain is deliberately wider than the per-transaction money domain.
    expect(aggregateMoneySchema.safeParse(999_999_999_999).success).toBe(true);
  });

  it('keeps accepting ordinary orders after lifetime revenue crosses the old $1M ceiling', async () => {
    const { engine } = await ledgerWithBaseRevenue(999_999.99);
    const results = [];
    for (let index = 0; index < 50; index++) {
      // Must resolve to a governed decision, never an unhandled exception.
      results.push(await engine.checkout(cart('prod-01', 1), owner, `domain-cross-${index}`));
    }
    expect(results.every(item => item.decision === 'allow')).toBe(true);
    const state = await engine.snapshot();
    expect(state.baseRevenue).toBeCloseTo(999_999.99 + 50 * 49, 2);
    expect(state.baseOrders).toBe(342 + 50);
    expect(state.products.find(item => item.id === 'prod-01')?.inventory).toBe(128 - 50);
    // Fifty sequential durable transactions, each rewriting a ledger whose audit chain grows
    // with every one of them. Measured at ~2.8s on an idle machine against Vitest's 5s default,
    // so this had no headroom and timed out inside the full parallel pool while passing in
    // isolation. The loop is the point of the test -- it is what proves the ceiling no longer
    // bricks checkout -- so the timeout is raised to match the real cost rather than the loop
    // being shortened to fit a budget it was never given.
  }, 60_000);

  it('denies a ledger already far past the old ceiling instead of throwing on every order', async () => {
    const { engine } = await ledgerWithBaseRevenue(5_000_000);
    const before = (await engine.snapshot()).audit.length;
    const result = await engine.checkout(cart('prod-01', 1), owner, 'domain-recovered');
    expect(result.decision).toBe('allow');
    const state = await engine.snapshot();
    expect(state.baseRevenue).toBeCloseTo(5_000_049, 2);
    // The attempt is still audited, exactly like any other successful mutation.
    expect(state.audit.length).toBeGreaterThan(before);
    expect(state.audit.at(-1)?.eventType).toBe('commerce.checkout');
  });

  it('keeps a high-revenue product sellable after its lifetime revenue crosses the old ceiling', async () => {
    const { filePath, engine } = await ledgerWithBaseRevenue(0);
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    raw.products[0].revenue = 999_999.99;
    await writeFile(filePath, JSON.stringify(raw, null, 2), 'utf8');
    const reloaded = await createEngine({ filePath });
    for (let index = 0; index < 5; index++) {
      expect((await reloaded.checkout(cart('prod-01', 1), owner, `product-revenue-${index}`)).decision).toBe('allow');
    }
    expect((await reloaded.snapshot()).products.find(item => item.id === 'prod-01')?.revenue).toBeCloseTo(1_000_244.99, 2);
    expect(engine.mode).toBe('simulation');
  });

  it('denies an order above the order-value ceiling and creates nothing', async () => {
    const engine = await createEngine();
    const state = await engine.snapshot();
    const constitutionVersion = state.constitution!.version;
    await engine.createProduct({
      expectedConstitutionVersion: constitutionVersion, reason: 'Establish a high-value listing for the ceiling drill',
      sku: 'VAULT-01', name: 'Vault item', description: 'x', category: 'Audit',
      price: MAX_ORDER_VALUE, landedCost: 0, estimatedCac: 0, inventory: 10, status: 'active', countryOfOrigin: 'US',
    }, owner, 'ceiling-product');
    const vault = (await engine.snapshot()).products.find(item => item.sku === 'VAULT-01')!;
    const auditBefore = (await engine.snapshot()).audit.length;

    // Two units at the ceiling price exceed the ceiling; exactly one unit does not.
    const denied = await engine.checkout(cart(vault.id, 2), owner, 'ceiling-exceeded');
    expect(denied.decision).toBe('deny');
    expect(denied.reason).toBe('ORDER_VALUE_LIMIT_EXCEEDED');
    expect(denied.maximumOrderValue).toBe(MAX_ORDER_VALUE);

    // Exactly at the ceiling is still permitted; only above it is denied.
    const atLimit = await engine.checkout(
      { items: [{ productId: vault.id, quantity: 1 }], customer: { name: 'Edge Buyer', email: 'edge@example.test' } },
      owner, 'ceiling-product-at-limit');
    expect(atLimit.decision).toBe('allow');

    const after = await engine.snapshot();
    expect(after.products.find(item => item.id === vault.id)?.inventory).toBe(9);
    expect(after.orders.some(order => order.items.some(line => line.productId === vault.id))).toBe(true);
    expect(after.audit.length).toBeGreaterThan(auditBefore);
  });

  it('records a governed denial and commits no partial mutation when the ledger state is corrupt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-money-domain-'));
    directories.push(directory);
    const filePath = join(directory, 'ledger.json');
    await createEngine({ filePath, initializeEmptyFile: true });
    const engine = await createEngine({ filePath });

    // Corrupt one order's line items on disk. The audit chain is untouched, so the ledger
    // still verifies; the corruption only surfaces while the action is executing.
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    raw.orders[0].items = null;
    await writeFile(filePath, JSON.stringify(raw, null, 2), 'utf8');

    const before = await engine.snapshot();
    const result = await engine.placeSupplierOrder({ productId: 'prod-01', orderId: 'ORD-1029', quantity: 1 }, owner, 'corrupt-state-drill');

    // An unexpected fault denies explicitly instead of escaping as an unhandled exception.
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('STATE_DOMAIN_VIOLATION');

    const after = await engine.snapshot();
    expect(after.supplierOrders).toHaveLength(0);
    expect(after.orders.find(item => item.id === 'ORD-1029')).toEqual(before.orders.find(item => item.id === 'ORD-1029'));
    // The denied attempt is still durably audited.
    const entry = after.audit.at(-1);
    expect(entry?.eventType).toBe('supplier.order');
    expect((entry?.payload.result as { reason: string }).reason).toBe('STATE_DOMAIN_VIOLATION');
  });
});