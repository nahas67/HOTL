import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { autonomyDomainEnforcement, autonomyDomains, type Actor, type AutonomyDomain } from '@hotl/schemas';
import { createEngine, type GuardrailEngine, type Result } from '../src/engine.js';

// Every test here calls the engine directly. No fixture supplies a missing Constitution binding,
// updates autonomy implicitly, or catches a policy denial on behalf of an agent -- an enforcement
// claim that survives a helper is not an enforcement claim.

const owner: Actor = { type: 'owner', id: 'domain-owner' };
const orderAgent: Actor = { type: 'agent', id: 'order_agent' };
const sourcing: Actor = { type: 'agent', id: 'sourcing_agent' };
const marketing: Actor = { type: 'agent', id: 'marketing_agent' };
const support: Actor = { type: 'agent', id: 'support_agent' };

const ENFORCED: AutonomyDomain[] = ['catalog', 'pricing', 'advertising', 'refunds', 'orders', 'fulfillment', 'purchasing', 'inventory', 'finance'];
const UNENFORCED: AutonomyDomain[] = autonomyDomains.filter(domain => !ENFORCED.includes(domain));

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

/** A file-backed ledger, so persistence, restart and replay claims are exercised for real. */
async function ledger() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-autonomy-domain-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  return { engine: await createEngine({ filePath, initializeEmptyFile: true }), filePath };
}

async function policy(engine: GuardrailEngine, domains: Record<string, Record<string, unknown>>, fields: Record<string, unknown> = {}, key = 'domain-policy') {
  const current = (await engine.snapshot()).constitution!;
  const result = await engine.updateConstitution({ expectedVersion: current.version, reason: 'Owner sets per-domain autonomy for this scenario', domains, ...fields }, owner, key);
  expect(result.decision).toBe('allow');
  return result.constitution as { version: number };
}

const cart = (productId: string, quantity = 1) => ({
  items: [{ productId, quantity }],
  customer: { name: 'Domain Buyer', email: 'domain-buyer@example.test' },
});

describe('honest labelling: every configured domain is enforced or explicitly labelled', () => {
  it('reports a verdict with a stated basis for all twenty domains', () => {
    expect(autonomyDomains).toHaveLength(20);
    expect(Object.keys(autonomyDomainEnforcement).sort()).toEqual([...autonomyDomains].sort());
    for (const domain of autonomyDomains) {
      const verdict = autonomyDomainEnforcement[domain];
      expect(verdict.basis.length, `${domain} must state why it is or is not enforced`).toBeGreaterThan(20);
      // A domain is either wired to a named engine operation or it is not. There is no third state.
      expect(verdict.enforced, `${domain}`).toBe(verdict.gate !== null);
      if (verdict.enforced) expect(verdict.gate).toMatch(/^[a-z.]+( \| [a-z.]+)*$/);
    }
    expect(ENFORCED.every(domain => autonomyDomainEnforcement[domain].enforced)).toBe(true);
    expect(UNENFORCED.every(domain => autonomyDomainEnforcement[domain].gate === null)).toBe(true);
  });

  // The only sound way to prove a negative about an entire engine is to read it. This asserts the
  // map against the source in BOTH directions: a domain labelled enforced must really be passed to
  // `autonomy(...)`, and a domain passed to `autonomy(...)` must be labelled enforced. Adding a
  // gate without updating the label, or labelling a domain with no gate, both fail here.
  it('never labels a domain enforced that no gate evaluates, and never omits a label from a gate that exists', async () => {
    const source = await readFile(fileURLToPath(new URL('../src/engine.ts', import.meta.url)), 'utf8');
    const code = source.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    const gated = new Set<string>();
    for (const match of code.matchAll(/this\.autonomy\(/g)) {
      const call = code.slice(match.index, match.index + 400).split('\n').slice(0, 4).join('\n');
      for (const quoted of call.matchAll(/'([a-z_]+)'/g)) if ((autonomyDomains as readonly string[]).includes(quoted[1]!)) gated.add(quoted[1]!);
    }
    expect([...gated].sort()).toEqual([...ENFORCED].sort());
    expect([...autonomyDomains.filter(domain => autonomyDomainEnforcement[domain].enforced)].sort()).toEqual([...gated].sort());
  });

  it('stamps the current enforcement truth on every constitution read and persists it', async () => {
    const { engine, filePath } = await ledger();
    const read = (await engine.snapshot()).constitution!;
    expect(read.domainEnforcement).toEqual(autonomyDomainEnforcement);
    // A durable workspace persists it on its first transaction, so the owner never reads a
    // Constitution whose domains carry a mode with no stated enforcement verdict.
    expect(JSON.parse(await readFile(filePath, 'utf8')).constitution.domainEnforcement).toEqual(autonomyDomainEnforcement);
    await policy(engine, { orders: { mode: 'MANUAL' } });
    const persisted = JSON.parse(await readFile(filePath!, 'utf8'));
    expect(persisted.constitution.domainEnforcement).toEqual(autonomyDomainEnforcement);
    expect(persisted.constitutionHistory.at(-1).constitution.domainEnforcement).toEqual(autonomyDomainEnforcement);
  });

  // AGENTS.md rule 7: a ledger written before this field existed must keep working. A required
  // field here would have turned every stored workspace into STATE_INVALID and denied execution.
  it('loads a ledger persisted before the enforcement map existed instead of denying it', async () => {
    const { engine, filePath } = await ledger();
    const stored = JSON.parse(await readFile(filePath, 'utf8'));
    delete stored.constitution.domainEnforcement;
    for (const entry of stored.constitutionHistory) delete entry.constitution.domainEnforcement;
    await writeFile(filePath, JSON.stringify(stored));
    const restarted = await createEngine({ filePath });
    expect((await restarted.snapshot()).constitution!.domainEnforcement).toEqual(autonomyDomainEnforcement);
    expect((await engine.snapshot()).constitution!.domainEnforcement).toEqual(autonomyDomainEnforcement);
  });

  it('refuses an owner attempt to declare a domain enforced, and applies none of that request', async () => {
    const { engine } = await ledger();
    const before = (await engine.snapshot()).constitution!;
    await expect(engine.updateConstitution({
      expectedVersion: before.version,
      reason: 'Owner attempts to arm an unimplemented domain',
      domains: { seo: { mode: 'AUTONOMOUS' } },
      domainEnforcement: { ...autonomyDomainEnforcement, seo: { enforced: true, gate: 'seo.index', basis: 'Owner supplied' } },
    } as never, owner, 'forge-enforcement')).rejects.toThrow();
    const after = (await engine.snapshot()).constitution!;
    expect(after.domainEnforcement!.seo.enforced).toBe(false);
    // The whole request is refused, so the legitimate domain edit alongside it is not a
    // side-effect channel either.
    expect(after.domains.seo).toEqual(before.domains.seo);
    expect(after.version).toBe(before.version);
  });
});

describe('every enforced domain is reachable by a decision that changes behaviour', () => {
  const cases: { domain: AutonomyDomain; run: (engine: GuardrailEngine, version: number) => Promise<Result> }[] = [
    { domain: 'catalog', run: (engine, version) => engine.publishListing({ productId: 'prod-01', expectedRevision: 1, expectedConstitutionVersion: version }, sourcing, `manual-catalog-${version}`) },
    { domain: 'pricing', run: (engine, version) => engine.publishListing({ productId: 'prod-01', sellingPrice: 55, expectedRevision: 1, expectedConstitutionVersion: version }, sourcing, `manual-pricing-${version}`) },
    { domain: 'advertising', run: (engine, version) => engine.checkSpend({ campaignId: 'manual-ad', requestedAmount: 5, agentId: marketing.id, expectedRevision: 0, expectedConstitutionVersion: version }, marketing, `manual-ad-${version}`) },
    { domain: 'refunds', run: (engine, version) => engine.evaluateRefund({ orderId: 'ORD-1030', amount: 10, reasonCode: 'damaged', requestedBy: support.id, expectedRevision: 1, expectedConstitutionVersion: version }, support, `manual-refunds-${version}`) },
    { domain: 'purchasing', run: (engine, version) => engine.placeSupplierOrder({ productId: 'prod-02', orderId: 'ORD-1030', quantity: 2, expectedRevision: 1, expectedOrderRevision: 1, expectedConstitutionVersion: version }, orderAgent, `manual-purchasing-${version}`) },
    { domain: 'fulfillment', run: (engine, version) => engine.placeSupplierOrder({ productId: 'prod-02', orderId: 'ORD-1030', quantity: 2, expectedRevision: 1, expectedOrderRevision: 1, expectedConstitutionVersion: version }, orderAgent, `manual-fulfillment-${version}`) },
    { domain: 'orders', run: (engine, version) => engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, `manual-orders-${version}`) },
    { domain: 'inventory', run: (engine, version) => engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, `manual-inventory-${version}`) },
    { domain: 'finance', run: (engine, version) => engine.commerceEvent({ eventId: 'manual-finance', type: 'payment.confirmed', orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, `manual-finance-${version}`) },
  ];

  it.each(cases)('$domain MANUAL denies the operation that domain governs and changes nothing', async ({ domain, run }) => {
    const engine = await createEngine({});
    const before = await engine.snapshot();
    // Every OTHER domain stays at the seeded SUPERVISED default, so the only thing that can
    // produce this denial is the one under test.
    const version = (await policy(engine, { [domain]: { mode: 'MANUAL' } }, {}, `manual-only-${domain}`)).version;
    const result = await run(engine, version);
    expect(result).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL', domain });
    const after = await engine.snapshot();
    for (const field of ['orders', 'products', 'reservations', 'refunds', 'campaigns', 'supplierOrders', 'commerceEvents'] as const) expect(after[field]).toEqual(before[field]);
  });
});

describe('orders and inventory govern an agent checkout', () => {
  it.each(['orders', 'inventory'] as const)('denies a paused %s domain before any stock is taken', async domain => {
    const engine = await createEngine({});
    const version = (await policy(engine, { [domain]: { paused: true } }, {}, `paused-${domain}`)).version;
    const result = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, `paused-checkout-${domain}`);
    expect(result).toMatchObject({ decision: 'deny', reason: 'DOMAIN_PAUSED', domain });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(6);
    expect(after.products.find(p => p.id === 'prod-01')!.inventory).toBe(128);
    expect(after.baseOrders).toBe(342);
  });

  it('escalates a supervised checkout above the domain limit and executes it exactly once on approval', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'SUPERVISED', maxAutoActionAmount: 25 }, inventory: { maxAutoActionAmount: 25 } })).version;
    const result = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'supervised-checkout');
    expect(result).toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED', domain: 'orders' });
    expect((await engine.snapshot()).orders).toHaveLength(6);
    const resolved = await engine.resolveInterrupt(String(result.interruptId), { decision: 'approve', note: 'Reviewed this specific simulated order.' }, owner, 'approve-supervised-checkout');
    expect(resolved).toMatchObject({ status: 'resolved', ownerDecision: 'approve', execution: { decision: 'allow' } });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(7);
    expect(after.products.find(p => p.id === 'prod-01')!.inventory).toBe(127);
    expect(after.baseOrders).toBe(343);
  });

  it('executes an autonomous checkout that stays inside both the domain and the economic limits', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 }, inventory: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 } }, { maxAutonomousTransaction: 100 })).version;
    const result = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'autonomous-checkout');
    expect(result.decision).toBe('allow');
    expect((await engine.snapshot()).products.find(p => p.id === 'prod-01')!.inventory).toBe(127);
  });

  it('still escalates an autonomous checkout above the owner\'s per-domain amount limit', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 25 }, inventory: { mode: 'AUTONOMOUS', maxAutoActionAmount: 25 } }, { maxAutonomousTransaction: 100 })).version;
    const result = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'autonomous-over-domain-limit');
    expect(result).toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED' });
    expect((await engine.snapshot()).orders).toHaveLength(6);
  });

  it('still escalates an autonomous checkout above maxAutonomousTransaction', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 500 }, inventory: { mode: 'AUTONOMOUS', maxAutoActionAmount: 500 } }, { maxAutonomousTransaction: 10 })).version;
    const result = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'autonomous-over-economic-ceiling');
    expect(result).toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED' });
    expect((await engine.snapshot()).orders).toHaveLength(6);
  });

  // Rule 2: a replayed historical allow is never fresh authority.
  it('does not let a replayed approval create a second order', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'SUPERVISED' } })).version;
    const escalated = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'replay-approval-checkout');
    const interruptId = String(escalated.interruptId);
    await engine.resolveInterrupt(interruptId, { decision: 'approve', note: 'Approved once.' }, owner, 'approve-once');
    const afterFirst = await engine.snapshot();

    const replayed = await engine.resolveInterrupt(interruptId, { decision: 'approve', note: 'Approved once.' }, owner, 'approve-once');
    expect(replayed).toMatchObject({ status: 'resolved', replayed: true });
    const second = await engine.resolveInterrupt(interruptId, { decision: 'approve', note: 'Approving again under a new key.' }, owner, 'approve-twice');
    expect(second).toMatchObject({ decision: 'deny', reason: 'INTERRUPT_ALREADY_RESOLVED' });

    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(afterFirst.orders.length);
    expect(after.products.find(p => p.id === 'prod-01')!.inventory).toBe(afterFirst.products.find(p => p.id === 'prod-01')!.inventory);
  });

  it('keeps an owner checkout outside domain autonomy entirely', async () => {
    const engine = await createEngine({});
    await policy(engine, { orders: { mode: 'MANUAL', paused: true }, inventory: { mode: 'MANUAL', paused: true } });
    const result = await engine.checkout(cart('prod-01'), owner, 'owner-checkout-domains');
    expect(result.decision).toBe('allow');
    expect((await engine.snapshot()).orders).toHaveLength(7);
  });

  // An owner policy change expires every pending proposal, so an approval already in the owner's
  // queue can never be spent against the policy it was planned under -- including a PAUSE.
  it('expires an approval in flight once the owner pauses the domain afterwards', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'SUPERVISED' } })).version;
    const escalated = await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'paused-after-escalation');
    await policy(engine, { orders: { paused: true } }, {}, 'pause-after-escalation');
    expect((await engine.snapshot()).interrupts.find(i => i.id === escalated.interruptId)!.status).toBe('expired');
    const resolved = await engine.resolveInterrupt(String(escalated.interruptId), { decision: 'approve', note: 'Approving after the owner paused the domain.' }, owner, 'approve-after-pause');
    expect(resolved).toMatchObject({ decision: 'deny', reason: 'INTERRUPT_ALREADY_RESOLVED' });
    const after = await engine.snapshot();
    expect(after.orders).toHaveLength(6);
    expect(after.products.find(p => p.id === 'prod-01')!.inventory).toBe(128);
  });
});

describe('finance governs payment transitions and fulfillment governs shipment', () => {
  const autonomous = { orders: { mode: 'AUTONOMOUS' as const, maxAutoActionAmount: 100 }, finance: { mode: 'AUTONOMOUS' as const, maxAutoActionAmount: 100 }, fulfillment: { mode: 'AUTONOMOUS' as const, maxAutoActionAmount: 100 } };

  it('denies a MANUAL finance domain before the order payment state moves', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 }, finance: { mode: 'MANUAL' } })).version;
    const result = await engine.commerceEvent({ eventId: 'finance-manual', type: 'payment.failed', orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, 'finance-manual-event');
    expect(result).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL', domain: 'finance' });
    const after = await engine.snapshot();
    expect(after.orders.find(o => o.id === 'ORD-1030')!.status).toBe('processing');
    expect(after.commerceEvents).toHaveLength(0);
  });

  it('denies a paused finance domain on a replayed-by-id event as well', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { finance: { paused: true } })).version;
    const result = await engine.commerceEvent({ eventId: 'finance-paused', type: 'payment.confirmed', orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, 'finance-paused-event');
    expect(result).toMatchObject({ decision: 'deny', reason: 'DOMAIN_PAUSED', domain: 'finance' });
    expect((await engine.snapshot()).commerceEvents).toHaveLength(0);
  });

  it('applies an autonomous payment transition and an autonomous shipment', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, autonomous, { maxAutonomousTransaction: 100 })).version;
    const failed = await engine.commerceEvent({ eventId: 'finance-auto-failed', type: 'payment.failed', orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, 'finance-auto-failed');
    expect(failed).toMatchObject({ status: 'processed' });
    expect((await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!.status).toBe('payment_failed');
    const confirmed = await engine.commerceEvent({ eventId: 'finance-auto-confirmed', type: 'payment.confirmed', orderId: 'ORD-1030', expectedRevision: 2, expectedConstitutionVersion: version }, orderAgent, 'finance-auto-confirmed');
    expect(confirmed).toMatchObject({ status: 'processed' });
    const shipped = await engine.commerceEvent({ eventId: 'fulfillment-auto', type: 'fulfillment.updated', orderId: 'ORD-1030', tracking: 'SIM-AUTO', expectedRevision: 3, expectedConstitutionVersion: version }, orderAgent, 'fulfillment-auto');
    expect(shipped).toMatchObject({ status: 'processed' });
    const order = (await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!;
    expect(order.status).toBe('shipped');
    expect(order.tracking).toBe('SIM-AUTO');
  });

  it('denies a MANUAL fulfillment domain on an agent shipment', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 }, fulfillment: { mode: 'MANUAL' } })).version;
    const result = await engine.commerceEvent({ eventId: 'fulfillment-manual', type: 'fulfillment.updated', orderId: 'ORD-1030', tracking: 'SIM-NOPE', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, 'fulfillment-manual-event');
    expect(result).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL', domain: 'fulfillment' });
    const order = (await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!;
    expect(order.status).toBe('processing');
    expect(order.tracking).toBeNull();
  });

  it('escalates a supervised payment transition above the domain limit and applies it once on approval', async () => {
    const engine = await createEngine({});
    // `orders` is held wide so the escalation names `finance`, the domain actually under test here.
    const version = (await policy(engine, { orders: { mode: 'SUPERVISED', maxAutoActionAmount: 100 }, finance: { mode: 'SUPERVISED', maxAutoActionAmount: 25 } })).version;
    const escalated = await engine.commerceEvent({ eventId: 'finance-supervised', type: 'payment.failed', orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version }, orderAgent, 'finance-supervised-event');
    expect(escalated).toMatchObject({ decision: 'escalated', reason: 'AUTONOMY_APPROVAL_REQUIRED', domain: 'finance' });
    expect((await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!.status).toBe('processing');
    const resolved = await engine.resolveInterrupt(String(escalated.interruptId), { decision: 'approve', note: 'Reviewed the simulated payment failure.' }, owner, 'approve-finance');
    expect(resolved).toMatchObject({ status: 'resolved', execution: { status: 'processed' } });
    const after = await engine.snapshot();
    expect(after.orders.find(o => o.id === 'ORD-1030')!.status).toBe('payment_failed');
    const replay = await engine.resolveInterrupt(String(escalated.interruptId), { decision: 'approve', note: 'Reviewed the simulated payment failure.' }, owner, 'approve-finance');
    expect(replay).toMatchObject({ status: 'resolved', replayed: true });
    expect((await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!.revision).toBe(after.orders.find(o => o.id === 'ORD-1030')!.revision);
  });

  // commerce-core posts a verified webhook with the workspace token and no agent header, so the
  // actor is the owner. Redelivery of the identical body must be acknowledged, never re-applied,
  // and never cost the owner a second decision.
  it('acknowledges a redelivered provider event without a second transition or a second owner decision', async () => {
    const engine = await createEngine({});
    await policy(engine, autonomous, { maxAutonomousTransaction: 100 }, 'redelivery-policy');
    const event = { eventId: 'redelivered-event', type: 'payment.failed', orderId: 'ORD-1030' };
    expect(await engine.commerceEvent(event, owner, 'redelivered-first')).toMatchObject({ decision: 'allow', status: 'processed' });
    const revisionAfterFirst = (await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!.revision;
    expect(await engine.commerceEvent(event, owner, 'redelivered-second')).toMatchObject({ decision: 'allow', status: 'already_processed' });
    // Same id, different payload: a provider integrity failure, not a silent overwrite.
    expect(await engine.commerceEvent({ ...event, type: 'payment.confirmed' }, owner, 'redelivered-conflict')).toMatchObject({ decision: 'deny', reason: 'COMMERCE_EVENT_CONFLICT' });
    const after = await engine.snapshot();
    expect(after.orders.find(o => o.id === 'ORD-1030')!.revision).toBe(revisionAfterFirst);
    expect(after.interrupts.filter(item => item.status === 'pending' && item.payload.domain === 'finance')).toHaveLength(0);
  });

  it('refuses an agent replay bound to the revision it planned against, and applies nothing twice', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, autonomous, { maxAutonomousTransaction: 100 })).version;
    const event = { eventId: 'agent-redelivered-event', type: 'payment.failed' as const, orderId: 'ORD-1030', expectedRevision: 1, expectedConstitutionVersion: version };
    expect(await engine.commerceEvent(event, orderAgent, 'agent-redelivered-first')).toMatchObject({ decision: 'allow', status: 'processed' });
    const revisionAfterFirst = (await engine.snapshot()).orders.find(o => o.id === 'ORD-1030')!.revision;
    // The agent binding is checked before the dedupe, so a stale replay is refused by the binding
    // and the order still moves exactly once.
    expect(await engine.commerceEvent(event, orderAgent, 'agent-redelivered-stale')).toMatchObject({ decision: 'deny', reason: 'RESOURCE_CHANGED' });
    const after = await engine.snapshot();
    expect(after.orders.find(o => o.id === 'ORD-1030')!.revision).toBe(revisionAfterFirst);
    expect(after.commerceEvents).toEqual(['agent-redelivered-event']);
  });

  it('keeps a provider-sourced owner event outside domain autonomy', async () => {
    const engine = await createEngine({});
    await policy(engine, { finance: { mode: 'MANUAL', paused: true }, orders: { paused: true } }, {}, 'owner-event-domains');
    // commerce-core posts verified webhooks with the workspace token and no agent header, so the
    // actor is the owner. Its replay path must keep working.
    expect(await engine.commerceEvent({ eventId: 'owner-event', type: 'payment.failed', orderId: 'ORD-1030' }, owner, 'owner-commerce-event')).toMatchObject({ status: 'processed' });
  });
});

describe('owner control closes the loop for a newly wired domain', () => {
  it('takes effect on the very next attempt and is audited with the domain both times', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { orders: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 }, inventory: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 } })).version;
    expect(await engine.checkout({ ...cart('prod-01'), expectedConstitutionVersion: version }, orderAgent, 'loop-first')).toMatchObject({ decision: 'allow' });
    await policy(engine, { orders: { mode: 'MANUAL' } }, {}, 'loop-manual');
    const next = (await engine.snapshot()).constitution!.version;
    expect(await engine.checkout({ ...cart('prod-02'), expectedConstitutionVersion: next }, orderAgent, 'loop-second')).toMatchObject({ decision: 'deny', reason: 'MANUAL_CONTROL', domain: 'orders' });

    const state = await engine.snapshot();
    const checkoutEvents = state.audit.filter(entry => entry.eventType === 'commerce.checkout');
    expect(checkoutEvents).toHaveLength(2);
    expect((checkoutEvents[0]!.payload.result as Result).decision).toBe('allow');
    expect((checkoutEvents[1]!.payload.result as Result)).toMatchObject({ reason: 'MANUAL_CONTROL', domain: 'orders' });
    const policyEvent = state.audit.filter(entry => entry.eventType === 'constitution.update');
    expect(policyEvent).toHaveLength(2);
    expect(policyEvent.at(-1)!.actorType).toBe('owner');
    // The chain that carried the decision is intact, not rewritten after the fact.
    let previous: string | null = null;
    for (const entry of state.audit) {
      expect(entry.prevHash).toBe(previous);
      previous = entry.hash;
    }
  });
});

describe('domains labelled unenforced are proven inert, not quietly hiding a capability', () => {
  it('a MANUAL support domain does not gate the support agent\'s only operation, which refunds governs', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { support: { mode: 'MANUAL' }, refunds: { mode: 'AUTONOMOUS', maxAutoActionAmount: 100 } })).version;
    const result = await engine.evaluateRefund({ orderId: 'ORD-1030', amount: 10, reasonCode: 'damaged', requestedBy: support.id, expectedRevision: 1, expectedConstitutionVersion: version }, support, 'support-manual-refund');
    expect(result.decision).toBe('allow');
    expect((await engine.snapshot()).refunds).toHaveLength(1);
  });

  it('a MANUAL sourcing domain does not gate listing publication, which catalog governs', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { sourcing: { mode: 'MANUAL' }, catalog: { mode: 'AUTONOMOUS' } })).version;
    const result = await engine.publishListing({ productId: 'prod-01', expectedRevision: 1, expectedConstitutionVersion: version }, sourcing, 'sourcing-manual-listing');
    expect(result.decision).toBe('allow');
    expect((await engine.snapshot()).products.find(p => p.id === 'prod-01')!.revision).toBe(2);
  });

  it('no campaign request carries content or promotion fields, so neither domain has a surface', async () => {
    const engine = await createEngine({});
    const version = (await policy(engine, { content: { mode: 'AUTONOMOUS' }, promotions: { mode: 'AUTONOMOUS' } })).version;
    const base = { campaignId: 'content-surface', requestedAmount: 5, agentId: marketing.id, expectedRevision: 0, expectedConstitutionVersion: version };
    await expect(engine.launchCampaign({ ...base, copy: 'Draft creative' } as never, marketing, 'campaign-copy')).rejects.toThrow();
    await expect(engine.launchCampaign({ ...base, discountCode: 'SUMMER' } as never, marketing, 'campaign-promo')).rejects.toThrow();
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
  });

  it('the marketplace capability is owner-only, so no agent autonomy mode can reach it', async () => {
    const engine = await createEngine({});
    await expect(engine.extensionTransaction('integration.connected', { provider: 'shopify', label: 'Agent attempt' }, orderAgent, 'agent-integration', () => ({ decision: 'allow' }))).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    expect((await engine.snapshot()).extensions?.integrations).toBeUndefined();
  });

  it.each(['supplier_contact', 'promotions', 'content', 'influencers', 'seo', 'email', 'sms', 'marketplaces', 'experimentation'] as const)('labels %s as configured-but-not-enforced with a stated reason', domain => {
    const verdict = autonomyDomainEnforcement[domain];
    expect(verdict).toMatchObject({ enforced: false, gate: null });
    expect(verdict.basis).toMatch(/no |owner-only|read-only/i);
  });
});