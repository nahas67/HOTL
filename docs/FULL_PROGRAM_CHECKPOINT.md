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
| Root tests | `node --test tests/*.test.mjs` | **PASS** — 12/12 (`test-root.log`) |
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

### 0.6.14 Open, deferred

Recorded so the register is complete. None is claimed as done.

- `checkout()`/`commerceEvent()` bypass `scope()` and `context()` — no engine-level scope or constitution-version binding (HTTP reachability is currently limited to `order_agent`).
- Idempotency keys share one flat namespace and denials consume them.
- Replayed historical `allow` is returned with no `replayed` marker.
- `telemetry()` serves fabricated margin/chart with no provenance marker.
- Webhook intake is bound to the app secret but not to an installation (cross-installation replay verified). The installation-bound MAC design was approved — there are no live subscriptions, so the breaking-change cost is zero today — but not implemented.
- Orchestrator: stale `interruptId`, refund-policy reimplementation that has drifted from the guardrail, owner binding on read/resume, and the rule-1 "model output can never enter an authorization body" sentinel test.
- `decision: 'unknown'` still crosses the HTTP boundary as **200 / `ok: true`**, so a lost provider response reads as success at the transport level even though the body is honest.
- Shopify: readiness endpoint overstates ingress/reconciliation state; empty-extension loss is silently accepted; attempts-exhausted path now clears its claim.
- `apps/storefront` origin/CSRF check has no test, and derives its expected origin from the request's own `Host` header when unconfigured.

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
