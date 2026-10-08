# HOTL — Master Implementation & Evidence Checkpoint

**Audited:** 2026-10-08  
**Repository:** nahas67/HOTL  
**Base branch/head:** main @ 1de2ad36793258db201aac21f04fdd48d4a0681f  
**Audit method:** GitHub repository tree, implementation files, selected test sources, retained evidence, current maturity register, current Sites deployment record, and GitHub Actions run 37753604085.  
**Purpose:** Mark what is demonstrated and leave everything missing/unverified unchecked. This checkpoint is an audit, not a production authorization.

## Marking rules

- **[x]** means the specifically worded claim is supported by source code, local tests, a recorded drill, or external evidence **at the stated scope only**.
- **[ ]** means absent, incomplete, blocked, not executed, or insufficiently evidenced. “Implemented locally” does **not** complete an external staging or production item.
- Recorded local drills are labeled **recorded**; they were not rerun by this audit. GitHub Actions findings below were inspected from the actual run.
- Do not upgrade any Shopify operation to M4 or domain autonomy to M7 without new, attributable external evidence and owner sign-off.
- This document does not replace the [owner-locked plan](../docs/locked-program-plan.md), [maturity register](../docs/program-maturity-register.md), or [engineering contract](../AGENTS.md).

## Executive status

| Area | Present assessment | Next gate |
| --- | --- | --- |
| Local simulation/control plane | M3 for selected cross-service capabilities | Fix CI and preserve recovery contracts |
| Gate A owner business/risk envelope | Technical model M2; actual owner authorization **blocked** | Owner business choices and approved economics/caps |
| Gate B trusted local foundation | Strong local implementation/recorded PostgreSQL drills; hosted controls **unverified** | Dedicated staging identity, DB/RLS, emergency control, restore |
| Gate C Shopify closed loop | OAuth/sync/webhooks/price operation M2 local; no M4 proof | Dev store/app, trusted HTTPS, actual provider evidence |
| Gate D supervised real commerce | Not demonstrated | Gate C completion first |
| OpenAI Sites owner view | Privately deployed **static read-only UI** (per deployment record) | Authenticate and connect narrow read APIs only after backend staging is safe |
| Production/business autonomy | Not demonstrated | Financial truth, real outcome evaluation, domain promotion |

## CP-00 — Repository, CI and supply-chain hygiene

- [x] Git history, default main branch, and project engineering contract exist.
- [x] Source tree includes the five application packages, connector SDK, schemas, kill service, migrations and CI workflows.
- [x] Main GitHub Actions pipeline installs dependencies, lints, typechecks, unit-tests and builds successfully on run [37753604085](https://github.com/nahas67/HOTL/actions/runs/37753604085).
- [x] Main CI has Playwright and PostgreSQL/RLS/runtime-ledger job steps defined in [.github/workflows/ci.yml](../.github/workflows/ci.yml).
- [x] A separate kill-switch CI workflow is defined; it builds a separate image and does not deploy it with main services.
- [ ] **CI is fully green at current main HEAD.** FAIL: GitHub Actions run 37753604085 failed; browser E2E 10 passed, 1 failed. The two later PostgreSQL steps were skipped.
- [ ] Repair the specific Playwright selector in tests/e2e/operating-system.spec.ts:80. The generic getByRole('alert') matches the HOTL validation notice and Next.js route announcer. Target the app alert unambiguously and rerun CI.
- [ ] Obtain GitHub Actions evidence for passing PostgreSQL migration/RLS and runtime-ledger drills on the current head; local recorded results are not a substitute for skipped CI steps.
- [ ] Enable a protected main branch or equivalent enforced passing-check/review policy. GitHub branch metadata reports main as unprotected.
- [ ] Audit the three large ZIP archives committed to the **public** repository for secrets/private operational data, purge exposures if discovered using a reviewed remediation procedure, and stop committing binary snapshot copies. A public repository is not the same as a private Site.
- [ ] Complete a documented full-repository and history secret-exposure review, beyond changed-file scans.
- [ ] Confirm current published source/release artifacts are sufficient to reproduce builds without local OneDrive paths or ignored state.

## CP-01 — Local commerce foundation

- [x] A local Next.js owner cockpit and separate simulation storefront are implemented (apps/cockpit and apps/storefront).
- [x] Simulation checkout uses server-authoritative catalog/price/inventory and persists demo orders (apps/commerce-core).
- [x] Local cockpit exposes overview, products, orders, agents, approvals, finance, integrations, autonomy/guardrails and activity.
- [x] The Business Constitution is versioned, and twenty domain controls and five owner-facing operating modes have implementations (packages/schemas/src/constitution.ts and guardrail engine).
- [x] Owner manual catalog/price/inventory edits, guarded refunds/campaign paths, approval interrupts and pause have local implementations/tests.
- [x] Guardrail service enforces deterministic margin/budget/refund, identity/scope, revision and idempotency checks in local tests.
- [x] Local ledger has hash-linked audit entries and audit-before-success logic, plus corrupted/missing-state refusal paths.
- [x] LangGraph contains executable bounded sourcing/marketing/operations/support stages with durable checkpoints, interrupt/resume and replan tests.
- [x] LiteLLM is the configured proxy for model requests; deterministic draft fixtures are explicitly identified as simulation.
- [ ] A production-hosted, always-running LangGraph/queue/model stack with actual scoped keys and operational telemetry has been demonstrated.
- [ ] The full target specialist-agent organization, business learning memory and outcome-evaluation loop exist as a validated operating system.

## CP-A — Owner business and risk envelope (Gate A)

- [x] Typed pilot profile/economics/capital/stop-rule schemas exist (packages/schemas/src/constitution.ts).
- [x] Money, ratios and fractions are distinguished and deterministic contribution, break-even CAC and break-even ROAS validation exists.
- [x] Owner draft/review/approval API and cockpit input surfaces are represented in the repository.
- [x] Owner data provenance, policy revisions and owner-authority checks are modeled; estimated inputs cannot autonomously authorize real spending.
- [ ] Legal seller country, target market, final approved product, fulfillment/supplier model and approved pilot currency are evidenced and owner-approved.
- [ ] Verified landed cost, payment/store/fulfillment/return/tax assumptions and allowed pricing/margin constraints are approved.
- [ ] Real pilot capital, reserve, daily/weekly/monthly caps, refund/supplier/inventory/advertising exposure and loss limits are owner-approved.
- [ ] Measurable stop thresholds, data sources and corresponding deterministic signals are configured and owner-approved.
- [ ] An authenticated owner has approved the current Gate A envelope digest/version in the actual authoritative cockpit.
- [ ] Gate A is passed for consequential external commerce activity.

## CP-B — Identity, durability and independent emergency foundation (Gate B)

- [x] Workspace-bound owner/agent signed identity, scope reduction, version and revocation contracts have local tests (apps/guardrail-service/src/identity.ts).
- [x] Separate transactional PostgreSQL runtime ledger/RLS/migration files exist (apps/guardrail-service/src/stores/postgres.ts; infra/supabase/migrations).
- [x] Local PostgreSQL runtime privilege checks probe privileged role membership, workspace binding, and effective DDL/ownership; unsafe privilege tests are present.
- [x] Local PostgreSQL restart, migration, dump/restore and digest checks are **recorded** in docs/continuation-verification.md; 2026-10-01/03 Docker 18.6 drill reports 33 tests.
- [x] File/checkpoint/kill-journal recovery paths and fail-closed checks are implemented and locally exercised.
- [x] Independent one-way kill service code, journal, retry hooks, isolated tests, container/deploy artifacts exist (infra/kill-switch).
- [x] Static staging preflight lists required settings; opt-in active probes and separate webhook ingress/worker/reconciliation statuses are implemented.
- [ ] Hosted owner authentication, scoped production-like credentials and real key-rotation/revocation are validated.
- [ ] Dedicated hosted staging PostgreSQL, tenant binding, safe runtime role, RLS and cross-workspace denial are exercised against that actual environment.
- [ ] Hosted backup/restore and independent external audit retention are verified.
- [ ] Independent kill service is separately deployed with separate credentials/state/revocation authority and verified while the main stack is unavailable.
- [ ] Durable queue/worker, observability, incident alerts and operational recovery are demonstrated in a deployed staging environment.
- [ ] Required HTTPS staging endpoints, identity issuer, encrypted secrets, store binding and emergency reader are provisioned.
- [ ] Static staging preflight is green and required active read-only probes pass. Last committed report has **19 missing settings**, active probes **NOT RUN**.
- [ ] Gate B fully passes deployed staging acceptance.

## CP-C — Shopify development-store proof (Gate C)

- [x] Shopify/WooCommerce read connector SDK, canonical models, validation and fixture-driven tests exist (packages/connector-sdk).
- [x] Shopify OAuth browser challenge, callback, encrypted token state, lifecycle checks and owner/workspace references are locally implemented.
- [x] Shopify persisted commerce/OAuth data uses strict runtime validation and corruption tests.
- [x] Shopify sync jobs, raw-body HMAC webhook inbox, durable stages, retry/dead-letter and reconciliation worker modes have local code/tests.
- [x] Shopify guarded owner-only development-store price proposal/cancel/dispatch/read-back/receipt path exists with local intercepted-provider tests.
- [x] One-use dispatch claim, no blind resend, UNKNOWN/DRIFT lock, stale observations, investigation-only annotations and fresh compensation controls are coded.
- [x] Current provider adapter pins GraphQL Admin 2026-07 in apps/guardrail-service/src/shopify-provider.ts; actual Shopify API response version is not verified.
- [ ] An authorized Shopify development store, installable dedicated app and minimal scopes are externally evidenced.
- [ ] Public trusted HTTPS OAuth callback/webhook ingress and separate staging credentials are deployed.
- [ ] Real Shopify OAuth install, token lifecycle and actual product/variant/inventory import are verified.
- [ ] Real Shopify webhook subscription, signed delivery, inbox-to-authoritative-reconciliation chain are verified.
- [ ] One owner-approved real dev-store price change passes HOTL guardrails and yields attributable receipt/read-back/audit evidence.
- [ ] Real retry, stale external edit, compensation, crash/restart, pause and isolated emergency denial have evidence.
- [ ] Shopify-side credential revocation/rotation has external evidence.
- [ ] Causal resolution of ambiguous provider outcomes is safe and externally validated; do not infer causality from an observed matching value.
- [ ] The residual provider read→write race without provider CAS is mitigated and its residual risk explicitly accepted for the owner-only pilot; do not call it eliminated.
- [ ] Normal merchant price writes or autonomous pricing are eligible; **they remain disabled**, and are not a Gate C objective.
- [ ] Gate C is externally verified (M4) and frozen.

## CP-S — Sites hosting and private owner interface

- [x] ChatGPT Sites has a deployed owner presentation; the project records a private audience of one allowed account, zero external visitors (docs/chatgpt-sites-deployment.md).
- [x] The hosted Site's scope is **static read-only**, with labeled Demo and recorded Checkpoint modes; current code has no HOTL backend/API connection.
- [x] Sites source intentionally blocks external requests and form submission through CSP, and documents no database/secret bindings.
- [x] An October 8 dashboard/UI refresh and desktop/mobile screenshot review are recorded (evidence/hotl-owner-ui-2026-10-08/README.md).
- [ ] The current October 8 UI revision has a complete fresh automated Site test run; the UI evidence says those tests were not rerun for the update.
- [ ] Owner Site is connected to live, authenticated, tenant-bound HOTL read APIs with truthful freshness/error semantics.
- [ ] Owner Site has real operational approvals, pause and business actions routed exclusively through deterministic guardrails.
- [ ] Owner Site has a separately verified deployed kill control without compromising kill-plane independence.
- [ ] A production-grade hosted HOTL backend is deployed; a static Site deployment does not count.
- [ ] Public storefront deployment has separate approval, payment safety and privacy/security acceptance.

## CP-D — First supervised end-to-end *real* commerce cycle (Gate D)

- [ ] Real catalog/variant/listing and inventory ownership synchronized to the chosen store.
- [ ] Real reservations, stock reconciliation, multi-location inventory and oversell denial.
- [ ] Real order creation, state transitions and fulfillment evidence.
- [ ] Payment authorization/capture, settlement, payout, chargeback/refund distinction and provider reconciliation.
- [ ] Fulfillment/shipping exception handling and tracked delivery.
- [ ] Returns eligibility, return shipment/inspection and externally reconciled refunds.
- [ ] Product-level landed cost, fees, returns and tax evidence feed a reconciled contribution ledger.
- [ ] One full supervised product→order→settlement→fulfillment→return/refund-if-applicable→finance cycle is evidenced.
- [ ] Gate D passes; only then authorize broader supplier/ad-spend implementation.

## CP-E — Full feature program after real operating proof (Gate E and later)

- [ ] Supplier discovery with provenance, quality scoring and redundancy.
- [ ] Guarded external purchase orders, supplier acknowledgements, inventory and finance reconciliation.
- [ ] Demand forecasting, uncertainty bands, reorder recommendations and deterministic price experiments.
- [ ] Verified multichannel listing/inventory connectors beyond local Shopify/WooCommerce read adapters.
- [ ] Read-only ad metrics connectors, attribution correctness and then separately gated advertising writes.
- [ ] Paid acquisition governed by cash, experiment budgets, product economics and contribution profit.
- [ ] Connected customers, CRM, consent, lifecycle messaging and support memory.
- [ ] Creator/affiliate outreach, attribution, commission and payout controls.
- [ ] Authoritative double-entry or equivalently controlled finance/cash commitments, payout reconciliation and tax reporting boundaries.
- [ ] Product opportunity engine, measurement/experimentation, scenario analysis and digital twin.
- [ ] Bounded domain specialists with typed tasks, authority/evaluation contracts and conflict rules.
- [ ] Shadow decision evaluation against real business outcomes, measured model cost and failure rates.
- [ ] Owner-approved domain-by-domain autonomy promotion (M6/M7), with automatic demotion/circuit breakers.
- [ ] Multi-brand/multi-store, localization, team RBAC and international tax/compliance readiness.
- [ ] Optional MCP/UCP/A2A or other agentic commerce interfaces, audited separately from execution authority.

## Priority actions (next verifiable checkpoints)

1. **CP-00 / P0** — Fix the single failing Playwright alert-selector case; rerun the full GitHub Actions pipeline so the PostgreSQL steps also execute. Evidence: [failed run](https://github.com/nahas67/HOTL/actions/runs/37753604085).
2. **CP-00 / P0 security review** — Public repo currently includes three binary ZIP project snapshots (approximately 4.98 MB, 5.60 MB and 15.89 MB). Inspect contents **and Git history** for credentials and private data before sharing or promoting the repository. No leak is asserted without inspection.
3. **CP-A / OWNER REQUIRED** — Enter and approve actual pilot product, seller jurisdiction, verified costs, cash reserve/spend/exposure limits and stop rules in authenticated HOTL. AI research does not confer owner authority.
4. **CP-B / EXTERNAL SETUP** — Deploy isolated identity, PostgreSQL/RLS, HTTPS callback/ingress, worker and independent emergency reader; run static preflight from 19 missing to 0, then active probes and restore/denial drills.
5. **CP-C / EXTERNAL SETUP & OWNER APPROVAL** — Provision the authorized Shopify development store/app; perform real OAuth, read sync, signed webhook and exactly one owner-confirmed bounded price write with full evidence. Keep ordinary/autonomous provider writes disabled.
6. **CP-D / LATER** — Start only after the preceding external gates pass.

## Evidence index

- [Current-state handoff](../PROJECT_CURRENT_STATE.md)
- [Locked owner program](../docs/locked-program-plan.md)
- [Scope/progress matrix](../docs/commerce-os-progress.md)
- [M0–M7 maturity register](../docs/program-maturity-register.md)
- [Continuing verification ledger](../docs/continuation-verification.md)
- [Blocked Gate C evidence](../evidence/gate-c-shopify-external-2026-09-28/README.md)
- [19-setting static preflight](../evidence/gate-a-c-staging-provisioning-2026-10-01/PREFLIGHT.json)
- [Sites deployment review](../docs/chatgpt-sites-deployment.md)
- [October 8 Sites UI evidence](../evidence/hotl-owner-ui-2026-10-08/README.md)
- [GitHub Actions CI run](https://github.com/nahas67/HOTL/actions/runs/37753604085)

**Audit note:** Source review establishes implementation presence; no Shopify request, credential, staging secret, hosted HITL action or financial mutation was performed for this audit. No existing source files, tests, policies or runtime state were changed.
