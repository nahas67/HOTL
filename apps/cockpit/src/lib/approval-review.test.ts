import { describe, expect, it } from "vitest";
import {
  approvalAmountKey,
  approvalRequest,
  legacyReviewContext,
} from "./approval-review";
import type { Interrupt, Telemetry } from "./types";

const item = (payload: Record<string, unknown>, category = "refund_escrow") =>
  ({ payload, category }) as Interrupt;
const telemetry = {
  products: [{ id: "product-1", revision: 4 }],
  orders: [{ id: "order-1", revision: 8 }],
} as Telemetry;

describe("owner approval review context", () => {
  it("binds legacy refund review to the current order and Constitution versions", () => {
    expect(
      legacyReviewContext(item({ orderId: "order-1" }), 6, telemetry),
    ).toEqual({
      reviewLegacy: true,
      expectedConstitutionVersion: 6,
      expectedRevision: 8,
    });
  });
  it("refuses approval context when a target or its revision cannot be read", () => {
    expect(() =>
      legacyReviewContext(item({ orderId: "missing" }), 6, telemetry),
    ).toThrow("current order version");
    expect(() =>
      legacyReviewContext(item({ productId: "product-1" }), 6, {
        ...telemetry,
        products: [{ id: "product-1" }],
      } as Telemetry),
    ).toThrow("current product version");
    expect(() => legacyReviewContext(item({}), 0, telemetry)).toThrow(
      "Constitution",
    );
  });
  it("preserves separate order and product revisions for a proposal with both targets", () => {
    expect(
      legacyReviewContext(
        item({ productId: "product-1", orderId: "order-1" }),
        6,
        telemetry,
      ),
    ).toEqual({
      reviewLegacy: true,
      expectedConstitutionVersion: 6,
      expectedRevision: 4,
      expectedOrderRevision: 8,
    });
  });
  it("reads nested proposal requests and exposes only the operation-specific editable value", () => {
    const proposal = item(
      {
        operation: "campaign.launch",
        request: { campaignId: "campaign-1", requestedAmount: 20 },
        actor: { id: "marketing_agent" },
      },
      "autonomy",
    );
    expect(approvalRequest(proposal)).toEqual({
      campaignId: "campaign-1",
      requestedAmount: 20,
    });
    expect(approvalAmountKey(proposal)).toBe("requestedAmount");
    expect(
      approvalAmountKey(
        item(
          { operation: "supplier.order", request: { quantity: 2 } },
          "autonomy",
        ),
      ),
    ).toBe("quantity");
    expect(
      approvalAmountKey(item({ operation: "spend.commit" }, "autonomy")),
    ).toBeNull();
  });
});
