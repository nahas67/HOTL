import type { Interrupt, Telemetry } from "./types";

export function approvalRequest(item: Interrupt): Record<string, unknown> {
  const request = item.payload.request;
  return request && typeof request === "object" && !Array.isArray(request)
    ? (request as Record<string, unknown>)
    : item.payload;
}

export function approvalAmountKey(item: Interrupt): string | null {
  const request = approvalRequest(item);
  const operation = item.payload.operation;
  if (operation === "supplier.order") return "quantity";
  if (operation === "listing.publish" || item.category === "margin")
    return "sellingPrice";
  if (
    operation === "campaign.launch" ||
    operation === "spend.check" ||
    item.category === "spend"
  )
    return "requestedAmount";
  if (operation === "refunds.evaluate" || item.category === "refund_escrow")
    return "amount";
  return null;
}

// Bind the owner's explicit legacy review to the policy and resource they saw.
// The guardrail service independently validates both immediately before action.
export function legacyReviewContext(
  item: Interrupt,
  version: number,
  telemetry: Telemetry,
) {
  if (!Number.isInteger(version) || version < 1)
    throw new Error("A current Constitution version is required.");
  const request = approvalRequest(item);
  const context: {
    reviewLegacy: true;
    expectedConstitutionVersion: number;
    expectedRevision?: number;
    expectedOrderRevision?: number;
  } = { reviewLegacy: true, expectedConstitutionVersion: version };
  if (request.productId) {
    const product = telemetry.products.find(
      (value) => value.id === request.productId,
    );
    if (!product || !Number.isInteger(product.revision))
      throw new Error(
        "The current product version is unavailable. Refresh before approving.",
      );
    context.expectedRevision = product.revision;
  }
  if (request.orderId) {
    const order = telemetry.orders.find(
      (value) => value.id === request.orderId,
    );
    if (!order || !Number.isInteger(order.revision))
      throw new Error(
        "The current order version is unavailable. Refresh before approving.",
      );
    if (request.productId) context.expectedOrderRevision = order.revision;
    else context.expectedRevision = order.revision;
  }
  return context;
}
