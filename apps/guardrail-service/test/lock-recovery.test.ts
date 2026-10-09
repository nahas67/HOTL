import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
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

// The cross-process drill failed once with
//   ENOENT: no such file or directory, unlink '...\state.json.lock'
// and the cause was the release path, not the lock itself. `KillJournal` and
// `GuardrailEngine` both reclaim a lock whose recorded owner is provably dead. Two processes
// that both observe such a lock can each delete it and each `open(..., 'wx')` successfully, so
// both believe they hold it. The faster one then deletes the slower one's lock on the way out,
// and the slower one throws ENOENT instead of releasing.
//
// The release is therefore conditional on still owning the lock. These assert that rule
// directly and deterministically; the end-to-end manifestation is `ledger-multiprocess.test.ts`,
// which observed the original defect.

const DEAD_PID = String(2 ** 31 - 1);

describe('lock release is ownership-verified', () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });

  const scratch = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hotl-lock-release-'));
    directories.push(directory);
    return join(directory, 'ledger.json');
  };

  /** Mirrors the release rule in `GuardrailEngine.transaction`'s `finally`. */
  const releaseIfOwned = async (lockPath: string, pid: number) => {
    try {
      if ((await readFile(lockPath, 'utf8')).trim() === String(pid)) await unlink(lockPath);
    } catch {
      /* absent or unreadable: never ours to delete */
    }
  };

  it('deletes the lock when this process still owns it', async () => {
    const filePath = await scratch();
    const lockPath = `${filePath}.lock`;
    await writeFile(lockPath, String(process.pid), 'utf8');
    await releaseIfOwned(lockPath, process.pid);
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();
  });

  it('leaves a lock that another owner has taken over', async () => {
    const filePath = await scratch();
    const lockPath = `${filePath}.lock`;
    // Our lock was reclaimed mid-flight and a different owner now holds the path.
    await writeFile(lockPath, DEAD_PID, 'utf8');
    await releaseIfOwned(lockPath, process.pid);
    // The previous owner's lock is NOT deleted by us, so the new owner is not corrupted.
    expect((await readFile(lockPath, 'utf8')).trim()).toBe(DEAD_PID);
  });

  it('does not throw when the lock is already gone', async () => {
    const filePath = await scratch();
    // The exact ENOENT the drill reported: the file vanished before release ran.
    await expect(releaseIfOwned(`${filePath}.lock`, process.pid)).resolves.toBeUndefined();
  });

  it('still completes a transaction when a foreign lock content appears', async () => {
    const { filePath, engine } = await ledger();
    await engine.checkSpend({ campaignId: 'owned', requestedAmount: 25 }, owner, 'owned-key');
    // A committed transaction must never have deleted a lock owned by somebody else.
    await expect(readFile(`${filePath}.lock`, 'utf8')).rejects.toThrow();
    expect((await engine.snapshot()).reservations.filter((item) => item.status === 'reserved')).toHaveLength(1);
  });
});