import { HttpGuardrails } from "./client.js";
import { createCheckpointer } from "./checkpointer.js";
import { createCommerceGraph } from "./graph.js";
import { RunManager, RunError } from "./manager.js";
import { createOrchestratorApp, setCheckpointConflictSource } from "./app.js";
import type { OwnerInterrupt } from "@hotl/schemas";
import { startQueueWorkers } from "./queue.js";

const mode = process.env.HOTL_MODE ?? "simulation";
if (!["simulation", "live"].includes(mode))
  throw new Error("HOTL_MODE must be simulation or live.");
const gateway = new HttpGuardrails();
const checkpointer = await createCheckpointer();
const manager = new RunManager(
  createCommerceGraph(gateway, checkpointer),
  gateway,
);
const app = createOrchestratorApp(manager, async (incoming) => {
  const headers: Record<string, string> = {};
  if (
    mode === "simulation" &&
    typeof incoming["x-hotl-internal-token"] === "string"
  )
    headers["x-hotl-internal-token"] = incoming["x-hotl-internal-token"];
  if (typeof incoming.authorization === "string")
    headers.Authorization = incoming.authorization;
  const base =
    process.env.GUARDRAIL_URL ??
    process.env.GUARDRAIL_SERVICE_URL ??
    "http://127.0.0.1:4100";
  const response = await fetch(`${base}/api/identity`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new RunError(
      "An authenticated platform owner is required.",
      response.status === 403 ? 403 : 401,
    );
  const identity = await response.json();
  if (identity.actor?.type !== 'owner' || typeof identity.actor.id !== 'string') throw new RunError('Owner identity could not be verified.', 401);
  return {
    id: identity.actor.id,
    interrupts: async () => {
      const result = await fetch(`${base}/api/interrupts`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!result.ok)
        throw new RunError("Unable to verify the owner decision.", 503);
      return (await result.json()).interrupts as OwnerInterrupt[];
    },
  };
});
// A skipped checkpoint (stale writer) must be visible, not only held inside the saver.
setCheckpointConflictSource(
  () => (checkpointer as { conflicts?: () => readonly { at: string; reason: string }[] }).conflicts?.() ?? [],
);
await app.listen({
  port: Number(process.env.ORCHESTRATOR_PORT ?? 4300),
  host: "127.0.0.1",
});
console.log("HOTL orchestrator on http://127.0.0.1:4300");
const workers =
  process.env.REDIS_URL && process.env.ENABLE_QUEUE_WORKERS === "true"
    ? await startQueueWorkers(manager, process.env.REDIS_URL)
    : undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await workers?.close();
    await app.close();
    if ("end" in checkpointer && typeof checkpointer.end === "function")
      await checkpointer.end();
    process.exit(0);
  });
