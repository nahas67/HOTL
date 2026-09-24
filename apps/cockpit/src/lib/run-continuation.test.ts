import { describe, expect, it } from "vitest";
import type { Interrupt } from "./types";
import { canReplanExpiredProposal, runContinuationNotice } from "./run-continuation";

describe("expired proposal continuation", () => {
  const item = { id: "proposal-1", runId: "run-1", status: "expired" } as Interrupt;
  const waiting = { runId: "run-1", interruptId: "proposal-1", status: "interrupted", resolvedInterruptIds: [] };

  it("offers replanning only for the matching unconsumed expired checkpoint", () => {
    expect(canReplanExpiredProposal(item, waiting)).toBe(true);
    expect(canReplanExpiredProposal({ ...item, status: "pending" }, waiting)).toBe(false);
    expect(canReplanExpiredProposal({ ...item, status: "approved" }, waiting)).toBe(false);
    expect(canReplanExpiredProposal(item, null)).toBe(false);
    expect(canReplanExpiredProposal(item, { ...waiting, runId: "another-run" })).toBe(false);
    expect(canReplanExpiredProposal(item, { ...waiting, interruptId: "new-proposal" })).toBe(false);
    expect(canReplanExpiredProposal(item, { ...waiting, status: "completed" })).toBe(false);
    expect(canReplanExpiredProposal(item, { ...waiting, resolvedInterruptIds: [item.id] })).toBe(false);
  });

  it("distinguishes a new approval wait from completion without claiming stale approval", () => {
    expect(runContinuationNotice({ status: "interrupted" })).toEqual({
      text: "Run is waiting for an owner decision. Review the current proposal in Approvals.",
      warning: false,
    });
    expect(runContinuationNotice({ status: "completed" }).text).toContain("Run completed.");
    expect(runContinuationNotice({ status: "running" }).text).toContain("Run is running.");
  });

  it("does not report failed, halted, missing, or sample runs as successfully resumed", () => {
    for (const status of ["failed", "halted", "unrecognized", undefined]) {
      const notice = runContinuationNotice({ status });
      expect(notice.warning).toBe(true);
      expect(notice.text).not.toMatch(/resumed|completed/i);
    }
    expect(runContinuationNotice({ status: "resolved", seeded: true })).toEqual({
      text: "The sample decision is recorded; it has no live graph run.",
      warning: false,
    });
  });
});
