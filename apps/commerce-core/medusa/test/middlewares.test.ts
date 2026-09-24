import assert from "node:assert/strict";
import test from "node:test";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { denyUnsupportedWrite } from "../src/api/middlewares";

test("native commerce mutations cannot bypass guarded payments with the system provider", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    let continued = false;
    let status: number | undefined;
    let body: unknown;
    const response = {
      status(code: number) { status = code; return this; },
      json(value: unknown) { body = value; return this; },
    };
    denyUnsupportedWrite(
      { method, path: "/store/carts/cart_1/complete", body: { provider_id: "pp_system" } } as MedusaRequest,
      response as MedusaResponse,
      () => { continued = true; },
    );
    assert.equal(continued, false);
    assert.equal(status, 503);
    assert.equal((body as { type: string }).type, "guardrail_unavailable");
  }
});

test("native read APIs remain available in staging", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    let continued = false;
    denyUnsupportedWrite({ method } as MedusaRequest, {} as MedusaResponse, () => { continued = true; });
    assert.equal(continued, true);
  }
});
