import { defineMiddlewares, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http";

export function denyUnsupportedWrite(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return res.status(503).json({ type: "guardrail_unavailable", message: "Native commerce mutations require the central Medusa guardrail workflow, which is not enabled in this staging adapter." });
}

// Medusa includes a default system payment provider. Restricting only our custom
// provider would leave native checkout and other commerce writes outside HOTL's
// audit boundary. Keep the staging HTTP surface read-only until guarded workflows
// are implemented; selecting another provider must not bypass that boundary.
export default defineMiddlewares({ routes: [
  { matcher: "/admin/*", middlewares: [denyUnsupportedWrite] },
  { matcher: "/store/*", middlewares: [denyUnsupportedWrite] },
] });
