import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { GuardrailClient } from "./guardrail-client.js";
import { verifyStripeSignature, type EventPublisher } from "./webhooks.js";

const checkoutSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.string().email().max(254),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(100),
            quantity: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    destinationCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict();

export function createCommerceApp(
  options: {
    guardrail?: Pick<GuardrailClient, "request">;
    publisher?: EventPublisher;
    webhookSecret?: string;
    mode?: string;
  } = {},
) {
  const app = Fastify({ bodyLimit: 64 * 1024, logger: false });
  const guardrail = options.guardrail ?? new GuardrailClient();
  const mode = options.mode ?? process.env.HOTL_MODE ?? "simulation";
  app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  app.setErrorHandler(
    (
      error: Error & { statusCode?: number; details?: unknown },
      _request,
      reply,
    ) => {
      if (error instanceof z.ZodError)
        return reply
          .code(400)
          .send({
            error: {
              code: "INVALID_REQUEST",
              message: "Please check the submitted fields.",
              details: error.flatten(),
            },
          });
      return reply
        .code(error.statusCode ?? 503)
        .send(
          error.details ?? {
            error: { code: "COMMERCE_UNAVAILABLE", message: error.message },
          },
        );
    },
  );
  app.get("/health", async () => ({
    service: "commerce-core",
    mode,
    status: "ok",
  }));
  app.get("/store/products", async () => {
    const response = await guardrail.request("/api/products");
    const products: Record<string, unknown>[] = Array.isArray(response)
      ? response
      : response.products;
    return {
      mode,
      products: products
        .filter((p) => p.status === "published" || p.status === "active")
        .map((p) => ({
          id: p.id,
          name: p.name ?? p.title,
          category: p.category,
          price: p.price ?? p.sellingPrice,
          stock: p.stock ?? p.inventory,
          description:
            p.description ?? "A considered addition to your everyday routine.",
          image: p.image,
          sku: p.sku,
        })),
    };
  });
  app.post("/store/checkout", async (request, reply) => {
    if (mode !== "simulation")
      return reply
        .code(503)
        .send({
          error: {
            code: "LIVE_CHECKOUT_NOT_CONFIGURED",
            message:
              "Live checkout requires the Medusa payment bridge and verified provider configuration.",
          },
        });
    const input = checkoutSchema.parse(request.body);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 128)
      return reply
        .code(400)
        .send({
          error: {
            code: "IDEMPOTENCY_REQUIRED",
            message: "A checkout idempotency key is required.",
          },
        });
    const order = await guardrail.request(
      "/api/guardrails/v1/commerce/checkout",
      input,
      key,
    );
    return reply.code(201).send({ ...order, mode: "simulation" });
  });
  // Encapsulation preserves raw webhook bytes without changing JSON checkout parsing.
  app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => done(null, body),
    );
    scoped.post("/webhooks/stripe", async (request, reply) => {
      const secret = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !options.publisher)
        return reply
          .code(503)
          .send({
            error: {
              code: "WEBHOOK_NOT_CONFIGURED",
              message:
                "Webhook verification and durable queue must be configured.",
            },
          });
      const raw = request.body as string;
      const signature = request.headers["stripe-signature"];
      if (
        typeof signature !== "string" ||
        !verifyStripeSignature(raw, signature, secret)
      )
        return reply
          .code(400)
          .send({
            error: {
              code: "INVALID_SIGNATURE",
              message: "Invalid webhook signature.",
            },
          });
      let event: { id: string; type: string; data?: unknown };
      try {
        event = z
          .object({
            id: z.string().min(1),
            type: z.string().min(1),
            data: z.unknown(),
          })
          .parse(JSON.parse(raw));
      } catch {
        return reply
          .code(400)
          .send({
            error: { code: "INVALID_EVENT", message: "Invalid payment event." },
          });
      }
      // The guardrail service durably audits receipt before queue acknowledgement.
      const type =
        event.type === "payment_intent.succeeded"
          ? "payment.confirmed"
          : event.type === "payment_intent.payment_failed"
            ? "payment.failed"
            : undefined;
      if (!type) return { received: true, ignored: true };
      const data = z
        .object({
          object: z.object({
            metadata: z.object({ order_id: z.string().min(1) }),
          }),
        })
        .safeParse(event.data);
      if (!data.success)
        return reply
          .code(400)
          .send({
            error: {
              code: "ORDER_REFERENCE_REQUIRED",
              message: "Payment event requires a verified order reference.",
            },
          });
      await guardrail.request(
        "/api/guardrails/v1/commerce/events",
        {
          eventId: event.id,
          type,
          orderId: data.data.object.metadata.order_id,
        },
        `stripe-${event.id}`,
      );
      await options.publisher.publish(event.id, type, event.data);
      return { received: true };
    });
  });
  return app;
}
