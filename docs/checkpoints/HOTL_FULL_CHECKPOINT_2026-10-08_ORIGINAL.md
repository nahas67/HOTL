# HOTL — Full Program Checkpoint and Evidence Register

**Prepared:** 2026-10-08  
**Repository requested:** https://github.com/nahas67/HOTL  
**Verified source available:** user-provided `HOTL-updated-share-2026-10-01.zip`; Git HEAD inside archive `8ccf7b5199e9ef9105410c1897f5b40d8e527446` on `codex/gate-c-preflight-hardening`.  
**CRITICAL:** The live GitHub repository could not be accessed in this audit. This is a **2026-10-01 snapshot checkpoint**, not a verified assessment of remote HEAD on October 8, and has **not been committed to GitHub**. Recheck changes since this SHA before using it as the official master register.

## Legend and evidence policy

- `[x]` = implemented and verified at the **specified scope** in the October 1 archive/evidence. It does **not** imply production capability.
- `[ ]` = incomplete, blocked, deferred, or lacks qualifying evidence. Descriptive tags distinguish these states.
- **M0** not implemented; **M1** implemented; **M2** local verified; **M3** integration verified; **M4** external staging verified; **M5** production verified; **M6** shadow validated; **M7** autonomy eligible.
- An unrun live test never becomes `[x]` because corresponding code, fixture or unit tests exist. Do not mark checkboxes complete automatically from written claims; cite actual run artefacts and commit.

## Executive gate summary

| Gate | Local engineering | Required gate result | Current disposition |
|---|---|---|---|
| A — Business and risk envelope | Typed models, cockpit editing, deterministic economics verified locally | Actual owner-approved business/risk envelope | **BLOCKED: owner values/approval missing** |
| B — Trusted execution foundation | Strong local source/recovery/identity evidence | Isolated hosted identity, DB, worker, emergency service, restore proof | **PARTIAL: hosted staging blocked** |
| C — First real Shopify proof | OAuth, sync, webhooks, owner-only price and fail-closed paths verified locally | Provider-backed dev-store E2E, audit, retries, emergency proof | **BLOCKED: no external Shopify evidence** |
| D — Real supervised commerce | Demo/local concepts only | Live reconciled order/payment/fulfillment/refund cycle | **NOT STARTED** |
| E — Measured autonomy | Configuration/controls locally exist | Measured shadow outcomes and independent domain eligibility gates | **NOT STARTED** |

## 0. Source and verification baseline

- [x] Baseline Git repository and source history exist in October 1 archive; branch commit recorded above. Evidence: `.git`, `evidence/gate-b1-source-control/README.md`.
- [x] Original locked plan preserved: `docs/locked-program-plan.md`.
- [x] Local owner cockpit and demo storefront integrated (M3). Evidence: `PROJECT_CURRENT_STATE.md`, `docs/program-maturity-register.md`.
- [x] Local guarded architecture: guardrail + orchestrator + commerce gateway + kill service (M3 where documented).
- [x] 2026-10-01 reported lint, typecheck (11 tasks), workspace tests, build (8 tasks), browser (11) passed. **Source-recorded, not rerun in this checkpoint.**
- [x] 2026-10-01 reported 33 disposable Docker PostgreSQL cases, restart, backup/restore and restored RLS/grant checks passed. **Source-recorded.**
- [x] 2026-10-01 11 staging-readiness tests and seven focused cockpit tests reported passed.
- [ ] **REMOTE UNVERIFIED** — Fetch latest GitHub default branch, branches, open PRs, CI, issues and compare with `8ccf7b5`. Current-remote statements require renewed verification.
- [ ] **NOT RUN** — Independently rerun full test suites at current remote commit and collect immutable CI/run IDs.
- [ ] **NOT VERIFIED** — Verify any ChatGPT Sites, hosted preview, or external app deployment, private access policy, URL, and authentication with runtime evidence.

## Gate A — Owner business and financial authority

### A1 — Pilot business definition
- [x] Local pilot schema, cockpit editor and versioned review/approval mechanism exist (M2).
- [ ] **OWNER REQUIRED** — Approved legal seller jurisdiction and markets.
- [ ] **OWNER REQUIRED** — Approved pilot category, product/SKU, customer profile and selling channel.
- [ ] **OWNER REQUIRED** — Approved fulfillment/supplier model, returns policy, currency and target AOV.
- [ ] **OWNER REQUIRED** — Authenticated owner approval of current business version/digest.

### A2 — Economics
- [x] Typed money/ratio/fraction schemas and deterministic contribution/break-even CAC/ROAS formula/version checks exist (M2).
- [x] Calculated field inconsistency can block approval in local tests.
- [ ] **OWNER/SOURCE REQUIRED** — Evidence-backed supplier/product, landed shipping, packing, payment/platform fees, fulfillment, refunds, returns and tax treatment.
- [ ] **OWNER REQUIRED** — Approved margin floor, allowed price limits and break-even thresholds for the actual SKU.
- [ ] **EXTERNAL UNVERIFIED** — Reconcile real observed charges against expected costs before real-money autonomy.

### A3 — Financial envelope
- [x] Local guardrail and versioned risk-envelope models enforce proposed caps in simulation/test paths (M2/M3).
- [ ] **OWNER REQUIRED** — Pilot capital, protected reserve and deployable balance.
- [ ] **OWNER REQUIRED** — Daily/weekly/monthly caps and per-action authorization ceiling.
- [ ] **OWNER REQUIRED** — Supplier, inventory, ad-spend, experiment-loss and refund caps.

### A4 — Business stops
- [x] Local pause, stop policies and independent kill latch implemented/tested.
- [ ] **OWNER REQUIRED** — Approved loss, contribution, refund, chargeback, supplier SLA, inventory and attribution stop thresholds.
- [ ] **EXTERNAL UNVERIFIED** — Confirm policy revisions invalidate stale plans under actual hosted identity.
- [ ] **GATE A PASS NOT MET** — Owner-signed approved business/economics/risk package, with UNKNOWNs resolved where required.

## Gate B — Trusted execution foundation

### B1 — Baseline and secrets
- [x] Source-control baseline exists; previous repository lacked it but was corrected.
- [x] Source-recorded changed-file secret scan found no non-example credentials.
- [ ] **VERIFY REMOTE** — Current branch rules, review/CI evidence, secret scanning and source-state cleanliness.

### B2 — Durability and restore
- [x] Local durable financial state, audit, idempotency and replay controls (M3).
- [x] Native/isolated PostgreSQL runtime and recovery tests evidenced locally; October 1 Docker drill reported successful.
- [ ] **HOSTED UNVERIFIED** — Staging PostgreSQL credentials, continuous durability and automatic backup.
- [ ] **HOSTED UNVERIFIED** — Restore staging backup into separate target, reconcile audit/receipts/RLS and recovery objectives.
- [ ] **HOSTED UNVERIFIED** — Cross-process/zone outage and recovery with no duplicate provider effects.

### B3 — Identity and access
- [x] Local owner/agent JWT, scopes, workspace binding and revocation contracts integrated (M3).
- [x] Local readiness probes check effective runtime SQL privileges and DDL/role/ownership conditions.
- [ ] **HOSTED UNVERIFIED** — Actual identity issuer, owner allowlist, agent key rotation and runtime revocation.
- [ ] **HOSTED UNVERIFIED** — Real PostgreSQL user has no elevated/RLS-bypass/DDL privileges; tenant denial tested against deployed DB.
- [ ] **HOSTED UNVERIFIED** — Private cockpit access and backend authorization demonstrated (link-only secrecy is insufficient).

### B4 — Supporting staging infrastructure
- [x] Staging readiness endpoint/checklist, static configuration and optional read-only probe framework locally tested.
- [x] Worker readiness separates ingress, worker and reconciliation concepts.
- [ ] **BLOCKED** — Configure isolated hosted owner/cockpit HTTPS origin and OAuth callback.
- [ ] **BLOCKED** — Configure public authenticated/HMAC-protected webhook HTTPS endpoint.
- [ ] **BLOCKED** — Provision staging DB, workspace, identity, secrets and queues/reconciliation worker.
- [ ] **BLOCKED** — Independently deployed emergency reader/latch, secrets, revocation and main-stack-down denial.
- [ ] **BLOCKED** — Named staging backup/restore target.
- [ ] **BLOCKED** — Static staging preflight `19 missing -> 0 missing`; source-recorded `PREFLIGHT.json` currently lists 19.
- [ ] **NOT RUN** — Active read-only HTTPS/provider/DB/identity/emergency/worker probes in real staging.
- [ ] **GATE B PASS NOT MET** — Hosted staging with independent emergency and recovery evidence.

## Gate C — First real Shopify proof

### C1 — Authorized development environment
- [x] Local restricted development-store allowlist and provider gating built/tested (M2).
- [ ] **OWNER/ACCOUNT REQUIRED** — Authorized dedicated Shopify development store.
- [ ] **OWNER/ACCOUNT REQUIRED** — Dedicated Shopify app, configured version, approved minimum scopes.
- [ ] **BLOCKED** — Secure client credentials/secret rotation in staged secret mechanism.

### C2 — Real OAuth
- [x] Local OAuth state, callback binding, token encryption/lifecycle and denial tests (M2).
- [ ] **EXTERNAL UNVERIFIED** — Real authorization redirect, callback, exchange, install and revocation.
- [ ] **EXTERNAL UNVERIFIED** — Prove token never reaches browser, agent, logs or evidence.

### C3 — Real read synchronization
- [x] Local strict persisted-state schemas, provider mapping and sync jobs (M2).
- [ ] **EXTERNAL UNVERIFIED** — Real product/variant/price/inventory/location read and canonical provenance.
- [ ] **EXTERNAL UNVERIFIED** — Rate limits, stale-result prevention, failure/retry and read-recovery against real Shopify.

### C4 — Real webhooks
- [x] Raw-body HMAC, receipt/dedupe, durable inbox, queue/reconciling/reconciled/dead-letter lifecycle tests (M2).
- [x] Local overlapping-secret and post-revocation-grace contract tests (M2).
- [ ] **EXTERNAL UNVERIFIED** — Actual registration and provider-side readback.
- [ ] **EXTERNAL UNVERIFIED** — Real Shopify delivery, HMAC, worker processing and authoritative reconciliation.
- [ ] **EXTERNAL UNVERIFIED** — Duplicate/restart/rotation/revocation behavior against provider.

### C5 — First guarded price mutation
- [x] Owner-only dev-store proposal, economics evidence, authorization, cancellation, preflight/read-twice, dispatch claim, receipt/readback and compensation code locally tested (M2).
- [ ] **BLOCKED** — Gate A owner authority and staging prerequisite gate passed.
- [ ] **EXTERNAL UNVERIFIED** — Owner approves one real dev variant and price proposal.
- [ ] **EXTERNAL UNVERIFIED** — One mutation via guardrail/provider path; trustworthy external receipt and readback.

### C6–C12 — Failure fidelity and emergency
- [x] Local no-blind-resend and idempotency contracts.
- [x] Local UNKNOWN/DRIFT/FAILED state and investigation locks.
- [x] Local provider second read and stale edit pre-dispatch denial tests; residual Shopify no-CAS race remains.
- [x] Local compensation requires fresh authority and state.
- [x] Local restart safety and isolated kill denial tests.
- [ ] **EXTERNAL UNVERIFIED** — Causal proof of UNKNOWN outcome rather than matching value alone.
- [ ] **EXTERNAL UNVERIFIED** — Duplicate same-request replay causes zero additional Shopify writes.
- [ ] **EXTERNAL UNVERIFIED** — External stale owner edit causes denial, without clobbering.
- [ ] **EXTERNAL UNVERIFIED** — Freshly authorized compensation and stale compensation denial.
- [ ] **EXTERNAL UNVERIFIED** — Restart/recovery proof, independent emergency denial and Shopify-side credential revocation.
- [ ] **GATE C PASS NOT MET** — Complete real closed-loop proof and evidence manifest. No M4 promotion permitted yet.

## Gate D — First real supervised commerce cycle

- [ ] D1: Provider-truth catalog/SKU/variant reconciliation and pricing/provenance.
- [ ] D2: Inventory truth, allocations/reservations, oversell and reorder policies.
- [ ] D3: Verified order lifecycle, cancellation, durable receipts and idempotency.
- [ ] D4: Real payment events, fees, settlement, disputes and reconciliation.
- [ ] D5: Carrier/fulfillment/exception state with authoritative tracking.
- [ ] D6: Return/refund states, policy checks, reimbursement and audit.
- [ ] D7: Contribution and cash reconciliation from provider financial events.
- [ ] Gate D: One actually observed complete supervised commerce transaction, including exception/restore gates.

## Feature stream S — Suppliers and procurement

- [ ] Supplier operating model, contracts, lead times and restrictions.
- [ ] Real supplier search and source quality/provenance checks.
- [ ] Scored supplier quality, delivery and landed cost; independent validation.
- [ ] Redundancy/failover across approved suppliers.
- [ ] PO state machine, receipts/invoices, cancellations and dispute tracking.
- [ ] Financial procurement firewall with owner/supplier caps and audited authorizations.
- [ ] Supplier checkpoint: one bounded real procurement lifecycle and reconciliation.

## Feature stream P — Forecasting and pricing

- [ ] Calibrated demand forecasting with out-of-sample historical evaluation.
- [ ] Real landed/unit economics reconciled against observed financial data.
- [ ] Guarded margin/floor/ceiling price policies across providers.
- [ ] Pricing experiments with holdout, reversal, uncertainty and loss budget.

## Multichannel

- [ ] Canonical cross-channel catalog, product identity and inventory ownership.
- [ ] Marketplace/channel read connectors proven externally.
- [ ] Bounded channel writes with provider-specific authorization and reconciliation.
- [ ] Multi-venue conflict, reservations, returns, fees and settlement parity.

## Marketing and growth

- [ ] Source-of-truth attribution and observed conversion/cost accounting.
- [ ] Read-only advertising and audience integrations.
- [ ] Guarded campaign/creative and spend operations.
- [ ] Ad-spend reserve, billing and overrun firewall.
- [ ] Net-contribution-focused optimization measured against controls.

## Customer, CRM and support

- [ ] Unified customer record, identity and consent/retention policy.
- [ ] Real customer-support intake, SLA, policy-approved response and escalation.
- [ ] Customer lifecycle segmentation and retention with attribution.
- [ ] Reviewed/consented durable customer learning memory.

## Creators and affiliates

- [ ] Creator sourcing, terms, consent and contractual approvals.
- [ ] Attribution, commissions, reversals, fraud controls and settlement.

## Financial operating system

- [ ] Business-grade double-entry ledger connected to real provider flows.
- [ ] Multi-currency cash, fees, taxes, settlement, reserve and margin accounting.
- [ ] Audited bank/payment/supplier/ad-receivable reconciliation with exception queues.
- [ ] Tax and accounting integrations with verified jurisdiction policy.

## Gate E — Evaluation and autonomy

- [ ] E1: Opportunity engine using real and traceable source signals.
- [ ] E2: Controlled experiment design and digital twin model validated against actual outcomes.
- [ ] E3: Independent shadow decision-vs-outcome evaluation over a prespecified period.
- [ ] E4: Agent tool/scope separation, delegation conflict resolution and action provenance at real provider boundaries.
- [ ] E5: Autonomy progression L0–L7 per domain based on measured error/loss and owner approval.
- [ ] E6: Fast revocation, kill/rollback, confidence/uncertainty gating and drift-triggered demotion in deployment.
- [ ] Gate E: Meets preregistered measurable safety/quality thresholds; eligible autonomy must be explicitly granted, never assumed.

## Cockpit, observability and operations

- [x] Local cockpit with owner control panels, audit/activity, Shopify and readiness status (M3 scope).
- [ ] Real deployed authenticated cockpit: owner/private access, audit and session revocation.
- [ ] Production SLOs, tracing, health and alarm coverage for dependencies.
- [ ] True P&L, provider latency, cash reserve, incidents, uncertainty and autonomy evaluation surfaces.
- [ ] Disaster recovery runbooks with externally measured recovery objectives.
- [ ] Responsive/mobile operational approval and emergency behavior proven with production-like identity.
- [ ] Any ChatGPT Sites hosting evaluation, deployment URL and private-audience verification (not evidenced in archive).

## The 19 staged static settings still missing in the October 1 evidence

`HOTL_MODE`, `GUARDRAIL_WORKSPACE_ID`, `GUARDRAIL_DATABASE_URL`, `SUPABASE_URL`, `OWNER_USER_IDS`, `GUARDRAIL_AUTHORIZATION_VERSION`, `AGENT_JWT_KEYS`, `HOTL_PUBLIC_ORIGIN`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_WEBHOOK_ORIGIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STAGING_SHOPS`, `SHOPIFY_SCOPES`, `CONNECTOR_ENCRYPTION_KEY`, `KILL_SWITCH_URL`, `KILL_SWITCH_READ_TOKEN`, `HOTL_BACKUP_RESTORE_TARGET`, `SHOPIFY_RECONCILIATION_MODE`.

These are **missing in the recorded October 1 shell environment**, not independently established as absent from all possible hosted environments on October 8. Never put actual secret values in checkpoint files.

## Next work order / dependencies

1. **CP-00: Fresh remote reconciliation.** Fetch latest GitHub HEAD; inspect changes since archived `8ccf7b5`, branches, PRs, CI and new evidence. Resolve contradictory documents and update this register; never assume the October 1 report is current.
2. **CP-01: Gate A owner decisions.** Owner authenticates and approves pilot business/risk/economic envelope. Research suggestions are not approval.
3. **CP-02: Gate B staging deployment.** Private cockpit identity + isolated least-privilege Postgres + secrets + trusted HTTPS webhook/callback + independent kill plane + worker + backup/recovery.
4. **CP-03: Gate C preflight.** Zero missing mandatory config, read-only active probes and signed evidence; consequential writes stay disabled.
5. **CP-04: Gate C provider proof.** Real authorized development store, OAuth, sync, webhook, single owner-approved variant write, receipt, readback, idempotency, stale edits, compensation, restart and emergency denial.
6. **CP-05: Gate D.** Only after full Gate C proof and specific owner authorization, run one supervised commerce cycle.
7. **CP-06+:** Supplier/procurement → inventory/fulfillment → marketing/CRM → financial reconciliation → measured shadow → per-domain autonomy gates.

## Updating this checklist safely

For each `[ ]` → `[x]`: require **commit SHA + test command/result + provider/runtime identifiers (sanitized) + captured source evidence path + review date**. If evidence becomes invalid, mark `[ ]` again and explain why. No time-based automatic promotion. Store the checkpoint in Git as `docs/FULL_PROGRAM_CHECKPOINT.md` after first reconciling the latest remote branch and reviewing the diff. Do not use this snapshot document to overwrite newer remote work blindly.

### Source anchors (snapshot)
- `docs/locked-program-plan.md` (authoritative product roadmap and maturity model)
- `docs/program-maturity-register.md` (M0–M3 as of September 28)
- `PROJECT_CURRENT_STATE.md` (October 1 scope limits)
- `evidence/gate-a-c-staging-provisioning-2026-10-01/README.md` (local run evidence)
- `evidence/gate-a-c-staging-provisioning-2026-10-01/PREFLIGHT.json` (19 missing settings)
- `evidence/gate-c-shopify-external-2026-09-28/README.md` (external BLOCKED)
