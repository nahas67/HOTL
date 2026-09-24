# Implemented behavior and source corrections

The current Commerce OS prompt is preserved in [commerce-os-build-prompt.md](commerce-os-build-prompt.md), with current scope in [commerce-os-progress.md](commerce-os-progress.md). The earlier B2C prompt remains in [source-build-prompt.md](source-build-prompt.md).
Sections 5–8 are extracted into the requested contract files. Their examples describe
the intended production design; the runnable implementation makes the following
explicit corrections and has the following limits.

## Runnable application

`pnpm dev` runs a Next.js cockpit and storefront, a Fastify commerce gateway,
deterministic guardrail service, actual LangGraph graph, and separate emergency-stop
process. Simulation needs no Docker or external provider credentials. Catalog,
initial metrics, sample creatives, and starting orders are fixtures. New simulation
orders, decisions, reservations, refunds, and run events are durably recorded locally.

The default guardrail ledger and LangGraph checkpoints are local files. They support
the local instance, not production horizontal scaling. `DATABASE_URL` selects the
official PostgresSaver for LangGraph only. Separately, `GUARDRAIL_DATABASE_URL` and
`GUARDRAIL_WORKSPACE_ID` select the private transactional guardrail ledger, with an
administrator-bound runtime login and no file fallback. See [database provisioning](postgres-runtime.md).
Setting `HOTL_MODE=live` enables strict authentication and still denies new financial
execution with `LIVE_ADAPTERS_UNAVAILABLE`.

The Medusa module under `apps/commerce-core/medusa` is integration groundwork. The
default running commerce gateway is not a deployed Medusa/Stripe payment processor.
No supplier purchase, card charge, paid campaign, or provider refund is made by the
local application. Trend, supplier, advertisement, and support provider adapters
still need owner-specific implementation and staging validation.

## Contract corrections

The authoritative implemented HTTP contract is
[the guardrail service README](../apps/guardrail-service/README.md). Shared validation
is in `packages/schemas`, with service-specific strict schemas where appropriate.

| Source sketch | Implemented boundary |
| --- | --- |
| Spend preflight is a read without idempotency | `/spend/check` atomically **reserves** budget and requires `Idempotency-Key`, eliminating check-then-spend races. |
| Platform executes after receiving allow | Execution belongs inside the guardrail service. `/campaigns/launch` checks, reserves, commits, and simulates the campaign atomically. |
| Margin preflight permits later publish | `/listing/publish` rereads stored costs and validates at execution; preflight does not authorize a future provider write. |
| Supplier gate is optional for large POs | Every supplier PO passes the guardrail boundary. |
| Refund threshold compares each request | Cumulative refunds per order enforce the $25 default, preventing split requests from bypassing escrow. Paid balance also caps all refunds. |
| Owner approval implies successful execution | Owner changes are revalidated. A failed margin or spend rule leaves the interrupt pending. |
| Resolution returns a resumed thread | Guardrail resolution records the decision and executes once; the cockpit/orchestrator separately verifies it and invokes `Command(resume)`. |
| Kill engage lives under the main guardrail API | The cockpit proxies to the independent kill service `/engage`; the guardrail service only reads independent `/state`. |
| Kill response lists all revocations immediately | HTTP 202 confirms the durable latch. Each action remains pending, failed, or unconfigured until a matching successful hook receipt arrives. |
| Single global kill row | Production SQL uses `owner_id` to partition all owner state; an isolated kill deployment currently represents one platform instance. |
| Floating point money in tables | SQL uses integer cents and basis points; HTTP accepts USD decimal amounts with at most two decimal places. |

Owner configuration cannot lower the margin floor below 40% or raise it above 99%,
and cannot raise automatic refunds above $25. SQL and shared API schemas enforce
these hard bounds; the owner may choose stricter controls.

Audit chains detect changed records but do not independently anchor their head.
A privileged filesystem or database administrator could rewrite or replace storage.
Production requires independent retention and an external trusted anchor.

## Production data and access

`infra/supabase/migrations/202609070001_hotl.sql` adds the requested tables plus owners,
pause state, idempotency, spend reservations, commerce orders, refunds, webhook events,
and an outbox. Browser roles only read rows for their authenticated owner subject with
`app_metadata.role=owner`; they cannot invoke financial database functions. Cross-owner
foreign keys and immutable-owner triggers protect record ownership. The trusted
`hotl_guardrail` role and Supabase service role have server-side access; neither belongs
in a browser or agent. The service role can cross tenants and therefore needs tight
operational control. RLS does not itself validate provider receipts or authenticate
the `p_owner` argument of trusted server routines.

The transactional ad functions reserve/begin/commit allocations, serialize concurrent
reservations with row locks, bind idempotency, and audit outcomes. They are migration
groundwork, not a complete production adapter. Refund triggers enforce paid balance,
aggregate escrow threshold, and daily refund pool, but a production refund executor
must additionally bind the approved payload and amount to a one-time provider action.
Do not enable live execution against this schema without implementing and testing that
transactional adapter, including outbox delivery, receipt reconciliation, and kill-state
freshness checks. Local Postgres Compose uses an Auth shim solely for RLS testing;
it does not supply Supabase Auth or Realtime.

## Runtime and owner loop

The graph checks stop state before its cycle and the guardrail checks again before
consequential actions. An interrupt checkpoints the graph; persisted owner resolution
is verified before resume. Simulation uses a durable file saver; Postgres uses the
official checkpointer. Redis workers are enabled only with `REDIS_URL` and
`ENABLE_QUEUE_WORKERS=true`. Daily scheduling separately requires
`ENABLE_SCHEDULED_RUNS=true`. These options are not enabled by the default demo.

The cockpit reads runtime APIs for simulation and can subscribe to configured
Supabase Realtime. The local file ledger does not automatically publish changes
into Supabase. Completing that persistence path is required for production realtime
to reflect actual financial events.

## Build roster corrections

The roster inherits the user's model and effort; stale placeholder model names in
the source are not copied into active TOML. Project config caps direct spawned agents
at three so a four-slot host can include the parent. `AGENTS.md` explicitly prohibits
recursive delegation. Current custom-agent files use `name`, `description`, and
`developer_instructions`, with supported optional sandbox settings, as documented in
[official OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
The installed CLI is older than the current app, so config uses the documented
legacy `max_threads` alias. No claim is made that all seven custom agents were
launched in a new CLI session.

## Verification boundaries

See [infrastructure verification](infra-verification.md) for checks actually run and
[production runbook](production-runbook.md) for prerequisites. The source Phase 8
owner pilot is not performed automatically. Local test success does not establish
real provider delivery, cloud credential separation, deployed queue draining, or a
production kill drill.
