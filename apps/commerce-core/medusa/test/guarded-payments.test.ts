import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { GuardedPayments, type PaymentOperation } from "../src/lib/guarded-payments";
import GuardedPaymentProviderService from "../src/modules/guarded-payment/service";

const token = "service-only-credential-at-least-32-chars";

test("payment bridge sends scoped idempotency keys and forwards replays to central ledger", async () => {
  const requests: { key: string; operationId: string; amount: string; auth: string }[] = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    const body = JSON.parse(text);
    requests.push({ key: String(req.headers["idempotency-key"]), operationId: body.operationId, amount: body.amount, auth: String(req.headers.authorization) });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ decision: "allow", mode: "live", executed: true, operationId: body.operationId, providerPaymentId: "pi_123", receiptId: "audit_123", status: "refunded" }));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const bridge = new GuardedPayments({ guardrailUrl: `http://127.0.0.1:${address.port}`, guardrailToken: token });
    const request = { idempotencyKey: "refund-medusa-123", paymentReference: "pi_123", amount: "12.34" };
    assert.equal((await bridge.execute("refund", request)).status, "refunded");
    await bridge.execute("refund", request);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].key, requests[1].key);
    assert.equal(requests[0].key, requests[0].operationId);
    assert.equal(requests[0].auth, `Bearer ${token}`);
    assert.equal(requests[0].amount, "12.34");
  } finally { server.close(); await once(server, "close"); }
});

for (const operation of ["capture", "refund"] satisfies PaymentOperation[]) {
  for (const failure of ["deny", "escalate", "simulation", "not-executed", "wrong-operation", "wrong-payment", "wrong-status", "missing-receipt", "missing-endpoint"]) {
    test(`${operation} rejects ${failure} without reporting execution`, async () => {
      const transport: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const receipt: Record<string, unknown> = { decision: "allow", mode: "live", executed: true, operationId: body.operationId, providerPaymentId: "pi_123", receiptId: "audit_123", status: operation === "capture" ? "captured" : "refunded" };
        if (failure === "deny" || failure === "escalate") receipt.decision = failure;
        if (failure === "simulation") receipt.mode = "simulation";
        if (failure === "not-executed") receipt.executed = false;
        if (failure === "wrong-operation") receipt.operationId = "another-operation";
        if (failure === "wrong-payment") receipt.providerPaymentId = "another-payment";
        if (failure === "wrong-status") receipt.status = "pending";
        if (failure === "missing-receipt") delete receipt.receiptId;
        return Response.json(receipt, { status: failure === "missing-endpoint" ? 404 : 200 });
      };
      const bridge = new GuardedPayments({ guardrailUrl: "http://127.0.0.1:4300", guardrailToken: token }, transport);
      await assert.rejects(bridge.execute(operation, { idempotencyKey: "operation-123", paymentReference: "pi_123", amount: "10" }), /Guardrail/);
    });
  }
}

test("missing idempotency key and invalid amounts never contact central service", async () => {
  let calls = 0;
  const bridge = new GuardedPayments({ guardrailUrl: "http://127.0.0.1:4300", guardrailToken: token }, async () => { calls++; throw new Error("should not call"); });
  await assert.rejects(bridge.execute("capture", { idempotencyKey: undefined, paymentReference: "pi_123" }), /idempotency/);
  for (const amount of ["NaN", "-5", "0", "1e3", "Infinity"]) {
    await assert.rejects(bridge.execute("refund", { idempotencyKey: "key", paymentReference: "pi_123", amount }), /positive decimal/);
  }
  assert.equal(calls, 0);
});

test("Medusa provider rejects forged payment status and ignores unverified webhooks", async () => {
  const provider = new GuardedPaymentProviderService({}, { guardrailUrl: "http://127.0.0.1:1", guardrailToken: token });
  await assert.rejects(provider.getPaymentStatus({ data: { paymentReference: "pi_fake", status: "captured", executed: true } }));
  await assert.rejects(provider.capturePayment({ data: { paymentReference: "pi_fake", status: "captured" } }), /idempotency/);
  assert.deepEqual(await provider.getWebhookActionAndData({ data: { type: "payment_intent.succeeded" }, rawData: "{}", headers: {} }), { action: "not_supported" });
});
