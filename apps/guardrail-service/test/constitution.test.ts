import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { autonomyDomains, type Actor, type BusinessConstitution } from '@hotl/schemas';
import { createEngine, type GuardrailEngine } from '../src/engine.js';

// These tests call the actual engine directly: no fixture supplies missing context,
// updates autonomy implicitly, or catches policy denials on behalf of an agent.
const owner: Actor = { type: 'owner', id: 'policy-owner' };
const marketing: Actor = { type: 'agent', id: 'marketing_agent' };
const sourcing: Actor = { type: 'agent', id: 'sourcing_agent' };
const support: Actor = { type: 'agent', id: 'support_agent' };
const orders: Actor = { type: 'agent', id: 'order_agent' };
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function ownerPolicy(engine: GuardrailEngine, fields: Record<string, unknown>, key = 'owner-policy') {
  const current = (await engine.snapshot()).constitution!;
  const result = await engine.updateConstitution({ expectedVersion: current.version, reason: 'Owner sets the policy for this scenario', ...fields }, owner, key);
  expect(result.decision).toBe('allow');
  return result.constitution as BusinessConstitution;
}

function assertChain(audit: Awaited<ReturnType<GuardrailEngine['snapshot']>>['audit']) {
  let previous: string | null = null;
  for (const entry of audit) {
    const { hash, ...record } = entry;
    const canonical = JSON.stringify(record, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    expect(record.prevHash).toBe(previous);
    expect(hash).toBe(createHash('sha256').update(canonical).digest('hex'));
    previous = hash;
  }
}

describe('Business Constitution and direct engine authorization', () => {
  it('starts with a complete supervised policy and an explicit audit boundary', async () => {
    const state = await (await createEngine({ seed: false })).snapshot();
    expect(state.constitution).toMatchObject({ version: 1, mode: 'SUPERVISED', marginFloor: .4, autoRefundThreshold: 25 });
    expect(Object.keys(state.constitution!.domains)).toEqual([...autonomyDomains]);
    expect(autonomyDomains).toHaveLength(20);
    expect(state.constitutionHistory).toHaveLength(1);
    assertChain(state.audit);
  });

  it.each(['MANUAL', 'COPILOT', 'SUPERVISED', 'AUTONOMOUS'] as const)('%s applies to agent spending while owner actions remain explicit', async mode => {
    const engine = await createEngine({ seed: false });
    const policy = await ownerPolicy(engine, { mode });
    const request = { campaignId: 'mode-campaign', requestedAmount: 5, agentId: marketing.id, expectedConstitutionVersion: policy.version, expectedRevision: 0 };
    const result = await engine.launchCampaign(request, marketing, 'agent-launch');
    if (mode === 'MANUAL') {
      expect(result).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL', domain: 'advertising' });
      expect((await engine.snapshot()).campaigns).toHaveLength(0);
      expect((await engine.launchCampaign(request, owner, 'owner-launch')).decision).toBe('allow');
    } else if (mode === 'COPILOT') {
      expect(result).toMatchObject({ decision: 'escalated', reason: 'COPILOT_APPROVAL_REQUIRED' });
      expect((await engine.snapshot()).campaigns).toHaveLength(0);
      const resolution = await engine.resolveInterrupt(String(result.interruptId), { decision: 'approve' }, owner, 'owner-approve');
      expect(resolution).toMatchObject({ status: 'resolved', execution: { decision: 'allow' } });
    } else {
      expect(result).toMatchObject({ decision: 'allow', status: 'launched' });
    }
    expect((await engine.snapshot()).campaigns).toHaveLength(1);
    assertChain((await engine.snapshot()).audit);
  });

  it.each(['SUPERVISED', 'AUTONOMOUS'] as const)('%s distinguishes public listing approval from a small spending action', async mode => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { mode });
    const result = await engine.publishListing({ productId: 'prod-02', expectedConstitutionVersion: policy.version, expectedRevision: 1 }, sourcing, 'public-listing');
    expect(result.decision).toBe(mode === 'SUPERVISED' ? 'escalated' : 'allow');
    expect((await engine.snapshot()).products.find(product => product.id === 'prod-02')!.revision).toBe(mode === 'SUPERVISED' ? 1 : 2);
  });

  it.each(autonomyDomains)('patches %s independently without rewriting the other nineteen domain policies', async domain => {
    const engine = await createEngine({ seed: false });
    const before = (await engine.snapshot()).constitution!;
    const policy = await ownerPolicy(engine, { domains: { [domain]: { mode: 'MANUAL', paused: true, maxAutoActionAmount: 7.25 } } });
    expect(policy).toMatchObject({ version: 2, mode: 'CUSTOM' });
    expect(policy.domains[domain]).toEqual({ mode: 'MANUAL', paused: true, maxAutoActionAmount: 7.25 });
    for (const other of autonomyDomains.filter(item => item !== domain)) expect(policy.domains[other]).toEqual(before.domains[other]);
    const state = await engine.snapshot();
    expect(state.constitutionHistory!.map(item => item.version)).toEqual([1, 2]);
    expect(state.audit.at(-1)).toMatchObject({ actorType: 'owner', actorId: owner.id, eventType: 'constitution.update' });
    expect(state.audit.at(-1)!.payload.result).toMatchObject({ before, after: policy });
  });

  it('requires owner authority and serializes conflicting policy versions without lost updates', async () => {
    const engine = await createEngine({ seed: false });
    const patch = { expectedVersion: 1, reason: 'Concurrent owner change', projectName: 'Owner One' };
    await expect(engine.updateConstitution(patch, marketing, 'agent-policy')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    await expect(engine.updateConstitution(patch, { type: 'system', id: 'internal-worker' }, 'system-policy')).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    const results = await Promise.all([
      engine.updateConstitution(patch, owner, 'owner-one'),
      engine.updateConstitution({ ...patch, projectName: 'Owner Two' }, owner, 'owner-two'),
    ]);
    expect(results.filter(result => result.decision === 'allow')).toHaveLength(1);
    expect(results.filter(result => result.reason === 'CONSTITUTION_CHANGED')).toHaveLength(1);
    expect((await engine.snapshot()).constitution).toMatchObject({ version: 2, projectName: 'Owner One' });
    expect(await engine.updateConstitution(patch, owner, 'owner-one')).toEqual(results[0]);
    await expect(engine.updateConstitution({ ...patch, projectName: 'Different replay' }, owner, 'owner-one')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await engine.snapshot()).constitutionHistory).toHaveLength(2);
  });

  it('denies missing constitution, resource, and order context without reserving or executing anything', async () => {
    const engine = await createEngine();
    const requests = [
      () => engine.checkSpend({ campaignId: 'context', requestedAmount: 1 }, marketing, 'no-context'),
      () => engine.checkSpend({ campaignId: 'context', requestedAmount: 1, expectedConstitutionVersion: 1 }, marketing, 'no-campaign-revision'),
      () => engine.publishListing({ productId: 'prod-02', expectedRevision: 1 }, sourcing, 'no-policy-version'),
      () => engine.evaluateRefund({ orderId: 'ORD-1030', amount: 1, reasonCode: 'damaged', expectedConstitutionVersion: 1 }, support, 'no-order-revision'),
      () => engine.placeSupplierOrder({ productId: 'prod-02', orderId: 'ORD-1030', quantity: 2, expectedConstitutionVersion: 1, expectedRevision: 1 }, orders, 'no-related-order-revision'),
    ];
    for (const execute of requests) expect(await execute()).toMatchObject({ decision: 'deny', reason: 'AGENT_CONTEXT_REQUIRED', replan: true });
    const state = await engine.snapshot();
    expect(state.reservations).toHaveLength(0);
    expect(state.refunds).toHaveLength(0);
    expect(state.supplierOrders).toHaveLength(0);
    expect(state.products.find(product => product.id === 'prod-02')!.revision).toBe(1);
  });

  it('rejects a correctly versioned caller from another department', async () => {
    const engine = await createEngine({ seed: false });
    expect(await engine.launchCampaign({ campaignId: 'scope', requestedAmount: 1, agentId: support.id, expectedConstitutionVersion: 1, expectedRevision: 0 }, support, 'wrong-scope'))
      .toMatchObject({ decision: 'deny', reason: 'AGENT_SCOPE_REQUIRED' });
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
  });

  it('pauses one domain and checks every domain used by a price-changing listing', async () => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { mode: 'AUTONOMOUS', domains: { advertising: { paused: true }, pricing: { paused: true } } });
    expect(await engine.launchCampaign({ campaignId: 'paused-domain', requestedAmount: 1, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'domain-spend'))
      .toMatchObject({ decision: 'deny', reason: 'DOMAIN_PAUSED', domain: 'advertising' });
    expect(await engine.publishListing({ productId: 'prod-02', sellingPrice: 35, expectedConstitutionVersion: policy.version, expectedRevision: 1 }, sourcing, 'domain-price'))
      .toMatchObject({ decision: 'deny', reason: 'DOMAIN_PAUSED', domain: 'pricing' });
    expect((await engine.publishListing({ productId: 'prod-02', expectedConstitutionVersion: policy.version, expectedRevision: 1 }, sourcing, 'catalog-only')).decision).toBe('allow');
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
  });

  it('escalates actions above domain or global autonomy caps and preserves the exact boundary', async () => {
    const engine = await createEngine({ seed: false });
    let policy = await ownerPolicy(engine, { mode: 'AUTONOMOUS', maxAutonomousTransaction: 15, domains: { advertising: { maxAutoActionAmount: 10 } } });
    expect(await engine.launchCampaign({ campaignId: 'domain-cap', requestedAmount: 10.01, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'domain-cap'))
      .toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED' });
    policy = await ownerPolicy(engine, { domains: { advertising: { maxAutoActionAmount: 100 } } }, 'raise-domain-cap');
    expect((await engine.launchCampaign({ campaignId: 'at-global-cap', requestedAmount: 15, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'at-global-cap')).decision).toBe('allow');
    expect(await engine.launchCampaign({ campaignId: 'above-global-cap', requestedAmount: 15.01, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'above-global-cap'))
      .toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED' });
    expect((await engine.telemetry()).metrics.adSpend).toBe(15);
  });

  it('routes free-form hard rules to owner review instead of treating text as executable policy', async () => {
    const engine = await createEngine({ seed: false });
    const policy = await ownerPolicy(engine, { mode: 'AUTONOMOUS', hardRules: ['Ask the owner before promoting seasonal products'] });
    expect(await engine.launchCampaign({ campaignId: 'human-rule', requestedAmount: 1, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'hard-rule'))
      .toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED' });
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
  });

  it('expires pending proposals after policy changes and denies stale agent context', async () => {
    const engine = await createEngine({ seed: false });
    const policy = await ownerPolicy(engine, { mode: 'COPILOT' });
    const request = { campaignId: 'old-policy', requestedAmount: 5, expectedConstitutionVersion: policy.version, expectedRevision: 0 };
    const proposal = await engine.launchCampaign(request, marketing, 'old-policy-proposal');
    const next = await ownerPolicy(engine, { mode: 'MANUAL' }, 'owner-takes-control');
    expect((await engine.snapshot()).interrupts.find(item => item.id === proposal.interruptId)).toMatchObject({ status: 'expired' });
    expect(await engine.launchCampaign(request, marketing, 'stale-policy-execution')).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED', currentConstitutionVersion: next.version });
    expect(await engine.resolveInterrupt(String(proposal.interruptId), { decision: 'approve' }, owner, 'stale-policy-approval')).toMatchObject({ decision: 'deny', reason: 'INTERRUPT_ALREADY_RESOLVED' });
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
  });

  it('preserves an owner edit and expires proposals prepared against the old product revision', async () => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { mode: 'COPILOT' });
    const request = { productId: 'prod-02', sellingPrice: 35, expectedConstitutionVersion: policy.version, expectedRevision: 1 };
    const proposal = await engine.publishListing(request, sourcing, 'old-product-proposal');
    const edited = await engine.updateProduct('prod-02', { expectedConstitutionVersion: policy.version, expectedRevision: 1, price: 36, inventory: 245, reason: 'Owner corrects the listing' }, owner, 'owner-product-edit');
    expect(edited).toMatchObject({ decision: 'allow', before: { price: 34, revision: 1 }, after: { price: 36, revision: 2, inventory: 245 } });
    expect((await engine.snapshot()).interrupts.find(item => item.id === proposal.interruptId)).toMatchObject({ status: 'expired' });
    expect(await engine.publishListing(request, sourcing, 'stale-product-execution')).toMatchObject({ decision: 'deny', reason: 'RESOURCE_CHANGED', currentRevision: 2 });
    expect(await engine.resolveInterrupt(String(proposal.interruptId), { decision: 'approve' }, owner, 'stale-product-approval')).toMatchObject({ decision: 'deny', reason: 'INTERRUPT_ALREADY_RESOLVED' });
    expect((await engine.snapshot()).products.find(product => product.id === 'prod-02')).toMatchObject({ price: 36, revision: 2, inventory: 245 });
  });

  it('checks both product and order revisions before supplier purchasing', async () => {
    const engine = await createEngine();
    const request = { productId: 'prod-02', orderId: 'ORD-1030', quantity: 2, expectedConstitutionVersion: 1, expectedRevision: 1, expectedOrderRevision: 1 };
    await engine.commerceEvent({ eventId: 'payment-refresh', type: 'payment.confirmed', orderId: 'ORD-1030' }, owner, 'refresh-order');
    expect(await engine.placeSupplierOrder(request, orders, 'stale-supplier-order')).toMatchObject({ decision: 'deny', reason: 'RESOURCE_CHANGED', currentOrderRevision: 2 });
    expect((await engine.snapshot()).supplierOrders).toHaveLength(0);
  });

  it('keeps historical authorization immutable while a new key must pass the latest policy', async () => {
    const engine = await createEngine({ seed: false });
    const request = { campaignId: 'historical', requestedAmount: 5, expectedConstitutionVersion: 1, expectedRevision: 0 };
    const allowed = await engine.launchCampaign(request, marketing, 'historical-allow');
    expect(allowed.decision).toBe('allow');
    await ownerPolicy(engine, { mode: 'MANUAL' });
    const before = await engine.snapshot();
    expect(await engine.launchCampaign(request, marketing, 'historical-allow')).toEqual(allowed);
    expect((await engine.snapshot()).audit).toEqual(before.audit);
    expect(await engine.launchCampaign(request, marketing, 'fresh-execution')).toMatchObject({ decision: 'deny', reason: 'CONSTITUTION_CHANGED' });
    expect((await engine.snapshot()).campaigns).toHaveLength(1);
    expect((await engine.snapshot()).reservations).toHaveLength(1);
  });

  it('enforces monthly spend across daily resets and cannot lower ceilings below committed spend', async () => {
    let now = new Date('2026-09-01T12:00:00Z');
    const engine = await createEngine({ seed: false, now: () => now });
    const policy = await ownerPolicy(engine, { mode: 'AUTONOMOUS', monthlyAdSpendCeiling: 50, domains: { advertising: { maxAutoActionAmount: 100 } } });
    expect((await engine.launchCampaign({ campaignId: 'first-day', requestedAmount: 30, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'first-day')).decision).toBe('allow');
    now = new Date('2026-09-02T12:00:00Z');
    expect((await engine.launchCampaign({ campaignId: 'second-day', requestedAmount: 20, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'second-day')).decision).toBe('allow');
    expect(await engine.launchCampaign({ campaignId: 'month-over', requestedAmount: .01, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'month-over')).toMatchObject({ decision: 'deny', reason: 'MONTHLY_CEILING_EXCEEDED' });
    expect(await engine.updateConstitution({ expectedVersion: policy.version, monthlyAdSpendCeiling: 49.99, reason: 'Attempt below committed monthly spend' }, owner, 'lower-monthly')).toMatchObject({ decision: 'deny', reason: 'MONTHLY_CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND' });
    expect(await engine.updateConstitution({ expectedVersion: policy.version, dailyAdSpendCeiling: 19.99, reason: 'Attempt below committed daily spend' }, owner, 'lower-daily')).toMatchObject({ decision: 'deny', reason: 'CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND' });
    expect((await engine.snapshot()).constitution!.version).toBe(policy.version);
    now = new Date('2026-10-01T12:00:00Z');
    expect((await engine.launchCampaign({ campaignId: 'new-month', requestedAmount: 1, expectedConstitutionVersion: policy.version, expectedRevision: 0 }, marketing, 'new-month')).decision).toBe('allow');
  });

  it('enforces the supplier purchase ceiling even for explicit owner requests', async () => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { maxSupplierPurchase: 1 });
    expect(await engine.placeSupplierOrder({ productId: 'prod-02', orderId: 'ORD-1030', quantity: 2, expectedConstitutionVersion: policy.version, expectedRevision: 1, expectedOrderRevision: 1 }, owner, 'large-purchase'))
      .toMatchObject({ decision: 'deny', reason: 'SUPPLIER_PURCHASE_LIMIT_EXCEEDED' });
    expect((await engine.snapshot()).supplierOrders).toHaveLength(0);
  });

  it('keeps the fixed refund escrow limit even when autonomy caps are higher', async () => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { mode: 'AUTONOMOUS', domains: { refunds: { maxAutoActionAmount: 100 } } });
    const first = { orderId: 'ORD-1030', amount: 25, reasonCode: 'damage', expectedConstitutionVersion: policy.version, expectedRevision: 1 };
    expect((await engine.evaluateRefund(first, support, 'at-refund-limit')).decision).toBe('allow');
    const escalation = await engine.evaluateRefund({ ...first, amount: .01, expectedRevision: 2 }, support, 'split-refund');
    expect(escalation).toMatchObject({ decision: 'escalated', reason: 'REFUND_ESCROW_REQUIRED' });
    expect((await engine.snapshot()).refunds).toHaveLength(1);
    expect((await engine.resolveInterrupt(String(escalation.interruptId), { decision: 'approve' }, owner, 'approve-refund')).status).toBe('resolved');
    expect((await engine.snapshot()).orders.find(order => order.id === 'ORD-1030')!.refunded).toBe(25.01);
    expect((await engine.snapshot()).refunds).toHaveLength(2);
  });

  it('requires country evidence, rejects prohibited categories, and validates destination separately', async () => {
    const engine = await createEngine();
    const policy = await ownerPolicy(engine, { permittedCountries: ['US'], prohibitedCountries: ['CN'], prohibitedCategories: ['Controlled'] });
    expect(await engine.publishListing({ productId: 'prod-02', expectedConstitutionVersion: policy.version, expectedRevision: 1 }, owner, 'unknown-origin')).toMatchObject({ decision: 'deny', reason: 'COUNTRY_EVIDENCE_REQUIRED' });
    const product = { expectedConstitutionVersion: policy.version, reason: 'Owner adds verified catalog item', sku: 'COUNTRY-TEST', name: 'Country test item', category: 'Everyday', price: 100, landedCost: 20, estimatedCac: 10, inventory: 3, status: 'active' };
    expect(await engine.createProduct({ ...product, countryOfOrigin: 'CN' }, owner, 'prohibited-origin')).toMatchObject({ decision: 'deny', reason: 'COUNTRY_NOT_PERMITTED' });
    expect(await engine.createProduct({ ...product, category: 'controlled', countryOfOrigin: 'US' }, owner, 'prohibited-category')).toMatchObject({ decision: 'deny', reason: 'PROHIBITED_CATEGORY' });
    const created = await engine.createProduct({ ...product, countryOfOrigin: 'US' }, owner, 'permitted-product');
    expect(created.decision).toBe('allow');
    const cart = { items: [{ productId: (created.product as { id: string }).id, quantity: 1 }], customer: { name: 'Country Test', email: 'country@example.com' } };
    expect(await engine.checkout(cart, owner, 'missing-destination')).toMatchObject({ decision: 'deny', reason: 'DESTINATION_COUNTRY_REQUIRED' });
    expect(await engine.checkout({ ...cart, destinationCountry: 'CA' }, owner, 'outside-permitted-country')).toMatchObject({ decision: 'deny', reason: 'COUNTRY_NOT_PERMITTED' });
    expect((await engine.checkout({ ...cart, destinationCountry: 'US' }, owner, 'permitted-destination')).decision).toBe('allow');
    expect(await engine.updateConstitution({ expectedVersion: policy.version, prohibitedCountries: ['US'], reason: 'Conflicting country policy' }, owner, 'country-conflict')).toMatchObject({ decision: 'deny', reason: 'COUNTRY_POLICY_CONFLICT' });
    expect((await engine.snapshot()).constitution!.version).toBe(policy.version);
  });

  it('rejects typed attempts to weaken fixed boundaries or add unknown policy fields', async () => {
    const engine = await createEngine({ seed: false });
    for (const values of [{ marginFloor: .3999 }, { autoRefundThreshold: 25.01 }, { monthlyAdSpendCeiling: .001 }, { domains: { unrestricted: { mode: 'AUTONOMOUS' } } }, { bypassGuardrails: true }]) {
      await expect(engine.updateConstitution({ expectedVersion: 1, reason: 'Invalid owner policy input', ...values }, owner, `invalid-${JSON.stringify(values)}`)).rejects.toBeDefined();
    }
    expect((await engine.snapshot()).constitution!.version).toBe(1);
  });

  it('migrates legacy persisted state additively, preserves audit and idempotency, and requires an explicit legacy review', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-constitution-migration-'));
    directories.push(directory);
    const filePath = join(directory, 'state.json');
    const engine = await createEngine();
    const request = { campaignId: 'legacy-reservation', requestedAmount: 1 };
    const allowed = await engine.checkSpend(request, owner, 'legacy-persisted-key');
    const legacy = await engine.snapshot();
    delete legacy.schemaVersion;
    delete legacy.constitution;
    delete legacy.constitutionHistory;
    for (const product of legacy.products) delete product.revision;
    for (const order of legacy.orders) delete order.revision;
    for (const reservation of legacy.reservations) delete reservation.revision;
    for (const interrupt of legacy.interrupts) delete interrupt.payload.legacyReviewRequired;
    await writeFile(filePath, JSON.stringify(legacy));

    const migrated = await createEngine({ filePath });
    const state = await migrated.snapshot();
    expect(state.constitution).toMatchObject({ version: 1, mode: 'MANUAL', dailyAdSpendCeiling: legacy.config.dailyAdSpendCeiling });
    expect(state.audit.slice(0, legacy.audit.length)).toEqual(legacy.audit);
    expect(state.audit.at(-1)).toMatchObject({ actorType: 'system', eventType: 'workspace.migrate-constitution' });
    expect(state.orders.map(({ revision: _revision, ...order }) => order)).toEqual(legacy.orders);
    expect(state.reservations.map(({ revision: _revision, ...reservation }) => reservation)).toEqual(legacy.reservations);
    expect(state.orders.every(order => order.revision === 1)).toBe(true);
    expect(state.interrupts.every(interrupt => interrupt.payload.legacyReviewRequired)).toBe(true);
    expect(await migrated.checkSpend(request, owner, 'legacy-persisted-key')).toEqual(allowed);
    expect(await migrated.launchCampaign({ campaignId: 'migration-auto', requestedAmount: 1, expectedConstitutionVersion: 1, expectedRevision: 0 }, marketing, 'migration-auto')).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL' });
    expect(await migrated.resolveInterrupt('int-refund-1029', { decision: 'approve' }, owner, 'unreviewed-legacy')).toMatchObject({ decision: 'deny', reason: 'LEGACY_REVIEW_REQUIRED' });
    expect(await migrated.resolveInterrupt('int-refund-1029', { decision: 'approve', reviewLegacy: true, expectedConstitutionVersion: 1, expectedRevision: 1 }, owner, 'reviewed-legacy')).toMatchObject({ status: 'resolved', execution: { decision: 'allow', amount: 42 } });
    const persisted = JSON.parse(await readFile(filePath, 'utf8'));
    const restarted = await createEngine({ filePath });
    expect((await restarted.snapshot()).audit).toEqual(persisted.audit);
    expect((await restarted.snapshot()).audit.filter(entry => entry.eventType === 'workspace.migrate-constitution')).toHaveLength(1);
    assertChain((await restarted.snapshot()).audit);
  });
});
