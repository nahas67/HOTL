import { describe, expect, it } from "vitest";
import { emptyPilotDraft } from "@hotl/schemas";
import { pilotDraftGaps } from "./operating-pages";

describe("pilot envelope approval indicators", () => {
  it("keeps an empty pilot visibly blocked", () => {
    const gaps = pilotDraftGaps(emptyPilotDraft());
    expect(gaps).toContain("Pilot country");
    expect(gaps).toContain("Maximum pilot capital");
    expect(gaps).toContain("Uncertain Provider Operations stop rule");
    expect(gaps).toContain("Provider Reconciliation Failures stop rule");
  });

  it("does not present estimates or non-owner capital limits as approval ready", () => {
    const draft = emptyPilotDraft();
    draft.profile.country = { value: "US", provenance: "ESTIMATED", evidenceRef: "Research 2026-09-24" };
    draft.capital.maxPilotCapital = { value: 100, provenance: "PROVIDER_OBSERVED", evidenceRef: "Balance 2026-09-24" };
    const gaps = pilotDraftGaps(draft);
    expect(gaps).toContain("Pilot country is estimated");
    expect(gaps).toContain("Maximum pilot capital needs owner-entered authority");
  });

  it("shows unsupported pilot currency before approval", () => {
    const draft = emptyPilotDraft();
    draft.profile.currency = { value: "EUR", provenance: "OWNER_ENTERED", evidenceRef: "Owner decision 2026-09-24" };
    expect(pilotDraftGaps(draft)).toContain("Pilot currency must be USD for current guardrails");
  });

  it("does not treat calculated source costs as observed evidence", () => {
    const draft = emptyPilotDraft();
    draft.economics.supplierProductCost = { value: 10, provenance: "CALCULATED", evidenceRef: "Estimate worksheet 2026-09-24" };
    expect(pilotDraftGaps(draft)).toContain("Supplier product cost needs a source observation");
  });

  it("requires active stop rules with positive thresholds", () => {
    const draft = emptyPilotDraft();
    draft.stopRules = [
      { metric: "UNCERTAIN_PROVIDER_OPERATIONS", unit: "COUNT", threshold: 1, action: "BLOCK_NEW_ACTIONS", enabled: true },
      { metric: "PROVIDER_RECONCILIATION_FAILURES", unit: "COUNT", threshold: 0, action: "REQUIRE_OWNER_REVIEW", enabled: true },
    ];
    const gaps = pilotDraftGaps(draft);
    expect(gaps).not.toContain("Uncertain Provider Operations stop rule");
    expect(gaps).toContain("Provider Reconciliation Failures stop rule");
  });
});
