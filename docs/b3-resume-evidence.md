# B-3 evidence — owner approval does not resume the LangGraph run

Status: **Case 1 fully reproduced (no defect). Case 2 partially reproduced — the
orchestrator leg is captured, the cockpit leg is NOT.**

Author: `b3-repro` (QA/diagnostics). Scope of this file is evidence only; no product
code was modified.

---

## 0. Summary of findings

| # | Case | Reproduced? | Evidence quality |
|---|------|-------------|------------------|
| 1 | Fresh run, valid checkpoint | **Yes — and it WORKS.** Run resumed and reached `completed`. | Complete: browser-observed request + response + orchestrator state |
| 2 | Stale approval, checkpoint gone | **Partially.** Orchestrator 404 captured. Cockpit 202 + misleading warning **not** captured. | Partial — see §3 |

**The defect did not reproduce for a run started in the same session.** Case 1 shows the
resume path is functionally correct end-to-end. B-3 is therefore *not* a general failure of
approval resolution; it is conditional, and the evidence below points at which condition.

---

## 1. Environment used

The preserved kill journal was **not** touched (`infra/kill-switch/data/events.jsonl` was
0 bytes before and after, `LastWriteTime 2026-09-07 15:32:38`, verified at the end of the
session). The sanctioned isolated-instance path was used instead.

> **Operational finding for whoever runs the next drill.** The directory name given in the
> task, `.data/b3-repro`, is **rejected by the launcher**. `scripts/dev.mjs:13-17` requires
> the isolated instance dir to match `/^e2e-[a-z0-9-]+$/i` relative to `.data`:
>
> ```
> if (!location || location.startsWith('..') || isAbsolute(location) || !/^e2e-[a-z0-9-]+$/i.test(location))
>   throw new Error('Browser test state must use a distinct .data/e2e-<id> directory.');
> ```
>
> `b3-repro` does not match, so `node scripts/dev.mjs` throws immediately. The equivalent
> conforming name used here was **`.data/e2e-b3repro`**.

Command used:

```powershell
$env:HOTL_TEST_INSTANCE_DIR='.data/e2e-b3repro'; node scripts/dev.mjs
```

Resulting layout: cockpit `3000`, storefront `3001`, guardrail `4100`, commerce `4400`,
orchestrator `4300`, kill-switch `14200` (dev.mjs moves the kill switch to `14200` for a
test instance, see `scripts/dev.mjs:36`).

Baseline health:

```
GET http://127.0.0.1:4300/health  -> 200
{"service":"orchestrator","status":"ok","mode":"simulation","checkpointConflicts":[]}

GET http://127.0.0.1:14200/state -> 200
{"engaged":false,"engagedAt":null,"engagedBy":null,"reason":null,"actions":[],"revision":1,"mode":"simulation"}
```

---

## 2. Case 1 — fresh run with a valid checkpoint: RESUMES CORRECTLY

### 2.1 Reproduction steps (exactly as executed)

All three calls were made from a **real browser** (Playwright/Chromium) against
`http://127.0.0.1:3000`, using same-origin `fetch` with the headers the cockpit UI sends
(`x-hotl-cockpit: 1` is required by `apps/cockpit/src/lib/proxy.ts:43`; `Idempotency-Key`
is required by `route.ts:20-22`).

**Step 1 — start a cycle**

```
POST http://127.0.0.1:3000/api/runs
x-hotl-cockpit: 1
Idempotency-Key: b3-case1-run-<uuid>
Content-Type: application/json
{"cycle":"daily"}
```

Observed (browser network log): `[POST] http://127.0.0.1:3000/api/runs => [201] Created`

```json
{
  "runId": "e57ed63b-12aa-40c8-a965-22d21a354864",
  "cycle": "daily",
  "status": "interrupted",
  "interruptId": "92566ad7-bd26-45fe-8807-ef4c536b8b66",
  "resolvedInterruptIds": [],
  "next": ["human_interrupt"],
  "activeStage": "refund",
  "guardrailDecisions": [
    { "decision": "deny",   "reason": "MARGIN_BELOW_FLOOR", "marginPct": 0.3095, "floor": 0.4 },
    { "decision": "allow",  "reservationId": "244b1ff1-...", "status": "launched" },
    { "decision": "allow",  "supplierOrder": { "id": "sim_po_44b848cc-...", "orderId": "ORD-1030" } },
    { "decision": "escalated", "interruptId": "92566ad7-bd26-45fe-8807-ef4c536b8b66",
      "reason": "AUTONOMY_APPROVAL_REQUIRED", "constitutionVersion": 1, "mode": "simulation" }
  ]
}
```

The interrupt is a genuine escalation created at `apps/guardrail-service/src/engine.ts:595`,
carrying `runId == threadId == e57ed63b-…4864` (the LangGraph `thread_id`).

**Step 2 — resolve the approval (this is the call that carries the B-3 defect)**

```
POST http://127.0.0.1:3000/api/interrupts/92566ad7-bd26-45fe-8807-ef4c536b8b66/resolve
x-hotl-cockpit: 1
Idempotency-Key: b3-case1-resolve-<uuid>
Content-Type: application/json
{"decision":"reject","note":"B-3 drill case 1: reject and resume the graph.","modifiedPayload":null}
```

Observed: `[POST] http://127.0.0.1:3000/api/interrupts/92566ad7-…/resolve => [200] OK`

```json
{
  "status": "resolved",
  "interruptId": "92566ad7-bd26-45fe-8807-ef4c536b8b66",
  "threadId": "e57ed63b-12aa-40c8-a965-22d21a354864",
  "resumedThreadId": "e57ed63b-12aa-40c8-a965-22d21a354864",
  "ownerDecision": "reject",
  "execution": { "decision": "deny", "reason": "OWNER_REJECTED" },
  "mode": "simulation"
}
```

**The response contains NO `warning` field.** That is the decisive signal: the bare
`catch {}` at `apps/cockpit/src/app/api/[...path]/route.ts:87-89` was **not** entered, so
the orchestrator resume succeeded.

### 2.2 Did the run actually resume?

Queried the orchestrator directly (`x-hotl-internal-token` owner header):

```
GET http://127.0.0.1:4300/api/runs/e57ed63b-12aa-40c8-a965-22d21a354864  -> 200
```

```json
{
  "runId": "e57ed63b-12aa-40c8-a965-22d21a354864",
  "status": "completed",
  "interruptId": null,
  "next": [],
  "resolvedInterruptIds": ["92566ad7-bd26-45fe-8807-ef4c536b8b66"]
}
```

Server-side log corroboration from the guardrail during the resume window shows the graph
continued executing after the decision was recorded (`runs/event`, `status`,
`agent-context` calls), i.e. it did not merely return a success shape.

### 2.3 Case 1 conclusion

**B-3 does NOT reproduce here.** A fresh run with a live checkpoint resumes correctly:
cockpit returns **200** with no warning, and the orchestrator reports **`completed`** with
the interrupt recorded in `resolvedInterruptIds` and `next: []`.

This matches the brief's note that `tests/e2e/platform.spec.ts:78` passes in CI. It also
means the fix must **not** be a blanket "always resume" change — the working path exists and
is exercised by a genuine `engine.ts:595` escalation.

---

## 3. Case 2 — stale approval whose checkpoint is gone: PARTIALLY REPRODUCED

### 3.1 What was reproduced: the precondition

A fresh guardrail state (isolated instance) starts with **three pending approvals carrying
fabricated run ids** that have never had a LangGraph checkpoint. Observed from a live
guardrail:

```
GET http://127.0.0.1:4100/api/interrupts  -> 200
```

```json
[
  { "id": "int-refund-1029", "runId": "run-support-01",   "threadId": "run-support-01",   "status": "pending", "payload": { …, "legacyReviewRequired": true } },
  { "id": "int-spend-01",    "runId": "run-marketing-01", "threadId": "run-marketing-01", "status": "pending", "payload": { …, "legacyReviewRequired": true } },
  { "id": "int-margin-01",   "runId": "run-sourcing-01",  "threadId": "run-sourcing-01",  "status": "pending", "payload": { …, "legacyReviewRequired": true } }
]
```

These originate at **`apps/guardrail-service/src/seed.ts:25`** — *not* at `engine.ts:595`.

> **Correction to the brief's premise.** The brief states "no seeded demo approvals exist;
> `engine.ts:595` is the only place an interrupt is created." That is true for *runtime*
> escalations, but the seed file does create three pending, resolvable approvals up front.
> They are real rows in `state.interrupts`, they are listed in the cockpit, and they are
> resolvable by the owner. Any fix must account for them.

Confirmed these ids are absent from **both** checkpoint stores on disk:

```
.data/e2e-b3repro/orchestrator-checkpoints.json  contains run-support-01 : False
data/orchestrator-checkpoints.json               contains run-support-01 : False
```

### 3.2 What was reproduced: the orchestrator's real response

From a live orchestrator:

```
GET http://127.0.0.1:4300/api/runs/run-support-01     -> HTTP 404
GET http://127.0.0.1:4300/api/runs/run-marketing-01   -> HTTP 404
GET http://127.0.0.1:4300/api/runs/run-sourcing-01    -> HTTP 404
```

Body, identical for all three:

```json
{ "error": { "code": "RUN_REQUEST_FAILED", "message": "This run has no saved checkpoint." } }
```

This is `apps/orchestrator/src/manager.ts:95-96` (`RunError(..., 404)`) rendered by the
Fastify error handler at `apps/orchestrator/src/app.ts:29-42`, which maps any non-Zod error
to `error.statusCode ?? 503` with code `RUN_REQUEST_FAILED`.

**So the orchestrator's real answer to a checkpoint-less approval's resume is HTTP 404 with
`"This run has no saved checkpoint."`**

### 3.3 What was NOT reproduced — stated plainly

**I did not capture the cockpit-level leg of Case 2.** Specifically I did **not** observe:

- the cockpit's `POST /api/interrupts/int-refund-1029/resolve` returning **202** with
  `warning: "Decision saved. The agent has not resumed yet; retry resume from Activity after the orchestrator reconnects."`, nor
- the on-screen toast text, nor
- the "Retry resume" banner in Activity.

**Reason:** the cockpit's `/api/[...path]` route handler began returning **HTTP 500 with an
HTML error page** before I could issue the Case 2 resolve. This was caused by an
**unrelated, pre-existing defect**, not by B-3:

1. `apps/cockpit/src/app/[[...section]]/page.tsx:17` calls `isKnownSection()` from a
   server component, but `isKnownSection` is exported from `apps/cockpit/src/components/cockpit.tsx`,
   a `"use client"` module. Every cockpit page route returns **500**:
   `Attempted to call isKnownSection() from the server but isKnownSection is on the client.`
   Both files are **modified but uncommitted** in the shared working tree (a routing-honesty
   change, alongside untracked `tests/e2e/routing-honesty.spec.ts`). This is another
   contributor's in-flight work; I did not touch it.
2. Separately, `recharts@3.10.1` fails to resolve its `es-toolkit/compat/*` imports
   (`Can't resolve 'es-toolkit/compat/get'`, `'es-toolkit/compat/uniqBy'`).
   `es-toolkit@1.52.0` **is** present in the pnpm store but is **not** linked into
   `apps/cockpit/node_modules` (`Test-Path apps\cockpit\node_modules\es-toolkit` -> False).
3. That cascade ends in a **Turbopack panic** (`Expected file content for file`,
   `Error in the "/api/[...path]/route" app-route HMR subscription`), after which the
   cockpit route handler serves 500 HTML for API routes too.

Ordering note: the first two Case 1 calls returned **201** and **200** correctly *before* the
poisoning. The breakage is environmental and progressive, not a property of the B-3 path.

### 3.4 A measurement I deliberately discarded

After a stack restart, `GET /api/runs/e57ed63b-…4864` on port 4300 returned **404
"This run has no saved checkpoint."** — even though that run had just reported `completed`.

This is **not** a finding. I traced it: the live services on 4100/4300 at that moment were
started at 07:58:48 and were bound to the **default** instance dir
(`data/orchestrator-checkpoints.json`, which does not contain `e57ed63b`), not to my
isolated `.data/e2e-b3repro` store (which does contain it — 901,686 bytes, written 07:55:11).
The 404 belonged to a different instance's empty state. **Case 1's `completed` result is the
valid one**, taken before the restart from the process that actually held the checkpoint.

---

## 4. Conclusion on root cause, with evidence

**B-3 is not a failure of approval resolution. It is a reporting defect on a specific
404 path.**

Evidence:

1. **Case 1 proves the resume machinery works.** Cockpit `200`, no `warning`, orchestrator
   `completed`. A genuine `engine.ts:595` escalation on a live checkpoint resumes fine.
2. **Case 2 proves the orchestrator refuses checkpoint-less runs on purpose.**
   `manager.ts:95-96` throws `RunError("This run has no saved checkpoint.", 404)`, and the
   Fastify handler returns `404 {"error":{"code":"RUN_REQUEST_FAILED", …}}` (§3.2). This is
   deliberate and correct — the comment at `manager.ts:92-94` says it replaced a previous
   fabricated "resolved, seeded" success, and rule 7 requires it.
3. **Therefore, when an approval's run has no checkpoint, the decision is correctly saved
   and the resume correctly 404s — and `route.ts:87-89` mislabels that 404 as a transient
   reconnection problem.** The `catch {}` is bare: it discards both the status and the body,
   so a permanent, expected 404 is reported to the owner as "retry resume … after the
   orchestrator reconnects". Retrying can never succeed.

**Why this is reachable at all** — the gap the fix must close:

`state.interrupts` is persisted in full and pruned only on resolve or Constitution-change
expiry (`engine.ts:823`). Approvals therefore outlive the run that created them. A pending
approval whose run is gone stays **listed in the cockpit and resolvable**. Combined with the
three seeded approvals from `seed.ts:25` (fabricated run ids, no checkpoint), an owner can
reach this path without any error having occurred.

**The missing evidence** is the exact wording of the owner-visible message in Case 2. That
is source-determinable but I did not observe it, and per the brief's instruction not to
infer from source, I am not reporting it as captured. The remaining drill is mechanical:
with a working cockpit, resolve `int-refund-1029` (or any `seed.ts` approval) and record the
cockpit's 202 body, the toast text, and the "Retry resume" banner, confirming they all show
the reconnection wording rather than "this run no longer exists and cannot be resumed".

---

## 5. Commands to reproduce (for a clean re-run)

```powershell
# 1. Isolated stack. NOTE: the dir MUST match /^e2e-[a-z0-9-]+$/i under .data/ (dev.mjs:13-17).
$env:HOTL_TEST_INSTANCE_DIR='.data/e2e-b3repro'; node scripts/dev.mjs

# 2. Case 1 - start a cycle (from the browser, or any client sending x-hotl-cockpit: 1)
curl.exe -s -X POST http://127.0.0.1:3000/api/runs `
  -H "x-hotl-cockpit: 1" -H "Idempotency-Key: b3-case1-<uuid>" `
  -H "Content-Type: application/json" -d '{"cycle":"daily"}'
#    expect 201, status "interrupted", an interruptId

# 3. Case 1 - resolve it (this is the call under test)
curl.exe -s -X POST http://127.0.0.1:3000/api/interrupts/<interruptId>/resolve `
  -H "x-hotl-cockpit: 1" -H "Idempotency-Key: b3-case1r-<uuid>" `
  -H "Content-Type: application/json" `
  -d '{"decision":"reject","note":"B-3 drill case 1","modifiedPayload":null}'
#    expect 200 and NO "warning" key  -> resume succeeded

# 4. Case 1 - prove the run resumed
curl.exe -s -H "x-hotl-internal-token: hotl-local-development-token" `
  http://127.0.0.1:4300/api/runs/<runId>
#    expect 200 and status "completed"

# 5. Case 2 - the stale seeded approval (needs legacy review context)
curl.exe -s -X POST http://127.0.0.1:3000/api/interrupts/int-refund-1029/resolve `
  -H "x-hotl-cockpit: 1" -H "Idempotency-Key: b3-case2-<uuid>" `
  -H "Content-Type: application/json" `
  -d '{"decision":"reject","note":"B-3 drill case 2","modifiedPayload":null,
       "reviewLegacy":true,"expectedConstitutionVersion":1,"expectedRevision":1}'
#    EXPECT the defect: 202 + warning "...retry resume ... after the orchestrator reconnects."

# 6. Case 2 - the orchestrator's real answer (what the catch{} swallows)
curl.exe -s -w "`nHTTP %{http_code}`n" -H "x-hotl-internal-token: hotl-local-development-token" `
  http://127.0.0.1:4300/api/runs/run-support-01
#    404 {"error":{"code":"RUN_REQUEST_FAILED","message":"This run has no saved checkpoint."}}
```

---

## 6. Blockers encountered (not B-3, reported for triage)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Server component calls a `"use client"` export | `apps/cockpit/src/app/[[...section]]/page.tsx:17` | **Every** cockpit page route returns 500. Uncommitted, another contributor's work. |
| 2 | `es-toolkit` not linked for `recharts` | `apps/cockpit/node_modules` (store has `es-toolkit@1.52.0`) | Module-resolution failure → Turbopack panic → cockpit API routes return 500 HTML |
| 3 | `.data/b3-repro` rejected by the launcher | `scripts/dev.mjs:13-17` | The instance-dir name given in the task cannot start the stack |

Items 1 and 2 must be resolved before any browser-level B-3 drill can observe the cockpit
UI. Neither is caused by B-3, and neither was modified here.