# HOTL Commerce OS — Complete Checkpoint

Checkpoint date: 2026-09-23  
Workspace: `C:\Users\nahas\OneDrive\Desktop\HOTL`  
Runtime status: local simulation is runnable; this checkpoint does not claim a running demo or deployed production service.

**Prompt-engineer handoff:** See [PROJECT_CURRENT_STATE.md](PROJECT_CURRENT_STATE.md) for a dated, detailed snapshot of backend, frontend, database, memory, feature status, safety contracts, evidence, gaps and next gates. This supplements this checkpoint and preserves the original prompts; it does not replace them.

This file is the continuation and handoff record for the platform built from
`docs/commerce-os-build-prompt.md` and the latest
`docs/production-continuation-prompt.md`. The earlier source prompt is preserved in
`docs/source-build-prompt.md`. All implementation files are saved locally. This
September 23 checkpoint predates source control. The September 24 local baseline is
commit `f83938ff51a0f5531998ed11380d55863f55ad2f`, tagged
`hotl-baseline-2026-09-24`; see [Gate B1 evidence](evidence/gate-b1-source-control/README.md).

## Latest continuation — read first

The first guarded Shopify development-store workflow is implemented locally:
workspace-bound identity, browser-bound OAuth, encrypted expiring tokens, durable
sync/webhook work, canonical merchant revisions, owner cost evidence, typed price
proposals, one-use dispatch, provider read-back, receipts, read-only reconciliation,
and owner-visible controls. The provider transport targets Shopify API 2026-07.

This is **not production verification**. Tests used intercepted Shopify requests;
no actual merchant installation, token refresh, webhook delivery or price mutation
was executed. The default launcher remains simulation-only. Actual price dispatch
requires a separately configured live-auth guardrail process, a server allowlist,
provider-confirmed development-store status, durable storage, fresh emergency state
and every policy check. Ordinary merchant stores and autonomous price writes are
disabled. Payments, ads, suppliers and live refunds remain fail-closed.

Read these records before continuing:

- [Guarded loop, staging procedure and limitations](docs/shopify-closed-loop.md)
- [Current verification evidence](docs/continuation-verification.md)
- [OAuth and encrypted token lifecycle](docs/shopify-oauth.md)
- [Production identity and rotation contract](docs/production-identity.md)
- [File, workflow and kill-journal recovery](docs/restore-verification.md)
- [PostgreSQL runtime and backup/restore](docs/postgres-runtime.md)
- [Implementation dependency plan](production-continuation.md)
- [Platform comparison, HOTL maturity and business gaps](docs/platform-comparison-and-level.md)
- [Implemented scope and remaining domains](docs/commerce-os-progress.md)

### Changes added in this continuation

- Guardrail HTTP identity now binds owner/agent tokens to the configured workspace
  and authorization version. Agent keys can rotate and scopes can be reduced;
  session/token revocation and bounded token age are enforced.
- `shopify-oauth.ts` owns challenge claims, encrypted access/refresh tokens,
  revision-bound authentication invalidation and local disconnect. Credentials
  remain inside guardrails; disconnect does not claim provider revocation.
- `shopify-state.ts`, `shopify-provider.ts`, `shopify-webhooks.ts`, `shopify-service.ts` and
  `shopify-routes.ts` implement merchant observations, durable imports, HMAC inbox,
  bounded worker leases/retries and owner API routes. Owner-triggered shop-scoped
  webhook registration now makes one claimed, audited provider call per topic and
  verifies the exact callback by readback. The owner cockpit exposes the operation;
  real provider registration and delivery remain externally unverified.
- `engine.ts` implements deterministic proposal/claim/dispatch. A provider timeout
  or lost response cannot cause automatic resend. An unresolved operation blocks
  new proposals for the resource; observing a target price cannot prove causality.
  Compensation requires a new authorization and refuses intervening owner changes.
- An owner can now withdraw a `PENDING` Shopify price proposal with a reason. The
  cancellation is audited and bound to its request key. Once dispatch is claimed,
  an uncertain or confirmed outcome cannot be cancelled to bypass investigation.
  Recovery tests cover failed claim/result commits and lost commit acknowledgement;
  a restarted service never blindly repeats a provider write.
- Owners can append durable investigation notes to `DISPATCHING`, `UNKNOWN` and
  `DRIFT` price operations, bound to the current reconciliation. These notes are
  visible in the cockpit and preserve the uncertainty lock; supplied references
  are not verified provider event evidence.
- The cockpit adds a separate Shopify staging panel, two-step proposal/execution,
  cancellation, cost evidence, jobs and receipts. Its OAuth proxy forwards only the expected
  browser cookie and redacts callback errors.
- File ledgers and LangGraph checkpoints now have initialization markers and
  immediate durable initialization. Missing initialized state fails closed.
  Restore tests cover pending approval recovery and irreversible emergency state.
- Native and Docker runtime-ledger scripts now include dump/restore checks. The
  native path passed; the changed Docker path remains unrun because the daemon was
  unavailable. PostgreSQL restore verifies data, audit, RLS, bindings and denial.
- Browser tests use an isolated emergency port (14200) to avoid the unrelated
  process on 4200. No unrelated process was stopped to run the tests.
- Actual HTTP route tests now cover OAuth cookie exchange, owner and tenant
  isolation, raw-body webhook signature/size/replay, restart persistence and
  cancellation validation with isolated fixtures. No merchant endpoint was used.

## Default entry points when started

- Owner cockpit: http://127.0.0.1:3000
- Customer storefront: http://127.0.0.1:3001
- Guardrail API: http://127.0.0.1:4100
- Independent emergency stop: http://127.0.0.1:4200
- LangGraph orchestrator: http://127.0.0.1:4300
- Commerce gateway: http://127.0.0.1:4400

Start or restart the local stack with `pnpm dev`. It is intentionally labeled
simulation-only. No real payment, supplier purchase, advertising spend, refund,
shipment, or provider write is performed.

If port 4200 is occupied, choose an unused local emergency port and set both
`KILL_SWITCH_PORT` and `KILL_SWITCH_URL` consistently before `pnpm dev`. Do not stop
an unrelated process or reset the emergency journal to resolve a port conflict.

## What is implemented

### Commerce and safety foundation

- pnpm/Turborepo TypeScript monorepo with separate cockpit, storefront,
  commerce gateway, guardrail service, orchestrator, connector SDK, and
  independently deployable kill switch.
- Deterministic guardrail authorization for checkout, listings, pricing,
  campaigns, advertising reservations, supplier purchase orders, refunds,
  inventory, pause, and owner approvals.
- Integer-cent and basis-point policy math, margin floor, daily/monthly spend
  ceilings, supplier purchase caps, refund escrow, country/category boundaries,
  and authoritative server-side price/inventory checks.
- Durable append-only SHA-256 audit chain and request/actor/operation-bound
  idempotency. Successful mutations append audit before reporting success.
- Reversible pause and independent durable one-way kill latch. Kill storage,
  credentials, journal, and revocation authority stay outside the application
  pipeline. There is no disengage endpoint.
- Missing, corrupt, stale, or unreachable state fails closed. File writes use
  fsync and atomic replacement; Windows lock/contention behavior is tested.

### Business Constitution and owner control

- Versioned workspace name, goals, advisory context, autonomy mode, financial
  limits, market restrictions, prohibited categories, hard rules, and policy
  history.
- Five modes: Manual, Copilot, Supervised, Autonomous, and Custom.
- Twenty independently pausable domains with per-domain mode and automatic
  action limit.
- Manual product creation/editing, price and inventory changes, campaign pause,
  refunds, approval review, global pause/resume, and explicit expired-proposal
  replanning.
- Constitution and resource revisions are checked immediately before action;
  stale edits and stale approvals cannot overwrite newer owner decisions.

### Runtime orchestration

- Actual LangGraph.js workflow for sourcing, marketing, operations, and support.
- Versioned plans and persisted checkpoints.
- Sequential Copilot approvals, supplier lines, refund escalation, replay-safe
  action keys, checkpoint restart, bounded stale replanning, and expired proposal
  recovery.
- Runtime model calls route through LiteLLM scoped virtual keys. The proxy
  administration key is excluded from runtime agents and browser processes.

### Integrations and data

- Connector SDK with canonical product, variant, inventory, order, and order-line
  types.
- Shopify Admin API 2026-07 and WooCommerce `wc/v3` read-only adapters.
- HTTPS/SSRF protections, trusted WooCommerce host allowlist, bounded retries and
  pagination, webhook HMAC verification, safe error normalization, encrypted
  AES-256-GCM credential storage, owner isolation, sync revisions, and preserved
  snapshots on provider failures.
- Imported merchant snapshots remain separate from the editable simulation
  catalog and finance ledger.
- Finance page reports persisted sales, refunds, estimated catalog costs,
  advertising reservations, contribution estimates, data-quality notes, and
  explicit `Unavailable` values where evidence is missing.

### UI and user experience

- Owner cockpit navigation for Overview, Agents, Approvals, Products, Orders,
  Finance, Integrations, Autonomy & policy, Guardrails, and Activity.
- Responsive desktop/mobile layouts, light/dark theme persistence, searchable
  activity, accessible labels, approval dialogs, safe manual forms, connection
  forms, and explicit simulation banners.
- Storefront cart, checkout retry idempotency, server-authoritative prices, and
  optional user-entered two-letter destination country.

### Persistence and infrastructure

- Local file ledger and independent kill journal preserve existing working data.
- Private PostgreSQL runtime ledger with transactional state plus mirrored audit
  entries, advisory locking, RLS/workspace binding, append-only constraints,
  rollback guarantees, and no file/cache fallback.
- Explicit empty-database initialization flag; missing production data is never
  silently recreated.
- Native PostgreSQL and disposable Docker drills, optional Redis/BullMQ,
  LiteLLM configuration, Supabase migrations, and separate deployment runbooks.

## Files and important contracts

- `apps/guardrail-service/src/engine.ts` — deterministic policy engine and
  persistence boundary.
- `apps/guardrail-service/src/server.ts` — authenticated guardrail HTTP API.
- `apps/guardrail-service/src/stores/postgres.ts` — private PostgreSQL runtime
  store.
- `apps/guardrail-service/src/integration-service.ts` — encrypted read-only
  connector lifecycle and syncs.
- `apps/orchestrator/src/graph.ts` and `apps/orchestrator/src/manager.ts` —
  LangGraph plan execution, interrupts, resume, and replanning.
- `packages/schemas/src/constitution.ts` — shared Constitution and domain policy
  schemas.
- `packages/connector-sdk/src/` — canonical connector implementations.
- `apps/cockpit/src/components/cockpit.tsx` — owner cockpit shell and approvals.
- `apps/cockpit/src/components/operating-pages.tsx` — Constitution editor.
- `apps/cockpit/src/components/integrations-page.tsx` — connection management.
- `apps/cockpit/src/components/finance-page.tsx` — finance evidence view.
- `apps/storefront/app/page.tsx` — customer storefront and checkout form.
- `scripts/dev.mjs` and `scripts/dev-env.mjs` — scoped local process launcher.
- `infra/kill-switch/` — independent emergency stop.
- `infra/supabase/migrations/` — normalized and runtime-ledger SQL.

## Current verification checkpoint

On 2026-09-23, `pnpm test` passed **383 tests** (including the 29 guarded price,
10 HTTP route and 26 cockpit tests; 25 database tests skipped in this command).
`pnpm lint`, `pnpm typecheck` and `pnpm build` passed. The detailed evidence is in
[continuation evidence](docs/continuation-verification.md). These tests use local
fixtures and intercepted provider requests; they do not verify Shopify execution.

Executed on 2026-09-21: `pnpm test` **350 passed** (25 DB tests skipped in that
command), `pnpm build` passed, and `pnpm test:e2e` **11 passed**. The native
PostgreSQL 18.3 drill passed **32 tests**, restart verification and a real
dump/restore with matching state/audit digest and restored authorization denial.
The DB total overlaps the package configuration tests; do not add these numbers
as unique tests. Final lint/typecheck and launcher checks are recorded in the
[continuation evidence](docs/continuation-verification.md).

Current Docker execution is unrun: the Linux daemon was unavailable. The older
successful Docker checks below are retained as history and do not verify the
new restore additions. No new hosted deployment or Shopify evidence is claimed.

### Earlier verification retained from the September 17 checkpoint

The following checks were recorded before this production continuation:

- `pnpm install --frozen-lockfile --offline`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`: 201 package and launcher tests passed.
- `pnpm test:e2e`: 11 isolated Chromium tests passed.
- Native PostgreSQL 18.3 runtime ledger drill: 32/32 passed, including 11
  actual guardrail-engine tests and restart digest verification.
- Docker PostgreSQL 18.6 runtime ledger drill: 32/32 passed, including restart
  digest verification and owned-resource cleanup.
- Docker PostgreSQL 16 normalized migration/RLS drill passed.
- Visual inspection captured cockpit, Constitution, Integrations, Finance, and
  storefront at desktop and mobile sizes with no page errors or horizontal
  overflow.
- Medusa staging adapter previously passed its independent typecheck, 25 tests,
  and JavaScript build. Its native mutation routes remain disabled.

The evidence and dates are recorded in `docs/verification.md`,
`docs/postgres-runtime.md`, and `docs/infra-verification.md`. Remote CI,
hosted Supabase, production poolers, real merchant accounts, real LiteLLM key
issuance, live payment execution, provider revocation, queue draining, and an
independent production deployment remain unverified.

## Preserved workspace state

The working simulation ledger and emergency journal were preserved throughout
the build. Do not delete or reset these paths:

- `data/guardrail-state.json`
- `data/orchestrator-checkpoints.json`
- `infra/kill-switch/data/events.jsonl`
- `.secrets/connectors.key`

Browser drills use isolated `.data/e2e-<id>` directories and do not reuse or
modify the working demo state.

## Ordered feature plan

### Phase 1 — Stabilize the current simulation

1. Keep `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and both browser
   and database drills green.
2. Completed locally: restore drills for the file ledger, PostgreSQL ledger,
   workflow checkpoints and independent kill journal. Re-run the changed Docker
   restoration path when its daemon is available.
3. Review audit retention, backup, and operator access before any deployment.

### Phase 2 — Production identity and persistence

1. Provision Supabase/PostgreSQL runtime logins with administrator-bound workspace
   UUIDs and no DDL, superuser, or `BYPASSRLS` access.
2. Verify owner Supabase Auth, short-lived agent JWTs, Realtime behavior, pooler
   semantics, backups, restore, alerting, and external audit retention.
3. Deploy the kill switch independently and run real revocation and main-stack-down
   drills. Keep deployment credentials outside the main application pipeline.

### Phase 3 — One complete guarded provider workflow

1. Implemented locally: Shopify installation, encrypted token refresh, durable
   sync/webhook inbox, guarded price dispatch and owner UI.
2. **Next dependency:** connect an authorized development store with an app and
   trusted HTTPS callback; prove read sync, stale sync cancellation,
   webhook freshness/reconciliation, and credential rotation.
3. Verify the implemented price path against that store: provider receipt,
   read-back, replay denial, uncertain outcomes, restart, compensation and audit.
   Resolve the external read/write race and add an auditable uncertainty-resolution
   workflow before considering ordinary merchant or autonomous enablement.
4. Keep all other provider writes fail-closed until their own staging evidence is
   complete.

### Phase 4 — Commerce operating capabilities

1. Add supplier discovery, scoring, negotiation, redundancy, and purchase
   workflows with the same deterministic authorization boundary.
2. Add inventory reconciliation, demand forecasting, pricing experiments,
   marketplace listings, fulfillment, shipping exceptions, returns, fraud, and
   chargeback workflows.
3. Add advertising connectors, attribution, creative approval, creator/affiliate
   workflows, CRM, retention, customer memory, and support channels.
4. Add tax, localization, multi-store/multi-brand workspaces, team roles,
   notifications, and extension APIs only after ownership and audit contracts are
   explicit.

### Phase 5 — Measured autonomy

1. Add shadow-decision mode, digital-twin projections, opportunity scoring,
   continuous evaluation, model-cost budgets, and morning executive briefs.
2. Measure false approvals, stale replans, economic outcomes, connector health,
   latency, audit completeness, and owner intervention rates.
3. Expand autonomous domains only from evidence and owner sign-off. A configured
   mode never creates a capability that has not been implemented and tested.

## Continuation rules

- Preserve persisted state and journals.
- Keep simulation and production evidence visibly separate.
- Route every financial/public mutation through the authenticated deterministic
  guardrail service.
- Never expose provider write credentials, database credentials, or LiteLLM master
  credentials to agents or browser code.
- Do not claim a live integration, production receipt, deployed revocation, or
  passing remote CI check until it has actually run and its evidence is recorded.
- Continue from this file and the linked documents rather than rebuilding the
  workspace from the original prompt.
- Do not turn local fixture receipts into production evidence or bypass unresolved
  operation locks. Preserve both the state files and their initialization markers.

## 2026-09-24 Gates A–C continuation checkpoint

The [latest verification](docs/gates-a-c-verification-2026-09-24.md) records the new typed pilot Constitution draft, owner approval and invalidation, stop-rule enforcement, cockpit editor, Shopify webhook secret-rotation window, second provider pre-write read, signed cross-workspace denial tests and local restore evidence. Repository checks passed: lint, typecheck, 408 distinct unit/integration tests, build and 11 isolated simulation browser tests. Native PostgreSQL restart/restore passed separately; changed Docker restore remains unrun without its daemon. The owner's pilot values remain `UNKNOWN`, so Gate A is not approved. No Shopify store, app or trusted HTTPS staging endpoint is set up, so Gate C is externally unverified. Gate D has not started.

## 2026-09-28 AI pilot recommendation checkpoint

The [owner actions guide](docs/gate-a-c-owner-next-actions.md) is the next handoff. The owner asked AI to choose the direction, so [the dated research recommendation](docs/pilot-ai-recommendation-2026-09-28.md) provisionally selects a U.S./USD target market; its three-product screen found no launch-ready product. An under-desk cable tray remains only the simplest research lead, with no demand trend or viable margin established. The owner’s legal seller country, unit economics, capital/reserve and risk caps remain `UNKNOWN` until verified and approved in the cockpit. Shopify staging remains not set up, so Gate C is blocked. No new technology was needed for this research, so no dependencies were added. Keep provider and deployment secrets in the appropriate secret managers; never put them in the evidence ledger.

The ordered [next Gates A–C working plan](next-gates-a-c-working-plan.md) is saved in the project root. It records the initial product screen as complete, then orders owner approval and isolated staging prerequisites before real provider drills and the evidence freeze. Gate D remains out of scope.
