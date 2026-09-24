import { AbstractPaymentProvider, MathBN } from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput, AuthorizePaymentOutput, CancelPaymentInput, CancelPaymentOutput,
  CapturePaymentInput, CapturePaymentOutput, DeletePaymentInput, DeletePaymentOutput,
  GetPaymentStatusInput, GetPaymentStatusOutput, InitiatePaymentInput, InitiatePaymentOutput,
  RefundPaymentInput, RefundPaymentOutput, RetrievePaymentInput, RetrievePaymentOutput,
  UpdatePaymentInput, UpdatePaymentOutput, ProviderWebhookPayload, WebhookActionResult,
} from "@medusajs/framework/types";
import { GuardedPayments, validateBridgeOptions, type BridgeOptions, type ExecutionReceipt, type ReceiptStatus } from "../../lib/guarded-payments";

function reference(data: Record<string, unknown> | undefined) {
  if (typeof data?.paymentReference !== "string" || !data.paymentReference) throw new Error("Missing central payment reference");
  return data.paymentReference;
}

function sessionId(data: Record<string, unknown> | undefined) {
  return typeof data?.medusaSessionId === "string" ? data.medusaSessionId : undefined;
}

function publicData(receipt: ExecutionReceipt, medusaSessionId?: string) {
  return {
    paymentReference: receipt.providerPaymentId,
    receiptId: receipt.receiptId,
    operationId: receipt.operationId,
    status: receipt.status,
    ...(medusaSessionId ? { medusaSessionId } : {}),
    ...(receipt.clientSecret ? { client_secret: receipt.clientSecret } : {}),
  };
}

function medusaStatus(status: ReceiptStatus): GetPaymentStatusOutput["status"] {
  if (status === "deleted") return "canceled";
  if (status === "refunded") return "captured";
  return status;
}

export default class GuardedPaymentProviderService extends AbstractPaymentProvider<BridgeOptions> {
  static identifier = "hotl-guarded";
  protected bridge: GuardedPayments;

  static validateOptions(options: BridgeOptions) { validateBridgeOptions(options); }

  constructor(container: Record<string, unknown>, options: BridgeOptions) {
    super(container, options);
    this.bridge = new GuardedPayments(options);
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    // session_id is supplied by Medusa's payment module. The bridge must verify
    // ownership and binding server-side; data is never an authorization source.
    const medusaSessionId = typeof input.data?.session_id === "string" ? input.data.session_id : undefined;
    const receipt = await this.bridge.execute("initiate", {
      idempotencyKey: input.context?.idempotency_key,
      medusaSessionId,
      amount: MathBN.convert(input.amount).toString(),
      currency: input.currency_code.toLowerCase(),
    });
    return { id: receipt.providerPaymentId, status: medusaStatus(receipt.status), data: publicData(receipt, medusaSessionId) };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const receipt = await this.bridge.execute("authorize", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data) });
    return { status: medusaStatus(receipt.status), data: publicData(receipt, sessionId(input.data)) };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const receipt = await this.bridge.execute("capture", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data) });
    return { data: publicData(receipt, sessionId(input.data)) };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const receipt = await this.bridge.execute("refund", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data), amount: MathBN.convert(input.amount).toString() });
    return { data: publicData(receipt, sessionId(input.data)) };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const receipt = await this.bridge.execute("cancel", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data) });
    return { data: publicData(receipt, sessionId(input.data)) };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const receipt = await this.bridge.execute("delete", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data) });
    return { data: publicData(receipt, sessionId(input.data)) };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const receipt = await this.bridge.execute("update", { idempotencyKey: input.context?.idempotency_key, paymentReference: reference(input.data), medusaSessionId: sessionId(input.data), amount: MathBN.convert(input.amount).toString(), currency: input.currency_code.toLowerCase() });
    return { status: medusaStatus(receipt.status), data: publicData(receipt, sessionId(input.data)) };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: publicData(await this.bridge.retrieve(reference(input.data)), sessionId(input.data)) };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const receipt = await this.bridge.retrieve(reference(input.data));
    return { status: medusaStatus(receipt.status) };
  }

  async getWebhookActionAndData(_payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    // Stripe webhooks terminate and are authenticated centrally. Until a signed
    // central webhook contract exists, inbound payloads cannot advance payment.
    return { action: "not_supported" };
  }
}
