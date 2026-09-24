# HOTL — Human on the Loop Commerce

A local, working commerce platform built from the supplied build package. The owner cockpit, storefront, deterministic guardrail API, LangGraph workflow and independent emergency stop run together in explicitly labeled **simulation mode**. Simulation orders, approvals, spend reservations, refunds, inventory and audit entries are persisted; no real funds move.

The latest continuation adds Shopify OAuth, durable sync/webhook processing and an
owner-operated guarded development-store price workflow. It is locally tested and
**externally unverified**; normal merchant and autonomous price writes stay disabled.
Owners can cancel a pending price proposal with an audited reason before dispatch.
Start with the [complete checkpoint](readit.md), [project current-state and prompt-engineer handoff](PROJECT_CURRENT_STATE.md), [staging loop](docs/shopify-closed-loop.md)
and [current evidence](docs/continuation-verification.md).

The owner-supplied [locked program plan](docs/locked-program-plan.md) sets the next evidence gates. [Gate A's pilot business and risk worksheet](docs/pilot-business-risk-envelope.md) records unknown owner inputs without treating them as approved policy.

## Run locally

Requires Node.js 22.13 or newer and pnpm 10.17.1 (the root `packageManager` selects it through Corepack).

```powershell
pnpm install
pnpm dev
```

Open the owner cockpit at **http://127.0.0.1:3000** and the customer storefront at **http://127.0.0.1:3001**. External API keys and Docker are not needed for the default simulation. All development listeners bind to loopback.

Optional configuration: copy `.env.example` to `.env`. The launcher gives each process only its permitted configuration; provider credentials and the LiteLLM administration key do not reach runtime agents or browser applications. Development authentication defaults are for the local simulation only; they are rejected in live mode.

## Try the complete workflow

1. Add a product to the storefront bag and place a demo order. Price and inventory are validated server-side, and the order appears in the cockpit.
2. Review the three seeded owner approvals. These historical examples require explicit review against the current policy. Approve the $42 refund; adjust the held diffuser price to $49; reduce the $50 campaign request to fit the available daily budget. Approval cannot bypass a deterministic margin or budget rule.
3. Run a daily cycle from the cockpit. The actual LangGraph runtime calls the actual guardrail service, processes sourcing/marketing/fulfillment/support, and pauses for an eligible refund over $25.
4. Resolve its approval to resume the graph. Reload or restart the services while it is waiting; the saved checkpoint preserves its position. Retried requests cannot repeat the financial action.
5. Pause the platform. Checkout and consequential agent actions are denied until you release Pause.

The **Autonomy & policy** page manages the versioned Business Constitution and all twenty domain controls. Existing ledgers migrate conservatively to Manual mode; choose the desired mode explicitly. New simulation workspaces start in Supervised mode. Products can be created and edited manually, and stale changes cannot overwrite a newer owner edit. Integrations supports encrypted read-only Shopify and WooCommerce imports; Finance reports persisted simulation transactions and labels estimates and unavailable metrics. See the [current scope and remaining product work](docs/commerce-os-progress.md).

The emergency stop requires `STOP EVERYTHING`, a reason and recent reauthentication. The local reauthentication password is `confirm-local-stop`. It permanently latches the selected **simulation instance**. There is no disengage endpoint. Revocation hooks accurately show `unconfigured` until an independently authorized provider hook confirms a result. Use automated drills for testing without latching your working demo.

## Services

| Component                            | Location                 | Local port |
| ------------------------------------ | ------------------------ | ---------- |
| Next.js owner cockpit                | `apps/cockpit`           | 3000       |
| Next.js storefront                   | `apps/storefront`        | 3001       |
| Fastify guardrail service            | `apps/guardrail-service` | 4100       |
| Isolated emergency stop              | `infra/kill-switch`      | 4200       |
| LangGraph orchestration              | `apps/orchestrator`      | 4300       |
| Commerce gateway and signed webhooks | `apps/commerce-core`     | 4400       |
| Shared Zod contracts                 | `packages/schemas`       | —          |

Local business state lives under `data/`; the stop journal lives separately in `infra/kill-switch/data/`. Keep those directories when restarting. A corrupt audit chain fails closed. File persistence supports the local single-instance simulation; it is not a multi-replica production database.

## Validation

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The tests cover concurrent spend reservations, margin rejection, refund limits and splitting, inventory validation, idempotent replay, immutable audit entries, agent scopes, payment webhook signatures, an actual LangGraph-to-guardrail approval round trip, checkpoint restart, and an isolated emergency-stop drill with the main application unreachable.

Browser checks exercise checkout, owner navigation, responsive layout, pause denial, margin denial, emergency confirmation, and graph interrupt/resume:

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser suite starts a fresh stack with independent state under `.data/e2e-<id>` and does not reuse a running demo. Stop `pnpm dev` before running it. The drill excludes external database, queue, model and service settings and preserves your working data and emergency-stop journal. Run `./infra/scripts/test-database.ps1` for the original native PostgreSQL drill, `./infra/scripts/test-runtime-ledger.ps1` for the private runtime ledger drill, or `bash infra/scripts/test-database.sh` with Docker. The optional [Medusa staging adapter](apps/commerce-core/medusa/README.md) has its own install, typecheck, tests, and build.

See [verification results](docs/verification.md) for checks actually completed and the infrastructure checks still outstanding.

## Infrastructure and production boundaries

The repository includes Supabase SQL/RLS migrations, optional PostgreSQL/Redis/LiteLLM Compose services, scoped virtual-key provisioning, BullMQ workers, and an independent kill-switch image/deployment path. Set `DATABASE_URL` to use the official LangGraph PostgresSaver; otherwise the local durable file checkpointer is used. Queue workers require both `REDIS_URL` and `ENABLE_QUEUE_WORKERS=true`; daily scheduling additionally requires `ENABLE_SCHEDULED_RUNS=true`.

**Live financial adapters remain disabled.** The separately configured Shopify development-store price path is the narrow exception described in the [staging runbook](docs/shopify-closed-loop.md); the default simulation never enables it. The Medusa staging bridge compiles and rejects unverified execution receipts; central payment execution and guarded native commerce workflows still need implementation. A production launch also needs approved supplier/ad/support integrations, deployed database/authentication validation, per-agent LiteLLM keys, and independent revocation hooks plus deployed drills. The [private guardrail Postgres ledger](docs/postgres-runtime.md) is selected separately with `GUARDRAIL_DATABASE_URL` and an administrator-bound workspace login; it never falls back to files. Merely adding API keys or setting `HOTL_MODE=live` does not enable spending. The staging pilot and owner sign-off from the specification remain external launch gates.

The dashboard uses seeded historical metrics in simulation; actual demo orders, approvals, spend and action logs update as you interact. Model drafts use deterministic sample content by default; configured live model requests route exclusively through LiteLLM.

See the `docs/` contracts and deployment runbooks for details. The original supplied prompt is retained there for traceability, with implementation corrections recorded separately.
