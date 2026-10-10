import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '@hotl/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ADVERSARIAL REVIEW: reclaiming an abandoned financial lock is not atomic.
 *
 * The D-B fix made the *release* conditional on still owning the lock, which closed the
 * "faster process deletes the slower process's lock" symptom. It did not touch the other
 * half of the same claim in `GuardrailEngine.transaction`:
 *
 *     orphaned(lockPath)  ->  unlink(lockPath)  ->  open(lockPath, 'wx')
 *
 * Judging an owner dead and deleting its lock are two separate steps, so two processes
 * recovering the SAME abandoned lock can both pass `orphaned()` -- each reading the same
 * provably-dead pid -- and then each delete. The loser's `unlink` is unconditional and acts on
 * whatever sits at the path *now*, which may be the winner's brand new lock:
 *
 *   P1: orphaned(D)=true  -> parked
 *   P2: orphaned(D)=true  -> unlink(stale) -> open('wx') -> writes P2 -> holds the lock
 *   P1: unlink(lockPath)  -> deletes P2's FRESH lock -> open('wx') -> writes P1 -> holds it too
 *
 * Both are now inside the critical section doing read-modify-write on the ledger. The release
 * check cannot help: neither process ever lost the lock from its own point of view. The result
 * is a lost update, and because the daily ceiling is computed from the state each writer read,
 * two grants against a ceiling only one of them can satisfy.
 *
 * This is a real race, so it is reproduced with a schedule rather than with luck: the
 * `node:fs/promises` module is intercepted to park two real `GuardrailEngine` transactions at
 * exact points inside the reclaim sequence. Everything else -- the engines, the lock file, the
 * atomic temp+rename write, the audit chain and the money math -- is the production path.
 */

/** A pid that cannot be running: above the Windows pid ceiling and never allocated. */
const DEAD_PID = String(2 ** 31 - 1);
const owner: Actor = { type: 'owner', id: 'reclaim-owner' };

interface Hold {
  op: string;
  pattern: RegExp;
  /** Resolves when a real call has actually been parked on this hold. */
  arrived: Promise<void>;
  /** Blocks the parked call until `open()` is invoked. */
  gate: Promise<void>;
  open: () => void;
  park: () => void;
  taken: boolean;
}

const scheduler = vi.hoisted(() => {
  const holds: Hold[] = [];
  return {
    holds,
    /** Park the next matching call to `op` until the returned `open()` is invoked. */
    hold(op: string, pattern: RegExp) {
      let park!: () => void;
      let release!: () => void;
      const arrived = new Promise<void>(resolve => { park = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      holds.push({ op, pattern, arrived, gate, open: release, park, taken: false });
      return { arrived, open: () => release() };
    },
    /** Hand every call that is still parked back to the real filesystem. */
    drain() { for (const hold of holds.splice(0)) if (!hold.taken) hold.open(); },
  };
});

// Only the operations named here are ever parked, and each parked call is matched by the
// FIRST un-consumed hold, so registration order is execution order. Everything else is a
// straight pass-through to the real filesystem.
//
// A parked call blocks on `hold.gate`, NOT on `hold.arrived`. `park()` resolves `arrived`, so
// awaiting `arrived` here returns on the very next microtask and the call would never actually
// be held -- the test would then be exercising whatever order the event loop happened to pick,
// which is how this file reported a pass and a failure for the same code on different runs. The
// gate is what makes the interleaving below a schedule rather than a hope.
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const intercept = (op: 'unlink' | 'rename') =>
    async (...args: unknown[]) => {
      const hold = scheduler.holds.find(item => !item.taken && item.op === op && item.pattern.test(args.map(String).join(' ')));
      const trace = (text: string) => { if (process.env.HOTL_TRACE) (globalThis as { __trace?: (t: string) => void }).__trace?.(text); };
      trace(`${op} ${args.map(String).join(' ').replace(/^.*[\\/]/, '')} ${hold ? `PARK#${scheduler.holds.indexOf(hold)}` : ''}\n`);
      if (hold) { hold.taken = true; hold.park(); await hold.gate; trace('  RESUMED\n'); }
      return (actual[op] as unknown as (...rest: unknown[]) => unknown)(...args);
    };
  return { ...actual, unlink: intercept('unlink'), rename: intercept('rename') };
});

const directories: string[] = [];
if (process.env.HOTL_TRACE) {
  const { appendFileSync } = await import('node:fs');
  (globalThis as { __trace?: (text: string) => void }).__trace = (text: string) => appendFileSync(process.env.HOTL_TRACE!, text);
}
afterEach(async () => {
  scheduler.drain();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function ledger() {
  const directory = await mkdtemp(join(tmpdir(), 'hotl-lock-reclaim-'));
  directories.push(directory);
  const filePath = join(directory, 'ledger.json');
  return { filePath, lockPath: `${filePath}.lock` };
}

const settle = <T>(promise: Promise<T>) =>
  promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
const code = (error: unknown) => (error as { code?: string } | null)?.code;

// The seeded ceiling is $100/day and `seed:false` records no seeded spend, so two independent
// $75 grants cannot both be correct: the second must be DAILY_CEILING_EXCEEDED.
const REQUEST = 75;
const request = (campaignId: string, amount = REQUEST) => ({ campaignId, requestedAmount: amount });

describe('stale financial lock recovery admits exactly one reclaimer', () => {
  it('never lets a second reclaimer steal the lock from the process that recovered it', async () => {
    const { filePath, lockPath } = await ledger();
    const { createEngine } = await import('../src/engine.js');
    const slow = await createEngine({ filePath, seed: false, initializeEmptyFile: true });
    const fast = await createEngine({ filePath, seed: false });

    // A writer hard-killed before its `finally` left this behind.
    await writeFile(lockPath, DEAD_PID, 'utf8');

    // `reclaimSlow` is consumed first because the slow process is started on its own, so its
    // reclaim `unlink` is provably the first one to reach the lock path.
    //
    // There is deliberately NO hold on the commit `rename`. A hold there matches by path
    // pattern rather than by process, so whichever writer commits first consumes it -- and with
    // the fix in place that is the slow process, which made `await a` block on this test's own
    // gate. The ordering the test needs does not depend on pinning a commit anyway: the slow
    // process is released last, so when the defect is present its clobbering update lands last
    // on its own. Removing the hold makes the schedule total -- the fast process can no longer
    // park anywhere, so `await b` always terminates and the test stops depending on how far the
    // Windows filesystem scheduler happened to run.
    const reclaimSlow = scheduler.hold('unlink', /\.lock$/);

    // The slow process judges the dead owner, claims the reclaim token, then stalls before
    // deleting the lock. It is now holding the token, which is the state under test.
    const a = slow.checkSpend(request('race-a'), owner, 'reclaim-key-a');
    await reclaimSlow.arrived;

    // The fast process now runs the whole recovery attempt to a decision.
    const b = settle(fast.checkSpend(request('race-b'), owner, 'reclaim-key-b'));
    const secondResult = await b;

    // With the defect present the fast process recovers the abandoned lock, writes its own
    // grant, and only now does the slow process resume and delete that live lock. Both are
    // then inside one critical section and the slow update overwrites the fast one.
    reclaimSlow.open();
    const firstResult = await a;
    const bRecovered = secondResult.ok;
    const secondValue = secondResult.ok ? secondResult.value : undefined;
    if (process.env.HOTL_TRACE) (globalThis as { __trace?: (t: string) => void }).__trace?.(`OUTCOME bRecovered=${bRecovered} a=${JSON.stringify(firstResult)} b=${secondResult.ok ? JSON.stringify(secondResult.value) : String(secondResult.error)}\n`);
    const granted = [firstResult, secondValue].filter(result => result?.decision === 'allow');

    const reader = await createEngine({ filePath, seed: false });
    const persisted = await reader.snapshot();

    // THE MONEY INVARIANT. Every grant the engine reported to a caller must be durable in the
    // ledger, and a grant must never be reported at all unless the ceiling can hold it.
    expect(persisted.reservations.map(item => item.id).sort(),
      'a reservation was reported to a caller but is missing from the committed ledger')
      .toEqual(granted.map(result => String(result?.reservationId)).sort());
    expect(granted, 'two grants were issued against a single daily ceiling').toHaveLength(1);
    expect((await reader.telemetry()).metrics.adSpend).toBe(REQUEST);
    // The audit chain still verifies, so a clobbering update is invisible to `verify`.
    expect(persisted.audit.length).toBeGreaterThan(0);

    // The process that lost must be refused cleanly and retryably, never silently re-run.
    const secondError = secondResult.ok ? undefined : secondResult.error;
    const refusal = [firstResult, secondValue].find(result => result?.decision !== 'allow');
    if (refusal) expect(refusal?.reason).toBe('DAILY_CEILING_EXCEEDED');
    else expect(code(secondError)).toBe('STATE_BUSY');
  }, 30_000);

  it('refuses a stale reclaim token instead of letting two writers through it', async () => {
    const { filePath, lockPath } = await ledger();
    const { createEngine } = await import('../src/engine.js');
    const engine = await createEngine({ filePath, seed: false, initializeEmptyFile: true });

    // A reclaim killed between claiming its token and finishing leaves that token behind.
    // Nothing may be stolen through it automatically: an uncertain lock denies, which is the
    // same rule the kill journal applies to a stale lock.
    await writeFile(lockPath, DEAD_PID, 'utf8');
    await writeFile(`${lockPath}.reclaim`, DEAD_PID, 'utf8');
    await expect(engine.checkSpend(request('token-held'), owner, 'reclaim-token-key'))
      .rejects.toMatchObject({ code: 'STATE_BUSY', statusCode: 503 });
    // Both files are left exactly as found for an operator runbook.
    expect((await readFile(lockPath, 'utf8')).trim()).toBe(DEAD_PID);
  });

  it('releases the reclaim token so the next recovery is not permanently wedged', async () => {
    const { filePath, lockPath } = await ledger();
    const { createEngine } = await import('../src/engine.js');
    const engine = await createEngine({ filePath, seed: false, initializeEmptyFile: true });

    await writeFile(lockPath, DEAD_PID, 'utf8');
    const reclaimed = await engine.checkSpend(request('token-released', 10), owner, 'reclaim-token-released');
    expect(reclaimed.decision).toBe('allow');
    await expect(readFile(`${lockPath}.reclaim`, 'utf8')).rejects.toThrow();
    await expect(readFile(lockPath, 'utf8')).rejects.toThrow();

    // A second abandonment is recovered just as cleanly, which it could not be if the first
    // recovery had leaked its token.
    await writeFile(lockPath, DEAD_PID, 'utf8');
    const again = await engine.checkSpend(request('token-released-again', 10), owner, 'reclaim-token-released-again');
    expect(again.decision).toBe('allow');
  });
});
