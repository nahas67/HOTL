# Project: Human-on-the-Loop Commerce (HOTL)

Build and maintain the commerce operating system specified in
`docs/commerce-os-build-prompt.md`, continued by
`docs/production-continuation-prompt.md`. Read `readit.md` and
`docs/continuation-verification.md` for current implementation and evidence.
The earlier B2C build package remains in
`docs/source-build-prompt.md` for implementation history and safety contracts.
The runnable system is an explicitly labeled local simulation. Preserve that boundary
until production integrations and deployed safety drills have been completed.

## Engineering rules

1. Financial and public mutations belong inside the deterministic guardrail service.
   All listings, price changes, campaigns, supplier POs, refunds, and checkout mutations
   must use its authenticated API. No agent may reproduce its policy math or use an
   LLM to authorize spending. See `docs/guardrail-api.md`, `docs/implementation-notes.md`,
   and `apps/guardrail-service/README.md` for target and implemented contracts.
2. Every successful mutation must durably append an audit event before reporting success.
   Enforce idempotency with request/actor/operation binding. A replayed historical
   allow response never grants fresh authorization for a provider action.
3. Pause is reversible. Kill is a durable one-way latch with no disengage endpoint.
   The kill service stays in `infra/kill-switch/`, with an independent deployment,
   credentials, storage, and revocation authority. Never put its deployment secrets
   or deployment steps in the main application pipeline.
4. Runtime LLM calls go exclusively through LiteLLM using per-agent virtual keys.
   The proxy administration/master key must never reach a runtime agent or browser.
5. Provider write credentials belong exclusively to the guardrail service. Emergency
   credentials authorize independent revocation only. Build agents, browser bundles,
   commerce gateways, and orchestrators must not receive standing provider write keys.
6. Live financial adapters currently fail closed. The owner-only Shopify
   development-store price path is a separately configured, externally unverified
   exception; preserve its allowlist, provider development-store check and disabled
   autonomous/ordinary-merchant boundary. See `docs/shopify-closed-loop.md`.
   Never label simulated receipts,
   mocked revocations, sample telemetry, or unrun tests as production evidence.
7. Preserve persisted state and audit/kill journals. Missing, corrupt, unreachable,
   or stale emergency state must deny execution; never silently reset it.
8. A phase requires implementation, relevant tests, and a passing denial simulation.
   Use meaningful concurrency, replay, ownership, failure, and restart tests where
   the change affects these guarantees.

## Workspace and verification

Use pnpm workspaces and TypeScript. Runtime graph: LangGraph.js; optional queues:
BullMQ/Redis; production target: Supabase/Postgres; UIs: Next.js; Medusa integration:
`apps/commerce-core/medusa`. See `docs/repo-structure.md` and the root README.

Run the relevant package's test/typecheck when changing it. Release validation uses
`pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. The SQL migration/RLS
drill is `bash infra/scripts/test-database.sh` and requires a working Docker daemon.
Record unavailable infrastructure checks as unrun.

## Build agents

The user-supplied phase plan explicitly authorizes direct specialized build agents
from `.codex/agents/`. Assign bounded independent ownership; only the root coordinates
delegation. Child agents must not recursively delegate. Honor host concurrency limits.
Never parallelize dependent guardrail implementation and orchestration integration.
Use inherited model/effort unless the user requests an override. All changes share
one workspace; do not overwrite another agent's work.

These build agents are separate from the runtime business agents. Runtime agents do
not use the Codex build roster and cannot elevate their scopes through it.
