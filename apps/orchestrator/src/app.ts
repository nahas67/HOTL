import Fastify from "fastify";
import { z } from "zod";
import type { OwnerInterrupt } from "@hotl/schemas";
import { RunManager } from "./manager.js";

type OwnerContext = { id: string; interrupts: () => Promise<OwnerInterrupt[]> };
export function createOrchestratorApp(
  manager: RunManager,
  authenticate: (headers: Record<string, unknown>) => Promise<OwnerContext>,
) {
  const app = Fastify({ bodyLimit: 16384 });
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) =>
      reply
        .code(error instanceof z.ZodError ? 400 : (error.statusCode ?? 503))
        .send({
          error: {
            code: "RUN_REQUEST_FAILED",
            message:
              error instanceof z.ZodError
                ? "Invalid run request."
                : error.message,
          },
        }),
  );
  app.get("/health", async () => ({
    service: "orchestrator",
    status: "ok",
    mode: process.env.HOTL_MODE ?? "simulation",
  }));
  app.post("/api/runs", async (request, reply) => {
    const owner = await authenticate(request.headers);
    const { cycle } = z
      .object({ cycle: z.enum(["daily", "weekly", "monthly"]) })
      .strict()
      .parse(request.body);
    const key = z
      .string()
      .min(8)
      .max(200)
      .parse(request.headers["idempotency-key"]);
    return reply.code(201).send(await manager.start(cycle, key, owner.id));
  });
  app.get("/api/runs/:id", async (request) => {
    await authenticate(request.headers);
    return manager.get(
      z
        .string()
        .min(1)
        .max(120)
        .parse((request.params as { id: string }).id),
    );
  });
  app.post("/api/runs/:id/resume", async (request) => {
    const owner = await authenticate(request.headers);
    z.string().min(8).max(200).parse(request.headers["idempotency-key"]);
    const { interruptId } = z
      .object({ interruptId: z.string().min(1).max(120) })
      .strict()
      .parse(request.body);
    return manager.resume(
      z
        .string()
        .min(1)
        .max(120)
        .parse((request.params as { id: string }).id),
      interruptId,
      await owner.interrupts(),
    );
  });
  return app;
}
