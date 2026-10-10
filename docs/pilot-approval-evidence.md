# Pilot approval: evidence for the path past the gate

**Scope.** `GuardrailEngine.approvePilot` (`apps/guardrail-service/src/engine.ts:952-964`) — the
write an owner uses to grant their own business authority. CP-03B's cockpit control matrix proved
the gate *holds* (Approve stayed `disabled` across 38 → 42 → 7 → 6 gaps). That is only the negative
path. This document records the first execution of the positive path and of every denial path.

**Standing boundary (AGENTS.md rule 6).** Everything here runs against the explicitly labelled local
simulation. The owner identity (`pilot-owner`) and every business value are test fixtures. No
business approval, provider response or external authority is involved, simulated or otherwise.

## Files added

| File | Purpose |
| --- | --- |
| `apps/guardrail-service/test/pilot-approval.test.ts` | 18 deterministic tests: the happy path and all denial paths |
| `tests/e2e/pilot-approval.spec.ts` | 1 Playwright spec: the same `allow` reached through the cockpit UI |
| `docs/pilot-approval-evidence.md` | This document |

No product source was modified. `git status` shows only these three new files; `git diff` is empty.

## Test counts

| Run | Command | Result |
| --- | --- | --- |
| Baseline (before) | `pnpm --filter @hotl/guardrail-service exec vitest run --reporter=dot` | 31 files, **373 passed**, 26 skipped, 0 failed (399) |
| Final (after) | same | 32 files, **391 passed**, 26 skipped, 0 failed (417) |
| Delta | — | **+1 file, +18 passed, +0 skipped, +0 failed** |

`pnpm --filter @hotl/guardrail-service exec tsc --noEmit` → **clean (exit 0)**.

Every one of the 18 new tests passes and **no pre-existing test changed state**. `money-domain`
and `ledger-multiprocess` did not time out.

## Method: the tests re-read the ledger, they do not trust the return value

Every assertion below reads what was *persisted*. The test drives a file-backed engine, then
opens the same ledger through a **second engine instance**, and separately parses the raw JSON off
disk. The `before`/`after` returned by `approvePilot` are treated as a claim to be checked against
that durable state, never as the source of truth.

The recorded `draftDigest` is checked against an **independent reimplementation** of the engine's
canonicalisation (sha256 over recursively key-sorted JSON), not against the engine's own helper.

## Part 1 — the happy path

Test: `allows a gap-free draft, bumps the version by exactly one, and records verifiable authority`.

A gap-free `PilotDraft` is saved as version 2, then approved. Asserted outcomes, all read back from
disk:

- `decision === 'allow'`, `status === 'approved'`.
- Constitution version is **exactly 3** — `persisted.version - 2 === 1`.
- `pilot.approval` records:
  - `approvedBy === 'pilot-owner'`,
  - `approvedAt` parses as a real instant,
  - `constitutionVersion === 3` (the **new** version, not the one approved against),
  - `draftDigest` equals an independently computed `digest(persisted draft)`, matches `/^[a-f0-9]{64}$/`,
    and is **not** the digest of a modified draft (so it binds *this* draft, not a constant).
- **Durable audit:** exactly one `constitution.pilot-approved` entry, actor owner, payload carrying
  `request` and `result {decision:'allow', status:'approved'}`, present **on disk at the moment the
  call resolved**. The audit hash chain is recomputed and verifies (`assertChain`).
- **before/after consistency:** `result.constitution`, `result.after` deep-equal the re-read
  persisted constitution; `result.before` deep-equals the version-2 constitution taken from
  `constitutionHistory`; `result.before.pilot.approval` is undefined.
- History is `[1, 2, 3]`, and the history entry's stored approval digest matches its own stored draft.
- The approval survives a **restart** (`createEngine` on the same file).

**Concurrency** (`grants exactly one authority under concurrent approvals of the same version`):
two concurrent `approvePilot` calls at `expectedVersion: 2` with different keys produce exactly one
`allow` and one `CONSTITUTION_CHANGED`. Final version 3, one approval block, and both attempts on the
audit record — one `allow`, one `deny`. The gate grants authority once.

## Part 2 — negative paths, with the actual codes

### A gap present → deny, and nothing is granted

`pilotDraftFailure` (`engine.ts:446-470`) is table-driven across nine distinct gaps. For each, the
saved draft is rejected **and nothing else changes**: version, draft, approval block and the
version-history list are byte-identical before and after, read from raw JSON.

| Draft defect | Observed `reason` |
| --- | --- |
| an UNKNOWN profile input | `PILOT_PROFILE_INCOMPLETE` |
| a profile currency the guardrails do not support | `PILOT_CURRENCY_UNSUPPORTED` |
| an ESTIMATED economic input | `PILOT_ECONOMICS_INCOMPLETE` |
| a derived-metric-style claim on a cost input (`CALCULATED`) | `PILOT_ECONOMICS_SOURCE_REQUIRED` |
| a capital limit that is not `OWNER_ENTERED` | `PILOT_OWNER_LIMITS_REQUIRED` |
| capital limits that cannot all be spent | `PILOT_LIMITS_CONFLICT` |
| a missing mandatory stop rule | `PILOT_STOP_RULES_REQUIRED` |
| an enabled stop rule with no live signal | `PILOT_STOP_SIGNAL_UNAVAILABLE` |
| two rules for the same metric | `PILOT_STOP_RULES_DUPLICATED` |
| a `CALCULATED` value an older formula revision left inconsistent | `PILOT_ECONOMICS_CALCULATION_INVALID` |

The last row is the one branch a current-build save cannot reach: `constitutionPatchSchema` validates
the draft on write, so the test writes the ledger directly to simulate a ledger an older build
persisted — which is exactly why `pilotEnvelopeSchema` stores the draft *shape* rather than the
validated draft (`packages/schemas/src/constitution.ts:101-102`). That ledger stays **readable** and
is **not approvable**, which is the correct posture.

Two behaviours worth stating explicitly, because they are easy to misread as "nothing happened":

- **A denial *is* durably audited** under `constitution.pilot-approved`, with
  `result.decision === 'deny'` and the specific code. A refused grant is exactly what an auditor
  needs to find. The test asserts the audited decision matches the returned one.
- **A denial does *not* consume the caller's idempotency key** (`engine.ts:312`). A separate test
  denies on key `pilot-reused-key`, corrects the draft, and then successfully approves on that same
  key. Otherwise one blocked request could permanently deny that key for every other actor and
  operation.

### Stale `expectedVersion`

Observed: `CONSTITUTION_CHANGED`, with `replan: true` and `currentConstitutionVersion: 2`. Version
stays 2, no approval block, only the audited denial is added.

### Non-owner actor

Observed: a **refusal, not a denial** — a thrown `GuardrailError` with `code: 'OWNER_REQUIRED'`,
`statusCode: 403`. Checked for both `{type:'agent'}` and `{type:'system'}`.

`owner()` runs *before* `transaction()`, so there is no policy decision to record. The test asserts
the strongest form of "nothing was written": **the ledger file is byte-identical** before and after,
and the idempotency key set is unchanged. Not even a denial audit entry is produced.

### Replay protection

`applyTransaction` (`engine.ts:273-314`) returns `{...recorded.result, replayed: true}` and does not
re-run the action. Asserted:

- The fresh result has **no** `replayed` property; the replay has `replayed: true`. The two are
  distinguishable by design, so history cannot be mistaken for permission.
- After the Constitution is moved on to version 4, the replay still reports `after.version === 3` —
  it is demonstrably the **recorded historical result**, not current authority.
- No second version bump, no second audit entry, audit length unchanged, chain still verifies.
- **Replay survives a restart** on a new engine instance.
- A second identity replaying the same key is refused: `IDEMPOTENCY_CONFLICT`, status `409`. The
  fingerprint binds actor, request, operation and mode.
- **The persisted key format is asserted directly**: the record lives at `id:<key>` and the bare
  `<key>` is absent. This is the format `engine.ts:275-280` explains must never be re-keyed — doing so
  would make records written by an earlier version unreachable on upgrade and a replayed financial
  request would execute a second time. The test pins that contract so a future refactor cannot quietly
  change it.

### Stale authority invalidation

After approval at version 3, the owner revises one pilot input and saves at version 4. Asserted:

- The recorded digest `granted.draftDigest` equals the digest of the draft it approved, and is
  **not** the digest of the revised draft.
- The live ledger carries **no approval at all** — `saveConstitution` drops a stale approval
  (`engine.ts:926-927`) — and the rehydrated engine confirms `pilot.approval` is undefined.
- The superseded version remains in history, but its authority is bound to *its own* draft only.
- The old version cannot be re-approved (`CONSTITUTION_CHANGED`), and a fresh key against the new
  draft passes the whole gate again and records a new digest.

## Part 3 — the browser path: **ran and passed**

Spec: `tests/e2e/pilot-approval.spec.ts` → **1 passed (8.4s)**, first run and again after the
mutation was reverted. Not weakened, not skipped.

It re-establishes CP-03B's negative path (gaps visible, Approve `disabled`), then drives the real
form to zero gaps: all **35 inputs** (10 profile + 15 economics + 10 capital) and both mandatory stop
rules. Each field is three controls — provenance first, because the value input is `disabled` while
the datum is `UNKNOWN`, then the value, then the evidence reference that only renders once the datum
is known. The provenance select is addressed through each field's own `<fieldset>` rather than by
label text, so a renamed label cannot silently retarget the test.

It then saves the draft (version +1, `approval` still undefined — a saved draft is not an approval),
enables the button, clicks **Approve saved pilot envelope**, and asserts:

- the POST returns `{decision: 'allow', status: 'approved'}`;
- the screen renders `Approved by … for Constitution version 3.`;
- the guardrail persisted `approval.constitutionVersion === 3` and a `draftDigest` equal to an
  independently computed digest of the persisted draft.

**What this proves and what it does not.** It proves the operator-facing path reaches and renders a
real `allow`, and that the authority behind it matches. It does not prove the authorisation
*guarantees* — those live in Part 1, which can reach branches no browser can (a non-owner actor, a
replayed `Idempotency-Key`, a digest that no longer matches). Part 1 is the deliverable; Part 3
confirms the button is wired to the thing Part 1 verifies. Where the two overlap, the browser test
is the weaker instrument and is not treated as the stronger one.

## Vacuity checks — the tests are not empty

A test that passes against broken code is worth nothing. Two mutations were applied to
`apps/guardrail-service/src/engine.ts`, each reverted with `git checkout` and confirmed clean.

**Mutation 1 — `approvePilot` skips the version bump** (`version: before.version + 1` → `before.version`):

- Unit tests: **6 failed, 12 passed**. Exactly the six authority-granting tests failed
  (happy path, concurrency, key-reuse, replay, replay-across-restart, stale-authority). The nine
  denial tests correctly stayed green — the break was in the allow path, and precisely the allow-path
  tests caught it. That the failures are *this* set of tests is itself the evidence.
- Playwright spec: **failed.** The first assertion to fire was the rendered approved state: with no
  version bump the approval's `constitutionVersion` no longer equals the Constitution's version, so
  the cockpit's `pilotApproved` check is false and it still renders "Gate A is blocked". The browser
  test is live, and it independently shows the UI's approved-state check is version-bound.

**Mutation 2 — `approvePilot` digests the wrong object** (`digest(before.pilot!.draft)` → `digest(before)`):

- Unit tests: **2 failed, 16 passed**, and only the two tests that assert the digest binds the draft
  (happy path, stale-authority invalidation). This is the control for the vacuity of the digest
  assertion itself: a digest of *anything else* fails it.

Both mutations were reverted; `git diff` is empty and no tracked file is modified.

## Product defects found

**None.** No defect was found in `approvePilot`, `pilotDraftFailure`, `applyTransaction`,
`saveConstitution`, the gate logic in `pilotDraftGaps` / `pilotEconomicsCalculationIssues`, or the
cockpit pilot editor. Every assertion in both suites passed against the unmodified product once the
deliberate mutations were reverted, and the behaviour observed matched the code as written.

Two behaviours that could be *mistaken* for defects, recorded here so the next reader does not
re-investigate them — both are intentional and are covered by comments at their source:

1. A denied approval appends an audit entry. `applyTransaction` audits every decision
   (`engine.ts:302`). Correct: a refusal is a decision worth investigating.
2. `approvePilot` does not delete `pilot.approval` when the draft changes, because
   `saveConstitution(..., preservePilotApproval = true)` (`engine.ts:961`) explicitly preserves it.
   Stale authority is prevented instead by the digest check in `pilotApprovalFailure`
   (`engine.ts:443`) and by any later owner write dropping the block. Verified above from both sides.

## Known limits of this evidence

- `pilotApprovalFailure` (`engine.ts:439-445`) — the consumer of the approval, which returns
  `PILOT_APPROVAL_REQUIRED` when the digest no longer matches — is reachable only from the live
  Shopify price path (`engine.ts:498`), which needs a live-mode workspace and provider staging
  capability. Its digest-mismatch property is proven **directly on the persisted record** here, not
  by invoking it. The consumption end is unrun in this phase.
- The browser spec asserts approval rendering and durable state; it does not attempt a provider
  write, which is out of scope and would require the live Shopify exception in AGENTS.md rule 6.
- `tests/e2e/pilot-approval.spec.ts` runs against a fresh `HOTL_TEST_INSTANCE_DIR`, so it does not
  assume a starting version number; it reads the version from the API and asserts the increment.
