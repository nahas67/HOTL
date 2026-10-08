import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { createEngine } from '@hotl/guardrail-service';
import { createServer } from '@hotl/guardrail-service/server';
import { HttpGuardrails, type AgentId, type GuardrailGateway } from '../src/client.js';
import { createCommerceGraph } from '../src/graph.js';
import { RunManager } from '../src/manager.js';

// Any distinctive string the graph could plausibly forward. If one of these ever
// appears in a guardrail request body, the model has been allowed to influence
// an authorization input, which rule 1 forbids.
const SENTINEL = 'LLM-SENTINEL-DO-NOT-AUTHORIZE-4f2a9c1b';
const drafts: Array<{ agent: AgentId; prompt: string }> = [];

// Stub the model so the test observes a body that could only come from model
// output. Everything else in the client module stays real.
vi.mock('../src/client.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/client.js')>();
  return {
    ...actual,
    draftWithLiteLLM: async (agent: AgentId, prompt: string) => {
      drafts.push({ agent, prompt });
      return `${SENTINEL} ${prompt}`;
    },
  };
});

const resources: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close(); });

const owner = { type: 'owner' as const, id: 'simulation-owner' };

async function validDraft(engine: Awaited<ReturnType<typeof createEngine>>) {
  const state = await engine.snapshot();
  await engine.updateProduct('prod-06', { expectedConstitutionVersion: state.constitution!.version, expectedRevision: state.products.find(p => p.id === 'prod-06')!.revision, price: 49, status: 'draft', reason: 'Prepare a viable simulation listing' }, owner, 'prepare-valid-listing');
}
async function mode(engine: Awaited<ReturnType<typeof createEngine>>, value: 'MANUAL' | 'COPILOT' | 'SUPERVISED') {
  const state = await engine.snapshot();
  await engine.updateConstitution({ expectedVersion: state.constitution!.version, mode: value, reason: 'Exercise owner operating mode' }, owner, `mode-${value}-${state.constitution!.version}`);
}

describe('rule 1: the graph proposes, the deterministic guardrail decides', () => {
  it('never places model output in a guardrail request body', async () => {
    drafts.length = 0;
    const engine = await createEngine({ killSwitchReader: async () => ({ engaged: false }) });
    const server = await createServer({ engine, mode: 'simulation', internalToken: 'test-token' });
    await server.listen({ port: 0, host: '127.0.0.1' }); resources.push(() => server.close());
    const address = server.server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
    const http = new HttpGuardrails(`http://127.0.0.1:${address.port}`, 'test-token');

    // Record every body the graph submits to the guardrail, including the run
    // audit events and the escalated action requests.
    const bodies: Array<{ path: string; body: unknown }> = [];
    const gateway: GuardrailGateway = {
      status: () => http.status(),
      context: agent => http.context(agent),
      ownerGet: path => http.ownerGet(path),
      execute: (agent, path, body, key) => {
        bodies.push({ path, body: JSON.parse(JSON.stringify(body ?? null)) });
        return http.execute(agent, path, body, key);
      },
    };

    const manager = new RunManager(createCommerceGraph(gateway, new MemorySaver()), gateway);
    await validDraft(engine); await mode(engine, 'COPILOT');

    // Drive a full COPILOT cycle through every department approval so the
    // campaign draft and any other model output is actually produced.
    let run = await manager.start('daily', 'model-output-isolated');
    while (run.status === 'interrupted') {
      expect(run.interruptId).toBeTruthy();
      await engine.resolveInterrupt(run.interruptId!, { decision: 'approve', note: 'Owner reviewed this proposal.' }, owner, `resolve-${run.interruptId}`);
      run = await manager.resume(run.runId, run.interruptId!, (await engine.snapshot()).interrupts);
    }
    expect(run.status).toBe('completed');

    // Non-vacuous: the stub must actually have run, or this proves nothing.
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.some(d => d.prompt.includes('campaign'))).toBe(true);

    // The invariant under test.
    expect(bodies.length).toBeGreaterThan(0);
    const leaked = bodies.filter(entry => JSON.stringify(entry.body).includes(SENTINEL));
    expect(leaked.map(entry => entry.path)).toEqual([]);

    // The cycle still reached real, guardrail-authorized decisions.
    const final = await engine.snapshot();
    expect(final.campaigns.length + final.supplierOrders.length + final.refunds.length).toBeGreaterThan(0);
    expect(final.audit.some(entry => JSON.stringify(entry).includes(SENTINEL))).toBe(false);
  });
});