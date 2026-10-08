import { afterEach, describe, expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { createEngine } from '@hotl/guardrail-service';
import { createServer } from '@hotl/guardrail-service/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpGuardrails, type GuardrailGateway } from '../src/client.js';
import { createCommerceGraph } from '../src/graph.js';
import { FileSaver } from '../src/checkpointer.js';
import { RunManager } from '../src/manager.js';
import { createOrchestratorApp } from '../src/app.js';

const resources: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close(); });
async function fixture(options: { saver?: MemorySaver; refundAmount?: number; campaignAmount?: number; intercept?: (gateway: GuardrailGateway, engine: Awaited<ReturnType<typeof createEngine>>) => GuardrailGateway } = {}) {
  const engine = await createEngine({ killSwitchReader: async () => ({ engaged: false }) });
  const server = await createServer({ engine, mode: 'simulation', internalToken: 'test-token' });
  await server.listen({ port: 0, host: '127.0.0.1' }); resources.push(() => server.close());
  const address = server.server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  const http = new HttpGuardrails(`http://127.0.0.1:${address.port}`, 'test-token');
  const gateway = options.intercept?.(http, engine) ?? http;
  const graph = createCommerceGraph(gateway, options.saver ?? new MemorySaver(), options);
  const manager = new RunManager(graph, gateway);
  return { engine, gateway, graph, manager };
}
const owner = { type: 'owner' as const, id: 'simulation-owner' };
async function validDraft(engine: Awaited<ReturnType<typeof createEngine>>) {
  const state = await engine.snapshot();
  await engine.updateProduct('prod-06', { expectedConstitutionVersion: state.constitution!.version, expectedRevision: state.products.find(p => p.id === 'prod-06')!.revision, price: 49, status: 'draft', reason: 'Prepare a viable simulation listing' }, owner, 'prepare-valid-listing');
}
async function mode(engine: Awaited<ReturnType<typeof createEngine>>, value: 'MANUAL' | 'COPILOT' | 'SUPERVISED') {
  const state = await engine.snapshot();
  await engine.updateConstitution({ expectedVersion: state.constitution!.version, mode: value, reason: 'Exercise owner operating mode' }, owner, `mode-${value}-${state.constitution!.version}`);
}
async function resolve(engine: Awaited<ReturnType<typeof createEngine>>, manager: RunManager, run: Awaited<ReturnType<RunManager['get']>>, decision: 'approve' | 'reject' = 'approve') {
  const result = await engine.resolveInterrupt(run.interruptId!, { decision, note: 'Owner reviewed this specific simulation proposal.' }, owner, `resolve-${run.interruptId}`);
  expect(result.status).toBe('resolved');
  await manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts);
  return manager.get(run.runId);
}
function withExecution(gateway: GuardrailGateway, execute: GuardrailGateway['execute']): GuardrailGateway {
  return { status: () => gateway.status(), context: agent => gateway.context(agent), ownerGet: path => gateway.ownerGet(path), execute };
}
describe('real LangGraph and real guardrail HTTP integration', () => {
  it('interrupts above $25, verifies an owner decision, resumes, and never repeats the refund', async () => {
    const { engine, manager } = await fixture();
    const run = await manager.start('daily', 'run-refund-approval');
    expect(run.status).toBe('interrupted'); expect(run.interruptId).toBeTruthy();
    await expect(manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts)).rejects.toThrow('owner must resolve');
    await engine.resolveInterrupt(run.interruptId!, { decision: 'approve', note: 'Verified the sample support case.' }, owner, 'owner-resolution-1');
    const finished = await manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts);
    expect(finished.status).toBe('completed');
    const refundCount = (await engine.snapshot()).refunds.length;
    expect((await manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts)).status).toBe('completed');
    expect((await engine.snapshot()).refunds.length).toBe(refundCount);
    expect((await manager.start('daily', 'run-refund-approval')).runId).toBe(run.runId);
    await expect(manager.start('weekly', 'run-refund-approval')).rejects.toThrow('different cycle');
  });
  it('finishes a small refund while denied margins and excess ad spend produce no corresponding writes', async () => {
    const { engine, manager } = await fixture({ refundAmount: 20, campaignAmount: 1000 });
    const run = await manager.start('daily', 'run-denial-simulation');
    expect(run.status).toBe('completed');
    expect(run.guardrailDecisions.some(d => d.reason === 'MARGIN_BELOW_FLOOR')).toBe(true);
    expect(run.guardrailDecisions.some(d => d.reason === 'DAILY_CEILING_EXCEEDED')).toBe(true);
    const state = await engine.snapshot();
    expect(state.products.find(p => p.id === 'prod-06')?.status).toBe('held');
    expect(state.campaigns).toHaveLength(0); expect(state.refunds).toHaveLength(1);
  });
  it('halts before department actions while paused', async () => {
    const { engine, manager } = await fixture();
    await engine.setPause(true, { reason: 'Test hold' }, owner, 'pause-before-run');
    expect((await manager.start('daily', 'run-while-paused')).status).toBe('halted');
    const state = await engine.snapshot(); expect(state.campaigns).toHaveLength(0); expect(state.refunds).toHaveLength(0); expect(state.supplierOrders).toHaveLength(0);
  });
  // Rule 7: unreachable emergency state must DENY, never be treated as "not engaged".
  // Every fixture above stubs a reader that succeeds, so this branch -- the one the rule
  // actually depends on -- had never executed. A throw is what an unreachable independent
  // emergency plane looks like, and it must be indistinguishable from "stop".
  it('halts when the emergency reader is unreachable instead of assuming not engaged', async () => {
    const engine = await createEngine({ killSwitchReader: async () => { throw new Error('Emergency stop unavailable'); } });
    const server = await createServer({ engine, mode: 'simulation', internalToken: 'test-token' });
    await server.listen({ port: 0, host: '127.0.0.1' }); resources.push(() => server.close());
    const address = server.server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
    const gateway = new HttpGuardrails(`http://127.0.0.1:${address.port}`, 'test-token');
    const manager = new RunManager(createCommerceGraph(gateway, new MemorySaver()), gateway);
    const before = await engine.snapshot();
    const run = await manager.start('daily', 'run-emergency-unreachable');
    expect(run.status).toBe('halted');
    const after = await engine.snapshot();
    expect(after.campaigns).toHaveLength(0);
    expect(after.refunds).toHaveLength(0);
    expect(after.supplierOrders).toHaveLength(0);
    // Denials are audited rather than dropped, so the ledger grows. What must never appear
    // is an audited *allow*: nothing was authorised while the emergency plane was unreadable.
    const appended = after.audit.slice(before.audit.length);
    expect(appended.length).toBeGreaterThan(0);
    expect(appended.every(entry => (entry as { result?: { decision?: string } }).result?.decision !== 'allow')).toBe(true);
  });
  it('restores an interrupted graph from disk and resumes after a service restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-graph-')); resources.push(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'checkpoints.json');
    const { engine, gateway, manager } = await fixture({ saver: await new FileSaver(file).load() });
    const run = await manager.start('daily', 'run-durable-checkpoint'); expect(run.status).toBe('interrupted');
    await engine.resolveInterrupt(run.interruptId!, { decision: 'reject', note: 'Declined sample refund.' }, owner, 'owner-reject-1');
    const restored = new RunManager(createCommerceGraph(gateway, await new FileSaver(file).load()), gateway);
    expect((await restored.get(run.runId)).status).toBe('interrupted');
    expect((await restored.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts)).status).toBe('completed');
    expect((await engine.snapshot()).refunds).toHaveLength(0);
  });
  it('rejects unauthenticated run launches before invoking the graph', async () => {
    const { manager } = await fixture();
    const app = createOrchestratorApp(manager, async () => { throw Object.assign(new Error('Owner required'), { statusCode: 401 }); }); resources.push(() => app.close());
    const response = await app.inject({ method: 'POST', url: '/api/runs', headers: { 'idempotency-key': 'untrusted-run-1' }, payload: { cycle: 'daily' } });
    expect(response.statusCode).toBe(401);
  });

  it('checkpoints each COPILOT approval and supplier line, surviving restart without replaying earlier approvals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-multi-approval-')); resources.push(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'checkpoints.json');
    const { engine, gateway, manager } = await fixture({ saver: await new FileSaver(file).load() });
    // Complete the first seeded order so this cycle selects the two-line order.
    expect((await engine.placeSupplierOrder({ productId: 'prod-02', quantity: 2, orderId: 'ORD-1030' }, owner, 'fixture-first-order')).decision).toBe('allow');
    await validDraft(engine); await mode(engine, 'COPILOT');
    let run = await manager.start('daily', 'copilot-multi-approval');
    expect(run.activeStage).toBe('catalog'); expect(run.status).toBe('interrupted');
    expect((await engine.snapshot()).products.find(p => p.id === 'prod-06')?.status).toBe('draft');
    const catalogApproval = run.interruptId!;
    run = await resolve(engine, manager, run);
    expect(run.activeStage).toBe('campaign'); expect(run.interruptId).not.toBe(catalogApproval);
    expect((await engine.snapshot()).products.find(p => p.id === 'prod-06')?.status).toBe('active');
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
    const replay = await manager.resume(run.runId, catalogApproval, (await engine.snapshot()).interrupts);
    if (!('interruptId' in replay)) throw new Error('Expected a persisted graph run');
    expect(replay.interruptId).toBe(run.interruptId); expect(replay.status).toBe('interrupted');
    expect((await engine.snapshot()).campaigns).toHaveLength(0);
    run = await resolve(engine, manager, run);
    expect(run.activeStage).toBe('supplier'); expect(run.plan?.body.productId).toBe('prod-04');
    expect((await engine.snapshot()).campaigns).toHaveLength(1);
    run = await resolve(engine, manager, run);
    expect(run.activeStage).toBe('supplier'); expect(run.plan?.body.productId).toBe('prod-05');
    expect((await engine.snapshot()).orders.find(o => o.id === 'ORD-1032')?.status).toBe('processing');
    const restored = new RunManager(createCommerceGraph(gateway, await new FileSaver(file).load()), gateway);
    expect((await restored.get(run.runId)).interruptId).toBe(run.interruptId);
    run = await resolve(engine, restored, run);
    expect(run.activeStage).toBe('refund'); expect(run.status).toBe('interrupted');
    expect((await engine.snapshot()).orders.find(o => o.id === 'ORD-1032')?.status).toBe('shipped');
    run = await resolve(engine, restored, run);
    expect(run.status).toBe('completed');
    const final = await engine.snapshot();
    expect(final.supplierOrders.filter(o => o.orderId === 'ORD-1032')).toHaveLength(2);
    expect(final.refunds).toHaveLength(1);
    expect(run.resolvedInterruptIds).toHaveLength(5);
    await restored.resume(run.runId, catalogApproval, final.interrupts);
    expect((await engine.snapshot()).supplierOrders).toEqual(final.supplierOrders);
    expect((await engine.snapshot()).refunds).toEqual(final.refunds);
  });

  // A resolved approval must stop being an approval target. The campaign gate
  // below denies on the daily ceiling, so it produces no new interrupt; the run
  // then completes. Nothing is pending, so the run must not still advertise the
  // catalog interrupt the owner already resolved.
  it('advertises no pending interrupt between interrupts or after completion', async () => {
    const { engine, manager } = await fixture({ campaignAmount: 100000 });
    await validDraft(engine); await mode(engine, 'COPILOT');
    let run = await manager.start('daily', 'no-stale-interrupt-id');
    expect(run.status).toBe('interrupted');
    const catalogApproval = run.interruptId!;
    expect(catalogApproval).toBeTruthy();
    // While genuinely waiting, the advertised id must be the one the guardrail
    // still holds pending for this run.
    const waitingFor = (await engine.snapshot()).interrupts.filter(i => i.threadId === run.runId && i.status === 'pending');
    expect(waitingFor.map(i => i.id)).toEqual([catalogApproval]);

    // Drive the run to a terminal state. The catalog approval resolves; the
    // campaign is denied by the daily ceiling, so it raises no replacement.
    while (run.status === 'interrupted') run = await resolve(engine, manager, run);
    expect(run.status).toBe('completed');
    expect((await engine.snapshot()).interrupts.filter(i => i.threadId === run.runId && i.status === 'pending')).toHaveLength(0);

    expect(run.interruptId).toBeNull();
    expect((await manager.get(run.runId)).interruptId).toBeNull();
    // The resolved id is still recorded as resolved, so replay stays a no-op.
    expect(run.resolvedInterruptIds).toContain(catalogApproval);
  });

  it('evaluates a MANUAL cycle without executing public or financial mutations', async () => {
    const { engine, manager } = await fixture();
    await validDraft(engine); await mode(engine, 'MANUAL');
    const before = await engine.snapshot();
    const run = await manager.start('daily', 'manual-no-financial-actions');
    expect(run.status).toBe('completed');
    expect(run.guardrailDecisions.filter(d => d.reason === 'MANUAL_CONTROL')).toHaveLength(4);
    const after = await engine.snapshot();
    expect(after.products).toEqual(before.products); expect(after.orders).toEqual(before.orders);
    expect(after.campaigns).toHaveLength(0); expect(after.supplierOrders).toHaveLength(0);
    expect(after.refunds).toHaveLength(0); expect(after.reservations).toHaveLength(0);
    expect(after.interrupts).toEqual(before.interrupts);
    expect(after.audit.length).toBeGreaterThan(before.audit.length);
  });

  it('observes a human catalog edit when an expired proposal resumes, without publishing the stale intent', async () => {
    const { engine, manager } = await fixture();
    await validDraft(engine); await mode(engine, 'COPILOT');
    const run = await manager.start('daily', 'human-catalog-change');
    expect(run.activeStage).toBe('catalog');
    const before = await engine.snapshot();
    expect((await engine.updateProduct('prod-06', { expectedConstitutionVersion: before.constitution!.version, expectedRevision: before.products.find(p => p.id === 'prod-06')!.revision, price: 52, status: 'held', reason: 'Owner is reconsidering this catalog item' }, owner, 'human-edit-held')).decision).toBe('allow');
    expect((await engine.snapshot()).interrupts.find(i => i.id === run.interruptId)?.status).toBe('expired');
    const resumed = await manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts);
    if (!('activeStage' in resumed)) throw new Error('Expected a persisted graph run');
    expect(resumed.activeStage).toBe('campaign'); expect(resumed.status).toBe('interrupted');
    const after = await engine.snapshot();
    expect(after.products.find(p => p.id === 'prod-06')).toMatchObject({ price: 52, status: 'held' });
    expect(resumed.replanCounts?.catalog).toBe(1);
    expect(after.interrupts.filter(i => i.threadId === run.runId && i.status === 'pending')).toHaveLength(1);
  });

  it('resumes an expired proposal through the HTTP API and replans against a new MANUAL Constitution', async () => {
    const { engine, manager } = await fixture();
    await validDraft(engine); await mode(engine, 'COPILOT');
    const run = await manager.start('daily', 'constitution-edit-replan');
    await mode(engine, 'MANUAL');
    const app = createOrchestratorApp(manager, async () => ({ id: owner.id, interrupts: async () => (await engine.snapshot()).interrupts })); resources.push(() => app.close());
    const response = await app.inject({ method: 'POST', url: `/api/runs/${run.runId}/resume`, headers: { 'idempotency-key': 'resume-expired-proposal' }, payload: { interruptId: run.interruptId } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'completed', replanCounts: { catalog: 1 } });
    const after = await engine.snapshot();
    expect(after.products.find(p => p.id === 'prod-06')?.status).toBe('draft');
    expect(after.campaigns).toHaveLength(0); expect(after.supplierOrders).toHaveLength(0); expect(after.refunds).toHaveLength(0);
    expect(after.interrupts.filter(i => i.threadId === run.runId && i.status === 'pending')).toHaveLength(0);
  });

  it('halts after two fresh replans when the owner keeps changing policy before execution', async () => {
    let attempts = 0;
    const { engine, manager } = await fixture({ intercept: (gateway, currentEngine) => withExecution(gateway, async (agent, path, body, key) => {
      if (path === '/campaigns/launch') {
        attempts += 1;
        const current = await currentEngine.snapshot();
        await currentEngine.updateConstitution({ expectedVersion: current.constitution!.version, goals: [`Owner revision ${attempts}`], reason: 'Owner revised the goal before this action executes' }, owner, `concurrent-owner-change-${attempts}`);
      }
      return gateway.execute(agent, path, body, key);
    }) });
    const run = await manager.start('daily', 'bounded-policy-replans');
    expect(run.status).toBe('halted'); expect(attempts).toBe(3);
    expect(run.guardrailDecisions.filter(d => d.reason === 'CONSTITUTION_CHANGED')).toHaveLength(3);
    expect(run.guardrailDecisions.at(-1)?.reason).toBe('REPLAN_LIMIT_REACHED');
    const after = await engine.snapshot();
    expect(after.campaigns).toHaveLength(0); expect(after.supplierOrders).toHaveLength(0); expect(after.refunds).toHaveLength(0);
  });

  it('replays the saved action key after a response is lost across a checkpoint restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-lost-receipt-')); resources.push(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'checkpoints.json');
    const submittedKeys: string[] = [];
    let loseResponse = true;
    const { engine, gateway, manager } = await fixture({ saver: await new FileSaver(file).load(), refundAmount: 20, intercept: real => withExecution(real, async (agent, path, body, key) => {
      const result = await real.execute(agent, path, body, key);
      if (path === '/campaigns/launch') {
        submittedKeys.push(key);
        if (loseResponse) { loseResponse = false; throw new Error('Simulated process loss after durable campaign execution'); }
      }
      return result;
    }) });
    await expect(manager.start('daily', 'lost-receipt-cycle')).rejects.toThrow('Simulated process loss');
    expect((await engine.snapshot()).campaigns).toHaveLength(1);
    const restored = new RunManager(createCommerceGraph(gateway, await new FileSaver(file).load(), { refundAmount: 20 }), gateway);
    expect((await restored.start('daily', 'lost-receipt-cycle')).status).toBe('completed');
    expect(submittedKeys).toHaveLength(2); expect(submittedKeys[0]).toBe(submittedKeys[1]);
    const final = await engine.snapshot();
    expect(final.campaigns).toHaveLength(1); expect(final.reservations).toHaveLength(1); expect(final.refunds).toHaveLength(1);
  });
});
