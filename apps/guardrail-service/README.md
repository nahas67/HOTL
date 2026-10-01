# Guardrail service

Deterministic TypeScript middleware for the HOTL local simulation. All simulated commerce, campaign, supplier, listing, and refund execution happens inside this service. The service performs the policy check and simulated mutation in the same transaction. Separately configured owner-only Shopify development-store price and shop-scoped webhook registration paths also live here; they have local fixture evidence but no actual merchant verification. See the [staging contract](../../docs/shopify-closed-loop.md). Normal merchant writes and live payment, refund, supplier and advertising execution remain disabled.

## Start and verify

From the workspace root, copy `.env.example` to `.env` and run `pnpm dev` to start the complete local stack. The guardrail HTTP listener binds to `127.0.0.1:4100`. Its independent emergency-stop dependency normally runs at `127.0.0.1:4200`.

```powershell
pnpm --filter @hotl/guardrail-service dev
pnpm --filter @hotl/guardrail-service test
pnpm --filter @hotl/guardrail-service typecheck
```

The workspace launcher loads the root `.env` and gives each service only its permitted configuration. Standalone processes use explicitly provisioned environment variables; they do not reload a shared `.env` containing other services' credentials. Set `GUARDRAIL_STATE_PATH` to choose the persistent JSON ledger location. Without an override the standalone service uses `.data/guardrails.json` relative to its process directory. The programmatic engine can run entirely in memory for tests.

## Authentication

`HOTL_MODE` accepts only `simulation` or `live`; unknown values fail startup. An injected engine and HTTP authentication mode must match.

In simulation mode, every private request requires `X-HOTL-Internal-Token` matching `HOTL_INTERNAL_TOKEN`. An optional `X-HOTL-Agent-Id` establishes one of the five department identities and its fixed scopes. Without that header, the trusted server-to-server gateway represents `simulation-owner`. This token is a local development credential and must never be included in client JavaScript or exposed on a public service.

In live mode, local gateway headers are rejected. Agent requests require `Authorization: Bearer <JWT>` with HS256 signing using `AGENT_JWT_SECRET` (at least 32 characters), issuer `AGENT_JWT_ISSUER` (default `hotl-agents`), audience `hotl-guardrails`, `sub` equal to the agent ID, `role: agent`, and both `iat` and `exp`. Tokens have a maximum lifetime and age of 15 minutes. The space-separated `scope` claim uses values such as `hotl:spend hotl:context`; granted scopes are intersected with the department allowlist. A wildcard cannot elevate an agent.

Owner requests use Supabase JWTs verified through `SUPABASE_URL/auth/v1/.well-known/jwks.json`, with the matching Auth issuer, `authenticated` audience, RS256 or ES256 signature, and `app_metadata.role: owner`. The subject must appear in `OWNER_USER_IDS` (comma separated; `OWNER_USER_ID` and `SUPABASE_OWNER_IDS` are accepted aliases). Agent identities cannot resolve interrupts or change owner controls even when their token contains owner-like scopes.

| Agent | Scopes |
| --- | --- |
| `sourcing_agent` | `listing`, `runs`, `context` |
| `marketing_agent` | `spend`, `campaign`, `runs`, `context` |
| `order_agent` | `supplier`, `commerce`, `runs`, `context` |
| `support_agent` | `refund`, `runs`, `context` |
| `master_orchestrator` | `status`, `runs`, `context` |

The full [production identity contract](../../docs/production-identity.md) additionally
requires a trusted server workspace, matching signed workspace and authorization
version, token/session identifiers and bounded token age. It documents key rotation,
revocation and reduced agent scopes. The introductory claim examples above are not
complete token templates. Live startup also binds HTTP and database workspaces.

## HTTP contract

The mutation base is `/api/guardrails/v1`. Every mutation requires a nonempty `Idempotency-Key` of at most 200 characters, including spend reservations and config patches. Margin preflight is read-only and does not need a key. USD amounts accept at most two decimal places. Validation rejects unknown fields.

The same key with the same normalized request, authenticated actor, operation, and execution mode returns the original response without repeating its side effect. A changed request returns HTTP 409 `IDEMPOTENCY_CONFLICT`. Historical replay may return an earlier allow response during a later pause; it performs no new action and is not fresh permission to call an external provider. A denied request remains denied on replay; a deliberately changed operation after controls change needs a new key. A filesystem writer conflict returns HTTP 503 `STATE_BUSY`; retry with the original key.

| Method and path | Access | Request / result |
| --- | --- | --- |
| `POST /spend/check` | `spend` | `{agentId,campaignId,requestedAmount,currency?,runId?}` → decision and, if allowed, `reservationId`, `expiresAt`, remaining daily budget |
| `POST /spend/commit` | `spend` | `{reservationId,providerReference?}` → commit a valid reservation exactly once |
| `POST /campaigns/launch` | `campaign` | Same input as spend check → reserve, commit, and create a simulated campaign atomically |
| `POST /listing/margin-check` | `listing` | `{sku,sellingPrice,landedCost,estimatedCac,currency?}` → decision, `marginPct`, `floor` |
| `POST /listing/publish` | `listing` | `{productId,sellingPrice?}` → validate stored product costs and publish |
| `POST /supplier-orders` | `supplier` | `{productId,quantity,orderId,runId?}` → one simulated PO for a complete order line |
| `POST /refunds/evaluate` | `refund` | `{orderId,amount,currency?,reasonCode,requestedBy?,runId?}` → automatic refund or pending interrupt |
| `POST /interrupts/:id/resolve` | Owner | `{decision: approve\|reject\|modify,modifiedPayload?,note?,resolvedBy?}` → execution and resumable `threadId` |
| `POST /pause/engage` | Owner | `{reason?}` → pause new execution |
| `POST /pause/release` | Owner | `{reason?}` → release pause only if independent kill status is available and disengaged |
| `GET/PATCH /guardrails/config` | Owner | Read config, or patch `dailyAdSpendCeiling`, `marginFloor`, `autoRefundThreshold`, `currency` |
| `POST /commerce/checkout` | `commerce` | `{items:[{productId,quantity}],customer:{name,email}}` → priced simulation order; no charge |
| `POST /commerce/events` | `commerce` | `{eventId,type,orderId,tracking?}` → deduplicated payment/fulfillment event |
| `POST /runs/event` | `runs` | `{runId,cycle,status,agentId?,summary?}` → durable run telemetry |

Use `/campaigns/launch` directly to execute a simulated campaign. Do not call `/spend/check` followed by `/campaigns/launch` for the same allocation: launch performs its own reservation. A separate preflight workflow uses `/spend/check` followed by `/spend/commit` with its returned reservation ID. Campaign IDs cannot be launched twice. A committed reservation cannot be reassigned to a different provider reference.

Refunds of at most $25 are automatic by default, and the threshold applies to the **cumulative refunded amount per order** to prevent splitting. Refunds never exceed the remaining order balance. There is at most one pending refund interrupt per order; a conflicting amount or run returns `REFUND_ALREADY_PENDING` with the existing interrupt ID. Owner approval executes a refund exactly once. Owner modifications cannot change a refund's order or a listing's product, and approvals still obey margin and ad-spend limits. A guardrail denial leaves the interrupt pending.

The resolution response reports `threadId` / `resumedThreadId` so the orchestrator can resume its persisted graph. The guardrail service does not itself invoke LangGraph; the cockpit/orchestrator performs and verifies that second step.

Checkout derives prices and costs from stored catalog records, merges duplicate lines, checks inventory and margin, and enforces a total per-product quantity limit of 20. Supplier POs require an eligible processing order and the complete product-line quantity; partial-line POs are unsupported. Multi-line orders become shipped only after every line has a PO. Refunded, payment-failed, delivered, or already-shipped orders cannot create new POs. Failed-payment orders cannot refund. Payment and fulfillment callbacks cannot regress refunded or delivered orders; event ID reuse with a different payload is denied.

Run telemetry accepts `daily|weekly|monthly` cycles and `running|interrupted|completed|halted|failed` status. It stays writable during stops so the system can record its halt. Owner control changes, rejection of pending approvals, audit records, and idempotency bookkeeping also remain available; they execute no provider action.

Public reads are `GET /health` and `GET /api/catalog`. The catalog includes only active products and omits landed cost and estimated CAC. Authenticated `GET /api/status` returns pause and kill reachability. `GET /api/agent-context` returns `{mode,agentId,config,products,orders,interrupts}` with department filtering: sourcing and operations get cost-bearing products; operations get customer-redacted orders; support gets order customers and refund interrupts; marketing and master get no orders or interrupts. JWT callers need `hotl:context` for this endpoint. Both status and context also exist beneath the mutation base.

Owner reads are `/api/overview`, `/api/telemetry`, `/api/products`, `/api/orders`, `/api/agents`, `/api/runs`, `/api/interrupts`, `/api/audit-log`, and `/api/staging-readiness`. Except overview, they also exist beneath the mutation base. The staging-readiness route returns field names and static reasons only; it never returns environment values and does not run active probes. Audit responses include `integrity: verified` after chain verification; the service exposes no edit/delete audit route.

`GET /health/ready` is an explicit live-only, read-only readiness check. It requires the private PostgreSQL store, confirms the current workspace binding and emergency reader, and queries the connected role's effective database/schema DDL and application-object ownership privileges. It fails closed when those facts cannot be verified; a hard-coded role label is not readiness evidence.

Deterministic policy denials return HTTP 200 with `{decision: "deny", reason: "..."}`. Callers must inspect `decision` before proceeding. Authentication, validation, and execution errors use `{error:{code,message,details}}` with an appropriate 4xx/5xx status.

## Emergency stop and storage

Before every new financial or operational execution, the service reads `${KILL_SWITCH_URL}/state` with `KILL_SWITCH_READ_TOKEN` and a 2.5-second timeout. Engaged, unreachable, or malformed emergency state denies execution. A reversible pause also denies all such execution. This service has no kill engage/disengage endpoint; the isolated kill service owns the irreversible stop.

The engine serializes writes, takes an exclusive filesystem lock, reloads current state under that lock, flushes the temporary snapshot, and atomically replaces the JSON file. Reservations consume the shared UTC daily budget while live for 15 minutes; committed reservations consume their original UTC day's budget. Integer cents and basis-point comparisons determine permission without rounding into approval. Every transaction appends a SHA-256 chained audit entry and stores an immutable result snapshot. Reads and restarts verify the chain, and existing empty/corrupt audit chains fail closed. If a running engine's previously observed ledger disappears, reads, writes, and historical replays fail with `STATE_MISSING`. Windows lock contention returns `STATE_BUSY` without deleting another writer's lock. A crash can leave a `.lock` file; an operator must verify no writer is alive before removing that exact stale lock.

The file implementation has initialization markers and requires explicit first
initialization in live mode; a missing initialized ledger is never recreated.
The separate [PostgreSQL runtime store](../../docs/postgres-runtime.md) implements
transactional state/audit, workspace login binding, RLS and no file fallback. Native
database restart and backup/restore were verified locally. Hosted deployment is
still unverified. Neither store has an independently anchored audit head; privileged
storage access can rewrite data and hashes. Production operation still needs protected
backups, isolated credentials and deployed emergency drills.

`HOTL_MODE=live` enables strict authentication. Existing financial paths remain denied
with `LIVE_ADAPTERS_UNAVAILABLE`; the Shopify development-store price exception needs
additional explicit capability and provider checks. Simulation metrics remain fixtures.
See [current verification](../../docs/continuation-verification.md) for the exact boundary.
