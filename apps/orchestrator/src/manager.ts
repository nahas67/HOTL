import { createHash } from "node:crypto";
import { Command } from "@langchain/langgraph";
import type { OwnerInterrupt } from "@hotl/schemas";
import { createCommerceGraph, type State } from "./graph.js";
import type { GuardrailGateway } from "./client.js";

type Graph = ReturnType<typeof createCommerceGraph>;
export class RunError extends Error {
  constructor(
    message: string,
    public statusCode = 409,
  ) {
    super(message);
  }
}
function idFor(key: string, owner: string) {
  const hash = createHash("sha256").update(`${owner}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export class RunManager {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    readonly graph: Graph,
    private gateway: GuardrailGateway,
  ) {}
  private serialize<T>(action: () => Promise<T>) {
    const task = this.pending.then(action, action);
    this.pending = task.catch(() => {});
    return task;
  }
  async get(runId: string) {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: runId },
    });
    if (!snapshot.values?.runId)
      throw new RunError("This run has no saved checkpoint.", 404);
    const waiting = snapshot.tasks.some(
      (task) => (task.interrupts?.length ?? 0) > 0,
    );
    const state = snapshot.values as State;
    return {
      runId,
      cycle: state.cycle,
      status: waiting ? "interrupted" : state.status,
      interruptId: state.interruptId,
      logs: state.logs,
      guardrailDecisions: state.guardrailDecisions,
      activeStage: state.activeStage,
      plan: state.plan,
      replanCounts: state.replanCounts,
      resolvedInterruptIds: state.resolvedInterruptIds ?? [],
      next: snapshot.next,
    };
  }
  start(cycle: State["cycle"], key: string, owner = "simulation-owner") {
    return this.serialize(async () => {
      if (key.length < 8 || key.length > 200)
        throw new RunError(
          "Use an Idempotency-Key between 8 and 200 characters.",
          400,
        );
      const runId = idFor(key, owner);
      const config = { configurable: { thread_id: runId }, recursionLimit: 300 };
      const existing = await this.graph.getState(config);
      if (existing.values?.runId) {
        if (existing.values.cycle !== cycle)
          throw new RunError(
            "This idempotency key belongs to a different cycle.",
          );
        const current = await this.get(runId);
        if (current.status === "running" && current.next.length)
          await this.graph.invoke(null, config);
        return this.get(runId);
      }
      await this.graph.invoke({ runId, cycle, status: "running" }, config);
      return this.get(runId);
    });
  }
  resume(runId: string, interruptId: string, interrupts: OwnerInterrupt[]) {
    return this.serialize(async () => {
      const decision = interrupts.find(
        (item) => item.id === interruptId && item.threadId === runId,
      );
      if (!decision)
        throw new RunError("The approval does not belong to this run.", 404);
      if (!["approved", "rejected", "modified", "expired"].includes(decision.status))
        throw new RunError(
          "The owner must resolve the approval before the agent can resume.",
        );
      const config = { configurable: { thread_id: runId }, recursionLimit: 300 };
      const snapshot = await this.graph.getState(config);
      if (
        !snapshot.values?.runId &&
        ["run-support-01", "run-marketing-01", "run-sourcing-01"].includes(
          runId,
        )
      )
        return {
          runId,
          status: "resolved",
          seeded: true,
          message: "The sample approval is resolved; it has no live graph run.",
        };
      const current = await this.get(runId);
      if (current.resolvedInterruptIds.includes(interruptId)) return current;
      if (current.interruptId !== interruptId)
        throw new RunError("This is not the approval the run is waiting for.");
      if (current.status === "completed") return current;
      if (current.status !== "interrupted")
        throw new RunError("This run is not waiting for an owner decision.");
      const platform = await this.gateway.status();
      if (
        platform.status !== "running" ||
        platform.paused ||
        platform.killSwitch.engaged ||
        platform.killSwitch.reachable === false
      )
        throw new RunError(
          "The platform controls currently prevent this run from resuming.",
          423,
        );
      await this.graph.invoke(
        new Command({
          resume: { status: decision.status, note: decision.resolutionNote },
        }),
        config,
      );
      return this.get(runId);
    });
  }
}
