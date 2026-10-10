<!-- ===================================================================== -->
<!-- SUPERSEDED BANNER — prepended 2026-10-10 by the same-day reconciliation -->
<!-- session. Everything BELOW this banner is the ORIGINAL 10 Oct body, kept  -->
<!-- unaltered as historical evidence. Do not delete or "fix up" that body.   -->
<!-- ===================================================================== -->

# ⛔ SUPERSEDED — this plan no longer describes the live starting position

**Banner added 2026-10-10. The plan body below was written earlier the same day.**

This plan was written with one instruction at the top — *"Live GitHub on Oct 10: UNVERIFIED;
first step must refresh HEAD"* — and it correctly built CP-00C around that. **CP-00C was
executed later the same day** and came back with facts that change this plan's premises,
its sequencing and its diagnosis of CP-02. The plan has not been re-sequenced here; the
banner tells you where it diverges.

**Authoritative current source: [`docs/FULL_PROGRAM_CHECKPOINT.md` §8](docs/FULL_PROGRAM_CHECKPOINT.md)
— "Reconciliation and repair — 2026-10-10".** §8 explicitly supersedes §§0–7 of that
checkpoint wherever they conflict. Read §8 before executing anything in this plan.

The original body is retained verbatim as the historical record of the 10 October plan.
It has deliberately **not** been rewritten.

> **This banner changes no maturity level, checks no box, and moves no gate.**
> CP-05 / CP-06 / CP-07 (Gates A / B / C) remain exactly as written: **blocked**.

## Claims now known to be wrong

1. **"Live GitHub on Oct 10: UNVERIFIED; first step must refresh HEAD."** — Done. `main` is
   `13a74aa`, 44 commits past the 1 October snapshot.
2. **CP-00C `[ ] 🚨 first`.** — **CP-00C is CLOSED** (§8.1). This plan's literal first action
   has already happened.
3. **CP-02's diagnosis.** — The plan attributes the red CI to the browser alert locator. That
   cause **was** fixed and merged (PR #3, green at `47f1032`); `main` then went red again at
   `13a74aa` for different reasons — a kill-switch journal race, plus an external Docker Hub
   outage.
4. **"26 PostgreSQL cases skipped due to unavailable local Docker" / "distinguish genuine
   infrastructure blockers from test failures."** — Docker **29.5.3** is available on this
   machine and both SQL drills pass. The genuine infrastructure blocker is a *different*
   one, and it lives on the runners, not locally.
5. **"Browser drill 11/11."** — Stale count. The suite is **20/20**.

## Current-state correction table

| # | Claim as written (below) | Verified now | Evidence |
|---|---|---|---|
| R1 | "Live GitHub on Oct 10: UNVERIFIED" (header) | Verified 2026-10-10. `main` = **`13a74aa`**, 44 commits past `8ccf7b5` | §8.1 · `git log --oneline -1 main`; `git rev-list --count 8ccf7b5..main` → `44` |
| R2 | CP-00C — `[ ] 🚨 first` | **CP-00C CLOSED** | §8.1 |
| R3 | CP-00C step 2 — "compare with reported `1de2ad3`, do not reset to that SHA" | Executed, and `1de2ad3` is obsolete — `main` moved on to `13a74aa` | §8.1 |
| R4 | CP-00C step 3 — "identify whether the local selector fix has been pushed, PR red/green today" | Push **did** happen, via **PR #3**, merged 2026-10-08T18:31:54Z. PR #1 itself is **closed unmerged** | §8.1, §8.2 · `gh pr list --state all` |
| R5 | CP-02 — `[ ] 🚨 P0`, cause = browser locator + skipped DB | **Still P0, still open — different cause.** Locator fixed by PR #3; remaining red = kill-switch journal IPC race (D-A, fixed `4d1d9ff`) and an external Docker Hub outage (N6). Four further defects were unmasked behind them (`3147a97`…`faeceec`) | §8.2, §8.2.1, §8.6 N6 |
| R6 | CP-02 step 4 — "distinguish genuine infrastructure blockers from test failures" | **Already needed, and now answered.** Docker Hub is unreachable from the GitHub runners (429 → 504 → timeout on `auth.docker.io`). External infrastructure, not a defect. The container steps were deliberately **left in place** — removing them would drop the checks the workflows exist to perform | §8.6 N6 |
| R7 | CP-02 step 5 — "fresh remote checks for browser and both PostgreSQL jobs" | Locally: **all green, forced uncached** — lint, typecheck 11/11, tests 11/11 tasks, root tests 22, build, browser 20/20, plus **both** SQL drills passing. Remotely: every non-container step green on the repair branch; the three container steps cannot run | §8.3, §8.8 |
| R8 | CP-02 step 6 — "reconcile/open checkpoint PR #1, then merge only under owner's permissions" | PR #1 is **closed unmerged** and superseded. **PR #4** (docs-only, open) and **PR #5** (repair, open at `bf3cda0`, awaiting required `validate`) await an owner decision. **PR #2 is redundant** (superseded by PR #3) and still open | §8.6 N5, §8.8 · `gh pr list --state all` |
| R9 | CP-02 step 7 — "if no remote CI access, remain BLOCKED / REMOTE UNVERIFIED" | Superseded — remote access exists. The blocker is now the container registry, and it is recorded as a blocker rather than removed from the pipeline | §8.1, §8.6 N6 |
| R10 | Browser drill 11/11 (implied by CP-02 step 3) | **20/20** | §8.1, §8.3 · `tests/e2e/` holds 7 specs (`platform`, `operating-system`, `replan`, `settings`, `responsive-overflow`, `tablist-aria`, `audit-integrity`) |
| R11 | "Refresh archived 19 missing settings from actual current config" (Gate B step 5) | **Still outstanding, and now sharper.** §8.6 N1: the 19 have **never been recomputed** against a real provisioned environment — the record describes a local shell, not a staging host | §8.6 N1, §8.9 |
| R12 | Exit instruction — "Begin at CP-00C, then CP-02" | CP-00C is done. Current order per §8.9: **CP-02 close-out** (re-run both workflows once Docker Hub recovers; merge PR #5 under owner authority; **do not merge while any container step is red**) → CP-03B → N1 → N7 → Gate A on the owner | §8.9 |
| R13 | Repair-branch baseline for any future work | §8.8 records `faeceec`; the branch has since taken documentation commits and stood at **`02160bb`** when this banner was written. **Code** state is still `faeceec`. `main` remains **`13a74aa`** and **RED** | `git rev-parse --short HEAD` → `02160bb`; `git rev-parse --short main` → `13a74aa` · branch is receiving commits — re-check before trusting any SHA |
| R14 | CP-02 step 4 leaves "genuine infrastructure blockers" to be distinguished later | Already answered. The blocker is **not** Docker (29.5.3 works locally) but the **runners'** rate-limited path to `auth.docker.io`. §8.2.1 now documents **digest-verified** mirrors (`public.ecr.aws` for `node`/`postgres`, `ghcr.io` for `gitleaks`); the steps stay in place and bounded retries may never convert a failure into a pass | §8.2.1 "Registry resolution", §8.6 N6 · `docker version` → `29.5.3` |

## Still accurate — preserve and do not "correct" these

Re-checked against §8 and **unchanged**. Executing these as written remains correct.

- **CP-01 `[x] initial review; [ ] closure`** — still correct, and still open. The gitleaks
  credential scan has not run since the repairs landed, and the exposed PAT named in D1 must
  still be treated as disclosed (§8.6 N8).
- **CP-03 and CP-03B** — both still `[ ]`, correctly. CP-03B has **not** been done: the
  browser drill covers the settings page *layout*, but no per-control classification of
  working / simulated / disabled yet exists (§8.9 item 2).
- **CP-04 `[x] completed research, not approval`** and **CP-04C `[ ]`** — correct. The
  cable-management NO-GO stands and no agent may promote it.
- **CP-05 / CP-06 / CP-07 — Gates A / B / C `[ ] 🚨`** — §8.7: *"No gate moved. Gate A remains
  owner-unapproved, Gate B externally blocked, Gate C has zero external provider evidence."*
  **This banner changes none of that.**
- **The CP-09 / Hermes H0–H5 lane** — still deferred, unstarted, still correctly confined to
  read-only research and local simulation.
- **The Contract, Evidence rule and Change Register Δ01–Δ16** — still sound as a discipline.
  One nuance: Δ01 asks for CP-00C as a *recurring* gate; §8.1 closes the **2026-10-10
  instance** of it. The recurring automation is not implemented and is not claimed to be.
- **CP-10 Gate D / Gate E deferred** — unchanged.

---

# HOTL — Revised Dependency-Ordered Working Plan (V2)

**Version:** 2026-10-10, **proposed change set**, not executed.  
**Sources:** inspected Oct 1 `8ccf7b5` archive, Oct 8 owner-provided next-working-plan and replay, prior `HOTL_MASTER_WORKING_PLAN_2026-10-08.md`.  
**Live GitHub on Oct 10:** **UNVERIFIED**; first step must refresh HEAD.  
**Related artifacts:** `HOTL_DETAILED_AUDIT_REPORT_2026-10-10.md`, `HOTL_FULL_CHECKPOINT_2026-10-10.md`.

## Contract

Execute only after reviewing actual checkout + `AGENTS.md`, locked plan, current plan, and tests. Each checkpoint runs **Inspect → Plan → Implement → Test → Evidence → Review → Checkmark → Next**. Mark exactly the completed scope; independent technical work may continue while external/owner gates remain blocked, but dependent consequential operations must never run without their authority.

Use no real provider purchase/refund, message, public post, advertising spend or price write without current owner approval and deterministic guarded authority. GitHub write/merge/push only if permitted in the working environment. Preserve history, business simulation state and audit journals; no delete/force-push shortcut.

### Evidence rule

For each checkpoint record **source SHA, branch, diff, test commands, pass/fail/skip/unrun, remote CI run IDs, provider receipts if applicable, approval digest, limitation, next blocker**. Keep independently verified source state distinct from reported agent work.

## Primary lane — release truth and current gates

| ID | Phase | Required proof | Current state |
|---|---|---|---|
| **CP-00C (NEW)** | Refresh source and PR reality | Fetch authenticated remote refs, compare latest HEAD to Oct 1 and reported Oct 8; inspect current PR #1/check runs | **[ ] 🚨 first** |
| **CP-01** | Public ZIP/secret/PII disposition | Heuristic review recorded; finish content scanner, classification and release policy; preserve history | **[x] initial review; [ ] closure** |
| **CP-02** | Get remote CI truly green | Fix narrow browser locator on actual branch; build/test; **remote browser + migration/RLS + runtime-ledger** pass | **[ ] 🚨 P0** |
| **CP-03** | Validate private read-only Site | Non-invited access denied, static read-only scope, deployed source matches repo, no secrets exposed | **[ ] P1** |
| **CP-03B (NEW)** | UI/Settings completeness matrix | Vertical settings, every visible route/control classified and correctly backed or disabled, accessibility/E2E coverage | **[ ] P1** |
| **CP-04** | Pilot candidate research | Oct8 cable-management NO-GO findings preserved with provenance | **[x] completed research, not approval** |
| **CP-04C (NEW)** | Verified product economics and supplier shortlist | Product demand, binding quote/expiry, landed cost, return and legal facts | **[ ]** |
| **CP-05** | Gate A owner business/risk approval | Authenticated current Constitution digest; product, jurisdiction, true costs, caps, stops approved | **[ ] 🚨 owner blocker** |
| **CP-06** | Gate B external staging | HTTPS, hosted identity, DB/RLS/recovery, webhook worker, independent emergency, 0 real static gaps + active tests | **[ ] 🚨 external blocker** |
| **CP-07** | Gate C first real Shopify proof | One approved dev-store OAuth → read → signed webhook → guarded price → receipt/readback → replay/denial/compensation | **[ ] 🚨 no M4 yet** |
| **CP-08** | Freeze reviewed maturity/evidence | Commit/propose sanitized checkpoint, update maturity based only on proof | **[ ]** |

### CP-00C — first action (new)

1. Inspect fresh Git status/log/remotes, current `main`, PR #1, action suite definitions and changed files since Oct 1.
2. Compare with reported `1de2ad36793258db201aac21f04fdd48d4a0681f`, preserving any newer work; do not reset to that SHA.
3. Identify whether local selector fix has been pushed, PR red/green today and exact PostgreSQL job status.
4. Create reproducible diff summary; update checkpoint statuses **before** coding.

### CP-02 — remote CI hard gate

1. Reproduce failing alert case or confirm it is fixed in current source.
2. Use semantics/accessible locator tied to the validation message; never water down assertion.
3. Run full local lint/typecheck/tests/build/Playwright, capture source SHA, test counts and skipped cases.
4. Inspect and repair `.github/workflows/ci.yml` if tests/jobs are excluded, unavailable or skipped incorrectly. Distinguish genuine infrastructure blockers from test failures.
5. Push in focused scoped CI-fix PR, obtain fresh remote checks for **browser and both PostgreSQL jobs**.
6. Reconcile/open checkpoint PR #1, then merge only under owner's repository permissions and required green checks.
7. If no remote CI access, remain `BLOCKED / REMOTE UNVERIFIED` and continue only independent safe work.

### CP-03 & CP-03B — UI and Sites

1. Test effective private owner/invitee permissions. Check read-only Site is not accidentally serving authenticated write functions or private simulation data to link holders.
2. Align deployed `WORKSPACE` view with source-controlled Site mirror and deployment version.
3. Inventory every nav route and every setting, especially requested **vertical Settings**. For each: user role, server route, validation, data freshness, mutation type, audit, E2E, responsive/mobile, and whether functional/simulated/disabled.
4. Fix true UI-to-backend mismatches in vertical slices; do not create ornamental unsupported panels. No changes to financial authority.

### CP-04C & Gate A

1. Maintain `NO-GO` for cable-management example until fresh demand and landed-cost proof materially changes assessment.
2. Research product shortlists (no assumption of seller country). Separate published listings from supplier-verified binding quotes.
3. Owner selects jurisdiction, legal entity, product, currency, acceptable risk and capital envelope. Record provenance and deterministic calculations.
4. Obtain authenticated owner approval in HOTL UI. Invalidation tests must reject stale cost/product/Constitution values.

### Gate B — infrastructure and secure preflight

1. Provision dedicated staging workspace/identity and secret store; no demo credentials.
2. Real least-privilege Postgres with RLS, restore target and denied cross-tenant queries.
3. Trusted stable HTTPS owner callback and webhook routes.
4. Durable inbox/worker/reconciliation plus separately deployed independent kill reader/latch.
5. Refresh archived 19 missing settings from **actual current config**; static tests must not be relaxed.
6. Run active read-only probes, backup/restore, emergency failure and denied authorization checks.

### Gate C — after A and B, one narrow price operation

Perform real OAuth, read sync, signed webhook and one carefully authorized dev-store variant-price change through the existing deterministic guardrail. Preserve no-blind-resend, durable claim, `UNKNOWN`/`DRIFT`, authority freshness, read-back and audit. Test replay, stale merchant edit, pause, independent kill, safe compensation/recovery. Keep autonomous and ordinary-store writes disabled. Promote only individually externally evidenced functions to M4. No real provider proof means Gate C remains blocked.

## Secondary separate lane — communication, marketing and Hermes (CP-09)

This may start in **read-only research/local simulation** after CI work is not being compromised; it does **not** unblock Gate A/B/C.

| Subphase | Required capability and invariant | Current |
|---|---|---|
| H0 | Deep inspect Hermes source and compare with LangGraph/MCP, license/maintenance/security; deny-by-default tool adapter | [ ] 🆕 |
| H1 | Supplier research, verification, quote ingestion, RFQ drafts, consentful business email with approved sending and immutable receipt | [ ] 🆕 |
| H2 | Customer mail/support inbox, authorization/consent, contextual drafts, threading, human escalation and privacy retention | [ ] 🆕 |
| H3 | Organic content research/creation, authorized official platform publishers, publication receipts and engagement reconciliation | [ ] 🆕 |
| H4 | Paid ads connectors, authorized campaign/budget writes, real spend/reconciliation and deterministic kill | [ ] deferred |
| H5 | Shadow metrics: send failure, complaints/opt-outs, false claims, supplier response quality, campaign effects | [ ] 🆕 |

**No browser-cookie posting bypasses; no automatic customer/supplier unsolicited bulk outreach; no agent has an unrestricted Shopify/payment token.**

## Future dependent stream — real commercial OS (CP-10)

Gate D is a single real supervised commerce cycle: product/quote → order → payment/settlement → inventory/fulfillment/tracking → refund/return → actual fees/tax/cash/profit reconciliation. Extend only one validated domain at a time, preserving authorization, receipts, idempotency and emergency controls. Gate E requires preregistered shadow performance and incident/loss metrics before domain-by-domain autonomy.

## Proposed plan change register (not applied to GitHub)

- **Δ01** Add CP-00C live Git freshness and source diff.
- **Δ02** Separate code/local/remote/external/owner evidence states.
- **Δ03** Make browser + two PostgreSQL CI steps remote-PASS a blocking CP-02 criterion.
- **Δ04** Extend archive review to disclosure/data-classification/release packaging.
- **Δ05** Add CP-03B complete functional cockpit and vertical Settings acceptance.
- **Δ06** Independently verify private owner Site permissions and source/deployment parity.
- **Δ07** Add CP-04C actual supplier quotes and product-specific demand evidence.
- **Δ08** Preserve A→B→C authority sequencing while allowing independent safe tasks.
- **Δ09** Expand Hermes H0–H5 with explicit channel-level capabilities.
- **Δ10** Add outbound consent, opt-outs, audit receipts, privacy and escalation.
- **Δ11** Require official API publishing evidence, not browser automation appearance.
- **Δ12** Require settled real finance evidence before profitability reports.
- **Δ13** Track supplier, customer, marketing, ads, inventory, finance, evaluation separately.
- **Δ14** Distinguish private Site/cockpit, public storefront, protected externally reachable callbacks.
- **Δ15** Reverify provider API versions/permissions at real integration date.
- **Δ16** Freeze review/evidence at every checkpoint instead of final-only.

## Exit and next action

**Begin at CP-00C, then CP-02.** Do not mark the program complete because the Site is deployed, local tests are green or code exists for twenty autonomy domains. Write the next checkpoint report after each finished phase and only check boxes backed by appropriate evidence. Owner/legal/external infrastructure blockers stay visibly unchecked.
