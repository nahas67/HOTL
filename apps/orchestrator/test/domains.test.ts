import { afterEach, describe, expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { createEngine, type GuardrailEngine } from '@hotl/guardrail-service';
import { createServer } from '@hotl/guardrail-service/server';
import { autonomyDomainEnforcement, autonomyDomains, type Actor } from '@hotl/schemas';
import { HttpGuardrails } from '../src/client.js';
import { createCommerceGraph } from '../src/graph.js';
import { guardrailOnlyDomains, pausedStageDomain, stageDomains } from '../src/domains.js';
import { RunManager } from '../src/manager.js';

const resources: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close(); });
const owner: Actor = { type: 'owner', id: 'simulation-owner' };

async function fixture() {
  const engine = await createEngine({ killSwitchReader: async () => ({ engaged: false }) });
  const server = await createServer({ engine, mode: 'simulation', internalToken: 'test-token' });
  await server.listen({ port: 0, host: '127.0.0.1' }); resources.push(() => server.close());
  const address = server.server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  const gateway = new HttpGuardrails(`http://127.0.0.1:${address.port}`, 'test-token');
  const graph = createCommerceGraph(gateway, new MemorySaver());
  return { engine, gateway, manager: new RunManager(graph, gateway) };
}

async function pauseDomains(engine: GuardrailEngine, domains: Record<string, { paused: true }>, key: string) {
  const state = await engine.snapshot();
  const result = await engine.updateConstitution({
    expectedVersion: state.constitution!.version,
    reason: `Owner pauses ${Object.keys(domains).join(', ')}`,
    domains,
  }, owner, key);
  expect(result.decision).toBe('allow');
}

/** Make the seeded draft viable so the catalog stage actually reaches the publish gate. */
async function validDraft(engine: GuardrailEngine) {
  const state = await engine.snapshot();
  await engine.updateProduct('prod-06', {
    expectedConstitutionVersion: state.constitution!.version,
    expectedRevision: state.products.find(p => p.id === 'prod-06')!.revision,
    price: 49,
    status: 'draft',
    reason: 'Prepare a viable simulation listing',
  }, owner, 'prepare-valid-listing');
}

describe('orchestrator autonomy-domain wiring', () => {
  it('maps every stage to an enforced domain, and names the enforced domains no stage drives', () => {
    for (const [stage, domains] of Object.entries(stageDomains)) {
      expect(domains.length, stage).toBeGreaterThan(0);
      for (const domain of domains) expect(autonomyDomainEnforcement[domain].enforced, `${stage}/${domain}`).toBe(true);
    }
    const driven = new Set(Object.values(stageDomains).flat());
    for (const domain of guardrailOnlyDomains) {
      expect(driven.has(domain), `${domain} has no orchestrator stage`).toBe(false);
      expect(autonomyDomainEnforcement[domain].enforced).toBe(true);
    }
    // Every enforced domain is accounted for exactly once: driven by a stage or guardrail-only.
    const enforced = autonomyDomains.filter(domain => autonomyDomainEnforcement[domain].enforced);
    expect([...driven, ...guardrailOnlyDomains].sort()).toEqual([...enforced].sort());
  });

  it('reads the owner domain modes the guardrail already returns, and honours PAUSE only', async () => {
    const engine = await createEngine({ seed: false });
    const state = await engine.snapshot();
    expect(pausedStageDomain(state.constitution!, 'catalog')).toBeNull();
    await engine.updateConstitution({ expectedVersion: state.constitution!.version, reason: 'Owner pauses the pricing domain', domains: { pricing: { paused: true } } }, owner, 'pause-pricing');
    expect(pausedStageDomain((await engine.snapshot()).constitution!, 'catalog')).toBe('pricing');
    await engine.updateConstitution({ expectedVersion: (await engine.snapshot()).constitution!.version, reason: 'Owner resumes pricing and takes manual control', domains: { pricing: { paused: false, mode: 'MANUAL' } } }, owner, 'manual-pricing');
    // MANUAL is the guardrail's decision to record, not the orchestrator's to pre-empt.
    expect(pausedStageDomain((await engine.snapshot()).constitution!, 'catalog')).toBeNull();
  });

  // The contrast is the proof: the same seeded ledger, one cycle with the domain paused and one
  // without. A paused refunds domain removes the decision entirely; leaving it alone still raises
  // the owner approval. A test that passed either way would prove nothing.
  it('skips a paused refunds stage without proposing an action or raising an owner decision', async () => {
    const pausedFixture = await fixture();
    await pauseDomains(pausedFixture.engine, { refunds: { paused: true } }, 'pause-refunds');
    const before = await pausedFixture.engine.snapshot();
    const pausedRun = await pausedFixture.manager.start('daily', 'paused-refund-domain');
    expect(pausedRun.status).toBe('completed');
    expect(pausedRun.interruptId).toBeNull();
    expect(pausedRun.guardrailDecisions.some(decision => decision.domain === 'refunds')).toBe(false);
    const pausedAfter = await pausedFixture.engine.snapshot();
    expect(pausedAfter.refunds).toEqual(before.refunds);
    expect(pausedAfter.interrupts.filter(item => item.status === 'pending' && !item.payload.legacyReviewRequired)).toHaveLength(0);

    const control = await fixture();
    const controlRun = await control.manager.start('daily', 'control-refund-domain');
    expect(controlRun.status).toBe('interrupted');
    expect(controlRun.guardrailDecisions.some(decision => decision.domain === 'refunds')).toBe(true);
    expect((await control.engine.snapshot()).refunds).toEqual(before.refunds);
  });

  it('skips a paused advertising stage without launching or reserving a campaign', async () => {
    const { engine, manager } = await fixture();
    await pauseDomains(engine, { advertising: { paused: true }, refunds: { paused: true } }, 'pause-advertising-and-refunds');
    const before = await engine.snapshot();
    const run = await manager.start('daily', 'paused-advertising-domain');
    expect(run.status).toBe('completed');
    expect(run.guardrailDecisions.some(decision => decision.domain === 'advertising')).toBe(false);
    const after = await engine.snapshot();
    expect(after.campaigns).toEqual(before.campaigns);
    expect(after.reservations).toEqual(before.reservations);
  });

  it('names the autonomy domain in the run log when the guardrail refuses an action', async () => {
    const { engine, manager } = await fixture();
    await validDraft(engine);
    await engine.updateConstitution({ expectedVersion: (await engine.snapshot()).constitution!.version, mode: 'MANUAL', reason: 'Owner takes manual control of every domain' }, owner, 'domains-manual-log');
    const run = await manager.start('daily', 'domain-in-run-log');
    expect(run.guardrailDecisions.some(decision => decision.reason === 'MANUAL_CONTROL')).toBe(true);
    const domainDecisions = run.guardrailDecisions.filter(decision => typeof decision.domain === 'string');
    expect(domainDecisions.map(decision => decision.domain)).toEqual(expect.arrayContaining(['catalog', 'advertising']));
    const logged = run.logs.filter(entry => entry.node.startsWith('guardrail.'));
    expect(logged.map(entry => entry.node)).toEqual(expect.arrayContaining(['guardrail.catalog', 'guardrail.advertising']));
    expect(logged.find(entry => entry.node === 'guardrail.catalog')!.summary).toMatch(/catalog autonomy domain/);
  });
});