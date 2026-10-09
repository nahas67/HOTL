import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FileSaver } from '../src/checkpointer.js';

// ROOT CAUSE of an intermittent, long-misdiagnosed browser-drill failure, captured verbatim from
// the orchestrator's own output by scripts/dev.mjs:
//
//   Error: EPERM: operation not permitted, rename '...orchestrator-checkpoints.json.<uuid>.tmp'
//     -> '...orchestrator-checkpoints.json'
//     at async <anonymous> (apps/orchestrator/src/checkpointer.ts:118:9)
//   Node.js v25.9.0
//
// A Windows sharing collision made the checkpoint rename fail transiently. With no retry the
// rejection escaped a promise LangGraph does not always await, Node treated it as fatal, the
// orchestrator exited 1, and the dev supervisor tore down every service -- turning one fault
// into a cascade of ECONNREFUSED failures across the rest of the drill.

let renameFailures = 0;

// The retry is deliberately Windows-only, matching the guardrail ledger's own rename retry.
// On POSIX `rename` is atomic and EPERM means a genuine permission fault that should surface
// immediately rather than be retried ten times. This test was written Windows-shaped only and
// failed on the Linux runners with "expected 2 to be 0", so it now asserts the real per-platform
// contract instead of assuming the Windows one.
const RETRIES_TRANSIENT_RENAME = process.platform === 'win32';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    default: actual,
    rename: async (from: unknown, to: unknown) => {
      if (renameFailures > 0) {
        renameFailures -= 1;
        const error = new Error('EPERM: operation not permitted, rename') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return (actual.rename as (f: unknown, t: unknown) => Promise<void>)(from, to);
    },
  };
});

const { FileSaver: MockedSaver } = await import('../src/checkpointer.js');

const threadOf = (id: string) => ({ configurable: { thread_id: id, checkpoint_ns: '' } });
const rootInput = { source: 'input', step: -1, parents: {} } as const;
const checkpoint = (id: string) => ({ v: 4, id, ts: '2026-09-18T00:00:00.000Z', channel_values: { approval: { interruptId: id, status: 'pending' } }, channel_versions: { approval: 1 }, versions_seen: {} });

async function scratch() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-rename-retry-'));
  return { directory, file: join(directory, 'checkpoints.json') };
}

describe('checkpoint rename tolerates a transient Windows sharing collision', () => {
  it('retries the rename and persists the checkpoint', async () => {
    const { directory, file } = await scratch();
    try {
      const saver = await new MockedSaver(file).load();
      renameFailures = 3;
      if (RETRIES_TRANSIENT_RENAME) {
        await saver.put(threadOf('thread-a'), checkpoint('a'), rootInput);
        expect(renameFailures, 'all transient rename failures should have been retried').toBe(0);
        const reopened = await new MockedSaver(file).load();
        expect(await reopened.getTuple(threadOf('thread-a'))).toBeDefined();
      } else {
        // Off Windows a rename failure is a real permission fault, not a sharing collision.
        // It must surface rather than be retried, and must leave nothing half-written: a
        // partially persisted checkpoint is worse than a clean refusal.
        await expect(saver.put(threadOf('thread-a'), checkpoint('a'), rootInput)).rejects.toMatchObject({
          code: 'EPERM',
        });
        // Exactly one attempt: consuming the other two armed failures would mean it retried.
        expect(renameFailures, 'not retried off Windows').toBe(2);
        const reopened = await new MockedSaver(file).load();
        expect(await reopened.getTuple(threadOf('thread-a'))).toBeUndefined();
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('surfaces a real rename failure instead of spinning forever', async () => {
    const { directory, file } = await scratch();
    try {
      const saver = await new MockedSaver(file).load();
      // More failures than the retry budget: it must reject, not loop forever.
      renameFailures = 50;
      await expect(saver.put(threadOf('thread-b'), checkpoint('b'), rootInput)).rejects.toBeTruthy();
      expect(renameFailures).toBeGreaterThan(0);
      // Bounded means bounded: the budget is never fully spent spinning. Off Windows exactly
      // one attempt is made, because there is no retry at all on this platform.
      expect(renameFailures).toBeLessThan(50);
      if (!RETRIES_TRANSIENT_RENAME) expect(renameFailures, 'not retried off Windows').toBe(49);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});