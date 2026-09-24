import { Queue, Worker } from "bullmq";
import type { RunManager } from "./manager.js";

// Optional worker. The same graph and guardrail boundary run for queued jobs;
// retrying a BullMQ job keeps its run id and side-effect idempotency keys.
export async function startQueueWorkers(manager: RunManager, redisUrl: string) {
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
  const queue = new Queue("agent-cycles", { connection });
  const worker = new Worker(
    "agent-cycles",
    async (job) => {
      const cycle = job.data.cycle;
      if (!["daily", "weekly", "monthly"].includes(cycle))
        throw new Error("Invalid scheduled cycle.");
      return manager.start(cycle, `queue-${job.id}`, "runtime-scheduler");
    },
    { connection, concurrency: 1 },
  );
  worker.on("error", (error) => console.error("Agent worker:", error.message));
  worker.on("failed", (job, error) =>
    console.error(`Cycle job ${job?.id} failed:`, error.message),
  );
  if (process.env.ENABLE_SCHEDULED_RUNS === "true") {
    await queue.upsertJobScheduler(
      "daily-commerce-cycle",
      { pattern: "0 8 * * *", tz: "UTC" },
      {
        name: "daily",
        data: { cycle: "daily" },
        opts: { attempts: 3, backoff: { type: "exponential", delay: 10000 } },
      },
    );
  }
  const commerce = new Worker(
    "commerce-events",
    async (job) => {
      // Unknown event types cannot trigger agent runs.
      if (
        ![
          "payment.confirmed",
          "payment.failed",
          "fulfillment.updated",
        ].includes(job.name)
      )
        throw new Error("Unsupported commerce event.");
      return manager.start(
        "daily",
        `commerce-event-${job.id}`,
        "commerce-event-worker",
      );
    },
    { connection, concurrency: 1 },
  );
  commerce.on("error", (error) =>
    console.error("Commerce worker:", error.message),
  );
  return {
    close: async () => {
      await worker.close();
      await commerce.close();
      await queue.close();
    },
  };
}
