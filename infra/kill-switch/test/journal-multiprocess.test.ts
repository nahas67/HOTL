import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { KillJournal } from "../src/journal.js";

/**
 * Cross-process single-writer enforcement for the independent kill journal.
 *
 * `kill-switch.test.ts` proves eight simultaneous `POST /engage` requests collapse
 * into one latch event, but those eight requests are handled by ONE process. The
 * comment in `journal.ts` — "Exclusive process ownership prevents split writers" —
 * is a claim about OS-level exclusion (`open(path + '.lock', 'wx')`), and nothing
 * currently runs two processes against one journal. If that exclusion ever failed,
 * two processes could each append an `engaged` event with independent sequence
 * numbers and hash chains, producing a journal that refuses to load — i.e. the
 * emergency plane would brick itself and commerce could never be resumed or
 * inspected. That is a fail-closed outcome, but it is still an availability failure
 * on the one control that must always work.
 *
 * These are REGRESSION GUARDS. The exclusion is implemented and correct today;
 * each assertion fails if the `.lock` acquisition is dropped, if it stops being
 * exclusive, or if a loser could append anyway.
 */
const here = dirname(fileURLToPath(import.meta.url));
const holderEntry = resolve(here, "fixtures", "journal-holder.ts");

/**
 * Locate the tsx loader across both install layouts this package is built by.
 *
 * The pnpm workspace hoists `tsx` to the repository root, but
 * `.github/workflows/kill-switch-ci.yml` deliberately installs this service in
 * ISOLATION -- `npm ci --workspaces=false` with `working-directory:
 * infra/kill-switch` -- so the emergency plane can never silently depend on the
 * main application's dependency tree. In that layout there is no root
 * `node_modules`, so every child process died instantly with an unresolvable
 * `--import` and both multiprocess tests failed on a 30s timeout having tested
 * nothing at all. The isolation is correct and is preserved; only the path
 * resolution was wrong.
 */
const tsxCandidates = [
  resolve(here, "..", "..", "..", "node_modules", "tsx", "dist", "loader.mjs"), // pnpm workspace root
  resolve(here, "..", "node_modules", "tsx", "dist", "loader.mjs"), // isolated npm ci
];
const tsxPath = tsxCandidates.find(candidate => existsSync(candidate));
if (!tsxPath)
  throw new Error(
    `Cannot locate the tsx loader for child processes. Looked in:\n${tsxCandidates.join("\n")}`,
  );
const tsxLoader = pathToFileURL(tsxPath).href;

const WORKERS = 3;

const directories: string[] = [];
const journals: KillJournal[] = [];
afterEach(async () => {
  for (const journal of journals.splice(0)) await journal.close().catch(() => undefined);
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

/**
 * Publishes a signal file atomically, matching what the child fixture does.
 *
 * `writeFile` creates the path before its payload is flushed, so a peer polling
 * with `access()` can see the file exist while it is still empty. Children poll
 * RELEASE with `access()` alone and never read its contents, so this has never
 * produced a wrong result here -- but the barrier is part of the same protocol,
 * and leaving one side of it racy would preserve the exact hazard this file was
 * written to detect.
 */
const publish = async (path: string, data: string) => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, data, "utf8");
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
};

/** Poll with an absolute deadline. Never assumes how long a child needs. */
async function waitUntil(
  probe: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probe()) return;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

async function scratch(): Promise<{ directory: string; journalPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "hotl-journal-mp-"));
  directories.push(directory);
  return { directory, journalPath: join(directory, "events.jsonl") };
}

function track(journal: KillJournal): KillJournal {
  journals.push(journal);
  return journal;
}

/**
 * Runs `count` children that all race to open the SAME journal.
 *
 * Each child publishes one of two signals: a `ready-N` file if it WON the lock
 * (and is now holding it), or a `result-N` file carrying its refusal if it lost.
 * Waiting on "either signal per child" rather than "every result" is what avoids
 * deadlocking on the winner, which legitimately holds the lock until released.
 */
async function raceOpen(
  directory: string,
  journalPath: string,
  count: number,
): Promise<{ winners: number; losers: number; loserErrors: string[]; stderr: string[] }> {
  const releasePath = join(directory, "RELEASE");
  const resultPath = (index: number) => join(directory, `result-${index}.json`);
  const readyPath = (index: number) => join(directory, `ready-${index}`);

  const children = Array.from({ length: count }, (_, index) =>
    spawn(
      process.execPath,
      ["--import", tsxLoader, holderEntry, journalPath, readyPath(index), releasePath, resultPath(index), `w${index}`],
      { stdio: ["ignore", "pipe", "pipe"], cwd: resolve(here, "..") },
    ),
  );
  const stderr: string[] = [];
  children.forEach((child, index) => {
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(`[w${index}] ${chunk.toString()}`));
    child.stdout?.resume();
  });

  /**
   * A child's result, but only once the payload is actually complete.
   *
   * Children publish with an atomic rename, so a partial read should be
   * impossible. Treating one as "not yet published" anyway means a future
   * regression surfaces as a timeout that carries the child's stderr, rather than
   * an opaque "Unexpected end of JSON input" pointing at an arbitrary line. This
   * changes only *when* a result counts as ready, never what is asserted.
   */
  const readOutcome = async (index: number): Promise<{ fatal?: string } | undefined> => {
    const raw = await readFile(resultPath(index), "utf8").catch(() => undefined);
    if (raw === undefined || raw.length === 0) return undefined;
    try {
      return JSON.parse(raw) as { fatal?: string };
    } catch {
      return undefined;
    }
  };

  try {
    await waitUntil(
      async () =>
        (
          await Promise.all(
            Array.from({ length: count }, async (_c, i) =>
              (await exists(readyPath(i))) || (await readOutcome(i)) !== undefined,
            ),
          )
        ).every(Boolean),
      30_000,
      `every child to resolve its open attempt\n--- child stderr ---\n${stderr.join("")}`,
    );

    const winners: number[] = [];
    const losers: number[] = [];
    for (let index = 0; index < count; index += 1) {
      if (await exists(readyPath(index))) winners.push(index);
      else losers.push(index);
    }

    const loserErrors: string[] = [];
    for (const index of losers) {
      const outcome = await readOutcome(index);
      if (!outcome)
        throw new Error(
          `Worker ${index} never published a complete result\n--- child stderr ---\n${stderr.join("")}`,
        );
      loserErrors.push(String(outcome.fatal));
    }

    // Exactly one lock holder is expected, so releasing lets every loser finish.
    await publish(releasePath, "go");
    for (const index of winners)
      await waitUntil(
        () => readOutcome(index).then(outcome => outcome !== undefined),
        30_000,
        `worker ${index} to finish`,
      );

    return { winners: winners.length, losers: losers.length, loserErrors, stderr };
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }
}

describe("kill journal single-writer enforcement across OS processes", () => {
  it("refuses a second OS process while another holds the journal lock", async () => {
    const { directory, journalPath } = await scratch();
    const releasePath = join(directory, "RELEASE");
    const resultPath = join(directory, "result-0.json");

    const child = spawn(
      process.execPath,
      ["--import", tsxLoader, holderEntry, journalPath, join(directory, "ready-0"), releasePath, resultPath, "holder"],
      { stdio: ["ignore", "pipe", "pipe"], cwd: resolve(here, "..") },
    );
    let childStderr = "";
    child.stderr?.on("data", (chunk: Buffer) => (childStderr += chunk.toString()));
    child.stdout?.resume();

    try {
      await waitUntil(() => exists(join(directory, "ready-0")), 30_000, "the holder to acquire the lock");

      // A second PROCESS must not be able to open the same journal. Without the
      // `.lock` this call resolves, and two writers would fork the hash chain.
      const intruder = track(new KillJournal(journalPath, false));
      await expect(intruder.initialize()).rejects.toMatchObject({ code: "EEXIST" });

      await publish(releasePath, "go");
      await waitUntil(async () => {
        const raw = await readFile(resultPath, "utf8").catch(() => "");
        try {
          return raw.length > 0 && Boolean(JSON.parse(raw));
        } catch {
          return false;
        }
      }, 30_000, `the holder to finish\n${childStderr}`);
      const outcome = JSON.parse(await readFile(resultPath, "utf8")) as { engaged?: boolean };
      expect(outcome.engaged).toBe(true);

      // The refused process left no state behind and did not disturb the latch.
      expect(await exists(`${journalPath}.lock`)).toBe(false);
      const lines = (await readFile(journalPath, "utf8")).split("\n").filter(Boolean);
      expect(lines.map((line) => (JSON.parse(line) as { type: string }).type)).toEqual([
        "initialized",
        "engaged",
      ]);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 60_000);

  it("admits exactly one writer when several processes race the same journal", async () => {
    const { directory, journalPath } = await scratch();
    const { winners, losers, loserErrors, stderr } = await raceOpen(
      directory,
      journalPath,
      WORKERS,
    );

    // Exclusive process ownership: one winner, everyone else refused with EEXIST.
    expect(winners, `expected exactly one writer\n${stderr.join("")}`).toBe(1);
    expect(losers).toBe(WORKERS - 1);
    // The refusal must be the exclusive-create failure, not a corrupt-journal one.
    for (const message of loserErrors) expect(message).toMatch(/^EEXIST:/);

    // A split writer would leave two `initialized` sentinels or two `engaged`
    // events with independent sequence numbers, i.e. a journal that cannot load.
    const lines = (await readFile(journalPath, "utf8")).split("\n").filter(Boolean);
    expect(lines.map((line) => (JSON.parse(line) as { type: string }).type)).toEqual([
      "initialized",
      "engaged",
    ]);

    // And the surviving journal still loads and verifies its own integrity.
    const journal = track(new KillJournal(journalPath, false));
    await expect(journal.initialize()).resolves.toBeUndefined();
    expect(journal.snapshot()).toMatchObject({ engaged: true, revision: 2 });
  }, 60_000);

  it("keeps refusing until the holder releases, then reopens the exact prior latch", async () => {
    const { directory, journalPath } = await scratch();
    const seed = track(new KillJournal(journalPath, true));
    await seed.initialize();
    await seed.append("engaged", {
      actor: "first-owner",
      reason: "Drill latch engaged before contention",
      actions: ["queues_halted"],
    });
    const latched = seed.snapshot();
    expect(latched.engaged).toBe(true);
    await seed.close();
    journals.splice(journals.indexOf(seed), 1);

    // Simulate a live holder that never released, then recover exactly as the
    // runbook would: remove the stale lock and reopen. The latch must survive.
    await writeFile(`${journalPath}.lock`, String(process.pid), "utf8");
    const blocked = track(new KillJournal(journalPath, false));
    await expect(blocked.initialize()).rejects.toMatchObject({ code: "EEXIST" });

    await rm(`${journalPath}.lock`, { force: true });
    const recovered = track(new KillJournal(journalPath, false));
    await expect(recovered.initialize()).resolves.toBeUndefined();
    expect(recovered.snapshot()).toEqual(latched);
  }, 30_000);
});