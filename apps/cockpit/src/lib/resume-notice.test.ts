import { describe, expect, it } from "vitest";
import { isPermanentResumeRefusal, resumeNotice } from "./resume-notice";

// B-3 regression guard.
//
// The defect was never that resuming failed. It was that a bare `catch {}` threw
// away the orchestrator's actual answer and printed one sentence for every case,
// telling the owner to retry a refusal that can never succeed. These assert the
// wording and, more importantly, whether a retry is offered at all -- the part
// that sent the owner to a dead end.

describe("resumeNotice", () => {
  it("says the decision was saved in every case, because it always is", () => {
    for (const failure of [{}, { status: 404 }, { status: 503 }, { status: 500 }]) {
      expect(resumeNotice(failure, "run-1").warning).toMatch(/^Decision saved/);
    }
  });

  it("treats an unreachable orchestrator as retryable", () => {
    const notice = resumeNotice({}, "run-1");
    expect(notice.resumeRetryable).toBe(true);
    expect(notice.warning).toMatch(/could not be reached/i);
    expect(notice.warning).toMatch(/retry/i);
  });

  it("refuses to offer a retry for a run with no saved checkpoint", () => {
    // manager.ts:95-96 returns this deliberately (rule 7). The state cannot change
    // on its own, so "retry" is a dead end.
    const notice = resumeNotice({ status: 404, code: "RUN_REQUEST_FAILED" }, "run-support-01");
    expect(notice.resumeRetryable).toBe(false);
    expect(notice.warning).toContain("run-support-01");
    expect(notice.warning).toMatch(/Retrying will not change this/);
    // The old message told the owner to retry in every case. This must not.
    expect(notice.warning).not.toMatch(/retry resume from Activity/i);
  });

  it("keeps every other refusal retryable and names the reason", () => {
    for (const status of [500, 503, 409, 423]) {
      const notice = resumeNotice({ status, code: "RUN_BUSY" }, "run-2");
      expect(notice.resumeRetryable, `status ${status} should stay retryable`).toBe(true);
      expect(notice.warning).toContain("RUN_BUSY");
    }
    // The orchestrator's own code is better than a bare number.
    expect(resumeNotice({ status: 500 }, "run-2").warning).toContain("500");
  });

  it("classifies only a 404 as permanent", () => {
    expect(isPermanentResumeRefusal(404)).toBe(true);
    for (const status of [400, 401, 409, 423, 500, 503, undefined]) {
      expect(isPermanentResumeRefusal(status), `status ${status} must not be permanent`).toBe(false);
    }
  });

  it("never implies the run was resumed when it was not", () => {
    for (const failure of [{}, { status: 404 }, { status: 500 }]) {
      const notice = resumeNotice(failure, "run-3");
      expect(notice.warning).not.toMatch(/has resumed\b(?! )\./i);
      expect(notice.warning).not.toMatch(/successfully resumed/i);
    }
  });
});