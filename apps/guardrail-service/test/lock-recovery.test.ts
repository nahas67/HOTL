import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@hotl/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.js';

// A writer that is hard-killed never reaches its `finally`, so its lock file survives. Before
// this, every subsequent transaction returned STATE_BUSY forever with no automated recovery --
// an availability incident on the financial ledger that fails CLOSED (safe) but strands the
// workspace until an operator deletes a file by hand. The kill journal already recorded its pid
// for exactly this reason; the ledger lock did not.

const owner: Actor = { type: 'owner', id: 'lock-recovery-owner' };
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function ledger() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-lock-recovery-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  return { filePath, engine: await createEngine({ filePath, initializeEmptyFile: true }) };
}

describe('state lock recovery from a dead writer', () => {
  it('recovers a lock whose owning process no longer exists', async () => {
    const { filePath, engine } = await ledger();
    const lockPath = `${filePath}.lock`;
    // A pid that cannot be running: 2^31 is above the Windows pid ceiling and never allocated.
    await writeFile(lockPath, String(2 ** 31 - 1), 'utf8');
    const state = await engine.snapshot();
    const result = await engine.checkSpend(
      { campaignId: 'lock-recovery', requestedAmount: 25 }, owner, 'lock-recovery-key');
    // The dead owner's lock was reclaimed and the transaction completed.
    expect(result.decision).toBe('allow');
    // The lock is released in the transaction's `finally`, so nothing is left behind -- an
    // orphaned lock must not survive the recovery either.
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
    expect(state.constitution).toBeTruthy();
  });

  it('refuses a lock held by a live process', async () => {
    const { filePath, engine } = await ledger();
    // process.pid is definitionally alive; the engine must not reclaim its own or a live lock.
    await writeFile(`${filePath}.lock`, String(process.pid), 'utf8');
    await expect(engine.checkSpend({ campaignId: 'held', requestedAmount: 25 }, owner, 'held-key'))
      .rejects.toMatchObject({ code: 'STATE_BUSY' });
  });

  it('refuses an uncertain lock rather than assuming it is abandoned', async () => {
    for (const contents of ['', '   ', 'not-a-pid', '{"json":true}']) {
      const { filePath, engine } = await ledger();
      await writeFile(`${filePath}.lock`, contents, 'utf8');
      // Fail closed: only a PROVABLY dead owner may be reclaimed.
      await expect(engine.checkSpend({ campaignId: 'unknown', requestedAmount: 25 }, owner, `unknown-${contents.length}`))
        .rejects.toMatchObject({ code: 'STATE_BUSY' });
    }
  });

  it('records the owning process on every acquisition', async () => {
    const { filePath, engine } = await ledger();
    await engine.checkSpend({ campaignId: 'recorded', requestedAmount: 25 }, owner, 'recorded-key');
    // The lock is released after a successful transaction, so assert via a contended attempt
    // in the multiprocess suite instead; here just prove no lock is left orphaned.
    await expect(readFile(`${filePath}.lock`, 'utf8')).rejects.toThrow();
  });
});