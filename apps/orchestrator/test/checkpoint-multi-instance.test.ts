import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "@hotl/guardrail-service";
import { createServer } from "@hotl/guardrail-service/server";
import { FileSaver } from "../src/checkpointer.js";
import { HttpGuardrails } from "../src/client.js";
import { createCommerceGraph } from "../src/graph.js";
import { RunManager } from "../src/manager.js";

/**
 * ============================================================================
 * CHARACTERIZATION TEST — this file asserts what the code DOES, not a guarantee
 * it has. Read the limitation before trusting anything here.
 *
 * `RunManager.serialize()` is a per-instance promise chain and `FileSaver.flush()`
 * is an unconditional whole-file `rename()` of that instance's in-memory
 * `storage`/`writes` — no lock, no read-merge, no conflict detection. Two
 * orchestrator processes over one checkpoint file therefore have NO mutual
 * exclusion, and the file is LAST-WRITER-WINS across the whole thread set.
 *
 * KNOWN LIMITATION (measured, reproducible, ~50ms):
 *   instance A writes t1  -> file = [t1]
 *   instance B writes t2  -> file = [t2]        <- t1 is GONE
 *   instance A writes t3  -> file = [t1, t3]    <- t2 is GONE
 * A writer does not just miss threads it never saw; it erases every thread that
 * existed when IT loaded. Two live workers each destroy the other's checkpoints
 * on every single write. The only reason the orchestrator is safe today is that
 * it is deployed as a single process.
 *
 * WHY THIS IS NOT A DOUBLE-SPEND: the financial defence is guardrail idempotency
 * on a deterministic action key, so a replayed execution replays rather than
 * re-executes. That is already proven in `graph.test.ts` ("replays the saved
 * action key after a response is lost across a checkpoint restart"). The loss
 * below is availability and auditability — a run becomes unfindable and an owner
 * cannot see what happened — not a duplicated financial effect.
 *
 * If a fix lands (file lock, read-merge, or PostgresSaver in production), the
 * first test below will FAIL. That is the point: the suite must announce the
 * change rather than silently re-baseline.
 * ============================================================================
 */
const directories: string[] = [];
const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close().catch(() => undefined);
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hotl-checkpoint-multi-"));
  directories.push(directory);
  return join(directory, "checkpoints.json");
}

const threadOf = (threadId: string) => ({
  configurable: { thread_id: threadId, checkpoint_ns: "" },
});
const rootInput = { source: "input", step: -1, parents: {} } as const;
const checkpoint = (id: string) => ({
  v: 4,
  id,
  ts: "2026-10-09T00:00:00.000Z",
  channel_values: { approval: { interruptId: id, status: "pending" } },
  channel_versions: { approval: 1 },
  versions_seen: {},
});

const persistedThreadIds = async (file: string): Promise<string[]> => {
  const data = JSON.parse(await readFile(file, "utf8")) as {
    storage: Record<string, Record<string, unknown>>;
  };
  return Object.keys(data.storage).sort();
};

async function gateway() {
  const engine = await createEngine({ killSwitchReader: async () => ({ engaged: false }) });
  const server = await createServer({ engine, mode: "simulation", internalToken: "multi-token" });
  await server.listen({ port: 0, host: "127.0.0.1" });
  closers.push(() => server.close());
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return new HttpGuardrails(`http://127.0.0.1:${address.port}`, "multi-token");
}

const managerOver = async (file: string, client: HttpGuardrails) =>
  new RunManager(
    createCommerceGraph(client, await new FileSaver(file).load()),
    client,
  );

describe("CHARACTERIZATION — two FileSaver instances share no mutual exclusion", () => {
  it("last writer wins the whole thread set, erasing threads it never loaded", async () => {
    const file = await scratch();

    const first = await new FileSaver(file).load();
    const second = await new FileSaver(file).load();

    await first.put(threadOf("thread-alpha"), checkpoint("alpha"), rootInput);
    expect(await persistedThreadIds(file)).toEqual(["thread-alpha"]);

    // The second instance loaded an EMPTY file, so writing discards everything
    // the first instance had already committed to disk.
    await second.put(threadOf("thread-bravo"), checkpoint("bravo"), rootInput);
    expect(await persistedThreadIds(file)).toEqual(["thread-bravo"]);

    // ...and the first instance, still holding only its own view, now destroys
    // the second instance's thread in exactly the same way.
    await first.put(threadOf("thread-charlie"), checkpoint("charlie"), rootInput);
    expect(await persistedThreadIds(file)).toEqual(["thread-alpha", "thread-charlie"]);

    // Divergence: the live instance still believes in the thread that disk lost.
    expect(await second.getTuple(threadOf("thread-bravo"))).toBeDefined();
    expect(await (await new FileSaver(file).load()).getTuple(threadOf("thread-bravo"))).toBeUndefined();

    // No error, no warning, no refusal: the loss is completely silent.
  }, 30_000);

  it("keeps one instance's own sequential writes intact", async () => {
    const file = await scratch();
    const only = await new FileSaver(file).load();
    for (const id of ["one", "two", "three"])
      await only.put(threadOf(`thread-${id}`), checkpoint(id), rootInput);
    expect(await persistedThreadIds(file)).toEqual([
      "thread-one",
      "thread-three",
      "thread-two",
    ]);
  }, 30_000);
});

describe("CHARACTERIZATION — the same loss is visible to the owner through RunManager", () => {
  it("makes one worker's run unfindable after a process restart", async () => {
    const file = await scratch();
    const client = await gateway();

    const workerA = await managerOver(file, client);
    const workerB = await managerOver(file, client);

    const runA = await workerA.start("daily", "worker-a-daily-run");
    expect(runA.runId).toBeTruthy();

    // Worker B writes next. Its in-memory view never saw worker A's run, so
    // this write replaces the whole thread set on disk.
    const runB = await workerB.start("daily", "worker-b-daily-run");
    expect(runB.runId).toBeTruthy();
    expect(runB.runId).not.toBe(runA.runId);

    // A restart is the honest way to observe the file: neither process's own
    // memory is consulted, so this is what an operator would find after a crash.
    const afterRestart = await managerOver(file, client);
    await expect(afterRestart.get(runA.runId)).rejects.toMatchObject({
      message: "This run has no saved checkpoint.",
      statusCode: 404,
    });
    expect((await afterRestart.get(runB.runId)).runId).toBe(runB.runId);
  }, 60_000);

  it("still serializes start and resume within a single instance", async () => {
    const file = await scratch();
    const worker = await managerOver(file, await gateway());

    // `serialize()` is per instance, so the in-process ordering guarantee holds
    // and is worth pinning separately from the cross-process limitation above.
    const [first, second] = await Promise.all([
      worker.start("daily", "concurrent-same-key-a"),
      worker.start("daily", "concurrent-same-key-a"),
    ]);
    expect(first.runId).toBe(second.runId);
    expect(await persistedThreadIds(file)).toEqual([first.runId].sort());
  }, 60_000);
});