// What to tell the owner after a recorded decision could not resume its run.
//
// This exists as a pure function because the alternative was a `catch {}` that
// discarded the orchestrator's actual answer. The bug it fixes (B-3) was never
// that resuming failed -- it was that every failure produced the same sentence,
// including one telling the owner to retry something that can never succeed.
//
// An approval outlives its run: the guardrail seeds pending approvals bound to
// fabricated run ids (`apps/guardrail-service/src/seed.ts`) and `state.interrupts`
// is pruned only on resolve or Constitution change (`engine.ts:823`). Resolving
// one produces a deliberate, permanent 404 "This run has no saved checkpoint."
// from `manager.ts:95-96`, which exists specifically to stop a fabricated success
// (rule 7). That answer is correct; the old message was not.

export type ResumeFailure = {
  /** `undefined` means the orchestrator could not be reached at all. */
  status?: number;
  code?: string;
};

export type ResumeNotice = {
  /** Sentence shown to the owner. Never promises a retry that cannot work. */
  warning: string;
  /** Whether "retry from Activity" is offered at all. */
  resumeRetryable: boolean;
};

/**
 * `404` is the orchestrator stating the run has no checkpoint. That state does not
 * change on its own, so retrying is a dead end and is not offered.
 */
export function isPermanentResumeRefusal(status?: number): boolean {
  return status === 404;
}

export function resumeNotice(failure: ResumeFailure, runId: string): ResumeNotice {
  if (failure.status === undefined) {
    return {
      warning:
        "Decision saved. The orchestrator could not be reached, so this run has not resumed. Retry from Activity once it reconnects.",
      resumeRetryable: true,
    };
  }
  if (isPermanentResumeRefusal(failure.status)) {
    return {
      warning: `Decision saved. This approval belonged to run ${runId}, which no longer has a saved checkpoint, so there is nothing to resume. Retrying will not change this.`,
      resumeRetryable: false,
    };
  }
  return {
    warning: `Decision saved, but the orchestrator declined to resume this run (${failure.code ?? failure.status}). Nothing was spent.`,
    resumeRetryable: true,
  };
}