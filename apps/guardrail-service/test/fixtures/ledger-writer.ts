/**
 * Child-process entry for `ledger-multiprocess.test.ts`.
 *
 * Each spawned process owns a completely independent `GuardrailEngine` over ONE
 * shared ledger file, so the only thing standing between two racing spend
 * reservations is the real cross-process lock (`engine.ts`, `open(lockPath,'wx')`)
 * and the atomic `rename()` of the persisted snapshot. Nothing is mocked.
 *
 * Usage:
 *   node --import tsx ledger-writer.ts <statePath> <readyPath> <startPath> <resultPath> <workerId> <attempts>
 *
 * Coordination is a filesystem barrier plus deadline polling: the child reports
 * "ready", then blocks until the parent publishes `startPath`. That forces the
 * writers to overlap without any process guessing how long the other needs.
 */
import { writeFile } from "node:fs/promises";
import { createEngine, type GuardrailEngine } from "../../src/engine.js";
import type { Actor } from "@hotl/schemas";

const [statePath, readyPath, startPath, resultPath, workerId, attemptsRaw] =
  process.argv.slice(2);
const attempts = Number(attemptsRaw);

/** Poll for a path with an absolute deadline. Fails loudly instead of hanging. */
async function waitForPath(path: string, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const { access } = await import("node:fs/promises");
  for (;;) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() >= deadline)
        throw new Error(`${workerId}: timed out after ${timeoutMs}ms waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
}

/**
 * The engine's own contract for lock contention is "retry with the same key"
 * (`STATE_BUSY`, engine.ts). Every retry below therefore reuses one idempotency
 * key, which is also what makes a double-execution observable if the lock broke:
 * the same key would then either replay or conflict instead of double-reserving.
 */
const RETRY_LIMIT = 2000;
/** Returns the value plus how many `STATE_BUSY` retries it took to get it. */
async function withBusyRetry<T>(
  key: string,
  work: () => Promise<T>,
): Promise<{ value: T; busyRetries: number }> {
  let busyRetries = 0;
  for (;;) {
    try {
      return { value: await work(), busyRetries };
    } catch (error) {
      if ((error as { code?: string }).code !== "STATE_BUSY") throw error;
      if (++busyRetries > RETRY_LIMIT)
        throw new Error(
          `${workerId}: lock stayed busy for ${RETRY_LIMIT} retries on key ${key}`,
        );
      // Yield to the event loop so the holder can finish. Not a timed sleep.
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

const owner: Actor = { type: "owner", id: "multiprocess-owner" };
const spend = (amount: number) => ({
  campaignId: "camp-multiprocess",
  agentId: "marketing_agent",
  requestedAmount: amount,
  currency: "USD",
});

type Outcome = {
  key: string;
  decision: string;
  reason?: string;
  reservationId?: string;
  busyRetries: number;
};

async function main() {
  // Touch the shared ledger once so a missing or corrupt file is reported here,
  // before the barrier, with a clear error instead of a confusing one later.
  await withBusyRetry("bootstrap", () =>
    createEngine({ filePath: statePath, seed: false }),
  );

  await writeFile(readyPath, workerId, "utf8");
  await waitForPath(startPath, 30_000, "the start barrier");

  // Re-open after the barrier so every process is contending at the same moment.
  const engine = (
    await withBusyRetry("engine-open", () =>
      createEngine({ filePath: statePath, seed: false }),
    )
  ).value;

  const outcomes: Outcome[] = [];
  for (let index = 0; index < attempts; index += 1) {
    const key = `mp-${workerId}-${index}`;
    const { value, busyRetries } = await withBusyRetry(key, () =>
      engine.checkSpend(spend(25), owner, key),
    );
    // `Result` carries an index signature, so narrow the fields this drill reads.
    const result = value as {
      decision: string;
      reason?: string;
      reservationId?: string;
    };
    outcomes.push({
      key,
      decision: result.decision,
      reason: result.reason,
      reservationId: result.reservationId,
      busyRetries,
    });
  }

  await writeFile(resultPath, JSON.stringify(outcomes), "utf8");
}

main().catch(async (error: unknown) => {
  await writeFile(
    resultPath,
    JSON.stringify({
      fatal: error instanceof Error ? `${error.message}` : String(error),
    }),
    "utf8",
  ).catch(() => undefined);
  process.exitCode = 1;
});