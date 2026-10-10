<!-- ===================================================================== -->
<!-- SUPERSEDED BANNER — prepended 2026-10-10 by the same-day reconciliation -->
<!-- session. Everything BELOW this banner is the ORIGINAL 10 Oct body, kept  -->
<!-- unaltered as historical evidence. Do not delete or "fix up" that body.   -->
<!-- ===================================================================== -->

# ⛔ SUPERSEDED — this document is not current truth

**Banner added 2026-10-10. The document body below was written earlier the same day.**

This file was written against a **stale baseline**: the 1 October source ZIP (`8ccf7b5`)
plus an 8 October user-supplied plan, because the auditor could not reach GitHub. Later on
10 October the live repository **was** reached (GitHub API and `gh`), and every headline
claim below was checked against it. Most of them did not survive.

**Authoritative current source: [`docs/FULL_PROGRAM_CHECKPOINT.md` §8](docs/FULL_PROGRAM_CHECKPOINT.md)
— "Reconciliation and repair — 2026-10-10".** §8 explicitly supersedes §§0–7 of that
checkpoint wherever they conflict. Read §8 before acting on anything in this file.

The original body is retained verbatim as the historical record of what was believed at
~01:35 on 10 October. It has deliberately **not** been rewritten. Use the correction table
below to read it correctly.

> **This banner changes no maturity level, checks no box, and moves no gate.**
> Gates A, B and C remain blocked exactly as §8.7 states.

## Claims now known to be wrong

1. **"No live October 10 GitHub HEAD verified."** — No longer true. Live state was
   retrieved on 2026-10-10; `main` is `13a74aa`.
2. **"Later reported main: `1de2ad3`."** — Superseded. `main` is `13a74aa`, **44 commits**
   past the 1 October snapshot.
3. **PR #1 open.** — PR #1 is **closed unmerged** as of 2026-10-08.
4. **CI red at `1de2ad3`, narrow browser fix "not committed/pushed"/"undelivered".** —
   Superseded. That fix **was delivered** in PR #3, merged 2026-10-08, and CI went **green**
   at `47f1032`. `main` then went **red again** at `13a74aa` for entirely different reasons.
5. **Postgres unverifiable; Docker unavailable; 26 cases skipped.** — Obsolete. Docker
   **29.5.3** is available on this machine and both SQL drills run and pass for real.
   (Remote Postgres jobs are *still* red, but for an external reason — see row R8.)
6. **Browser drill 11/11.** — Stale count. The suite is now **20/20**; settings, responsive,
   ARIA and audit-integrity specs have been added since.
7. **"`sites/` absent from the archive" / "archive is too old to contain that site".** —
   Obsolete. `sites/` is present and tracked (14 tracked files).
8. **"CI as of 10 Oct: NOT RECHECKED."** — Rechecked. `main` is **RED**: both workflows
   failed at `13a74aa`.

## Current-state correction table

| # | Claim as written (below) | Verified now | Evidence |
|---|---|---|---|
| R1 | `main` at `1de2ad3`; no live HEAD verified | `main` = **`13a74aa`**, 44 commits past `8ccf7b5` | §8.1, §8.8 · `git log --oneline -1 main`; `git rev-list --count 8ccf7b5..main` → `44` |
| R2 | PR #1 open (line 23) | **Closed, unmerged**, 2026-10-08 | §8.1 · `gh pr list --state all` |
| R3 | Browser-locator fix "not committed/pushed", "undelivered" (lines 26, 221) | **Delivered and merged** — PR #3, merged 2026-10-08T18:31:54Z | §8.2 · `gh pr list --state all` → `#3 MERGED` |
| R4 | "CI as of 10 Oct: NOT RECHECKED" (line 245) | **Rechecked.** `main` **RED** — runs `37981663106` and `37981663015` both `failure` at `13a74aa` | §8.1, §8.8 · `gh run list --branch main` |
| R5 | CI green was never obtained (line 27) | Green **was** obtained at `47f1032` (run `37825011345`), then regressed. The item is therefore *partly* satisfied and reopened at a higher SHA | §8.1 · `gh run list --branch main` |
| R6 | Browser drill **11/11** (lines 25, 198) | **20/20** | §8.1, §8.3 · `tests/e2e/` holds 7 specs (`platform`, `operating-system`, `replan`, `settings`, `responsive-overflow`, `tablist-aria`, `audit-integrity`) |
| R7 | `sites/` absent from archive (line 58) | `sites/` **present and tracked** — 14 tracked files | §8.1 · `git ls-files sites \| Measure-Object -Line` → `14` |
| R8 | Postgres/migrations unverifiable; Docker unavailable (lines 29–30) | Docker **29.5.3 available**; migration+RLS drill **PASS**, runtime-ledger drill **PASS**, locally and uncached. Remote Postgres jobs remain red for a *different* reason: **Docker Hub is unreachable from the GitHub runners** (429 / 504 / timeout on `auth.docker.io`) — external, not a defect | §8.1, §8.3, §8.6 N2/N6 |
| R9 | "CP-00C — re-fetch actual GitHub main…" `[ ] 🚨` (line 22) | **CP-00C CLOSED** | §8.1 |
| R10 | "Reconcile checkpoint PR with repaired branch…" (line 31) | PR #1 closed unmerged. **PR #4** (docs-only) and **PR #5** (repair, branch `codex/cp02-ci-red-2026-10-10`) are open; both await an owner decision | §8.6 N5, §8.8 · `gh pr list --state all` |
| R11 | "Verify whether PR #1 is open/merged" (line 23) | Verified — closed, unmerged. Separately, **PR #2 is redundant** (superseded by PR #3) and still open | §8.6 N5 · `gh pr list --state all` |
| R12 | Ledger lock release had no ownership check | **Real correctness defect, fixed** at `4d1d9ff`. The financial invariant itself was never observed violated; the fix is a strict tightening | §8.2 D-B |
| R13 | Kill-switch cross-process guard assumed proven | It **had never actually executed** in the workflow built to validate it (hardcoded pnpm-workspace `tsx` path in an `npm ci --workspaces=false` layout). Now fixed; it genuinely runs for the first time | §8.2.1 D-D |
| R14 | Owner-console Site tests assumed sound | They asserted on **built** output while `dist/` is git-ignored, so they only passed where a developer had already built. Now build-then-test; verified from a deleted `dist/`: 5 pass / 0 fail | §8.2.1 D-F |
| R15 | Repair-branch SHA | §8.8 records the repair branch at `faeceec`; it has since taken the §8 documentation commits and stood at **`02160bb`** when this banner was written. The **code** state is still `faeceec` — everything after it is documentation | `git rev-parse --short HEAD` → `02160bb` · the branch is receiving commits; re-check any SHA before relying on it |
| R16 | "Docker Hub outage means the remote Postgres/container steps simply cannot run" | Still the cause, but a **resolution is now prepared**: `auth.docker.io` answers normally off-runner, so this is rate-limiting specific to the shared GitHub runner IP pool. Digest-identical mirrors (`node:22-alpine` and `postgres:16-alpine` from `public.ecr.aws`, `gitleaks` from `ghcr.io`) are documented, and the container steps **stay in place** | §8.2.1 "Registry resolution — verified equivalent sources", §8.6 N6 |

## Still accurate — preserve and do not "correct" these

These parts of the original body were re-checked against §8 and remain sound. They are the
reason the file is still worth keeping.

- **All gate evidence rows (§§ D–N).** §8.7: *"No gate moved. Gate A remains owner-unapproved,
  Gate B externally blocked, Gate C has zero external provider evidence."*
- **The 19 missing staging settings (§F, and the full table in the audit report).** §8.6 N1
  confirms they have **never been recomputed against a real environment**.
- **The `✅ = local/simulation only` legend and the maturity scale.** §8.2 closes with the
  same discipline in stronger form: *"A green local run is not evidence of a green runner."*
- **Line 48 (🚨 hosted restore / RPO / RTO / tenant isolation).** Correctly still open. §8.3
  restored into a *separate local database* with matching state/audit MD5 — that is real
  evidence, but it is **not** a hosted restore target and carries no RPO/RTO figures. The box
  stays unchecked.
- **The cable-management NO-GO classification (§E).** Not contradicted by §8.
- **Line 20** (Oct 1 ZIP contents) and **line 47** (ledger/migration/restore *historically
  documented*) — literally true as written; §8.3 adds real local evidence but does not change
  the wording or the box.

---

# HOTL — Full Checkpoint and Missing-Feature Checklist

**As of:** 10 October 2026 · **Truth cutoff:** 1 October inspected repository ZIP + 8 October user-provided agent/working-plan report. **No live October 10 GitHub HEAD verified.**  
**Repository:** <https://github.com/nahas67/HOTL.git> · **Latest source snapshot inspected:** `8ccf7b5199e9ef9105410c1897f5b40d8e527446`. **Later reported main:** `1de2ad36793258db201aac21f04fdd48d4a0681f` (not independently verified today).  
**Companion:** `HOTL_DETAILED_AUDIT_REPORT_2026-10-10.md`.

## Read the legend before the checkbox

- ✅ `[x]` = the **specifically stated scoped result** is complete in archived source/tests or user-supplied October 8 report. A checkmark can mean *local implementation only*, **not** live commerce.
- ⬜ `[ ]` = incomplete, unavailable or not sufficiently evidenced. Never mark true because the design/plan mentions it.
- 🚨 `[ ]` = **critical missing prerequisite / blocker**.
- 🆕 `[ ]` = **newly highlighted or under-specified gap requiring an explicit plan task**; some were implicit in the locked long-term roadmap.
- 🧪 = local/simulation only; 🌐 = externally proven; 🔒 = owner/external authorization missing; 📋 = reported Oct 8, not rerun here.
- **Status maturity:** M0 absent real capability; M1 implemented; M2 locally tested; M3 local integration; M4 real external staging; M5 production; M6 shadow validated; M7 autonomy eligible. **No Shopify M4 proved.**

**Completion accounting rule:** A checked `[x]` is limited to its written wording. For example, `[x] simulation supplier workflow exists` and `[ ] actual supplier contacted` are both true. These are not contradictory.

## A. Repository, version, PR and quality gates (CP-00 / CP-02)

- [x] ✅🧪 Oct 1 source ZIP contains tracked Git history and working TypeScript monorepo; embedded HEAD `8ccf7b5` inspected.
- [x] ✅📋 Oct 8 owner-provided plan reconciled older archive vs reported `main` at `1de2ad3`.
- [ ] 🚨 **CP-00C** Re-fetch actual GitHub `main`, branches, tags, open PRs, all check runs and latest 10 Oct commit SHA; compare semantic source diff from Oct 1 and reported Oct 8.
- [ ] 🚨 Verify whether [PR #1](https://github.com/nahas67/HOTL/pull/1) is open/merged/updated and whether current CI is green on its actual latest head.
- [x] ✅📋 Browser assertion ambiguity identified in `tests/e2e/operating-system.spec.ts`.
- [x] ✅📋 Minimal validation-message-specific selector fix made locally, with 11/11 browser tests passing locally.
- [ ] 🚨 Commit/push the *correct* narrow assertion fix and verify it appears on the tested remote SHA.
- [ ] 🚨 Obtain new successful CI `validate` browser run with immutable link/SHA.
- [x] ✅📋 Lint/typecheck/unit/build reportedly passed on October 8 local worktree.
- [ ] 🚨 Run & prove migrations/RLS PostgreSQL CI job with fresh remote artifacts; do not count local skipped cases.
- [ ] 🚨 Run & prove runtime-ledger PostgreSQL CI job with fresh remote artifacts.
- [ ] ⬜ Reconcile checkpoint PR with repaired branch/current base, review, and merge only when allowed and green.
- [x] ✅🧪 Re-ran `node --test tests/staging-readiness.test.mjs` against Oct 1 ZIP here: 11/11 passed.
- [ ] ⬜ Run current full lint/typecheck/tests/build/Playwright on exact latest source SHA.
- [ ] ⬜ Attach environment versions, commands, non-overlapping test counts, skips and run IDs to evidence.
- [ ] 🆕 Add automated checkpoint freshness validation: evidence references must match current SHA and cannot silently carry stale 'PASS'.

## B. Repository security, public archives and disaster recovery (CP-01)

- [x] ✅📋 Three public ZIP snapshots and history underwent an initial heuristic review; no recognized live-secret signatures reported.
- [x] ✅📋 Simulation/ledger/checkpoint/browser state in public ZIPs identified; fake `example.com` emails distinguished from proven real customers.
- [ ] ⬜ Perform appropriately scoped credential/PII scanning across *every archive member*, current repo and relevant Git history; publish method and limitations.
- [ ] ⬜ Decide whether public simulation/audit state should remain public; owner review of non-production provenance and disclosure policy.
- [ ] ⬜ Inspect future release/upload packaging for machine paths, generated data, tokens, OAuth state, private customer information and logs.
- [ ] ⬜ Enforce release artifact allowlist and safe `.gitignore` so runtime state is not unintentionally uploaded again.
- [ ] ⬜ Rotate/revoke affected secrets and handle incident only if real exposure warrants; no arbitrary history rewrite.
- [x] ✅🧪 Local durable guardrail file state/checkpoints and separate emergency journal implemented and tested in archived source.
- [x] ✅🧪 Private PostgreSQL transactional ledger/migration/restore tests have *historically documented* local evidence.
- [ ] 🚨 Prove hosted restore into a separate target, RPO/RTO, hash/audit consistency and tenant isolation after restart.
- [ ] ⬜ Anchor/sign important audit checkpoints externally if required by planned production assurance model.
- [ ] 🆕 Build formal simulation-data retention and data-classification policy before public snapshot publication.

## C. Product UI, owner Site, settings and access (CP-03 / proposed CP-03B)

- [x] ✅🧪 Next.js local owner cockpit and simulated storefront exist.
- [x] ✅🧪 Cockpit has controls/surfaces for dashboard/activity, product/catalog, finance, approvals, policy/Constitution, autonomy domains, integrations and Shopify staging.
- [x] ✅📋 A hosted **static read-only** owner Site is reported deployed, with a `WORKSPACE` label change.
- [ ] 🚨 Verify current published Site URL and effective **owner/invitee-only access** by testing as a non-invited viewer. Link secrecy alone is insufficient.
- [ ] ⬜ Reconcile deployed Site assets with `sites/hotl-owner-console/src/assets/app.js` and tracked source/commit; archive is too old to contain that site.
- [ ] ⬜ Ensure private cockpit and optionally public storefront have separate access policies/deployments.
- [ ] 🆕 Audit EVERY application route/page/component and mark: working backed API, simulation only, disabled, placeholder, or missing.
- [ ] 🆕 Implement/test requested **vertical Settings navigation** with discoverable categories and every existing setting placed correctly.
- [ ] 🆕 Settings audit for owner/workspace, business, agents, models/MCP, policy, limits, stores, suppliers, marketing, social accounts, CRM, payment, taxation, notifications, security, integrations, backups and audit; **do not present missing features as working**.
- [ ] 🆕 Prove every exposed action has loading/error/empty states, permission checks, audit linkage, keyboard accessibility, mobile behavior and relevant E2E tests.
- [ ] ⬜ Make external operation state (`PENDING`, `UNKNOWN`, `DRIFT`, `FAILED`, etc.) and freshness visible across relevant owner panels.
- [ ] ⬜ Deploy functional authenticated HOTL cockpit to private infrastructure with verified backend read paths; do not expose mutation secrets to browsers.
- [ ] ⬜ Operator notification/alerts, real-time metrics and mobile control validated in deployed environment.

## D. Constitution, guardrails, identity and autonomy policy

- [x] ✅🧪 Versioned Business Constitution and 20 domain policy controls modeled in repository.
- [x] ✅🧪 Deterministic amount/margin/spend/refund/idempotency/authorization logic exists in guardrail engine.
- [x] ✅🧪 Local owner/agent scope, workspace binding, revocation and short-lived token contracts/tests exist.
- [x] ✅🧪 Local Pause and separate irreversible kill-latch implementation and tests exist.
- [x] ✅🧪 Guarded audit and replay behavior locally tested.
- [ ] 🚨 Actual current owner business Constitution approved with real risk values and provenance (Gate A).
- [ ] 🚨 Real hosted issuer, real role provisioning/rotation, least privilege and deployed cross-workspace denial (Gate B).
- [ ] 🚨 Truly independent deployed kill authority/reader + main-stack-down denial and separate state/credentials.
- [ ] ⬜ Provider identities, scopes, durable operation receipts and webhooks tied to the correct workspace under real provider conditions.
- [ ] ⬜ Model/agent cost ceilings and budgets proven against real inference services and retries.
- [ ] ⬜ Implement operational 20-domain autonomy with measured eligibility; presence of 20 settings does **not** mean 20 working businesses.

## E. Gate A — real business and finance authority

- [x] ✅🧪 Typed owner-entered business/risk envelope, ratio/money/fraction separation and deterministic contribution/break-even math locally tested.
- [x] ✅🧪 Owner approval UI/contracts and state invalidation rules exist locally.
- [x] ✅📋 Cable-management product research reviewed and appropriately classified **NO-GO**; no supplier quote/demand proof claimed.
- [ ] 🚨 Seller's real legal country and eligible business entity/jurisdiction owner-approved.
- [ ] 🚨 Chosen actual product/category/channel/currency and legal/tax basis owner-approved.
- [ ] 🚨 Verified product procurement price, shipping, duties, tax, packaging, fees, marketing and returns assumptions by source.
- [ ] 🚨 Real contribution margin, verified break-even CAC/ROAS, margin/discount/price floors validated.
- [ ] 🚨 Approved pilot capital, protected reserve, daily/weekly/monthly spend, advertising/supplier/inventory/refund exposure caps.
- [ ] 🚨 Owner-approved cash loss, chargeback, refund, supplier, reconciliation, inventory and other stop conditions.
- [ ] 🚨 Authenticated owner approves current envelope/Constitution digest and timestamp; stale authority invalidates.
- [ ] 🆕 Distinguish researched estimated opportunity P&L from actual settled profit in all cockpit charts and agent reports.
- [ ] 🆕 Product-specific validation sheet with provider/source URL, timestamp, supplier quote validity, compliance, contribution assumptions and owner decision.

## F. Gate B — trusted staging/deployment

- [x] ✅🧪 Static staging-readiness and opt-in active-probe logic exists in archive.
- [x] ✅🧪 Separate readiness for webhook ingress, worker and authoritative reconciliation modeled and locally tested.
- [x] ✅🧪 Oct 1 static evidence precisely recorded **19 missing** settings, `BLOCKED`, active probes `NOT_RUN`.
- [ ] 🚨 Recompute 19-item list against *actual present* environment; don't assume historical report is fresh.
- [ ] 🚨 Isolated staging workspace, live identity issuer and trusted public HTTPS owner origin.
- [ ] 🚨 Scoped secrets/app configuration, isolated PostgreSQL runtime and RLS denial.
- [ ] 🚨 Trusted OAuth callback and Shopify webhook origin, with intentional limited public exposure.
- [ ] 🚨 Real queue/worker/reconciliation processing, including dead-letter and restart recovery.
- [ ] 🚨 Independent emergency service, live reader, revocation control, failure-denial evidence.
- [ ] 🚨 Named backup/restore target and actual restore to isolated environment.
- [ ] 🚨 Opt-in active read-only probes pass; verify TLS, identity, DB privilege, RLS, routes, workers, backup and emergency independently.
- [ ] ⬜ Observability, deployment rollback, operator credential rotation and documented service runbooks.
- [ ] ⬜ Hosting/free-tier capability verification (persistent workers, outbound provider access, webhooks, secrets, compute limits); Site hosting alone cannot satisfy B.

## G. Gate C — narrow real Shopify development-store proof

- [x] ✅🧪 Shopify OAuth state/callback contracts, encrypted token lifecycle and corruption rejection exist/tested locally.
- [x] ✅🧪 Shopify read sync/observation/job path exists/tested with provider requests intercepted.
- [x] ✅🧪 HMAC webhook ingest, durable inbox and queued→reconciling→reconciled/dead-letter distinctions exist/tested locally.
- [x] ✅🧪 Finite previous-secret overlap/grace semantics locally tested.
- [x] ✅🧪 Owner-operated guarded variant price proposals, cancel-before-dispatch, two provider reads, claim, receipt and no-blind-resend logic locally tested.
- [x] ✅🧪 Local investigation and compensation workflows exist, with explicit UNKNOWN/DRIFT protections.
- [ ] 🚨 Authorized Shopify **development** store and installed dedicated app with minimum required scopes.
- [ ] 🚨 Real OAuth redirect/exchange and actual encrypted provider token storage verified externally.
- [ ] 🚨 Real authoritative product/variant/inventory sync and installation/workspace provenance.
- [ ] 🚨 Real webhook registration, signed provider delivery and successful authoritative reconciliation (not merely HTTP 2xx).
- [ ] 🚨 Exactly one currently owner-approved price proposal and provider mutation through HOTL deterministic guardrail.
- [ ] 🚨 Real receipt, post-write provider observation, independent readback, causal audit chain.
- [ ] 🚨 Replay rejection, externally edited stale variant denial and no duplicate price mutation.
- [ ] 🚨 Safe unknown-response handling, lock/investigation, restart proof and compensation evidence as appropriate.
- [ ] 🚨 Pause, independently isolated kill and credential revocation denial proved externally where safe.
- [ ] ⬜ Residual Shopify read→write external-edit race measured and disclosed; no false atomic CAS claim.
- [ ] ⬜ Only independently passed subcapabilities promoted to M4; overall Gate C stays blocked until complete.
- [ ] ⬜ Recheck official provider API version/scopes at time of actual drill; do not freeze a historical latest-version assumption.

## H. Gate D — first verified supervised sales cycle

- [x] ✅🧪 Local storefront cart/order/checkout simulation exists.
- [x] ✅🧪 Product/inventory/refund concepts and finance simulation paths exist.
- [ ] 🚨 One real customer/product lifecycle with documented legal authority and payment-provider sandbox/staging as appropriate.
- [ ] 🚨 Real payment authorization, capture and settlement, with duplicate/timeout/chargeback controls.
- [ ] 🚨 Real inventory reservation, fulfillment, shipping/tracking and exception recovery.
- [ ] 🚨 Refund/return flow, eligibility, ledger treatment, support and audit.
- [ ] 🚨 Provider-to-ledger cash/fee/tax/settlement reconciliation and actual contribution after costs.
- [ ] ⬜ Supplier/product liability, customer data, disputes and failure-drill runbooks.
- [ ] ⬜ Freeze signed/evidence-backed Gate D result before expanding autonomous spending.

## I. Supplier intelligence, procurement and communication

- [x] ✅🧪 A `sourcing_agent` role and simulated supplier stages exist.
- [ ] 🚨 Real supplier database/discovery, legal/quality validation and deduplication.
- [ ] 🚨 Verified RFQ/quote workflow with dated cost, MOQ, lead time, sample, freight, defect, returns and terms.
- [ ] 🆕 Authorized supplier mailbox/communication connector; threaded outreach, approved templates, reply recording, follow-up limits and explicit sender identity.
- [ ] 🆕 Supplier onboarding workflow, tax/legal/compliance checks, quote expiry and preferred/backup suppliers.
- [ ] ⬜ Scored supplier reliability/stock/late-delivery/refund risk based on actual outcomes.
- [ ] ⬜ Guarded purchase order + real payment authorization, caps, cancellation and idempotent provider reconciliation.
- [ ] ⬜ Supplier substitution/shortage/disruption response; no binding autonomous negotiation without permission.
- [ ] ⬜ Inventory/procurement accounting and goods-received reconciliation.

## J. Organic marketing, social media, advertising and growth

- [x] ✅🧪 Marketing-agent role and local simulated campaign drafting path exist.
- [ ] 🚨 Product-specific trends + source freshness + uncertainty + competitive research into measured opportunities.
- [ ] 🆕 Content strategy, reusable brand voice, asset QC, copyright/compliance checks, approval pipeline.
- [ ] 🆕 **Real organic social publishing** through official authorized APIs for selected platforms, proof of publish ID, scheduled jobs, retries, rate limits and takedowns.
- [ ] 🆕 Per-platform account authorization, disclosure rules, credentials/refresh and explicit public-post scope.
- [ ] ⬜ Organic reach/engagement/conversion data and attribution validation; no invented metrics.
- [ ] ⬜ Experiment design, campaign variants, guardrails, measurement and reproducible learning.
- [ ] 🚨 Paid ad-platform integration(s), approved budgets, campaign creation, spend ledger and stop/kill enforcement.
- [ ] 🚨 Paid ads reconciliation, ROAS/contribution after real costs, adverse-spend detection and attribution uncertainty.
- [ ] ⬜ SEO, creator/affiliate programs, compliant lead generation, referral/retention experiments.

## K. Customer relations, CRM, support and communication

- [x] ✅🧪 `support_agent` and simulated support tickets/interrupts exist.
- [ ] 🚨 Real authorized customer-support inbox (email/business messaging/helpdesk); send/receive, threading and provider receipts.
- [ ] 🆕 Consent-aware customer messaging, privacy protection, template rules, unsubscribe/opt-out, contact frequency limits and regional retention.
- [ ] 🆕 Customer complaint detection, triage, escalation and human takeover SLA.
- [ ] ⬜ Actual order/shipping/refund lookup permission and safe personalized replies; no unsupported delivery promises.
- [ ] ⬜ Verified customer profile memory, customer support history, dedupe and controlled personalization.
- [ ] ⬜ Returns/RMA, dispute handling, fraud controls and chargeback workflows connected to provider systems.
- [ ] ⬜ CSAT/response latency/first-resolution metrics from real events and privacy/audit evidence.

## L. Finance, tax, platform reach and corporate operations

- [x] ✅🧪 Local money calculations, state ledger, risk and simulated finance dashboard exist.
- [ ] 🚨 Double-entry or adequately reconciled financial bookkeeping for actual sales, settlements, cash and fees.
- [ ] 🚨 Refund/chargeback accounting, reserve tracking, disputed funds and settlement timing.
- [ ] ⬜ Tax assessment, invoice/receipts, filing-ready records and professional review boundaries by jurisdiction.
- [ ] ⬜ Multi-currency FX rate/provenance, realized FX, balances and cross-channel fees.
- [ ] ⬜ Real demand/inventory forecasting with uncertainty and provider observation freshness.
- [ ] ⬜ Multi-store/marketplace channel reconciliation with cross-channel inventory, prices and orders.
- [ ] ⬜ Organization/operator RBAC, separation of duties and multi-tenant access audits.
- [ ] ⬜ Revenue-quality, profitability and cash-runway reports sourced from **settled actuals**, not estimates.

## M. Hermes / external-operations agent integration (CP-09)

- [ ] 🆕 Inspect `NousResearch/hermes-agent` source, license, recent maintenance, compatible SDK/MCP patterns and deployment/security footprint before inclusion.
- [ ] 🆕 Define isolated Hermes adapter; strict tools for supplier research, drafts, communication, customer service and organic content creation.
- [ ] 🆕 Deny-by-default permission/scopes: agent never receives Shopify write tokens, payment credentials or unrestricted terminal/provider access.
- [ ] 🆕 Prompt-injection-resistant treatment of supplier web pages, inbound emails, user-generated content and attachments; separate trusted instructions from data.
- [ ] 🆕 Simulate RFQ drafts, customer reply drafts and marketing calendars, with audit and owner review.
- [ ] 🆕 Integrate permitted official outbound email/customer channels, sender authorization, volume/anti-spam rules and immutable send receipts.
- [ ] 🆕 Integrate permitted official organic publishing accounts with explicit approval and read-back of publication IDs.
- [ ] ⬜ Audit memory retention, tenant isolation, personally identifiable information, replay safety, cost budgets and kill propagation for Hermes subagents.
- [ ] ⬜ Demonstrate reliability/shadow outcomes before any external unattended send; separate organic posting from paid advertising.

## N. Gate E: agents, evaluation, learning and measured autonomy

- [x] ✅🧪 Local graph orchestration, checkpoints, activity and domain autonomy configuration exist.
- [ ] 🚨 Real measured shadow performance against approved baseline and preregistered loss/error/incident limits.
- [ ] ⬜ Agent evaluations by domain: task completion, refusal correctness, false approvals, drift, provider failures and monetary impact.
- [ ] ⬜ Full specialist roles under explicit orchestration contracts; conflicts, provenance and tool budgets traced.
- [ ] ⬜ Durable product/supplier/market/customer knowledge with provenance, access controls and staleness policies.
- [ ] ⬜ Continuous learning/feedback from real observations with retraining/review gates; not just LangGraph checkpoints.
- [ ] ⬜ Digital twin/experiment engine with assumptions separated from observed causal outcomes.
- [ ] ⬜ Level-by-level domain autonomy eligibility approved by owner; no general autonomous-company label without evidence.
- [ ] ⬜ Live incident response, on-call, capability revocation and change-management review.

## O. Master checkpoint freeze (CP-08) and plan changes

- [x] ✅ The previous working plan explicitly prioritized CI before external gates; the October 8 research marked candidate NO-GO and external blockers.
- [ ] 🚨 Verify latest GitHub source and PR/Actions before any **October 10** completion claim.
- [ ] ⬜ Commit/freeze evidence package per completed checkpoint with SHA, dates, exact tests/skip counts and secrets review.
- [ ] ⬜ Reconcile `docs/MASTER_CHECKPOINT_2026-10-08.md` with actual main and the present program maturity register.
- [ ] ⬜ Distinguish `CODE`, `LOCAL`, `REMOTE_CI`, `EXTERNAL`, `PRODUCTION`, `OWNER_APPROVED` statuses in ongoing checkpoint automation.
- [ ] 🆕 Add CP-00C (remote freshness), CP-03B (vertical Settings/feature-to-route verification), and CP-04C (binding supplier quote/product-level demand proof).
- [ ] 🆕 Add consent/privacy/outbound receipts/opt-out and per-platform official publishing acceptance to Hermes H1–H3.
- [ ] 🆕 Add Site owner-access denial, source/deployment parity and separate public storefront risk controls.
- [ ] 🆕 Add immutable provider evidence and settled actual-finance criteria for every real Gate D channel.
- [ ] ⬜ Only open Gate D after actual Gate C evidence and requisite new owner authorization.

## Immediate safe action order

1. **P0:** Get current GitHub HEAD and remote CI; do not assume October 8 status persists.
2. **P0:** Apply/push the narrow browser-test fix to an approved branch and get both required PostgreSQL jobs green.
3. **P1:** Confirm private owner Site access, reconcile deployed source; complete archive release classification.
4. **P1:** UI/settings parity inventory with all nonworking controls explicitly labeled; don't rebuild existing functional pages.
5. **Gate A:** Owner-approved real business/product/risk envelope. Research can help; AI may not approve.
6. **Gate B:** Provision the isolated environment, resolve genuine preflight findings, run active read-only probes.
7. **Gate C:** One owner-operated authorized Shopify development-store roundtrip; record provider receipts, uncertain effects and kill safeguards.
8. **Separate non-blocking stream:** Hermes adapter simulation and safe communication design; no real send/post without authorization.
9. **Later:** Gate D, complete supplier/customer/organic/ads/finance subsystems, then shadow-measured domain autonomy.

## Last audit decision

**Core HOTL local prototype:** substantively implemented. **Complete real autonomous commerce business:** **NO**. **External Shopify:** **NOT VERIFIED**. **Owner financial authority:** **MISSING**. **Production backend:** **UNVERIFIED**. **CI as of 10 Oct:** **NOT RECHECKED**. **Hermes:** **PLANNED**. **Real supplier/customer communication, organic posting and paid ads:** **NOT PROVEN**.

**Do not let new feature development, hosted UI or a green local suite override these boundaries.**
