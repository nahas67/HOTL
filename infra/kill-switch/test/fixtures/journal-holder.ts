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
import { writeFile } from "node:fs/promises";
import { KillJournal } from "../../src/journal.js";

const [journalPath, readyPath, releasePath, resultPath, workerId] =
  process.argv.slice(2);

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
  await writeFile(readyPath, workerId, "utf8");
  await waitForPath(releasePath, 30_000, "the release barrier");
  await journal.append("engaged", {
    actor: `multiprocess-${workerId}`,
    reason: "Cross-process single-writer drill",
    actions: ["queues_halted"],
  });
  const engaged = journal.snapshot().engaged;
  await journal.close();
  await writeFile(resultPath, JSON.stringify({ workerId, engaged }), "utf8");
}

main().catch(async (error: unknown) => {
  await writeFile(
    resultPath,
    JSON.stringify({
      workerId,
      fatal: error instanceof Error ? error.message : String(error),
    }),
    "utf8",
  ).catch(() => undefined);
  process.exitCode = 1;
});