import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The write path retried EPERM/EACCES/EBUSY around `rename` because a sharing- or
// delete-pending file makes it fail transiently. The read path did not: `snapshot()` went straight
// to the failure handler, so a reader colliding with a concurrent writer could report the ledger
// as unreadable. This is an availability fault only -- state is never served from cache instead --
// but on a OneDrive-backed Windows workspace it is a plausible real interruption.

let transientFailures = 0;
const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    default: actual,
    readFile: async (target: unknown, options?: unknown) => {
      if (transientFailures > 0 && String(target).endsWith('ledger.json')) {
        transientFailures -= 1;
        const error = new Error('EPERM: operation not permitted, rename') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return (actual.readFile as (t: unknown, o?: unknown) => Promise<unknown>)(target, options);
    },
  };
});

const { createEngine } = await import('../src/engine.js');

const directories: string[] = [];
afterEach(async () => {
  transientFailures = 0;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function ledger() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-read-retry-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  await createEngine({ filePath, initializeEmptyFile: true });
  return filePath;
}

describe('persisted read tolerates a transient Windows sharing collision', () => {
  it('retries a transient read failure and still returns real state', async () => {
    const filePath = await ledger();
    const expected = JSON.parse(await realFs.readFile(filePath, 'utf8'));
    // Construct first: arming this before construction would also fail the engine's own
    // initial load, which is a different read path.
    const engine = await createEngine({ filePath });
    transientFailures = 2;

    const state = await engine.snapshot();
    expect(transientFailures, 'both transient failures should have been retried').toBe(0);
    expect(state.orders).toEqual(expected.orders);
    expect(state.audit.length).toBe(expected.audit.length);
  });

  it('does not retry a genuine corruption, and never serves cached state instead', async () => {
    const filePath = await ledger();
    const engine = await createEngine({ filePath });
    await writeFile(filePath, '{ not json', 'utf8');
    transientFailures = 0;
    await expect(engine.snapshot()).rejects.toBeTruthy();
  });

  it('reports a missing ledger rather than reusing the last good snapshot', async () => {
    const filePath = await ledger();
    const engine = await createEngine({ filePath });
    await engine.snapshot();
    await rm(filePath, { force: true });
    transientFailures = 0;
    // Failing closed is the point: never answer from cache.
    await expect(engine.snapshot()).rejects.toMatchObject({ code: expect.any(String) });
  });

  it('gives up after bounded retries rather than spinning', async () => {
    const filePath = await ledger();
    const engine = await createEngine({ filePath });
    // More failures than the retry budget: it must surface an error, not loop.
    transientFailures = 50;
    await expect(engine.snapshot()).rejects.toBeTruthy();
    expect(transientFailures).toBeGreaterThan(0);
  });
});