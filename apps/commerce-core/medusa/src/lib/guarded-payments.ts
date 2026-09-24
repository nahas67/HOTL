import { createHash } from "node:crypto";

export type PaymentOperation = "initiate" | "authorize" | "capture" | "refund" | "update" | "cancel" | "delete";
export type ReceiptStatus = "pending" | "requires_more" | "authorized" | "captured" | "refunded" | "canceled" | "deleted";
export interface ExecutionReceipt {
  decision: "allow";
  mode: "live";
  executed: true;
  operationId: string;
  providerPaymentId: string;
  receiptId: string;
  status: ReceiptStatus;
  clientSecret?: string;
}
export interface BridgeOptions {
  guardrailUrl: string;
  guardrailToken: string;
  timeoutMs?: number;
}
export interface PaymentRequest {
  idempotencyKey: unknown;
  medusaSessionId?: string;
  paymentReference?: string;
  amount?: string;
  currency?: string;
}

const statuses = new Set<ReceiptStatus>(["pending", "requires_more", "authorized", "captured", "refunded", "canceled", "deleted"]);
const expectedStatuses: Record<PaymentOperation, ReceiptStatus[]> = {
  initiate: ["pending", "requires_more", "authorized"],
  authorize: ["pending", "requires_more", "authorized", "captured"],
  capture: ["captured"],
  refund: ["refunded"],
  update: ["pending", "requires_more", "authorized"],
  cancel: ["canceled"],
  delete: ["deleted"],
};

export function validateBridgeOptions(options: BridgeOptions) {
  const url = new URL(options.guardrailUrl);
  if (url.username || url.password || url.search || url.hash) throw new Error("Guardrail URL must not contain credentials, query, or fragment");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Guardrail payment bridge requires HTTPS outside localhost");
  }
  if (!options.guardrailToken || options.guardrailToken.length < 32) throw new Error("MEDUSA_GUARDRAIL_TOKEN must contain at least 32 characters");
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60000)) throw new Error("Invalid payment bridge timeout");
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024;
}

function parseReceipt(body: unknown, operationId?: string, paymentReference?: string): ExecutionReceipt {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Guardrail did not return a payment execution receipt");
  const receipt = body as Record<string, unknown>;
  if (receipt.decision !== "allow" || receipt.mode !== "live" || receipt.executed !== true ||
    !nonempty(receipt.operationId) || !nonempty(receipt.providerPaymentId) || !nonempty(receipt.receiptId) ||
    !statuses.has(receipt.status as ReceiptStatus) ||
    (operationId !== undefined && receipt.operationId !== operationId) ||
    (paymentReference !== undefined && receipt.providerPaymentId !== paymentReference)) {
    throw new Error("Guardrail payment receipt rejected: operation was not confirmed");
  }
  return {
    decision: "allow", mode: "live", executed: true,
    operationId: receipt.operationId, providerPaymentId: receipt.providerPaymentId,
    receiptId: receipt.receiptId, status: receipt.status as ReceiptStatus,
    ...(nonempty(receipt.clientSecret) ? { clientSecret: receipt.clientSecret } : {}),
  };
}

// The central service must persist idempotency and audit before returning this receipt.
// A policy-only allow or a simulation receipt is deliberately insufficient.
export class GuardedPayments {
  private base: string;
  constructor(private options: BridgeOptions, private transport: typeof fetch = fetch) {
    validateBridgeOptions(options);
    this.base = options.guardrailUrl.replace(/\/$/, "") + "/api/guardrails/v1/medusa/payments";
  }

  async execute(operation: PaymentOperation, request: PaymentRequest): Promise<ExecutionReceipt> {
    if (!nonempty(request.idempotencyKey)) throw new Error("Medusa payment context.idempotency_key is required");
    if (operation !== "initiate" && !nonempty(request.paymentReference)) throw new Error("Missing payment reference");
    if (request.amount !== undefined && (!/^(0|[1-9]\d*)(\.\d+)?$/.test(request.amount) || Number(request.amount) <= 0 || !Number.isFinite(Number(request.amount)))) throw new Error("Payment amount must be a positive decimal string");
    if (request.currency !== undefined && !/^[a-z]{3}$/.test(request.currency)) throw new Error("Payment currency must be a lowercase ISO code");
    const operationId = "medusa-" + createHash("sha256").update(operation + "\n" + request.idempotencyKey).digest("hex");
    const response = await this.transport(`${this.base}/${operation}`, {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.guardrailToken}`, "Idempotency-Key": operationId },
      body: JSON.stringify({ operationId, medusaSessionId: request.medusaSessionId, paymentReference: request.paymentReference, amount: request.amount, currency: request.currency }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10000),
    });
    if (!response.ok) throw new Error(`Guardrail payment ${operation} unavailable or denied (HTTP ${response.status})`);
    const receipt = parseReceipt(await response.json(), operationId, request.paymentReference);
    if (!expectedStatuses[operation].includes(receipt.status)) throw new Error(`Guardrail payment ${operation} was not confirmed`);
    return receipt;
  }

  async retrieve(paymentReference: string): Promise<ExecutionReceipt> {
    if (!nonempty(paymentReference)) throw new Error("Missing payment reference");
    const response = await this.transport(`${this.base}/${encodeURIComponent(paymentReference)}`, {
      method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${this.options.guardrailToken}` },
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10000),
    });
    if (!response.ok) throw new Error(`Guardrail payment retrieval unavailable (HTTP ${response.status})`);
    return parseReceipt(await response.json(), undefined, paymentReference);
  }
}
