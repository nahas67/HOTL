import { createHmac, timingSafeEqual } from "node:crypto";

// Validate the exact wire bytes and timestamp before accepting any payment event.
export function verifyStripeSignature(
  raw: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const parts = signature.split(",").map((part) => part.split("="));
  const timestampText = parts.find(([key]) => key === "t")?.[1];
  if (!timestampText || !/^\d+$/.test(timestampText)) return false;
  const timestamp = Number(timestampText);
  if (Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestampText}.${raw}`)
    .digest();
  return parts
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      if (!value || !/^[a-f0-9]{64}$/i.test(value)) return false;
      const provided = Buffer.from(value, "hex");
      return (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      );
    });
}

export interface EventPublisher {
  publish(id: string, type: string, payload: unknown): Promise<void>;
}
export class BullEventPublisher implements EventPublisher {
  private queuePromise: Promise<import("bullmq").Queue>;
  constructor(redisUrl: string) {
    this.queuePromise = import("bullmq").then(({ Queue }) => {
      const url = new URL(redisUrl);
      return new Queue("commerce-events", {
        connection: {
          host: url.hostname,
          port: Number(url.port || 6379),
          username: url.username || undefined,
          password: url.password || undefined,
          ...(url.protocol === "rediss:" ? { tls: {} } : {}),
        },
      });
    });
  }
  async publish(id: string, type: string, payload: unknown) {
    const queue = await this.queuePromise;
    await queue.add(type, payload, {
      jobId: id.replaceAll(":", "-"),
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 604800 },
      removeOnFail: false,
    });
  }
  async close() {
    await (await this.queuePromise).close();
  }
}
