/**
 * Child-process entry for `journal-multiprocess.test.ts`.
 *
 * Usage:
 *   node --import tsx journal-holder.ts <journalPath> <readyPath> <releasePath> <resultPath> <workerId>
 *
 * Opens a real `KillJournal` on the shared path and holds it until the parent
 * releases it, so the exclusive `.lock` acquisition in `KillJournal.initialize`
 * can be contested by a genuine second OS process rather than a second object.
 */
import { rename, unlink, writeFile } from "node:fs/promises";
import { KillJournal } from "../../src/journal.js";

const [journalPath, readyPath, releasePath, resultPath, workerId] =
  process.argv.slice(2);

/**
 * Publishes a signal file atomically.
 *
 * A plain `writeFile(path, data)` creates/truncates `path` BEFORE the payload is
 * flushed, so a reader polling with `access()` can observe the file as existing
 * while its contents are still empty or partial. The parent in
 * `journal-multiprocess.test.ts` then parses that buffer and throws
 * "Unexpected end of JSON input". That is not a race in the journal itself -- it
 * is a race in this hand-off, and it only reproduces on a runner slow enough for
 * the poll to land inside the flush window.
 *
 * Writing to a private temp name in the same directory and `rename()`-ing it into
 * place makes publication atomic on POSIX and on Windows, so the parent only ever
 * sees a complete file. This fixes the protocol by construction instead of
 * teaching the reader to tolerate a window that should not exist.
 */
async function publish(path: string, data: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, data, "utf8");
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

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

async function main() {
  const journal = new KillJournal(journalPath, true);
  await journal.initialize();
  await publish(readyPath, workerId);
  await waitForPath(releasePath, 30_000, "the release barrier");
  await journal.append("engaged", {
    actor: `multiprocess-${workerId}`,
    reason: "Cross-process single-writer drill",
    actions: ["queues_halted"],
  });
  const engaged = journal.snapshot().engaged;
  await journal.close();
  await publish(resultPath, JSON.stringify({ workerId, engaged }));
}

main().catch(async (error: unknown) => {
  await publish(
    resultPath,
    JSON.stringify({
      workerId,
      fatal: error instanceof Error ? error.message : String(error),
    }),
  ).catch(() => undefined);
  process.exitCode = 1;
});