import { describe, expect, it } from 'vitest';
import { createOrchestratorApp, setCheckpointConflictSource } from '../src/app.js';
import { RunManager } from '../src/manager.js';

// A stale writer's checkpoint write is SKIPPED rather than allowed to erase another writer's
// runs, and the saver deliberately does not reject (LangGraph issues writes it does not always
// await). That makes the refusal easy to lose, so `/health` must report it -- otherwise a
// skipped checkpoint is invisible to anyone watching the service.

const manager = { get: async () => ({ runId: 'r', status: 'completed' }) } as unknown as RunManager;
const authenticate = async () => ({ id: 'owner', interrupts: async () => [] });

async function health(conflicts: { at: string; reason: string }[]) {
  const app = createOrchestratorApp(manager, authenticate);
  setCheckpointConflictSource(() => conflicts);
  const response = await app.inject({ method: 'GET', url: '/health' });
  await app.close();
  return response.json() as { service: string; checkpointConflicts: { at: string; reason: string }[] };
}

describe('orchestrator health reports recorded checkpoint conflicts', () => {
  it('reports no conflicts when the saver has recorded none', async () => {
    const body = await health([]);
    expect(body.service).toBe('orchestrator');
    expect(body.checkpointConflicts).toEqual([]);
  });

  it('reports a recorded stale-writer conflict with its reason', async () => {
    const body = await health([
      { at: '2026-09-18T00:00:00.000Z', reason: 'Checkpoint file changed since this writer last read it; refusing to overwrite another writer\'s runs.' },
    ]);
    expect(body.checkpointConflicts).toHaveLength(1);
    expect(body.checkpointConflicts[0]?.reason).toMatch(/refusing to overwrite another writer/i);
  });
});