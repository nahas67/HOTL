import type { Interrupt } from "./types";

export function canReplanExpiredProposal(
  item: Interrupt,
  run: Record<string, unknown> | null,
) {
  return (
    item.status === "expired" &&
    run?.runId === item.runId &&
    run.status === "interrupted" &&
    run.interruptId === item.id &&
    !(
      Array.isArray(run.resolvedInterruptIds) &&
      run.resolvedInterruptIds.includes(item.id)
    )
  );
}

export function runContinuationNotice(run: Record<string, unknown>) {
  switch (run.status) {
    case "completed":
      return {
        text: "Run completed. Review Activity for the recorded decisions.",
        warning: false,
      };
    case "interrupted":
      return {
        text: "Run is waiting for an owner decision. Review the current proposal in Approvals.",
        warning: false,
      };
    case "running":
      return {
        text: "Run is running. Follow its progress in Activity.",
        warning: false,
      };
    case "halted":
      return {
        text: "Run halted. Check Activity and platform controls before starting further work.",
        warning: true,
      };
    case "failed":
      return {
        text: "Run failed. Check Activity for the failure before retrying.",
        warning: true,
      };
    case "resolved":
      if (run.seeded === true)
        return {
          text: "The sample decision is recorded; it has no live graph run.",
          warning: false,
        };
  }
  return {
    text: "The run status could not be confirmed. Refresh its saved status before retrying.",
    warning: true,
  };
}
