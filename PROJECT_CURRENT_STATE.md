# HOTL Project Current State and Prompt-Engineer Handoff

**Snapshot date:** 2026-10-03
**Repository:** `C:\Users\nahas\OneDrive\Desktop\HOTL`  
**Purpose:** Give a prompt engineer and technical reviewer a detailed, loss-resistant picture of what this project is, what is implemented, what evidence exists, what remains, and which constraints must remain in force.

> **Important scope statement:** HOTL currently runs as an explicitly labeled local commerce simulation. Its local code and tests do not establish production readiness, real merchant connection, business profitability, or a guarantee of zero mistakes. Preserve this boundary until the applicable provider integrations and deployed safety drills have actually passed.

## 1. Executive state

HOTL (Human-on-the-Loop Commerce) is intended to become a commerce operating system in which AI can plan and carry out bounded business work while deterministic services enforce owner policy, financial limits, auditability, human interrupts, and emergency stops. The current repository is a sizeable local prototype: it has a storefront and owner cockpit, a deterministic guardrail API, a LangGraph workflow, simulated commerce state, audit and idempotency, workspace identity contracts, an isolated kill-switch service, connector abstractions, and a narrow owner-operated Shopify development-store price workflow.

The system does **not** currently run a complete real commerce business. The Shopify workflow is locally implemented and tested but has not been externally verified against a real merchant development store in the evidence currently recorded. Live payments, supplier purchasing, ads, ordinary merchant price changes, broad production commerce, and autonomous provider writes remain disabled or absent. Production identity, hosting, monitoring, deployed kill/revocation, and cross-cluster recovery are not established.

The original user goal was an AI-run e-commerce business “with no error or mistake.” That cannot be promised literally. The engineering objective should be framed as: prevent unauthorized actions, prevent duplicate financial effects on retries, fail closed when critical state is unavailable or stale, detect and contain uncertain provider outcomes, preserve evidence, and quantify residual error and loss rates over real operating periods.

### Current maturity (as documented)

- **Local engineering:** L1, tested local prototype.
- **Staging / real provider operation:** L0, not demonstrated.
- **Broad autonomous commerce operation / proven business outcomes:** L0, not operational.

Maturity is about demonstrated operation, not how much code exists. See [platform comparison and level](docs/platform-comparison-and-level.md).

## 2. Which documents are authoritative

Keep the supplied prompts intact. This handoff summarizes them; it does not replace their detailed requirements.

1. [`docs/commerce-os-build-prompt.md`](docs/commerce-os-build-prompt.md) is the retained original build prompt and broad product specification.
2. [`docs/production-continuation-prompt.md`](docs/production-continuation-prompt.md) is the retained production-continuation prompt and its detailed constraints/acceptance requirements.
2a. [`docs/locked-program-plan.md`](docs/locked-program-plan.md) is the owner-supplied September 24 program plan, preserved verbatim. It defines maturity labels M0–M7, Gates A–E and the immediate dependency order. The [Gate A worksheet](docs/pilot-business-risk-envelope.md) leaves unknown commercial inputs unapproved.
3. [`AGENTS.md`](AGENTS.md) is the active repository engineering contract. Its safety rules govern implementation.
4. [`readit.md`](readit.md) is the existing long-form checkpoint: prior work, state preservation, evidence and ordered phases.
5. [`docs/continuation-verification.md`](docs/continuation-verification.md) records the latest release-check evidence currently documented (2026-09-23). It is the evidence source; do not convert planned steps into passed checks.
6. [`docs/commerce-os-progress.md`](docs/commerce-os-progress.md) is the concise implemented/partial/missing scope matrix.
7. [`production-continuation.md`](production-continuation.md) is the dependency-ordered implementation/staging plan.
8. Detailed subsystem contracts are linked in section 12 below.

If a design prompt describes intended behavior that conflicts with current code, call it **target/planned**, not implemented. In particular, design sketches such as [`docs/langgraph-design.md`](docs/langgraph-design.md) and [`docs/cockpit-schema.md`](docs/cockpit-schema.md) must not be read as proof that every suggested node or field exists.

## 3. Product intent and operating principles

The intended product is a human-on-the-loop commerce control plane rather than an LLM with unrestricted store credentials. Runtime agents propose plans and invoke bounded tools. The guardrail service owns deterministic decisions for financial and public mutations. The owner configures a versioned Business Constitution and autonomy by domain; exceptions can pause in human interrupts. Operational state and evidence should remain inspectable, replay-aware, and recoverable.

The original master prompt covers a much broader system than the implemented prototype. Its target domains include:

- business goals, opportunity research, product selection, sourcing and supplier intelligence;
- catalog, variants, listings, inventory, demand forecasts, pricing and experiments;
- storefronts, marketplace/discovery channels, checkout and commerce protocols;
- campaigns, advertising, creative, attribution, creators/affiliates, CRM and retention;
- customer support, customer memory, returns, refunds, fraud, chargebacks and fulfillment;
- finance, cash, reconciliation, landed cost, tax, localization and multi-store operations;
- specialized runtime business agents, workflow orchestration, approval interrupts and checkpoints;
- business memory, event history, learning, evaluation, shadow mode, forecasts and digital-twin analysis;
- owner cockpit, operator activity, controls, alerts, mobile/responsive views and executive briefs;
- connectors, webhooks, extension/API contracts, identity, secrets, audit, recovery and observability;
- policy, economic safety, prompt-injection handling, model/cost budgets, reliability, quality and testing.

These are the product target areas, **not** a claim that each is implemented. The complete requirements and original wording remain in the retained source prompt linked above. Use that file to verify omissions in any implementation prompt.

## 4. Runtime map

| Component | Source location | Local address / role | Current status |
| --- | --- | --- | --- |
| Owner cockpit | `apps/cockpit` | `127.0.0.1:3000`; Next.js operator UI and validated same-origin proxy | Implemented for local control and review; not hosted production UI |
| Customer storefront | `apps/storefront` | `127.0.0.1:3001`; local catalog/cart/demo checkout | Simulation only; not a live storefront/payment service |
| Guardrail service | `apps/guardrail-service` | `127.0.0.1:4100`; authenticated deterministic policy, state, audit and provider boundary | Core local implementation; provider write credentials are intended to stay here |
| Independent kill service | `infra/kill-switch` | `127.0.0.1:4200`; separate durable irreversible stop latch and revocation hooks | Local isolated implementation/drills; no deployed independent service or verified real revocation |
| LangGraph orchestrator | `apps/orchestrator` | `127.0.0.1:4300`; run lifecycle, graph, checkpoints and interrupts | Local workflow implementation; uses guardrail gateway |
| Commerce gateway | `apps/commerce-core` | `127.0.0.1:4400`; checkout/webhook/gateway functions | Local simulation/integration boundary; central live payment execution is absent |
| Shared contracts | `packages/schemas` | Zod schemas shared by services and UI | Implemented; actual coverage varies by domain |
| Connector SDK | `packages/connector-sdk` and connector packages | Canonical provider mapping and constrained adapters | Shopify/WooCommerce read interfaces and intercepted tests; no real merchants connected |
| Optional Medusa bridge | `apps/commerce-core/medusa` | Separate staging integration | Builds/tests as documented; native mutation routes remain disabled |
| Optional runtime infrastructure | `infra/` | PostgreSQL/Supabase migrations, Redis/BullMQ, LiteLLM, Compose/deployment assets | Target/configuration exists; deployed hosted production evidence is not established |

Default development uses Node.js 22.13+ and pnpm 10.17.1. `pnpm install` then `pnpm dev` starts the local simulation; no external provider key or Docker is required for that default path. Keep all demo state. Read the README before operating any service.

## 5. Backend and runtime behavior

### Guardrail and commerce mutations

The deterministic guardrail is the authorization boundary for consequential work. Its implemented contracts cover integer-cent calculations, margin and spend ceilings, owner/agent identity and scopes, workspace binding, optimistic revisions, idempotency, reservations/escrow, pause/kill checks, owner interrupts, and durable audit-before-success. The orchestrator does not authorize money with model reasoning. Stale or missing context can deny or trigger a replan.

The runtime agent identifiers currently declared in `apps/orchestrator/src/client.ts` are `master_orchestrator`, `sourcing_agent`, `marketing_agent`, `order_agent`, and `support_agent`. Current graph stages are catalog, campaign, supplier and refund, with planning/follow-up nodes, guardrail execution, replan handling, owner interrupts and checkpointed state. These are a small executable subset of the specialist roster described in the source prompt.

### Shopify bounded path

Current locally implemented pieces include OAuth challenge/callback handling, encrypted connector-token storage, token refresh/invalidation, development-store/environment checks, bounded read synchronization, durable observations/jobs, HMAC-verified webhook inbox handling, leased/retried local webhook processing, and owner-triggered webhook subscription registration with read-back. The owner flow supports price cost evidence, proposal, pre-dispatch cancellation, one-use dispatch claim, provider read-back, receipt/reconciliation, and durable investigation annotations for unresolved `DISPATCHING`, `UNKNOWN`, and `DRIFT` operations. Investigation notes are revision/time-bound and preserve the unresolved resource lock; referenced material is not automatically verified provider evidence.

The important limitation is that the real provider end-to-end path has not been externally verified. Provider timeouts/lost results do not authorize blind resend. Seeing the requested price later does not establish causality. Shopify lacks a compare-and-swap field in this price mutation, so an owner/provider edit racing between preflight and write remains an unresolved risk. There is no verified evidence-based clearance process that safely establishes causality for an ambiguous operation. Normal merchant and autonomous price changes remain disabled.

### Identity, LLM and queues

The repository implements workspace-bound owner/agent identity contracts, short-lived tokens, scope reduction and revocation logic, with local tests. Hosted Supabase/Auth, real scoped JWT issuance/rotation and deployment remain unverified. In simulation, local internal credentials are used; live-mode owner and agent calls require scoped bearer tokens. Runtime LLM calls are routed through LiteLLM with per-agent virtual-key configuration; simulation uses deterministic sample drafts. Real proxy, model alias, budgets, key issuance and production traces are unverified. Never put the LiteLLM admin/master key in a browser or runtime agent.

Redis/BullMQ workers and scheduled runs are optional and explicitly gated by environment settings. They are not necessary for the default local simulation; production queue delivery/draining/recovery is not verified.

## 6. Frontend surfaces

### Owner cockpit

The Next.js cockpit provides the local owner control surface: dashboard/activity, policy and Business Constitution, autonomy-domain controls, products/catalog editing, approvals/interrupts, integrations, finance reporting, pause/kill information, and the Shopify staging panel. The Shopify panel includes installation/auth state, sync/jobs and webhook operations, cost evidence, staged price proposal/review, cancellation, execution, receipts/reconciliation and investigation notes. The server-side proxy validates request schemas and forwards owner credentials; browser code is not the provider write credential store.

Historical seeded metrics and sample operations are fixtures. Finance distinguishes simulation/estimates and unavailable measurements. The cockpit is not evidence of a complete enterprise control center, real-time production telemetry, a mobile application or live provider operations. The source prompt's larger command center, alerting, multi-workspace, multi-role and full mobile requirements remain broader target work.

### Storefront and checkout

The storefront supports local catalog browsing, bag/cart and simulated order placement. Product/price/inventory validation occurs server-side and demo orders are persisted into local state. It does not process real payment or represent a launched merchant storefront.

## 7. Data, database, memory and persistence

### Local runtime state (preserve)

The working repository records identify these durable local state paths:

- `data/guardrail-state.json` — local business/guardrail state, including audit and workspace policy/extensions;
- `data/orchestrator-checkpoints.json` — local LangGraph checkpoint state;
- `infra/kill-switch/data/events.jsonl` — separate emergency stop journal;
- `.secrets/connectors.key` — local connector-encryption key material.

Do not read secrets into reports, print state contents, delete, reset, overwrite, or casually migrate these files. Initialization markers distinguish a never-initialized workspace from missing initialized state. Missing, corrupt, unreachable or stale emergency/ledger state must deny writes; do not silently recreate history. Browser drills should use isolated `.data/e2e-*` state instead.

### Database options and actual status

- The default local guardrail ledger is durable file-backed state, suitable for the single-instance local simulation, not multi-replica production.
- The orchestrator selects the official LangGraph `PostgresSaver` when `DATABASE_URL` is configured; otherwise its local durable `FileSaver` is used. This checkpoint store is distinct from the financial guardrail ledger.
- The private guardrail transactional ledger is selected separately through `GUARDRAIL_DATABASE_URL` with workspace binding; it must not silently fall back to files. See [`docs/postgres-runtime.md`](docs/postgres-runtime.md).
- Supabase/PostgreSQL migrations define public operational tables including owners, agent runs/actions, interrupts, audit log, kill/pause state, guardrail config, idempotency records, spend reservations, orders/refunds, webhook events and action outbox. The private `hotl_runtime` schema separately holds workspace bindings, workspace state and audit entries with restrictive runtime role/RLS policies.
- SQL and RLS are implementation/deployment artifacts, not evidence that hosted Supabase is provisioned or validated. The native PostgreSQL local runtime/restore drill has recorded evidence. Docker and hosted/cross-cluster restore coverage must be read from the verification record; do not infer it passed from migration existence.

### What “memory” currently means

Current persistence is operational memory, not a learned autonomous business brain:

- **Workflow/checkpoint memory:** LangGraph state preserves a run's cycle, status, targets/telemetry, product/campaign drafts, supplier orders, support tickets, planning contexts, action plan/key, active stage, replan counts, interrupts, guardrail decisions, logs and kill status. Checkpoints allow interrupted runs to resume.
- **Business-policy memory:** the guardrail state stores the versioned Business Constitution and its history, legacy config, domain controls, integrations/provider observations, operations and audit information in durable state/extensions.
- **Audit/event memory:** append-only hash-linked local audit entries and the separate emergency journal preserve action history. Audit head is not independently anchored externally.
- **Connector memory:** encrypted token vault data, sync snapshots, jobs, webhook inbox and provider-operation/reconciliation records support the bounded Shopify flow.
- **Customer/business learning memory:** persistent customer profiles/preferences, cross-channel conversation memory, validated product/supplier knowledge base, causal outcome-learning system, model training, and continuously improved policies are not implemented as a complete feature set. Do not describe saved graph checkpoints as those capabilities.

The file and checkpoint stores support local recovery; they are not automatically equivalent to high availability, multi-region disaster recovery, external immutability or hosted backups.

## 8. Feature status matrix

| Area | Status | What is actually supported / boundary |
| --- | --- | --- |
| Local product demo and simulated orders | Implemented locally | Storefront and owner cockpit; no real money |
| Deterministic financial guardrails | Implemented locally | Local policy and denial behavior; no unrestricted LLM authorization |
| Constitution and domain autonomy controls | Implemented locally | Versioned policy, conservative migration and owner controls |
| Audit, idempotency, replay and revision checks | Implemented locally | Durable local contracts and tests; no independent external audit anchoring |
| Pause and permanent kill latch | Implemented locally | Reversible pause, irreversible instance latch; deployed independent revocation unverified |
| LangGraph runs and human interrupts | Implemented locally | Small subset of target roles/domains; checkpointed |
| Connector framework | Partial | Shopify/WooCommerce bounded read adapters; fixtures/intercepts, no real connected merchants |
| Shopify OAuth/sync/webhooks | Implemented locally; externally unverified | Full bounded implementation surface; real app/store/callback/subscriptions/delivery not proven |
| Shopify owner price path | Implemented locally; externally unverified | Dev-store allowlist and owner flow only; not ordinary merchant or autonomous price control |
| Payments/settlement reconciliation | Missing for live operation | Demo checkout only; no central live payment execution |
| Supplier discovery and purchasing | Missing | No connected sourcing, scorecard or real purchase-order execution |
| Ads, attribution, creative distribution | Missing for live operation | Simulation/planning only; no live spend adapter |
| Inventory/fulfillment/shipping/returns/fraud | Partial/simulation | Some commerce concepts and data paths; no verified end-to-end real operation |
| Finance and unit economics | Partial | Simulation ledger and estimates; no reconciled real costs, fees, cash or tax |
| Customer relationship and memory | Missing/broad target | No complete channel-connected CRM/learning memory |
| Real-time observability/alerts/on-call | Missing as production operation | Local status/telemetry surfaces do not prove monitored deployment |
| Production multi-tenant hosted deployment | Missing/unverified | SQL/config exists; hosted operation not established |
| Measured profitability / autonomous business | Missing | No real business cohort or validated economic outcome |

For detailed scope and dependencies use [`docs/commerce-os-progress.md`](docs/commerce-os-progress.md), not only this summary.

## 9. Safety contracts that must survive prompt rewriting

Treat these as non-negotiable invariants from `AGENTS.md` and the source prompts:

1. Every financial or public mutation (listing, price, campaign, supplier PO, refund, checkout) must use the authenticated deterministic guardrail API. No agent may reproduce policy math or use an LLM to authorize spending.
2. Every successful mutation durably appends an audit event before success. Idempotency binds request, actor and operation. A historical `allow` replay is not fresh provider authorization.
3. Pause is reversible. Kill is a durable one-way latch with no disengage endpoint. Keep its deployment, credentials, storage and revocation authority independent from the main app.
4. Runtime models go only through LiteLLM with per-agent virtual keys. Never expose its admin/master key to agents or browsers.
5. Provider write credentials stay inside guardrails. Emergency credentials authorize revocation only. Orchestrator, commerce gateway, browser and build agents get no standing provider write credential.
6. Live financial adapters fail closed. Preserve the tightly allowlisted, owner-only Shopify development-store exception and its non-autonomous boundary. Never describe fixture receipts, mocked revocations, sample telemetry or unrun tests as production evidence.
7. Preserve persisted state and audit/kill journals. Missing, corrupt, unreachable or stale emergency state denies execution; never silently reset it.
8. Do not enable a capability merely because mode, API keys or a prompt says “autonomous.” Require implementation, relevant meaningful tests, denial simulations, staging evidence and owner sign-off at each phase.

“No errors ever” is not a credible acceptance criterion. Prefer measurable guarantees and residual-risk reporting: no unauthorized capability use, no duplicate provider write under retry/restart, no silent uncertain outcomes, explicit stale-data denial, complete audit linkage, and defined loss/intervention/error thresholds based on observed denominators and operating periods.

## 10. Latest recorded validation and its limits

The latest dated checkpoint is [the 2026-10-03 runtime-role escalation denial follow-up](evidence/gate-b-runtime-role-escalation-2026-10-03/README.md), extending the [2026-10-01 Gate A + Gate C provisioning checkpoint](evidence/gate-a-c-staging-provisioning-2026-10-01/README.md). PostgreSQL readiness now has a regression drill for both direct schema DDL and inherited `CREATEROLE` membership; all 33 disposable PostgreSQL 18.6 tests plus restart/restore checks passed. This is local evidence only. The [sanitized static preflight](evidence/gate-a-c-staging-provisioning-2026-10-01/PREFLIGHT.json) still reports 19 missing fields, active probes were not run, and external staging remains blocked. The full release checks listed below are historical and must be rerun before a release claim.

The base release-validation ledger is dated **2026-09-23**. Its local release checks were:

- `pnpm test`: 383 passed across guardrail (241), cockpit (26), connector (49), commerce (17), orchestrator (36), kill service (12) and launcher (2). The 25 database tests in the regular suite were skipped and have separate drill records.
- `pnpm lint`: passed.
- `pnpm typecheck`: 11 workspace tasks passed.
- `pnpm build`: eight workspace tasks passed.
- Targeted Shopify price recovery tests and actual Fastify route tests are included in the counts, with provider exchange intercepted.
- Native PostgreSQL runtime-ledger restart/dump/restore evidence and other earlier drills are listed in `docs/continuation-verification.md`, `docs/postgres-runtime.md`, `docs/verification.md` and `docs/infra-verification.md`.

Evidence files/logs are local and may be ignored by Git; cite their recorded paths and dates. This handoff did not rerun checks. Passing local checks prove neither a real provider transaction nor deployed revocation, hosted identity, production uptime, security review, or profitable business performance. The regular skipped DB tests are not counted as passing. Recheck the latest evidence document before making a release claim.

## 11. Gaps and dependency-ordered next work

### Gate A — establish the business and risk budget

Owner selects one pilot country, category, customer, channel and product evidence; document fully landed unit economics and actual inventory/purchase exposure. Set spend, loss, margin, refund and stop limits the owner can afford. AI must not invent these values or authorize itself against assumptions it generated.

### Gate B — prove one isolated provider environment

Provision an authorized Shopify development store, app, trusted HTTPS callback, scoped identities/secrets, separate workspace/ledger and independent emergency control. Verify real OAuth/token lifecycle, read sync, webhook registration and delivery, stale-data detection, owner approvals, provider read-back, audit binding, rotation, restart and backup/restore. Execute only the approved small owner-confirmed operation.

### Gate C — uncertainty, race, revocation and recovery

Resolve ambiguous provider outcomes with evidence that establishes causality; retain the per-resource write lock until safely resolved. Address the owner/provider edit race that lacks provider compare-and-swap. Test lost responses and process/database restarts without resend, actual credential revocation, main-stack-unavailable kill operation, alerting and restoration. Do not treat notes or an observed matching value as proof.

### Gate D — one supervised, reconciled commerce cycle

Only after Gate B/C: connect catalog, inventory, order, payment settlement, fulfillment, returns/refunds and finance with real reconciliation and explicit owner responsibility. Add supplier or ad spend only after their connectors have their own deterministic controls, evidence, reversals and failure drills. Keep shadow/approval/capped modes first.

### Gate E — measured expansion

Collect real operating periods and compare forecasts to actual settled contribution after product cost, fees, fulfillment, returns, ads, refunds and tax. Track exceptions, data staleness, loss/error rates, duplicate actions, owner interventions, latency, model cost, connector health and recovery. Promote one domain at a time only when predeclared owner-approved thresholds pass.

The full sequence and staging acceptance checklist are in [`production-continuation.md`](production-continuation.md), [`docs/shopify-closed-loop.md`](docs/shopify-closed-loop.md), and [`docs/commerce-os-progress.md`](docs/commerce-os-progress.md).

## 12. Documentation index for a reviewer

- Product prompts/history: [`docs/commerce-os-build-prompt.md`](docs/commerce-os-build-prompt.md), [`docs/production-continuation-prompt.md`](docs/production-continuation-prompt.md), [`docs/source-build-prompt.md`](docs/source-build-prompt.md).
- Current project checkpoint: [`readit.md`](readit.md); this handoff: `PROJECT_CURRENT_STATE.md`.
- Scope and plan: [`docs/commerce-os-progress.md`](docs/commerce-os-progress.md), [`production-continuation.md`](production-continuation.md), [`hotl-build.md`](hotl-build.md).
- Safety/API implementation contracts: [`docs/guardrail-api.md`](docs/guardrail-api.md), [`docs/implementation-notes.md`](docs/implementation-notes.md), [`apps/guardrail-service/README.md`](apps/guardrail-service/README.md).
- Provider limits and Shopify: [`docs/shopify-closed-loop.md`](docs/shopify-closed-loop.md), [`docs/shopify-oauth.md`](docs/shopify-oauth.md), [`docs/production-identity.md`](docs/production-identity.md).
- Data and recovery: [`docs/postgres-runtime.md`](docs/postgres-runtime.md), [`docs/restore-verification.md`](docs/restore-verification.md), [`docs/verification.md`](docs/verification.md), [`docs/infra-verification.md`](docs/infra-verification.md).
- Evidence/maturity/research: [`docs/continuation-verification.md`](docs/continuation-verification.md), [`docs/platform-comparison-and-level.md`](docs/platform-comparison-and-level.md).
- System architecture: [`docs/repo-structure.md`](docs/repo-structure.md), [`docs/langgraph-design.md`](docs/langgraph-design.md), [`docs/cockpit-schema.md`](docs/cockpit-schema.md), [`README.md`](README.md).

## 13. Prompt-engineer review brief

Please review the complete retained prompts alongside this handoff and answer:

1. Is every source requirement either mapped to implementation, explicitly partial, or explicitly deferred? Identify any unmatched source requirement.
2. Are the local simulation, owner-only Shopify development-store boundary, and “externally unverified” evidence labels preserved in any new build prompt?
3. Does the prompt keep all consequential mutations behind the guardrail API, with fresh authorization, idempotency, durable audit and a deny-safe outcome on missing/stale state?
4. Does it distinguish workflow checkpoints and policy history from the unimplemented customer/business learning memory target?
5. Is the next proposed milestone dependency-correct and testable against real staging evidence, without prematurely enabling broad autonomy?
6. Are existing state files, kill journal, source prompts, logs and local evidence preserved, and are no real secret values copied into the review prompt?
7. Which acceptance criteria can be objectively measured, and what business inputs must the owner supply before the platform can act?

Suggested reviewer output: requirement-to-status traceability matrix; factual corrections to this snapshot; safety invariants retained verbatim; next-milestone acceptance criteria; unresolved risks and owner decisions. Do not instruct an implementation agent to overwrite this handoff or the source prompts; append a dated review or propose changes for owner review.

---

**Snapshot caveat:** The historical sections and addenda retain their own dates. This current snapshot was refreshed on 2026-09-28; see the Gate C local-hardening addendum and its dated evidence package below. A file, migration, test, mock receipt or planned deployment is not proof of a hosted/live capability.

**September 24 source-control addendum:** Initial local source commit `f83938ff51a0f5531998ed11380d55863f55ad2f` and annotated tag `hotl-baseline-2026-09-24` now exist. The preserved [locked program plan](docs/locked-program-plan.md), [maturity register](docs/program-maturity-register.md), [Gate A worksheet](docs/pilot-business-risk-envelope.md), and [Gate B1 evidence](evidence/gate-b1-source-control/README.md) govern the next review. No real provider or hosted evidence was added by this source-control step.

**September 24 implementation addendum:** The newer [Gates A–C verification](docs/gates-a-c-verification-2026-09-24.md) supersedes the test totals and immediate gate details in Sections 10–11 above. The typed pilot business/risk draft, owner approval/invalidation, cockpit editor, local Shopify pre-write race guard, webhook-secret rotation, cross-workspace tests and restore evidence are now implemented or recorded. Current release checks passed with 408 distinct unit/integration tests and 11 local browser tests. Gate A remains owner-input-required, Gate B remains staging-incomplete, and Gate C has no external Shopify proof. The original Sections 10–11 are retained as the dated earlier snapshot, not as current evidence.

**2026-09-28 Gate C local-preflight hardening checkpoint:** See the [dated verification record](docs/continuation-verification.md#2026-09-28-gate-c-local-preflight-hardening) and [evidence package](evidence/gate-c-preflight-hardening-2026-09-28/README.md). The local work adds strict fail-closed Shopify persisted-state validation, deterministic and typed pilot economics, status-accurate webhook reconciliation, finite Shopify secret-rotation handling aligned to current Shopify documentation, explicit worker/readiness modes, and separate static versus opt-in read-only staging probes. Full local checks, isolated browser tests, and native PostgreSQL migration/restart/backup-restore drills passed. The Docker drill is unrun because the Docker daemon is unavailable. Static preflight lists the missing staging inputs and correctly reports external verification false. Gate A remains **PARTIALLY VERIFIED / OWNER INPUT REQUIRED**; Gate B remains **PARTIALLY VERIFIED / STAGING BLOCKED**; Gate C remains **LOCAL VERIFIED / EXTERNAL STAGING BLOCKED**. No Gate D work began, no capability was promoted to M4, and no real Shopify action occurred.

**2026-09-28 real Gate C evidence attempt:** The latest [evidence package](evidence/gate-c-shopify-external-2026-09-28/README.md) records the current blocked attempt and the exact sanitized [static preflight](evidence/gate-c-shopify-external-2026-09-28/PREFLIGHT.json). The 19 required staging fields remain missing. No active probe or Shopify request occurred, and no M4 promotion was made. Gate A remains unapproved because AI recommendations are not legal/business evidence or cockpit owner approval. Gate C remains blocked until the owner-authorized business envelope and isolated staging prerequisites, Shopify development store/app, and trusted HTTPS endpoints exist. The residual read→write race remains.
