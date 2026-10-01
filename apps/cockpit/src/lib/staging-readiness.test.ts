import { describe, expect, it } from "vitest";
import { buildStagingReadinessRows, type StagingReadinessReport } from "./staging-readiness";

const report = (overrides: Partial<StagingReadinessReport> = {}): StagingReadinessReport => ({
  staticConfiguration: { status: "BLOCKED", evidenceScope: "STATIC_CONFIGURATION_ONLY", missing: [{ field: "SHOPIFY_STAGING_SHOPS", reason: "Configure one dev store." }] },
  workerReadiness: { ingress: "BLOCKED", worker: "BLOCKED", reconciliation: "BLOCKED", mode: "DISABLED" },
  activeProbes: { status: "NOT_RUN", notProbed: ["SHOPIFY_PROVIDER_WEBHOOK_DELIVERY"], results: [] },
  externalStagingVerified: false,
  readyForOperatorReview: false,
  failures: [{ field: "SHOPIFY_STAGING_SHOPS", reason: "Configure one dev store." }],
  ...overrides,
});

describe("staging readiness checklist", () => {
  it("keeps missing store setup and owner authority blocked without provider proof", () => {
    const rows = buildStagingReadinessRows(report(), "OWNER INPUT + APPROVAL REQUIRED");
    expect(rows.find((row) => row.label === "Gate A business and risk authority")?.status).toBe("OWNER INPUT + APPROVAL REQUIRED");
    expect(rows.find((row) => row.label === "One Shopify development store")?.status).toBe("BLOCKED · MISSING SETTINGS");
    expect(rows.find((row) => row.label === "External Shopify staging proof")?.status).toBe("NOT VERIFIED");
  });

  it("labels active checks as read-only and never turns configuration into external verification", () => {
    const result = report({
      staticConfiguration: { status: "VERIFIED", evidenceScope: "STATIC_CONFIGURATION_ONLY", missing: [] },
      activeProbes: { status: "PARTIALLY_VERIFIED", notProbed: ["SHOPIFY_PROVIDER_WEBHOOK_DELIVERY"], results: [{ name: "SHOPIFY_OAUTH_CALLBACK_ROUTE", status: "VERIFIED" }] },
      failures: [],
      readyForOperatorReview: true,
    });
    const rows = buildStagingReadinessRows(result, "OWNER INPUT + APPROVAL REQUIRED");
    expect(rows.find((row) => row.label === "Owner HTTPS callback")?.status).toBe("READ-ONLY PROBE PASSED");
    expect(rows.find((row) => row.label === "External Shopify staging proof")?.status).toBe("NOT VERIFIED");
  });
});
