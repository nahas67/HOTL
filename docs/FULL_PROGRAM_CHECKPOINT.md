# HOTL — Full Program Checkpoint and Evidence Register

**Prepared:** 2026-10-08 (supersedes the October 1 snapshot anchored at `8ccf7b5`)
**Repository:** https://github.com/nahas67/HOTL
**Base branch/head at review:** `main` @ `1de2ad36793258db201aac21f04fdd48d4a0681f`
**Prior checkpoint preserved at:** [`docs/checkpoints/HOTL_FULL_CHECKPOINT_2026-10-08_ORIGINAL.md`](checkpoints/HOTL_FULL_CHECKPOINT_2026-10-08_ORIGINAL.md) — SHA-256 `ba2bac52…c852e2`, byte-identical to the copy supplied with this session.
**Prior audit superseded:** [`docs/MASTER_CHECKPOINT_2026-10-08.md`](MASTER_CHECKPOINT_2026-10-08.md) (branch `audit/hotl-checkpoint-2026-10-08`, open PR #1).

**This is an evidence register, not a production authorization.** Nothing here promotes a gate. No simulated result is provider proof.

## Legend and evidence policy

- `[x]` = implemented **and** verified at the **stated scope** by evidence cited in this document. It never implies production capability.
- `[ ]` = incomplete, blocked, deferred, or lacking qualifying evidence. The tag states which.
- **M0** not implemented · **M1** implemented · **M2** local verified · **M3** integration verified · **M4** external staging verified · **M5** production verified · **M6** shadow validated · **M7** autonomy eligible.
- An unrun test never becomes `[x]` because code exists. Every promotion below names a command, a result, and where the artefact lives.

## What changed in this session

| # | Change | Evidence |
| --- | --- | --- |
| 1 | Reconciled the October 1 snapshot against real remote state, closing its open **CP-00** item. | §0 |
| 2 | **Credential exposure found and contained**: a live GitHub fine-grained PAT was being serialized by the Next.js build into `apps/cockpit/.next/cache/turbopack`. | §0.3 |
| 3 | Full-history secret scan run for the first time with a real scanner; history is **clean**. | §0.3 |
| 4 | Fixed the red `main` pipeline and the underlying environment-dependent test. | §0.2 |
| 4b | Repaired the pipeline again after it advanced: fixed a **timing-dependent readiness gate** in the SQL drill that made CI pass or fail by runner speed. | §0.2.1 |
| 5 | Three public ZIP snapshots untracked; `*.zip` ignored; a safe archive builder added. | §0.4 |
| 6 | CI now fails on credential leaks, tracked binary snapshots, committed `.env`, and allowance drift. | §0.5 |
| 7 | Entire release-validation suite plus both PostgreSQL drills **re-run and passing** on this machine. | §0.1 |

---

## 0. Source and verification baseline

### 0.1 Local verification — re-run 2026-10-08

Machine: Windows, Node v25.9.0, pnpm 10.17.1, Docker Desktop (Linux), PostgreSQL 18 local binaries.
Harness: `scripts/verify-suite.ps1`; raw logs in `artifacts/verify-2026-10-08/` (git-ignored).

| Step | Command | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | **PASS** (exit 0) |
| Typecheck | `pnpm exec turbo run typecheck --force` | **PASS** — 11/11 successful, **0 cached** (`typecheck.log`) |
| Unit/workspace tests | `pnpm exec turbo run test --concurrency=2 --force` | **PASS** — **0 cached**, 11/11 turbo tasks (`test.log`) |
| Root tests | `node --test tests/*.test.mjs` | **PASS** — 21/21, 0 skipped (`test-root.log`) |
| Build | `pnpm build` | **PASS** (exit 0) |
| Browser drill | `pnpm test:e2e` | **PASS** — **11/11 passed** (`e2e.log`). See the flake note below: this result is not unconditional. |
| Migration + RLS drill | `pwsh -File infra/scripts/test-database.ps1` | **PASS** — includes the new direct-`append_audit` denial |
| Runtime-ledger drill | `pwsh -File infra/scripts/test-runtime-ledger.ps1` | **PASS** — 33/33; ledger/audit MD5 identical before restart, after restart and after restore |

> **Correction, 2026-10-09.** An earlier revision of this table claimed `--force / 0 cached` while citing a log that read `11 cached, 11 total / FULL TURBO`, because `scripts/verify-suite.ps1` never passed `--force`. The claim was true; the cited artefact contradicted it. **The harness now forces typecheck and the turbo tests**, and every row above names a log showing the result it claims. A turbo cache hit is not evidence, and the harness may not present one as evidence.

Scope note added by the same review: the runtime-ledger restore digest covers `workspace_state` + `audit_entries` only. Shopify tables, the webhook inbox and idempotency records are **outside** that digest.

### 0.1.1 A newly discovered flaky browser test — recorded, not papered over

Repeated full `pnpm test:e2e` runs during this session produced **11 passed, then 1 failed, then 11 passed** — roughly one failure in three full runs.

The failure is `platform.spec.ts` *"a cockpit cycle pauses in LangGraph and resumes after a saved owner decision"*, where `POST /api/runs` returns **503** instead of 201. Established by experiment, not inference:

- It **passes in isolation**, both with and without this session's changes.
- It is **not** caused by this session's work: the same test passed in isolation with the changes stashed.
- A 503 on that route traces to `KILL_SWITCH_UNAVAILABLE`, i.e. the guardrail's `killState()` read of the independent emergency plane threw — the only 503 source on that path.

**This is fail-closed and therefore safety-preserving, not a safety defect**: an unreadable emergency plane must deny. It is an availability flake. Two candidate causes remain open — the 2,500 ms `KILL_SWITCH_READ_TIMEOUT_MS` being tight while the single-threaded kill service is briefly busy under parallel drill load, or ledger file-lock contention. **The timeout was deliberately NOT tuned**, because raising a safety bound on an unproven hypothesis is exactly how a fail-closed control gets quietly weakened.

Treat "e2e 11/11" as **observed, not guaranteed**, until this is root-caused.

These are **local** results. They do not satisfy any hosted or provider requirement.

Per-package test totals behind the `test.log` row, for traceability:

| Package | Files | Passed | Skipped |
| --- | --- | --- | --- |
| `@hotl/guardrail-service` | 26 | 310 | 26 (PostgreSQL, run by the drill) |
| `@hotl/orchestrator` | 5 | 41 | 0 |
| `@hotl/cockpit` | 6 | 35 | 0 |
| `@hotl/connector-sdk` | 3 | 49 | 0 |
| `@hotl/commerce-core` | 1 | 17 | 0 |
| `@hotl/kill-switch` | 2 | 15 | 0 |
| `@hotl/storefront` | 1 | 7 | 0 (was 0 with `--passWithNoTests` before this session) |
| root `tests/*.test.mjs` | 3 | 21 | 0 |
| `apps/commerce-core/medusa` (own runner) | 2 | 25 | 0 |

### 0.2 Remote reconciliation — the prior checkpoint's CP-00, now closed

The October 1 snapshot was anchored at `8ccf7b5` and could not reach GitHub. Remote access worked this session, so its open item **REMOTE UNVERIFIED** is resolved.

- `main` and `origin/main` both at `1de2ad3`; local is 0 ahead / 0 behind. **The supplied checkpoint is seven commits stale**, not current.
- Commits since the anchor: `8cc6a13`, `dd362d5`, `716fd4d`, `ee9df03`, `a84c9ed`, `1de2ad3` — all Sites/owner-console UI work plus one PostgreSQL privilege test. **No gate state changed.**
- New remote branch `origin/audit/hotl-checkpoint-2026-10-08` (PR #1, documentation only).
- Repository is **public**, default branch `main`, 17,778 KB.

**Pipeline state at `main` @ `1de2ad3`:** run [`37753604085`](https://github.com/nahas67/HOTL/actions/runs/37753604085) **FAILED**.

Root cause, from the run log:

```text
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
1) <div role="alert" class="os-notice os-error">…</div>
```

**A finding worth recording: the test passed locally and failed on CI at the same commit.** Playwright strict-mode resolution depends on timing — the cockpit's `role="alert"` notice plus Next.js' transient route announcer. On this machine 11/11 passed on the unmodified commit; on the slower runner two elements matched. The bare selector was therefore environment-dependent, not merely CI-broken, and a local green run was never evidence of a CI-green commit.

`tests/e2e/operating-system.spec.ts:80` now targets the HOTL validation notice explicitly (`filter({ hasText: 'Request validation failed.' })`). Verified: **11/11 e2e pass locally with the fix**, including a full re-run after every other change in this session.

This matches the fix already proposed in open [PR #2](https://github.com/nahas67/HOTL/pull/2) (run [`37776234045`](https://github.com/nahas67/HOTL/actions/runs/37776234045), green). PR #2 remained **open and unmerged** at the time of writing. Merging to `main` is left to the owner — see §7.

**Confirmed on CI:** run [`37821434285`](https://github.com/nahas67/HOTL/actions/runs/37821434285) on this branch passes step 11, "Exercise the local simulation in the browser". The e2e repair works on the runner, not only locally.

### 0.2.1 A second timing-dependent defect, found by the repaired pipeline

With the browser step fixed, CI progressed past it and failed at the **next** step, which this session had not touched:

```text
Validate production migration and RLS on local Postgres
psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed:
FATAL:  database "hotl" does not exist
```

`infra/scripts/test-database.sh` starts `postgres:16-alpine` with `POSTGRES_DB=hotl`, then waits on `pg_isready` before running the migration. **`pg_isready` reports "accepting connections" while the image is still running its initialization step, before `POSTGRES_DB` is created.** The gate therefore opened before the database existed, so the drill's result depended on runner speed: a slow machine got past it, a fast one failed.

This is a **pre-existing bug, not script logic and not a regression** from this branch — the identical sequence reproduces cleanly locally, and PR #2's run passed the same step on an unchanged base hours earlier. It is the *same class of defect* as the e2e selector: a check that is correct on one machine and wrong on another because it verifies a proxy signal rather than the property it exists to prove. A drill whose pass/fail depends on runner timing is not evidence, which is why it matters under this project's evidence rules.

Fixed in `8a45928`: the gate now opens a real `psql` connection over loopback to the exact database the drill uses, and the retry loop is raised 30 s → 60 s. `infra/scripts/test-runtime-ledger.sh` already applied this rule — *"TCP readiness avoids the image's temporary initialization-only socket"* — so this script was the one that was missed.

Verified end to end under bash against Docker: **exit 0**, including the concurrent-spend denial where one reservation is allowed and the second is refused with `DAILY_CEILING_EXCEEDED`.

### 0.2.2 Result — first fully green pipeline on this repository

Run [`37822359219`](https://github.com/nahas67/HOTL/actions/runs/37822359219), branch `codex/checkpoint-reconciliation-2026-10-08` @ `8a45928`: **all steps successful**.

```text
pnpm lint ............................................... success
pnpm typecheck .......................................... success
pnpm test ............................................... success
pnpm build .............................................. success
Exercise the local simulation in the browser ............. success
Validate production migration and RLS on local Postgres .. success
Validate runtime ledger and guardrail engine ............. success
Scan git history and working tree for credentials ........ success   (new)
```

This is materially better than any previous run on this repository. Run `37753604085` failed at the browser step and **skipped both PostgreSQL drills**, so until now the migration/RLS and runtime-ledger evidence has never actually run in CI on a green build. It now does, and the credential scan runs on every push and pull request.

**`main` is still red until this branch is merged** — the default branch has not been changed by this session.

### 0.3 Credential review — first real result (NEW)

Full detail: [`evidence/supply-chain-review-2026-10-08/README.md`](../evidence/supply-chain-review-2026-10-08/README.md).
Tool: `zricethezav/gitleaks:v8.28.0` via Docker — the same invocation now runs in CI, so a local pass and a CI pass mean the same thing.

**Finding — a live GitHub fine-grained PAT was written to disk in plaintext.** The working-tree scan reported `github-fine-grained-pat` in four `apps/cockpit/.next/cache/turbopack/**.sst` files, each holding one 93-character `github_pat_…` value immediately after the bytes `GITHUB_MCP_TOKEN]`. The **build serialized a process environment variable into its on-disk cache**. This is build-tool behaviour, not a HOTL source defect.

Scope, confirmed rather than assumed:

- **Not in git history** — the full-history scan returns no such finding.
- **Not in any public ZIP** — all three archives were opened entry-by-entry; none embed `.next`; 0 marker hits across 1,284–1,364 entries each.
- **Not in tracked source**, and **not the same credential** as the authenticated `gh` session (compared by SHA-256 prefix only; no value was logged or transmitted).

Containment: `apps/cockpit/.next` (384,421,116 B) and `apps/storefront/.next` (120,570,935 B) deleted — git-ignored, regenerable, no dev server running. Re-scan: zero remaining markers.

**[ ] OWNER ACTION — rotate or revoke that fine-grained PAT.** It must be treated as disclosed. **[ ] OWNER ACTION — do not let build processes inherit agent tooling credentials** such as `GITHUB_MCP_TOKEN`.

**Full git history, after one scoped allowance: clean.**

```text
20 commits scanned · ~2.87 MB · no leaks found
```

Unconfigured, the same scan returned 2 findings, both `generic-api-key` on literal `idempotencyKey` test fixtures (`"refund-medusa-123"`, `"operation-123"`) in `apps/commerce-core/medusa/test/guarded-payments.test.ts`. Verified test data, not credentials. The allowance is pinned to that one file, and `tests/repository-hygiene.test.mjs` **fails the build** if a second allowance appears or any allowance path becomes a wildcard.

### 0.4 Public archive exposure — remediated going forward

Three ZIP snapshots were tracked in a **public** repository, all added in `716fd4d`:

| Archive | Size | Embeds `.git` | Embeds `.data` | Credential found |
| --- | --- | --- | --- | --- |
| `HOTL-updated-share-2026-10-01.zip` | 5,600,824 B | yes | yes | no |
| `HOTL-updated-share-2026-10-03.zip` | 15,893,095 B | yes | yes | no |
| `HOTL-before-continuation-2026-10-01.zip` | 4,981,776 B | yes | yes | no |

- `git rm --cached` on all three — **files remain on disk, all history preserved**; only future tracking stops.
- `*.zip` added to `.gitignore` with the reason inline.
- `scripts/build-share-archive.ps1` builds a shareable archive and then **aborts if the output contains `.git`, `.data`, `.next`, `.medusa`, `node_modules` or a nested `.zip`**. Default mode archives the tracked tree, where ignored state cannot appear by construction.

**[ ] OWNER DECISION** — the historical ZIP blobs still exist in git history. Purging them needs a history rewrite, which was not attempted.

### 0.5 Enforcement added to CI

- `.github/workflows/ci.yml` runs both gitleaks invocations after the PostgreSQL drills.
- `pnpm test` runs `tests/repository-hygiene.test.mjs` (6 checks): no tracked generated/ignored/simulation directory, no tracked file over 5 MB, no tracked `.zip`, required ignore rules present, `.env.example` tracked while real `.env` files are not, and the gitleaks allowance still scoped to one reviewed path.

---

## Executive gate summary

| Gate | Local engineering | Required gate result | Current disposition |
| --- | --- | --- | --- |
| **A** — Business and risk envelope | Typed models, cockpit editing, deterministic economics verified locally | Actual owner-approved business/risk envelope | **BLOCKED — owner values and approval missing.** Unchanged. |
| **B** — Trusted execution foundation | Strong local source/recovery/identity evidence; both PostgreSQL drills re-run green | Isolated hosted identity, DB, worker, emergency service, restore proof | **PARTIAL — hosted staging blocked.** Unchanged. |
| **C** — First real Shopify proof | OAuth, sync, webhooks, owner-only price and fail-closed paths verified locally | Provider-backed dev-store E2E, audit, retries, emergency proof | **BLOCKED — no external Shopify evidence.** Unchanged. |
| **D** — Real supervised commerce | Nothing | Live reconciled order/payment/fulfillment/refund cycle | **NOT STARTED** |
| **E** — Measured autonomy | Configuration/controls locally exist | Measured shadow outcomes and per-domain eligibility gates | **NOT STARTED** |

**No gate moved this session.** The one substantive change was to engineering integrity, not to gate readiness. Gates A–C remain blocked on owner authority and infrastructure this environment cannot supply.

## 0.6 Safety hardening pass — 2026-10-09

Five independent auditors (guardrail, Shopify, orchestration, infrastructure/security, QA) read disjoint scopes and reported traced findings; the Lead independently re-verified the highest-severity claims before acting. **No gate status changed and no external evidence was claimed.** Six defects were fixed and proven by tests that fail without the fix.

### 0.6.1 CRITICAL — cumulative revenue permanently bricked all checkout

`toMinor` (`packages/schemas/src/index.ts`) called `moneySchema.parse`, which caps at **$1,000,000**. Two monotonic accumulators — `state.baseRevenue` and `product.revenue` — were fed through it without a ceiling. Once either crossed the line, `toMinor` threw `ZodError` inside `applyTransaction` (`engine.ts:158`), which has **no try/catch**, so the throw escaped *before* `this.audit()` at `:160`. From that point every checkout threw, including a trivial one, durably across restart — while `telemetry()` still reported `status: 'running'` and `/api/finance` still looked healthy.

Reproduced independently by the Lead from the code, then by the team's tests. Fixed by:

- `toMinor` is now pure arithmetic; the two-decimal guarantee stays with the request schemas.
- New `aggregateMoneySchema` + `assertAggregateMoney()` give lifetime totals a domain that cannot collide with the per-transaction one.
- `applyTransaction` now converts an *unexpected* fault into `deny('STATE_DOMAIN_VIOLATION')` **and writes an audit event**, restoring it from a pre-action snapshot so no partial mutation commits. Typed `GuardrailError`/validation errors still propagate unchanged.
- `MAX_ORDER_VALUE` (10,000) bounds a single order — a blast-radius bound that denies for every actor including the owner. Exactly at the ceiling is permitted.

Evidence: `apps/guardrail-service/test/money-domain.test.ts` — 6/6, including "keeps accepting ordinary orders after lifetime revenue crosses the old $1M ceiling" and a corrupt-state case asserting a governed denial **plus** an audit entry.

### 0.6.2 Rule 7 fail-open — a blank kill journal reported "not engaged"

`infra/kill-switch/src/journal.ts`: `''.split('\n').filter(Boolean)` yields `[]`, so an existing **zero-length** journal never called `apply()` and the service started with `engaged: false`. A blank restore of an engaged latch would resume commerce after a global stop.

The fix needed a durable way to tell a *legitimately initialized* empty journal from a *wiped* one — the two are identical on disk. A creation sentinel (`type: 'initialized'`) is now written durably when the journal is created, so an existing journal with no events can only mean truncation. An existing blank journal is refused; a newly created one still starts unengaged.

This changes the journal's first line, so two assertions that encoded the old *shape* were updated — the "latch durable before response" check now asserts the engaged event is present in the file rather than assuming it is line 0, which is a **stronger** check of the same property. Journals written by the old code still load unchanged.

Evidence: `infra/kill-switch/test/restore.test.ts` — empty and whitespace faults now refuse; 15/15 kill-switch tests pass.

### 0.6.3 Rule 2 — the audit chain was forgeable by the role that depends on it

`202609070001_hotl.sql:360` granted `EXECUTE` on `public.append_audit(...)` to `hotl_guardrail` and `service_role`, although all four call sites are inside `SECURITY DEFINER` code that already holds definer rights. Any holder of the guardrail login could append a forged, hash-chain-valid, irreversible audit row for **any** owner.

`append_audit` is removed from the grant and explicitly revoked from both roles. `infra/scripts/test-database.sql` now asserts a direct call under `set role hotl_guardrail` fails with `permission denied`, and the drill's independent chain re-derivation still finds zero forged rows.

### 0.6.4 Rule 3/7 — the preflight accepted a simulation-mode emergency plane

`scripts/staging-readiness.mjs` checked only `typeof body.engaged === 'boolean'`, ignoring the `mode` field the kill plane returns. An instance running the repository's published demo credentials reported `VERIFIED` and the process exited 0 — while the same file blocks that token locally. The probe now requires `body.mode === 'live'`. The new test was verified to **fail** against the pre-fix script and pass after.

### 0.6.5 Shopify reconciliation worker wedged on an attempts-exhausted job

`shopify-service.ts:248` set a terminal `FAILED` status but left `claim` and `leaseUntil` behind, which `syncJobSchema` rejects — so `verify()` threw, the transaction rolled back, and **every** subsequent worker pass threw on the same job, with zero provider reads. Linked inbox events never reached a terminal state and kept counting toward the webhook backlog ceiling, so real deliveries would eventually be dropped with 503.

Fixed by clearing the claim/lease and marking linked evidence terminal, plus `sweepStranded()` which resolves orphaned `RECONCILING`/`RECONCILIATION_QUEUED` events whose job is terminal — from durable local evidence only, never applying a webhook body or contacting the provider.

### 0.6.6 Orchestrator checkpoint poisoning

`checkpointer.ts` stored `this.saving = save`, where `save` chains off the previous flush **with no rejection handler**. One transient filesystem fault meant no checkpoint byte was ever written again and every later call rejected with the original stale error, until process restart — plausible on this OneDrive-backed workspace. `this.saving = save.catch(() => {})` keeps the chain alive so the next flush runs its own body.

### 0.6.7 Evidence-integrity defect in this register — corrected

The 2026-10-09 QA audit found that §0.1 claimed `--force / 0 cached` for typecheck while citing a log showing `11 cached / FULL TURBO`, because the named harness never passed `--force`. The claim was true; the citation was false. Fixed in the harness and corrected in §0.1 above, with the scope of the restore digest narrowed to what it actually covers.

### 0.6.8 Confirmed correct — no false positives reported as defects

The auditors independently traced and confirmed, rather than assumed: the one-way kill latch has no disengage path and is enforced at both service and database layer; the runtime ledger's cross-workspace isolation is genuinely binding for a non-owner role; audit-before-success is atomic on both stores; provider POSTs are never retried; compensation requires fresh authority; MANUAL mode executes nothing; and the replan bound caps any stage at three executions. **These are not findings and were not "fixed".**

### 0.6.9 The kill-switch ↔ guardrail HTTP seam — previously untested, now proven

The guardrail and the kill switch are, by design, **independently deployed with independent credentials**. The code connecting them over HTTP (`apps/guardrail-service/src/server.ts:26-28`) was constructed by **no test in the repository**: all 20 `createServer({...})` call sites pass an explicit `engine:`, so every kill-denial test injected a lambda instead.

`apps/guardrail-service/test/kill-switch-seam.test.ts` now starts the **real** `createKillSwitch()` and drives the **real** reader closure — 6 cases: healthy and unengaged acts normally; engaged denies; wrong read token denies `KILL_SWITCH_UNAVAILABLE`; a stopped plane denies; a well-formed body with no `engaged` field denies; and no configured token appears in any response.

**Verified that these detect real defects**, by temporarily breaking the production reader:

| Injected defect | Result |
| --- | --- |
| `/state` path changed to `/wrong-path` | tests fail |
| `Authorization` header removed from the reader | the healthy-path case fails |
| none (restored) | 6/6 pass |

### 0.6.10 Commerce mutations are now bound to scope and policy

`checkout()` and `commerceEvent()` called only `block()`, inheriting **no engine-level authorization**: no scope check and no Constitution-version binding. Verified before the fix — an agent holding only `listing`/`runs`/`context` could create an order, decrement inventory and raise `baseOrders` with zero approval. Both now pass through `scope()` and `context()`; `order_agent` is recorded as the commerce scope holder, matching the HTTP route's existing `requireAccess(request,'commerce')`. Owner and storefront callers are unaffected because the version fields are optional in the schema and required only for agents.

`apps/guardrail-service/test/engine-authorization.test.ts` — 5 cases. **Verified they bite**: with the gate removed, 3 fail; restored, all 5 pass.

### 0.6.11 Synthetic telemetry is separated from measured data

`telemetry()` returned a hardcoded `margin`, `marginChange`, `revenueChange`, `ordersChange` and a synthetic chart interleaved with real ledger values under the same `metrics` key, so no consumer could tell measured from invented. `metrics` now holds **only** ledger-derived values; everything fabricated moved to a labelled `synthetic` block carrying its own note. The cockpit was updated to read the new shape and labels those tiles *"Illustrative trend, not observed"*.

### 0.6.12 Replays are now distinguishable from fresh authority

A replayed result is returned with `replayed: true`. Behaviour is unchanged — the action is still not re-run and stop conditions are still not re-evaluated on that path — but the caller can no longer mistake recorded history for fresh permission. Twenty existing replay assertions were updated to expect the marker, which makes them **strictly stronger** than the previous deep-equality checks.

### 0.6.13 A proposal deliberately rejected

The audit also proposed re-keying the idempotency map per actor and operation, so that one actor's rejected request could not block another's key. **This was implemented, then reverted on review.** `state.idempotency` is part of the durable ledger; re-keying it makes every record written by an earlier version unreachable on upgrade, and a replayed financial request would then execute a second time. Losing replay protection is a safety failure; cross-actor key squatting is an availability annoyance. The key format is unchanged and the reason is recorded at the call site so it is not "fixed" later by someone who misses the migration.

### 0.6.15 An uncertain outcome no longer reports as success

When a provider write's response is lost, the guardrail returns `decision: 'unknown'` with `status: 'UNKNOWN'` and a receipt. The body was honest, but **every transport-level signal said success**: the route returned HTTP 200, and the cockpit proxy — which downgraded only `decision === 'deny'` — returned `ok: true`, so any client keying on status treated a financial operation as completed.

Both boundaries now refuse to call it success:

- `shopify-routes.ts` raises `PROVIDER_OUTCOME_UNKNOWN` (502) rather than returning 200.
- `apps/cockpit/src/lib/proxy.ts` classifies `decision: 'unknown'` as `ok: false`, 502, with a message stating the outcome is not known and must not be retried blindly.

It is deliberately **not** mapped to a denial. An uncertain outcome is unknown, not refused, and conflating the two would let an operator conclude nothing happened when a write may have landed. Two tests in `apps/cockpit/src/lib/proxy.test.ts` cover both properties, including that it is not reported as a denial. **Verified they bite**: reverting the proxy change fails 2 of 35.

### 0.6.16 Webhook callbacks are now bound to an installation

The app-wide webhook secret is shared by **every** installation, so a body validly signed for
store A was accepted at store B's endpoint and triggered a real provider read against a store the
payload never came from. Verified in the audit before the fix.

The callback URL is now `/api/shopify/webhooks/:id/:mac`, where `mac` is
`base64url(HMAC-SHA256(CONNECTOR_ENCRYPTION_KEY, "hotl-shopify-webhook:v1:" + installation-id))`,
43 URL-safe characters. The MAC is checked **first**, before HMAC and before any ledger read, so
a wrong-MAC request never reaches either. The unbound two-segment shape is **removed, not kept as
a fallback**: a hand-assembled URL is a hard 401.

Two properties worth keeping in view: the URI is **deterministic per installation**, so
re-registering after a Shopify-side deletion yields the same endpoint and an operator never hunts
for a new URL; and the change was made **now** precisely because no live subscription exists — the
breaking-change cost is zero today and would become permanent the moment a real store connects.

Evidence: `test/shopify-webhook-mac.test.ts` (6 cases: determinism, URL-safe segment, per-installation
and per-key binding, domain separation from a bare MAC and from `:v2`, 10 malformed presentations),
plus an HTTP-level test that a **correctly signed** body carrying another installation's MAC is
refused and triggers no provider read. **Verified it bites**: removing the MAC gate fails that test.

**Residual, recorded not glossed:** losing only **one** container is still lazily re-initialised,
because the commerce container is legitimately absent between install and first sync, so presence
alone cannot distinguish that from a wipe.

### 0.6.17 Silent loss of a Shopify extension container now denies

Wholesale loss of both extension containers started the workspace with zero installations, zero
variants and zero operations, and **no denial** — fail-silent, which rule 7 forbids. Detection
uses the **hash-chained audit journal**, not a new persisted field: the journal is the only Shopify
artefact outside the containers, and a new marker field would not survive the very event it exists
to detect. Each container is matched against **its own** operation-name prefixes.

That domain split is load-bearing: a first attempt matched all `integration.shopify.*` events
against both containers and broke five tests, because a legitimate OAuth install writes
installation-domain events while no commerce container exists yet. **Renaming an operation without
updating the prefix list silently disables this detection.**

### 0.6.18 Health readiness no longer overstates its state

`ingressReady` required only that a service existed, while `webhookUri` needs a configured public
HTTPS origin **and** the connector encryption key — registration would have thrown while health
reported ready. `reconciliationReady` was `true` in `OWNER_MANUAL`, where no worker runs and the
documentation promises `MANUAL_ONLY`. Both are now derived from what is actually configured and
running, and the response carries the `MANUAL_ONLY` label.

### 0.6.19 Orchestrator: a resolved interrupt is no longer advertised as pending

`interruptId` was only overwritten when a decision was escalated *and* carried one, so the run
kept advertising an approval the owner had already decided. The trap survived **three** clearing
sites, not one — `execute()`, `sourcing_margin_gate` and `human_interrupt` — and fixing only the
first would have left it open. All three now clear it, and an escalation carrying no id can no
longer route to `human_interrupt` against a stale one.

Separately, a rule-1 test now **proves** model output can never enter an authorization body: the
model is stubbed with a unique sentinel, a full cycle runs, and every `execute` body is asserted
to be sentinel-free. It was mutation-tested — an injected sentinel is caught — and guarded against
vacuity, so deleting the model call cannot make it pass trivially.

**Known, unproven:** a checkpoint persisted by *earlier* code is not migrated by this change. The
id is now strictly derived and cleared on every path, so old threads self-heal on the next
execution, but no fixture exercises a pre-change on-disk checkpoint. Correct long-term answer is
to derive the pending interrupt rather than store it.

### 0.6.20 A refused request no longer burns everyone else's key

A pure denial changed nothing, yet it was recorded, so one actor could permanently block that key
for every other actor and operation — including the owner. Denials are no longer recorded; a
replayed denial is re-evaluated, which re-runs the policy and is strictly more conservative.
Anything that mutated state still records, so replay protection for real effects is unchanged, and
the **persisted key format is untouched** (see 0.6.13).

This surfaced a stale-replay hazard rather than hiding it: a restored ledger previously replayed a
cached `MARGIN_BELOW_FLOOR` denial even though the emergency plane was engaged. It now returns
`KILL_SWITCH_ENGAGED`, which is what a test literally titled *"freshly enforces independent kill
state after restore"* was asserting but did not actually check.

### 0.6.21 Infrastructure and security gaps closed this round

An independent infra pass closed four verified gaps, each with a test that fails without the fix.

- **DELETE was unaudited on 10 domain tables.** The mutation trigger was `after insert or update`
  only, so a deletion produced no audit event, contrary to rule 2. It is now `insert or update or
  delete`, branching on `TG_OP` to read `OLD` (a DELETE trigger has no `NEW`). The drill asserts
  the trigger is registered as AFTER on all ten tables, that a deletion is journalled with the
  removed row, and that a DELETE refused by the kill-latch BEFORE trigger leaves **no** event.
- **The staging preflight contradicted itself.** It listed a control as unprobed while probing it,
  and its detail text claimed the probe verified database role privileges when it only reads the
  guardrail's own assertion. Both are now explicit: the probe is named
  `GUARDRAIL_SELF_REPORTED_WORKSPACE_AND_KILL_READER` and carries an `evidenceClass`.
  `KILL_DEPLOYMENT_LOGICAL_INDEPENDENCE` stays in the unprobed list because it genuinely is.
- **The kill switch silently defaulted to simulation with credentials published in this repo.** An
  unset `HOTL_MODE` now fails closed *before* any listener, journal or lock file is created. The
  `Dockerfile` already pinned `HOTL_MODE=live` and a test now guards that.
- **The kill-switch image build never ran on `main`.** Added the push trigger, with a test
  asserting the workflow still contains no deploy step and no secret.

### 0.7 Cockpit redesign attempt — parked, not shipped

A parallel workstream built a design system (`tokens.css`, `design-system.css`), a primitive layer
(`ui.tsx`) and a 2,069-line categorized Settings surface (`settings-page.tsx`) with a vertical
left sidebar. It was **interrupted before completion and regressed six of the eleven core browser
journeys** — manual product edit, storefront checkout, pause/resume, below-margin approval
denial, the LangGraph cycle, and expired-proposal replanning.

The decisive evidence: with the redesign parked, `pnpm test:e2e` returns **11/11 in 51 s**; with
it applied it returned **8 passed in 6.7 minutes** with cascading timeouts. One failure — the pause
test failing to resume — left the platform paused, which is why every later test reported `halted`
rather than `interrupted`. The cascade looked like six independent defects and was one.

**The work is preserved, not discarded**: `git stash` entry `in-flight-cockpit-redesign`. It is
**not** on `main`. A redesign that breaks checkout, pause and approvals is a regression, and
shipping it to satisfy a request would have been the wrong trade.

The lesson is recorded: a large UI rewrite needs its e2e suite run *during* development. A
45-second timeout per broken control turned one regression into a 6.7-minute, hard-to-diagnose
cascade.

### 0.7.1 Verified cockpit defects — still open against `main`

QA exercised every control in a real browser against a live stack and produced
[`docs/cockpit-control-inventory.md`](../cockpit-control-inventory.md). Highest-value items:

- **[FIX-1] An illustrative chart is captioned as measured.** `RevenueChart` renders
  `telemetry().synthetic.chart` — the guardrail's fabricated series — captioned *"Measured
  progress. Every dollar accounted for."* On one screen the panel read **$20,773.00** while the
  metric card above read **Total revenue $24,782**. The guardrail already ships the correct copy
  in `synthetic.note`; it is declared in `types.ts` and rendered nowhere.
- **[FIX-2] `/products` and `/orders` scroll horizontally at 360 px** (671 px and 588 px
  `scrollWidth`). Existing responsive coverage checks four other routes at 390 px, which is why it
  was green. The page genuinely pans sideways.
- **Dishonest availability:** Approve stays enabled while paused. It fails closed server-side, but
  unlike every other financial control it renders as available when it can never succeed. Reject
  correctly stays enabled — the guardrail deliberately skips `block()` for rejections.
- **Accessibility:** the Constitution tablist points `aria-controls` at five unrendered panels; the
  Approve/Reject/Modify group has no role, label or pressed state, so selection is conveyed by a
  CSS class alone on a financial action.
- **A control that lies:** the Ad spend card hardcodes **"Within budget"**, still shown beside
  "$0.00 remaining" when the ceiling is exceeded.

### 0.7.2 Capabilities that existed but were unreachable — now wired

Four guardrail capabilities had no route through the cockpit proxy, so they were *disconnected
rather than absent*: `GET /api/campaigns`, `POST /campaigns/:id/pause`,
`PATCH /api/guardrails/config` (previously GET-only, so the ad-spend ceiling and margin floor could
be read but never changed), and `GET /api/shopify/webhooks/health`. All four are proxied and
remain owner-gated by the guardrail; the proxy widens no authority.

Two more — `GET /api/audit-log` (carrying the backend's computed `integrity: "verified"` verdict)
and `GET /api/operating-state` (pending proposals with `requiredAction`, plus resource revisions) —
were already proxied and working but **never called by any UI surface**. They still need
surfacing; the cockpit currently rebuilds that freshness context by hand.

### 0.7.4 UI honesty and accessibility defects — closed this round

Four of the audit's findings are fixed against `main` and verified (`516f524`):

- **The revenue chart no longer claims to be measured.** It renders `telemetry().synthetic`
  verbatim via `synthetic.note`, and its `aria-label` announces the figure as illustrative
  rather than as revenue. Previously it showed **$20,773.00** captioned *"Measured progress"*
  beside a real **Total revenue $24,782** on the same screen.
- **The ad-spend card is derived, not hardcoded.** It said **"Within budget"** unconditionally,
  including beside "$0.00 remaining" against an exhausted ceiling. It now reports the ceiling
  being exceeded when it is.
- **Approve is disabled while the platform is paused**, matching every other financial control.
  Reject stays enabled deliberately — the guardrail skips `block()` for rejections, so it can
  still succeed.
- **The Approve/Reject/Modify group is now a labelled group with `aria-pressed` per option**, so
  the armed decision is conveyed programmatically instead of by a CSS class alone.

**Two of my own attempts were wrong and were corrected rather than shipped:**

1. My first accessibility fix set `role="radio"` on the buttons. That **overrides the button
   role** and silently broke `getByRole('button', { name: 'Reject' })`, timing out the LangGraph
   cycle test. The e2e suite is the contract, so the options remain buttons carrying
   `aria-pressed` — which still fixes the actual defect (selection conveyed only by CSS).
2. My responsive fix **did nothing**. Adding `max-width`/`min-width` to `.table-scroll` left
   `/products` at 671 px and `/orders` at 587 px, identical before and after, so it was
   reverted rather than left in as cargo cult.

### 0.7.5 Responsive defect — ROOT CAUSED AND FIXED

The `/products` and `/orders` horizontal overflow is **fixed**. It was not a table-sizing problem.

**Root cause.** `.sr-only` is `position:absolute` (the standard visually-hidden pattern). Its
containing block is the nearest *positioned* ancestor — and `.table-scroll`, the element with
`overflow:auto`, was `position:static`. So the hidden span was **not** clipped by the scroll
container; it sat at the far end of the 715 px table and extended the document. The table itself
was always clipped correctly (`right=729` inside a container whose client width is 332) — the
overflow came entirely from a 1 px element escaping its clip.

```css
/* before */ .table-scroll{overflow:auto}
/* after  */ .table-scroll{overflow:auto;position:relative}
```

**Two earlier attempts failed and were reverted**, which is why this took three tries:

1. Adding `max-width`/`min-width` changed the measurements **not at all** (671 px before and
   after). Reverted rather than left in as cargo cult.
2. A first regression test used `waitUntil: 'domcontentloaded'`, which measures before hydration
   renders the page. Every route then reported exactly its viewport width, so the test **passed
   against the very defect it was written to catch**. It was caught only because it also passed
   when the change was reverted — which is precisely the check that exposes a useless test.

Measured after the fix at 360 px: `/products` `document.scrollWidth` **360**, `/orders` **360** —
exactly the viewport.

`tests/e2e/responsive-overflow.spec.ts` now sweeps **all ten routes at 360 px and 390 px** with
`networkidle`, and `KNOWN_DEFECT_ROUTES` is **empty**. **Verified it bites**: with the fix reverted
the sweep fails and names `/products document=671`, `/orders document=587` at 360 px and
`677`/`593` at 390 px. A future route that overflows will fail this test.

### 0.7.7 Cross-process guarantees — now proven, and two real defects surfaced

Guarantees that had only ever been tested with two engines **in one process** are now exercised
across **real OS processes**, coordinated by a filesystem barrier with deadline polling (no timing
sleeps; 3.2 s total, stable over three runs).

- **`ledger-multiprocess`** — the file-backed ledger mutex across three processes. The decisive
  case asserts `STATE_BUSY` while a real lock is held and success after release; the contention
  is genuine (310/343/310 cross-process retries measured), and 3 processes × 3 × $25 against a
  $100 ceiling yields exactly 4 allows and 5 denials with the issued reservation set equal to the
  persisted one — no loss, no double-issue.
- **`journal-multiprocess`** — kill-journal single-writer across real processes. Exactly one
  winner, every loser matching `/^EEXIST:/`, and the surviving journal must contain exactly
  `['initialized','engaged']`. A split writer produces two `initialized` sentinels and the journal
  then refuses to load — bricking the emergency plane.
- **`checkpoint-multi-instance`** — 2 pinning tests and 2 explicitly labelled characterization
  tests.

### 0.7.8 D2 — an orphaned ledger lock stranded the workspace. FIXED

`engine.ts` released its lock in a `finally`. A writer hard-killed by `SIGKILL` or power loss never
reaches it, so `state.json.lock` survived and **every** later transaction returned `STATE_BUSY`
forever, with no automated recovery. It fails closed — safe, not a breach — but it is an
availability incident on the financial ledger needing a human to delete a file, and the kill
journal already recorded its pid for exactly this reason while the ledger lock did not.

The lock now records `process.pid` on acquisition, and an `EEXIST` lock is reclaimed **only** when
its recorded owner is provably gone (`process.kill(pid,0)` → `ESRCH`). Anything uncertain —
unreadable, empty, non-numeric, or `EPERM` (alive but not ours to signal) — still denies.
Recovery is never inferred from age.

`apps/guardrail-service/test/lock-recovery.test.ts` — 4 cases. **Verified it bites**: removing the
recovery fails the dead-owner case while all three fail-closed cases still pass.

### 0.7.9 D1 — orchestrator checkpoint writers have no mutual exclusion. OPEN, fix ATTEMPTED AND REVERTED

`checkpointer.ts` `flush()` rewrites the instance's **entire** in-memory storage and renames it
over the shared file, with no lock, no read-merge and no conflict detection. Measured behaviour:

```text
after A: ['t1']   after B: ['t2']   <- t1 destroyed
after A: ['t1','t3']  <- t2 destroyed
fresh reader sees t2: false
```

**Total last-writer-wins across the whole thread set**, not merely threads the second instance
never saw: two live workers destroy each other's checkpoints on **every write**. An owner can
find a run gone and `get()` rejects 404 after a restart.

**It is not a double-spend.** The financial defence is guardrail idempotency on a deterministic
action key, already proven by `graph.test.ts` ("replays the saved action key after a response is
lost across a checkpoint restart"). This is **availability and auditability**. Production is
protected today only by the single-process topology and by `createCheckpointer()` refusing to
build a `FileSaver` outside simulation without `DATABASE_URL` — a correct guard worth keeping.
`checkpoint-multi-instance.test.ts` is a permanent witness that **documents the current loss**.

**A fix was implemented and then reverted.** Optimistic concurrency control was added: `flush()`
takes an exclusive `.writelock` (recording `process.pid`, reclaiming only a provably dead owner,
matching the ledger and kill-journal locks), and refuses when the file on disk differs from the
bytes this writer last read or wrote. In isolation this worked exactly as intended — the probe
showed `b.put REJECTED: Checkpoint file changed since this writer last read it`, and both
multi-instance tests passed while failing again when the staleness check was removed.

**It was reverted because it could not be fully verified.** Run together, the orchestrator suite
passed all 46 tests but emitted **24 unhandled rejections** of the new refusal error, which fails
the package task. Each spec passes cleanly in isolation, so the interaction is a cross-spec or
timing effect that was not identified. Shipping a change that makes the suite red — or suppressing
the rejections, which would hide exactly the signal that matters — was not acceptable, so the
attempt was withdrawn and `main` left green.

**Two fix attempts were made and withdrawn.** Both established real facts; neither could be shipped.

*Attempt 1* — optimistic concurrency control in `flush()`: an exclusive `.writelock` recording
`process.pid`, reclaiming only a provably dead owner (the ledger and kill-journal rule), refusing
when the file on disk differs from the bytes this writer last read or wrote. **Verified working in
isolation** — the probe showed the refusal, and both multi-instance tests failed again when the
staleness check was removed. Run together it produced **24 unhandled rejections**.

*Attempt 2* — the diagnosis in the previous section, acted on: `flush()` no longer throws for a
staleness refusal. It records the refusal and surfaces it from `put()`, which callers do await.
Result: **19 unhandled rejections**, and now provably **not** caused by the staleness path, because
that path no longer throws at all.

**What the two attempts together prove.** `put()` is *also* reached un-awaited by the graph, so
**neither** placement — throwing from `flush()` nor deferring to `put()` — avoids surfacing a
refusal as an unhandled rejection. The saver is the wrong place to own this outcome entirely.

**Therefore the fix must move up a layer.** The refusal has to be owned by `RunManager`/graph-level
error handling, with the saver exposing the conflict as state rather than as a promise rejection.
That is a real design change with its own tests, and it was not attempted blind. No source change
is committed; the suite is green at 46/46.

This is unfinished work with a now-well-characterised cause, not a rejected idea. Two attempts
without new information would have been churn, so it stops here.

### 0.7.10 D3 — unlocked ledger reads. OBSERVATION, not reproduced

`snapshot()` and `telemetry()` read without taking the lock, while `transaction()` correctly
snapshots inside it. On Windows/OneDrive a reader can collide with the rename. The ten-retry
EPERM/EACCES/EBUSY loop covers writers only. **Not reproduced** in the contention runs, so it is
recorded as an observation rather than a confirmed defect.

### 0.7.12 A computed control that no surface displayed — now surfaced

`GET /api/audit-log` returns the entries **and the guardrail's own `integrity: "verified"`
verdict**, which the service recomputes on every load. The cockpit proxied the route and
**nothing called it**. The Activity page showed individual `hash`/`prevHash` values in its detail
dialog while the service's actual verdict — the thing that says whether the chain is intact —
was never rendered, and there was no control to re-verify.

The Activity page now carries an **Audit chain integrity** panel. It states plainly that the
verdict is the service's, not the page's, exposes a **Re-verify chain** action that issues a real
request, and **fails honestly**: if the log cannot be read it renders an alert and never claims
the chain is verified.

`tests/e2e/audit-integrity.spec.ts` — 2 cases. The first asserts the verdict renders and that
re-verify performs a genuine request (measured via resource timing, not by assuming). The second
aborts the route and asserts the page shows an alert and **never** says "Chain verified" while the
state is unknown. This is the same honesty discipline applied to the revenue chart: an unknown
control must not render as a healthy one.

### 0.8 Settings surface — LANDED (the redesign, recovered additively)

The parked redesign is now **live**, recovered in a way that avoided the regressions that caused
it to be parked. What changed is the *method*, not the code:

- The earlier attempt replaced the shell (`cockpit.tsx`, `operating-pages.tsx`, `layout.tsx`) and
  never verified the interactive controls before running e2e once. It broke six journeys.
- This attempt restored **only the new files** (`settings-page.tsx`, `ui.tsx`, `tokens.css`,
  `design-system.css`) and made the **smallest additive wiring**: a new `settings` section in the
  existing nav, one render branch, two CSS imports. **No existing section was restyled or
  restructured**, so the six journeys that broke before cannot break.

**What it delivers**, matching the stated requirement:
- A **vertical left sidebar** (`nav[aria-label="Settings sections"]`, taller than wide) with
  **categorized navigation** (group headings, e.g. "Workspace"), and a **dedicated main content
  panel** to its right.
- **Nine+ categories** covering business configuration, stores, integrations, agents, automation,
  financial controls, permissions, notifications and system management — each bound to real API
  calls through the existing proxy, with the cockpit's own run/pause/emergency actions passed in
  rather than re-implemented.
- A design-system token layer and primitive components, loaded after the legacy stylesheets, which
  re-point existing variables so shipped components sit on the new scale without being rewritten.

**Evidence** — `tests/e2e/settings.spec.ts`, 3 cases: the sidebar is a vertical rail with more than
one category group and the panel sits to its right; **every** category is clicked and must render
non-empty real content with a distinct name (a decorative shell would fail this); and the page does
not overflow at 360 px.

One correction worth recording: the first run of that spec failed twice because I asserted against
`.ds-settings-body` while the component renders `.ds-settings-content`. The page was correct and
the test was wrong — verified by probing the real DOM rather than "fixing" the component.

Full suite green with 0 cached. **e2e 18/18** (11 original + 7 added this session).

### 0.9.1 The "1-in-3 e2e flake" is NOT a flaky test — it is a service crash

Long recorded as an unexplained intermittent `POST /api/runs -> 503`. **Root-caused this round,
and it is a different problem than anyone assumed.**

The Playwright log carries the evidence that was never read:

```text
[WebServer] orchestrator exited (1). Stopping local stack.
Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:4100
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/...
```

`scripts/dev.mjs` supervises all services and **tears down every child when one exits**. So the
orchestrator process **crashes with exit code 1**, which kills the guardrail and cockpit too, and
every subsequent test fails instantly with `ECONNREFUSED` in ~780 ms.

That inverts the earlier reading. The suite was never "sometimes flaky": it was **crashing a
service and reporting the cascade as failures**, which is why one fault presented as six or nine
independent defects. It also means a red run is not 6–9 problems, it is **one crash plus noise**.

**What was ruled out by measurement, not assumption:**

| Hypothesis | Experiment | Result |
| --- | --- | --- |
| Emergency-plane read times out (2,500 ms budget) | 40 consecutive `GET /api/status` | **0 failures, p50 8 ms, p95 11 ms, max 68 ms** — a 36× margin. Not it. |
| `POST /api/runs` is itself unreliable | 25 consecutive calls | **25/25 succeeded** — not it. |
| The cycle test alone is flaky | 3× in isolation | **3/3 passed** — not it. |
| `platform.spec` alone is flaky | 2× in isolation | **6/6 both times** — not it. |
| `operating-system` + `platform` together | 2× | **10/10 both times** — not it. |

**Still open: why the orchestrator exits.** After the cascade was identified, four consecutive full
runs passed **20/20**, so the crash is genuinely intermittent and did not reproduce. It is also
**not** resource exhaustion: the crash run and the clean runs both had 35 node processes and
4.7 GB free, so process count does not explain it. It is recorded as unexplained rather than
resolved, because claiming a fix for something that stopped happening would be false confidence.

**The harness is what hid it, and that part is fixed.** `scripts/dev.mjs` captured every child's
stdout/stderr but never associated it with the exit, so the only visible line was
`orchestrator exited (1)` and the real error scrolled past. On a child exit the harness now prints
a delimited block naming the service, its exit code or signal, and **its last 40 lines of output**,
labelled as the cause rather than the `ECONNREFUSED` noise that follows the teardown. Next
occurrence will be diagnosable in one look instead of five rounds.

### 0.9.2 Constitution tablist pointed at panels that were never rendered — fixed

All six tabs set `aria-controls="constitution-<id>"`, but only the **selected** panel is rendered,
so **five of six pointed at elements that did not exist**. An attribute referencing nothing is
worse for assistive technology than omitting it.

The selected tab now declares `aria-controls`; inactive tabs declare none; and the panel is
`aria-labelledby` its tab. `tests/e2e/tablist-aria.spec.ts` — 2 cases that walk every tab and
assert each relationship resolves, plus that exactly one tab is selected at a time.
**Verified it bites**: restoring the original attribute fails both tests.

### 0.9.3 Open, deferred

The replay marker added earlier broke six assertions in `postgres-store.test.ts`. That file is
guarded by `describe.skipIf`, so **26 of its cases never run in the normal suite** — they execute
only inside the runtime-ledger drill, against real PostgreSQL. `pnpm test` stayed green the whole
time.

The infra agent found the failing drill, proved it was not its own regression by stashing every one
of its files, and reported it rather than working around it. That is the system working: the
assertions were fixed, and the drill is green again —

```text
Tests  33 passed (33)
Runtime ledger state/audit MD5 before and after restart: c47b9ee74b482fa1807679ceb54db146
Restored runtime ledger state/audit MD5:                c47b9ee74b482fa1807679ceb54db146
Restored RLS, grants, login bindings and append-only denial verified
```

**A green `pnpm test` did not mean the guardrail suite was green.** That is now recorded rather
than quietly fixed.

### 0.6.22 Open, deferred

Recorded so the register is complete. None is claimed as done.

- `checkout()`/`commerceEvent()` bypass `scope()` and `context()` — no engine-level scope or constitution-version binding (HTTP reachability is currently limited to `order_agent`).
- Idempotency keys share one flat namespace and denials consume them.
- Replayed historical `allow` is returned with no `replayed` marker.
- `telemetry()` serves fabricated margin/chart with no provenance marker.
- Webhook intake is now installation-bound (§0.6.16). Losing only **one** extension container is still lazily re-initialised (§0.6.17).
- Orchestrator: refund-policy reimplementation at `graph.ts:138` that has drifted from the guardrail, and owner binding on read/resume — both still deliberately sequenced behind guardrail work.
- `apps/storefront` derives its expected origin from the request's own `Host` when `STOREFRONT_PUBLIC_ORIGIN` is unset; pinning it remains a staging prerequisite.
- The `integration.shopify.*` prefix lists that drive extension-loss detection must move with any operation rename (§0.6.17).
- A pre-change on-disk orchestrator checkpoint is not migrated by the interrupt-clearing change (§0.6.19).
- Roughly one full e2e run in three fails with `503 / KILL_SWITCH_UNAVAILABLE` (§0.1.1).

## 0.1.1 Runtime-ledger drill — measured recovery evidence

`infra/scripts/test-runtime-ledger.ps1` builds a **disposable native PostgreSQL cluster** (never `DATABASE_URL`, never an existing cluster), applies the migrations, runs the real `GuardrailEngine` against PostgreSQL persistence, restarts, dumps, restores, and re-verifies authorization. Observed output:

```text
✓ test/postgres-store.test.ts (33 tests) 3187ms
Runtime ledger state/audit MD5 before and after restart: 56a26542f58ffbbaebb020bb13061091
Restored runtime ledger state/audit MD5:                56a26542f58ffbbaebb020bb13061091
Custom-format backup SHA-256: 96FD33864541B019148C024F624594B8420626F612B75B97D77095CEC5053819
Restored RLS, grants, login bindings and append-only denial verified
[OK] Runtime ledger integration tests, database restart, backup/restore digest and restored authorization checks passed.
```

The digest is **identical before restart, after restart, and after restore**, and restored RLS/grants/login bindings/append-only denial were re-verified. This is strong local recovery evidence and remains **M2/M3 local** — it says nothing about a hosted backup target, recovery objectives, or cross-zone failure.

---

## Gate A — Owner business and financial authority

### A1 — Pilot business definition
- [x] Local pilot schema, cockpit editor and versioned review/approval mechanism exist (M2).
- [ ] **OWNER REQUIRED** — Approved legal seller jurisdiction and markets.
- [ ] **OWNER REQUIRED** — Approved pilot category, product/SKU, customer profile and selling channel.
- [ ] **OWNER REQUIRED** — Approved fulfillment/supplier model, returns policy, currency and target AOV.
- [ ] **OWNER REQUIRED** — Authenticated owner approval of the current business version/digest.

### A2 — Economics
- [x] Typed money/ratio/fraction schemas and deterministic contribution/break-even CAC/ROAS formula/version checks exist (M2).
- [x] Calculated-field inconsistency can block approval in local tests.
- [ ] **OWNER/SOURCE REQUIRED** — Evidence-backed supplier/product, landed shipping, packing, payment/platform fees, fulfillment, refunds, returns and tax treatment.
- [ ] **OWNER REQUIRED** — Approved margin floor, allowed price limits and break-even thresholds for the actual SKU.
- [ ] **EXTERNAL UNVERIFIED** — Reconcile real observed charges against expected costs before real-money autonomy.

### A3 — Financial envelope
- [x] Local guardrail and versioned risk-envelope models enforce proposed caps in simulation/test paths (M2/M3).
- [ ] **OWNER REQUIRED** — Pilot capital, protected reserve and deployable balance.
- [ ] **OWNER REQUIRED** — Daily/weekly/monthly caps and per-action authorization ceiling.
- [ ] **OWNER REQUIRED** — Supplier, inventory, ad-spend, experiment-loss and refund caps.

### A4 — Business stops
- [x] Local pause, stop policies and independent kill latch implemented and tested.
- [ ] **OWNER REQUIRED** — Approved loss, contribution, refund, chargeback, supplier SLA, inventory and attribution stop thresholds.
- [ ] **EXTERNAL UNVERIFIED** — Confirm policy revisions invalidate stale plans under actual hosted identity.
- [ ] **GATE A PASS NOT MET** — Owner-signed approved business/economics/risk package with UNKNOWNs resolved.

**Carry-over from the 2026-10-08 AI pilot screen — still NO-GO.** National e-commerce growth and IKEA's $12.99 substitute confirm a comparable and price pressure, not demand for the SKU. An Alibaba listing at $9.63–$10.70 MOQ 100 is **not a binding quote** and yields only an indicative $2.29–$3.36 per unit before freight, duty, fulfillment, payment fees, taxes, returns and acquisition — not a contribution result. Seller country, Shopify Payments eligibility and import/compliance obligations remain unclassified. No supplier was contacted. The cable tray remains a research lead, not a selected product.

## Gate B — Trusted execution foundation

### B1 — Baseline and secrets
- [x] Source-control baseline exists.
- [x] **Full-history credential scan executed with a real scanner and clean** — §0.3. (Previously recorded only as a changed-file scan.)
- [x] Tracked ZIP snapshots removed and prevented — §0.4.
- [x] Credential scan runs in CI and fails the build — §0.5.
- [ ] **VERIFY** — Current branch rules and review policy: **`main` is unprotected** (§6).

### B2 — Durability and restore
- [x] Local durable financial state, audit, idempotency and replay controls (M3).
- [x] **Migration/RLS drill re-run 2026-10-08: PASS** — migration, owner isolation, write denial, audit immutability, refund escrow, kill latch, concurrent spend — §0.1.
- [x] **Runtime-ledger drill re-run 2026-10-08: PASS** — 33/33 tests; ledger/audit MD5 identical before restart, after restart and after restore; restored RLS, grants, login bindings and append-only denial re-verified — §0.1.1.
- [ ] **HOSTED UNVERIFIED** — Staging PostgreSQL credentials, continuous durability and automatic backup.
- [ ] **HOSTED UNVERIFIED** — Restore staging backup into a separate target and reconcile audit/receipts/RLS and recovery objectives.
- [ ] **HOSTED UNVERIFIED** — Cross-process/zone outage and recovery with no duplicate provider effects.

### B3 — Identity and access
- [x] Local owner/agent JWT, scopes, workspace binding and revocation contracts integrated (M3).
- [x] Local readiness probes check effective runtime SQL privileges and DDL/role/ownership conditions.
- [ ] **HOSTED UNVERIFIED** — Actual identity issuer, owner allowlist, agent key rotation and runtime revocation.
- [ ] **HOSTED UNVERIFIED** — Real PostgreSQL user has no elevated/RLS-bypass/DDL privileges; tenant denial tested against the deployed DB.
- [ ] **HOSTED UNVERIFIED** — Private cockpit access and backend authorization demonstrated.

### B4 — Supporting staging infrastructure
- [x] Staging readiness endpoint/checklist, static configuration and optional read-only probe framework locally tested.
- [x] Worker readiness separates ingress, worker and reconciliation concepts.
- [ ] **BLOCKED** — Isolated hosted owner/cockpit HTTPS origin and OAuth callback.
- [ ] **BLOCKED** — Public authenticated/HMAC-protected webhook HTTPS endpoint.
- [ ] **BLOCKED** — Staging DB, workspace, identity, secrets and queues/reconciliation worker.
- [ ] **BLOCKED** — Independently deployed emergency reader/latch, secrets, revocation and main-stack-down denial.
- [ ] **BLOCKED** — Named staging backup/restore target.
- [ ] **BLOCKED** — Static preflight `19 missing -> 0 missing`. The committed `PREFLIGHT.json` still lists 19; **refresh only against the real staging environment**, never by editing the file.
- [ ] **NOT RUN** — Active read-only HTTPS/provider/DB/identity/emergency/worker probes in real staging.
- [ ] **GATE B PASS NOT MET** — Hosted staging with independent emergency and recovery evidence.

## Gate C — First real Shopify proof

### C1 — Authorized development environment
- [x] Local restricted development-store allowlist and provider gating built and tested (M2).
- [ ] **OWNER/ACCOUNT REQUIRED** — Authorized dedicated Shopify development store.
- [ ] **OWNER/ACCOUNT REQUIRED** — Dedicated Shopify app, configured version, approved minimum scopes.
- [ ] **BLOCKED** — Secure client credential/secret rotation in a staged secret mechanism.

### C2 — Real OAuth
- [x] Local OAuth state, callback binding, token encryption/lifecycle and denial tests (M2).
- [ ] **EXTERNAL UNVERIFIED** — Real authorization redirect, callback, exchange, install and revocation.
- [ ] **EXTERNAL UNVERIFIED** — Prove the token never reaches browser, agent, logs or evidence.

### C3 — Real read synchronization
- [x] Local strict persisted-state schemas, provider mapping and sync jobs (M2).
- [ ] **EXTERNAL UNVERIFIED** — Real product/variant/price/inventory/location read and canonical provenance.
- [ ] **EXTERNAL UNVERIFIED** — Rate limits, stale-result prevention, failure/retry and read-recovery against real Shopify.

### C4 — Real webhooks
- [x] Raw-body HMAC, receipt/dedupe, durable inbox, queue/reconciling/reconciled/dead-letter lifecycle tests (M2).
- [x] Local overlapping-secret and post-revocation-grace contract tests (M2).
- [ ] **EXTERNAL UNVERIFIED** — Actual registration and provider-side readback.
- [ ] **EXTERNAL UNVERIFIED** — Real Shopify delivery, HMAC, worker processing and authoritative reconciliation.
- [ ] **EXTERNAL UNVERIFIED** — Duplicate/restart/rotation/revocation behaviour against the provider.

### C5 — First guarded price mutation
- [x] Owner-only dev-store proposal, economics evidence, authorization, cancellation, preflight/read-twice, dispatch claim, receipt/readback and compensation code locally tested (M2).
- [ ] **BLOCKED** — Gate A owner authority and the staging prerequisite gate.
- [ ] **EXTERNAL UNVERIFIED** — Owner approves one real dev variant and price proposal.
- [ ] **EXTERNAL UNVERIFIED** — One mutation via the guardrail/provider path with a trustworthy external receipt and readback.

### C6–C12 — Failure fidelity and emergency
- [x] Local no-blind-resend and idempotency contracts.
- [x] Local UNKNOWN/DRIFT/FAILED states and investigation locks.
- [x] Local provider second read and stale edit pre-dispatch denial tests; residual Shopify no-CAS race remains.
- [x] Local compensation requires fresh authority and state.
- [x] Local restart safety and isolated kill denial tests.
- [ ] **EXTERNAL UNVERIFIED** — Causal proof of UNKNOWN outcome rather than matching value alone.
- [ ] **EXTERNAL UNVERIFIED** — Duplicate same-request replay causes zero additional Shopify writes.
- [ ] **EXTERNAL UNVERIFIED** — External stale owner edit causes denial without clobbering.
- [ ] **EXTERNAL UNVERIFIED** — Freshly authorized compensation and stale compensation denial.
- [ ] **EXTERNAL UNVERIFIED** — Restart/recovery proof, independent emergency denial and Shopify-side credential revocation.
- [ ] **GATE C PASS NOT MET** — Complete real closed-loop proof and evidence manifest. **No M4 promotion permitted.**

## Gate D — First real supervised commerce cycle

- [ ] D1 Provider-truth catalog/SKU/variant reconciliation and pricing/provenance.
- [ ] D2 Inventory truth, allocations/reservations, oversell and reorder policies.
- [ ] D3 Verified order lifecycle, cancellation, durable receipts and idempotency.
- [ ] D4 Real payment events, fees, settlement, disputes and reconciliation.
- [ ] D5 Carrier/fulfillment/exception state with authoritative tracking.
- [ ] D6 Return/refund states, policy checks, reimbursement and audit.
- [ ] D7 Contribution and cash reconciliation from provider financial events.
- [ ] **Gate D** — One actually observed complete supervised commerce transaction. **Must not begin before Gate C closes.**

## Feature streams S, P, multichannel, marketing, CRM, creators, financial OS

All remain `[ ]`. None has moved. Recorded as unchanged from the prior checkpoint rather than re-listed item by item; see the October 1 snapshot for the itemized form, preserved at `docs/checkpoints/HOTL_FULL_CHECKPOINT_2026-10-08_ORIGINAL.md`.

## Gate E — Evaluation and autonomy

- [ ] E1 Opportunity engine using real and traceable source signals.
- [ ] E2 Controlled experiment design and a digital twin validated against actual outcomes.
- [ ] E3 Independent shadow decision-vs-outcome evaluation over a prespecified period.
- [ ] E4 Agent tool/scope separation, delegation conflict resolution and action provenance at real provider boundaries.
- [ ] E5 Autonomy progression L0–L7 per domain based on measured error/loss and owner approval.
- [ ] E6 Fast revocation, kill/rollback, confidence gating and drift-triggered demotion in deployment.
- [ ] **Gate E** — Meets preregistered measurable safety/quality thresholds. **Eligible autonomy must be explicitly granted, never assumed.**

## Cockpit, observability and operations

- [x] Local cockpit with owner control panels, audit/activity, Shopify and readiness status (M3 scope).
- [x] Local cockpit browser drill re-run 2026-10-08: **11/11 pass** — §0.1.
- [ ] Real deployed authenticated cockpit: owner/private access, audit and session revocation.
- [ ] Production SLOs, tracing, health and alarm coverage for dependencies.
- [ ] True P&L, provider latency, cash reserve, incidents, uncertainty and autonomy evaluation surfaces.
- [ ] Disaster-recovery runbooks with externally measured recovery objectives.
- [ ] Responsive/mobile operational approval and emergency behaviour proven with production-like identity.
- [ ] ChatGPT Sites hosting: deployed as a **static, read-only** interface. Deployment succeeded; it is not an authenticated backend and proves no gate.

## The 19 staged static settings still missing

`HOTL_MODE`, `GUARDRAIL_WORKSPACE_ID`, `GUARDRAIL_DATABASE_URL`, `SUPABASE_URL`, `OWNER_USER_IDS`, `GUARDRAIL_AUTHORIZATION_VERSION`, `AGENT_JWT_KEYS`, `HOTL_PUBLIC_ORIGIN`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_WEBHOOK_ORIGIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STAGING_SHOPS`, `SHOPIFY_SCOPES`, `CONNECTOR_ENCRYPTION_KEY`, `KILL_SWITCH_URL`, `KILL_SWITCH_READ_TOKEN`, `HOTL_BACKUP_RESTORE_TARGET`, `SHOPIFY_RECONCILIATION_MODE`.

These are missing in the **recorded local shell environment**, not proven absent from every possible hosted environment. Never place actual secret values in a checkpoint file.

---

## 6. Repository governance — open owner decisions

| # | Decision | State | Why it is not applied automatically |
| --- | --- | --- | --- |
| D1 | **Rotate/revoke the exposed GitHub fine-grained PAT** | **Urgent** | Only the owner can revoke a credential. |
| D2 | **Merge PR #2** (`codex/fix-e2e-alert-selector-2026-10-08`) into `main` | Open, green, CLEAN | Changes the default branch. The equivalent fix is in this branch and verified locally. |
| D3 | **Protect `main`** — `GET /branches/main/protection` returns `404 Branch not protected` | Not applied | No required checks, review rule or force-push block. Enabling it alters the owner's merge workflow, so it is proposed, not imposed. |
| D4 | **Purge historical ZIP blobs** via history rewrite | Not attempted | Destructive and irreversible; requires owner approval. |
| D5 | **Merge or close PR #1** (`audit/hotl-checkpoint-2026-10-08`) | Open | Superseded in substance by this document. |
| D6 | **Scope the exposed PAT** and keep agent tooling credentials out of build environments | Not applied | Infrastructure change on the owner's machine. |

## 7. Next work order

1. **Owner: rotate the exposed PAT** (§0.3, D1). Highest urgency; everything else is unaffected by it.
2. **Owner: merge the CI fix to `main`** (D2) so the default branch is green again, then merge or close PR #1 (D5).
3. **Owner: decide on `main` protection** (D3).
4. **CP-01 Gate A** — owner records the real seller jurisdiction, channel/product choice, verified economics, capital/reserve, exposure and stop thresholds, and approves the current Constitution version in the authenticated cockpit. AI may recommend; only authenticated owner approval resolves authority.
5. **CP-02 Gate B** — isolated staging identity, least-privilege PostgreSQL/RLS, HTTPS origins, worker/queue, independently deployed kill plane, named backup/restore target. Require deployed denial, recovery and read-only readiness evidence.
6. **CP-03 Gate C preflight** — zero missing mandatory config, read-only active probes, signed evidence. Consequential writes stay disabled.
7. **CP-04 Gate C provider proof** — dev store, OAuth, sync, webhook, one owner-approved variant write, receipt, readback, idempotency, stale edits, compensation, restart, emergency denial.
8. **CP-05 Gate D** — only after Gate C closes and under specific owner authorization.
9. **CP-06+** — supplier/procurement → inventory/fulfillment → marketing/CRM → financial reconciliation → measured shadow → per-domain autonomy gates.

## Updating this checklist safely

For every `[ ]` → `[x]`, record **commit SHA + exact command and result + provider/runtime identifiers (sanitized) + captured evidence path + review date**. If evidence becomes invalid, return the item to `[ ]` and say why. No time-based automatic promotion. Never record a secret value, and never mark an external item complete from local evidence.

## Source anchors

- [`AGENTS.md`](../AGENTS.md) — engineering contract
- [`docs/locked-program-plan.md`](locked-program-plan.md) — authoritative roadmap and maturity model
- [`docs/program-maturity-register.md`](program-maturity-register.md) — M0–M3
- [`PROJECT_CURRENT_STATE.md`](../PROJECT_CURRENT_STATE.md) — scope limits
- [`docs/gate-a-c-owner-next-actions.md`](gate-a-c-owner-next-actions.md) — owner actions for Gates A–C
- [`evidence/supply-chain-review-2026-10-08/README.md`](../evidence/supply-chain-review-2026-10-08/README.md) — **new** credential and archive review
- [`evidence/gate-a-c-staging-provisioning-2026-10-01/README.md`](../evidence/gate-a-c-staging-provisioning-2026-10-01/README.md) and [`PREFLIGHT.json`](../evidence/gate-a-c-staging-provisioning-2026-10-01/PREFLIGHT.json) — 19 missing settings
- [`evidence/gate-c-shopify-external-2026-09-28/README.md`](../evidence/gate-c-shopify-external-2026-09-28/README.md) — external BLOCKED
- [`docs/checkpoints/HOTL_FULL_CHECKPOINT_2026-10-08_ORIGINAL.md`](checkpoints/HOTL_FULL_CHECKPOINT_2026-10-08_ORIGINAL.md) — preserved October 1 snapshot
