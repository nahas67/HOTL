import { createHash } from "node:crypto";
import { Queue, type ConnectionOptions } from "bullmq";

export interface CommerceEvent {
  name: string;
  data: { id: string };
  metadata?: { eventGroupId?: string; created_at?: Date; [key: string]: unknown };
}

export function queueConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error("REDIS_URL must use redis or rediss");
  const db = url.pathname.slice(1) || "0";
  if (!/^\d+$/.test(db)) throw new Error("Invalid Redis database index");
  return {
    host: url.hostname, port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db: Number(db), maxRetriesPerRequest: 1, connectTimeout: 5000,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  } satisfies ConnectionOptions;
}

export function commerceEnvelope(event: CommerceEvent) {
  if (!event.data.id) throw new Error("Commerce event is missing its resource ID");
  const createdAt = event.metadata?.created_at;
  const group = event.metadata?.eventGroupId;
  if (!createdAt && !group) throw new Error("Commerce event needs stable Medusa created_at or eventGroupId metadata for retry deduplication");
  const timestamp = createdAt ? new Date(createdAt).toISOString() : null;
  const eventId = createHash("sha256").update(JSON.stringify([event.name, event.data.id, group ?? null, timestamp])).digest("hex");
  return { eventId, source: "medusa" as const, type: event.name, resourceId: event.data.id, occurredAt: timestamp, data: event.data };
}

export async function publishCommerceEvent(event: CommerceEvent) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required for commerce event delivery");
  const envelope = commerceEnvelope(event);
  const queue = new Queue("commerce-events", { connection: queueConnection(redisUrl) });
  try {
    await queue.add(event.name, envelope, {
      jobId: `medusa-${envelope.eventId}`, attempts: 10,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 604800 }, removeOnFail: false,
    });
  } finally {
    await queue.close();
  }
}
