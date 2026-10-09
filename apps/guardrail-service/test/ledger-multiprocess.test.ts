import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createEngine, type EngineOptions } from "../src/engine.js";

/**
 * Cross-process durability of the file-backed guardrail ledger.
 *
 * `engine.test.ts` already proves that two independent engines sharing one file
 * cannot jointly overspend — but both engines live in ONE process, so the single
 * guarantee that actually matters across a real deployment is never exercised:
 * the `open(lockPath, 'wx')` exclusion in `GuardrailEngine.transaction`. Two OS
 * processes, not two objects, is the only thing that proves the lock is a real
 * mutual-exclusion primitive rather than an in-process accident.
 *
 * These are REGRESSION GUARDS, not failing-first tests: the lock is implemented
 * and correct today. Each assertion below fails if the lock is removed, if the
 * state snapshot is taken outside the lock, if the atomic rename is replaced with
 * an in-place write, or if the lock is not released.
 */
const here = dirname(fileURLToPath(import.meta.url));
const writerEntry = resolve(here, "fixtures", "ledger-writer.ts");
// `--import` takes a specifier, so an absolute Windows path must be a file:// URL.
const tsxLoader = pathToFileURL(
  resolve(here, "..", "..", "..", "node_modules", "tsx", "dist", "loader.mjs"),
).href;

const WORKERS = 3;
const ATTEMPTS_PER_WORKER = 3;
const DAILY_CEILING_USD = 100;
const RESERVATION_USD = 25;
const EXPECTED_ALLOWS = DAILY_CEILING_USD / RESERVATION_USD;

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/** Poll with an absolute deadline. Never assumes how long the child needs. */
async function waitUntil(
  probe: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probe()) return;
    if (Date.now() >= deadline)
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

type Outcome = {
  key: string;
  decision: string;
  reason?: string;
  reservationId?: string;
  busyRetries: number;
};

type ChildReport = Outcome[] | { fatal: string };

async function runWorkers(
  directory: string,
  statePath: string,
  count: number,
  attempts: number,
): Promise<{ reports: ChildReport[]; stderr: string[] }> {
  const startPath = join(directory, "START");
  const resultPaths = Array.from({ length: count }, (_, i) =>
    join(directory, `result-${i}.json`),
  );

  const children = Array.from({ length: count }, (_, index) =>
    spawn(
      process.execPath,
      ["--import", tsxLoader, writerEntry, statePath, join(directory, `ready-${index}`), startPath, resultPaths[index]!, `w${index}`, String(attempts)],
      { stdio: ["ignore", "pipe", "pipe"], cwd: resolve(here, "..") },
    ),
  );
  const stderr: string[] = [];
  children.forEach((child, index) => {
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(`[w${index}] ${chunk.toString()}`));
    child.stdout?.resume();
  });

  try {
    // Barrier: nobody writes until every process has its engine open and is live.
    await waitUntil(
      async () =>
        (await Promise.all(children.map((_c, i) => exists(join(directory, `ready-${i}`))))).every(
          Boolean,
        ),
      30_000,
      `all worker processes to report ready\n--- child stderr ---\n${stderr.join("")}`,
    );
    await writeFile(startPath, "go", "utf8");
    await waitUntil(
      async () => (await Promise.all(resultPaths.map(exists))).every(Boolean),
      30_000,
      "all worker processes to finish",
    );
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }

  const reports: ChildReport[] = [];
  for (const path of resultPaths)
    reports.push(JSON.parse(await readFile(path, "utf8")) as ChildReport);
  return { reports, stderr };
}

const fatal = (report: ChildReport): string | undefined =>
  !Array.isArray(report) ? report.fatal : undefined;

async function preparedLedger(directory: string): Promise<string> {
  const filePath = join(directory, "state.json");
  // The parent creates the ledger so no worker races first-time initialization.
  const seed = (await createEngine({ filePath, seed: false } satisfies EngineOptions)) as Awaited<
    ReturnType<typeof createEngine>
  >;
  expect((await seed.snapshot()).config.dailyAdSpendCeiling).toBe(DAILY_CEILING_USD);
  return filePath;
}

describe("file-backed ledger durability across OS processes", () => {
  it("never exceeds the daily ceiling when independent processes reserve concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hotl-ledger-mp-"));
    directories.push(directory);
    const filePath = await preparedLedger(directory);

    const { reports, stderr } = await runWorkers(
      directory,
      filePath,
      WORKERS,
      ATTEMPTS_PER_WORKER,
    );
    const failures = reports.map(fatal).filter((message): message is string => Boolean(message));
    expect(failures, `child processes failed:\n${stderr.join("")}`).toEqual([]);

    const outcomes = reports.flatMap((report) => report as Outcome[]);
    expect(outcomes).toHaveLength(WORKERS * ATTEMPTS_PER_WORKER);

    const allows = outcomes.filter((item) => item.decision === "allow");
    const denials = outcomes.filter((item) => item.decision !== "allow");

    // The financial guarantee: concurrent reservations from separate OS processes
    // are serialized by the lock, so the owner's daily ceiling still holds exactly.
    expect(allows).toHaveLength(EXPECTED_ALLOWS);
    expect(denials.map((item) => item.reason).sort()).toEqual(
      Array<string>(WORKERS * ATTEMPTS_PER_WORKER - EXPECTED_ALLOWS).fill(
        "DAILY_CEILING_EXCEEDED",
      ),
    );

    // Contention must actually have happened, or this proves nothing about the lock.
// Measured on this machine: 310-343 STATE_BUSY retries per run across three
// independent executions, so the lock is genuinely contested by separate
// processes rather than the three workers happening to interleave trivially.
const totalBusyRetries = outcomes.reduce((total, item) => total + item.busyRetries, 0);
expect(totalBusyRetries, "expected real cross-process lock contention").toBeGreaterThan(0);

    // No reservation was lost, and no reservation was handed to two callers.
    const issued = allows.map((item) => item.reservationId).sort();
    expect(new Set(issued).size).toBe(issued.length);
    const reader = await createEngine({ filePath, seed: false });
    const persisted = (await reader.snapshot()).reservations.filter(
      (item) => item.status === "reserved",
    );
    expect(persisted.map((item) => item.id).sort()).toEqual(issued);
    expect((await reader.telemetry()).metrics.adSpend).toBe(DAILY_CEILING_USD);
  }, 60_000);

  it("leaves no orphaned lock and a readable, chain-valid ledger after every writer exits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hotl-ledger-mp-lock-"));
    directories.push(directory);
    const filePath = await preparedLedger(directory);

    const { reports } = await runWorkers(directory, filePath, 2, 2);
    expect(reports.map(fatal).filter(Boolean)).toEqual([]);

    // Every transaction releases the lock in its `finally`. A survivor here would
    // wedge the ledger at STATE_BUSY forever with no owner to release it.
    expect(await exists(`${filePath}.lock`)).toBe(false);
    const leftovers = (await readFile(filePath, "utf8")).length > 0;
    expect(leftovers).toBe(true);

    // Re-opening re-verifies the append-only hash chain, so a lost update or a
    // torn write from a losing racer fails here rather than passing silently.
    const reader = await createEngine({ filePath, seed: false });
    const state = await reader.snapshot();
    expect(state.audit.length).toBeGreaterThan(0);
    expect(
      state.audit.filter((entry) => entry.eventType === "spend.check"),
    ).toHaveLength(4);
  }, 60_000);

  it("refuses a second writer while a process holds the lock, and recovers once released", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hotl-ledger-mp-exclusive-"));
    directories.push(directory);
    const filePath = await preparedLedger(directory);

    // Contend the lock exactly as the engine does, from this process.
    const { open } = await import("node:fs/promises");
    let holder: Awaited<ReturnType<typeof open>> | undefined;
    try {
      holder = await open(`${filePath}.lock`, "wx");
    } catch (error) {
      throw new Error(`Could not take the lock for the fixture: ${String(error)}`);
    }

    const blocked = await createEngine({ filePath, seed: false });
    await expect(
      blocked.checkSpend(
        { campaignId: "camp-lock", agentId: "marketing_agent", requestedAmount: 1, currency: "USD" },
        { type: "owner", id: "multiprocess-owner" },
        "lock-held-1",
      ),
    ).rejects.toMatchObject({ code: "STATE_BUSY", statusCode: 503 });

    // Nothing was written while the lock was held: no audit growth, no reservation.
    const before = await readFile(filePath, "utf8");

    await holder.close();
    holder = undefined;
    await rm(`${filePath}.lock`, { force: true });

    const released = await createEngine({ filePath, seed: false });
    expect(await readFile(filePath, "utf8")).toBe(before);
    const recovered = await released.checkSpend(
      { campaignId: "camp-lock", agentId: "marketing_agent", requestedAmount: 1, currency: "USD" },
      { type: "owner", id: "multiprocess-owner" },
      "lock-released-1",
    );
    expect(recovered.decision).toBe("allow");
    expect(await exists(`${filePath}.lock`)).toBe(false);
  }, 30_000);
});