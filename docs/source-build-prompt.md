# Codex Build Package — Autonomous Multi-Agent B2C Commerce Engine (HOTL)

This document is meant to be **pasted into / referenced by OpenAI Codex CLI**. It contains a root project prompt, a native Codex sub-agent roster, a phased build plan, the runtime LangGraph design, the guardrail middleware API contracts, and the Owner Cockpit data/realtime schema.

---

## 0. Assumptions & Decisions (read first)

Your spec left a few implementation choices open. Here's what this package assumes — change any of these and adjust the docs below accordingly:

| Open item | Decision made | Why |
|---|---|---|
| LangGraph vs CrewAI | **LangGraph.js** (`@langchain/langgraph`), not Python | Medusa, BullMQ, Next.js, and the guardrail service are all Node/TS. One language across the stack means one shared Zod schema package instead of a Python/TS boundary, and Codex sub-agents don't need to context-switch runtimes. |
| "GPT-6 Astra" | Replaced with "your Codex CLI's current top-tier model" | GPT-6 Astra isn't a shipped OpenAI model as of this writing. Run `codex models` (or check your CLI's model picker) and slot in whichever flagship Codex model is current — the TOML examples below use placeholder names you'll need to update. |
| "Irreversible kill switch" | Kept genuinely irreversible, **plus a separate reversible "Pause"** control | A one-way kill switch is the right tool for a catastrophic stop, but it's the wrong tool for "an agent is being weird, hold everything for 20 minutes." Section 7.4 gives you both. |
| Monorepo tool | pnpm workspaces + Turborepo | Standard, Codex-friendly, no license friction. |

---

## 1. How to Use This With Codex CLI

Codex CLI ships a native **subagent** system (TOML files under `.codex/agents/`, orchestrated by the parent session, managed with `/agent` in the CLI). This package uses that feature directly rather than inventing a parallel framework:

1. Create the files in Sections 2–3 in your repo before you start (`AGENTS.md`, `.codex/config.toml`, `.codex/agents/*.toml`).
2. Also save Sections 5–7 as `/docs/langgraph-design.md`, `/docs/guardrail-api.md`, and `/docs/cockpit-schema.md` — the sub-agent instructions reference these paths as their contracts.
3. Run `codex` in the repo root and work through Section 4 phase-by-phase, using the example prompts as-is or adapted.
4. Codex only spawns a subagent when you explicitly tell it to — so the phase prompts in Section 4 are written as direct instructions ("Have X do Y"), not vague hints.

---

## 2. Master Prompt — `AGENTS.md` (repo root)

```markdown
# Project: Autonomous Multi-Agent B2C Commerce Engine (HOTL)

## Mission
Build a Human-on-the-Loop B2C dropshipping platform run by a swarm of specialized
runtime agents (sourcing, marketing, order/inventory, support) under a Master
Orchestrator, with a human owner holding veto power over every financially or
publicly consequential action.

## Non-negotiable rules for every agent working in this repo
1. Guardrails are deterministic code, never LLM judgment. Any node/service that
   spends money, publishes a listing, places a supplier order, or issues a refund
   MUST call the guardrail-service contract in /docs/guardrail-api.md. Re-implementing
   that math locally, or asking an LLM to "decide if this is within budget," is a bug.
2. Every mutating action writes an audit_log row before it reports success.
3. The kill-switch is irreversible by design and lives in infrastructure
   independent from the main stack (own credentials, own deploy target) so a
   compromised or overloaded main app cannot block it. Never merge kill-switch
   code into the main app's deploy pipeline.
4. Runtime agents call LLMs only through the LiteLLM proxy, never a provider SDK
   directly, so per-agent token/budget ceilings are enforced centrally.
5. No agent, human-written script, or Codex subagent gets standing write access
   to Stripe, ad platform, or supplier credentials. All third-party writes route
   through the guardrail-service, which holds the only live credentials.
6. Definition of done for any phase = code + tests + a guardrail-simulation test
   that tries to break the rule and gets denied. "It works on the happy path" is
   not done.

## Stack
- Commerce core: MedusaJS (Node) + Stripe
- Orchestration: LangGraph.js (@langchain/langgraph)
- Queues: BullMQ + Redis
- Data/Auth: Supabase (Postgres + Realtime + Auth)
- Storefront + Owner Cockpit: Next.js (App Router), shadcn/ui, Tailwind
- Model routing: LiteLLM proxy in front of Llama 3.3 8B / DeepSeek-V3 / Gemini
  Flash (runtime agents) — Codex's own build-time model is separate, see below.

## Repo layout
See Section 8 of the build package (`/docs/repo-structure.md` once copied in).
```

---

## 3. Codex Sub-Agent Roster (build-time)

These are **Codex CLI subagents** — they help you *build* the product. They are distinct from the *runtime* LangGraph agents (sourcing/marketing/order/support) defined in Section 5, which are business logic your code implements, not Codex agents.

### 3.1 `.codex/config.toml`

```toml
[agents]
max_threads = 6
max_depth = 1
job_max_runtime_seconds = 1800
```

`max_depth = 1` is deliberate: on a safety-critical project you want direct delegation, not recursive fan-out you didn't ask for.

### 3.2 Agent roster

| Agent | Owns | Sandbox | Notes |
|---|---|---|---|
| `repo_scaffolder` | Monorepo, tooling, CI | workspace-write | Phase 0 only, no business logic |
| `commerce_core_builder` | MedusaJS + Stripe | workspace-write | Treats guardrail contract as a hard boundary |
| `guardrail_builder` | Deterministic middleware | workspace-write | Safety-critical; zero LLM calls in this service |
| `orchestration_builder` | LangGraph.js service | workspace-write | Depends on guardrail contract being final first |
| `cockpit_builder` | Next.js Owner Cockpit | workspace-write | No direct financial writes — always via API routes |
| `infra_devops` | Docker, LiteLLM proxy, kill-switch deploy | workspace-write | Keeps kill-switch infra isolated from main stack |
| `qa_tester` | Integration + guardrail-break tests | workspace-write | Files issues rather than editing others' code |

### 3.3 Agent definitions

`.codex/agents/repo-scaffolder.toml`
```toml
name = "repo_scaffolder"
description = "Sets up monorepo layout, tooling, and CI. Use for Phase 0 foundation work only."
model = "<your-current-codex-flagship>"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Scaffold repository structure only: pnpm workspaces, TypeScript configs, ESLint/
Prettier, Turborepo pipeline, GitHub Actions CI, docker-compose for local dev
(Postgres, Redis). Do not implement business logic, agent logic, or guardrail
logic — leave TODO stubs with interface signatures for other agents to fill in.
Every package must build and lint clean before you report done.
"""
```

`.codex/agents/commerce-core-builder.toml`
```toml
name = "commerce_core_builder"
description = "Implements the MedusaJS commerce core: catalog, cart, checkout, Stripe, inventory webhooks."
model = "<your-current-codex-flagship>"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
Own apps/commerce-core (MedusaJS). Implement product/variant modules, cart and
checkout, the Stripe payment provider, and inventory/order webhooks that publish
events to Redis (BullMQ) for downstream agents.
Never let this service change price, discount, or refund state without first
calling the guardrail-service contract in /docs/guardrail-api.md — that boundary
is not a suggestion. Write integration tests for checkout and webhook delivery.
"""
```

`.codex/agents/guardrail-builder.toml`
```toml
name = "guardrail_builder"
description = "Implements the deterministic guardrail middleware: spend ceilings, margin floor, refund escrow, kill switch. Safety-critical."
model = "<your-current-codex-flagship>"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
Own apps/guardrail-service, implementing exactly the endpoints in
/docs/guardrail-api.md. Zero LLM/agent calls inside this service — deterministic
rules, DB reads/writes, and third-party revoke calls only.
Every mutating endpoint requires an Idempotency-Key header and writes an
append-only audit_log row before returning a response.
Write unit tests that deliberately try to break each rule (over-ceiling spend,
sub-40% margin, >$25 refund without escalation, replayed idempotency key) and
assert denial. The kill-switch engage endpoint has no matching disengage
endpoint — recovery is a manual runbook, not code. Do not add one.
"""
```

`.codex/agents/orchestration-builder.toml`
```toml
name = "orchestration_builder"
description = "Builds the LangGraph.js orchestrator: state schema, graph topology, checkpointing, interrupts."
model = "<your-current-codex-flagship>"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
Own apps/orchestrator. Implement the state schema and graph topology exactly as
specified in /docs/langgraph-design.md. Every node performing a side-effecting
action (spend, listing publish, refund, supplier order) MUST call the
guardrail-service before acting. Use a Postgres-backed checkpointer against the
shared Supabase instance so runs survive restarts and interrupts. Route all LLM
calls through the LiteLLM proxy, never a provider SDK directly.
"""
```

`.codex/agents/cockpit-builder.toml`
```toml
name = "cockpit_builder"
description = "Builds the Next.js Owner Cockpit: realtime telemetry, interrupt resolution UI, kill switch / pause controls."
model = "<your-current-codex-mid-tier>"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Own apps/cockpit (Next.js App Router, shadcn/ui, Tailwind). Subscribe to
Supabase Realtime on the interrupts and agent_actions tables per
/docs/cockpit-schema.md. The Kill Switch control requires a typed confirmation
phrase plus re-auth before it fires; the Pause control does not. Never call
third-party APIs or the database directly for financial writes — always go
through Next.js API routes that proxy to the guardrail-service.
"""
```

`.codex/agents/infra-devops.toml`
```toml
name = "infra_devops"
description = "Owns Docker/Compose, LiteLLM proxy config, secrets layout, and the independently-hosted kill-switch endpoint."
model = "<your-current-codex-mid-tier>"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Own infra/. The kill-switch service must deploy to infrastructure and
credentials fully separate from the main app (separate project/account,
separate secrets vault) so a compromised or overloaded main stack cannot block
it. Configure the LiteLLM proxy with per-agent virtual keys, token/rate limits,
and budget alerts.
"""
```

`.codex/agents/qa-tester.toml`
```toml
name = "qa_tester"
description = "Writes end-to-end and guardrail-simulation tests, including kill-switch and interrupt-resume drills."
model = "<your-current-codex-mid-tier>"
model_reasoning_effort = "medium"
sandbox_mode = "workspace-write"
developer_instructions = """
Write integration tests against a docker-compose stack: full happy-path order
flow; a margin-floor rejection; an over-ceiling ad-spend rejection; a >$25
refund escalation followed by an owner-approval resume; and a kill-switch drill
verifying queues drain and tokens revoke. Do not edit business logic in other
apps — file issues instead.
"""
```

---

## 4. Phased Implementation Plan

| Phase | Goal | Subagent(s) | Gate to move on |
|---|---|---|---|
| 0 | Monorepo, CI, local docker-compose | `repo_scaffolder` | CI green on an empty scaffold |
| 1 | Commerce core: Medusa + Stripe + webhooks | `commerce_core_builder` | Checkout + webhook tests pass |
| 2 | Supabase schema (Section 7 tables), auth, LiteLLM proxy | `infra_devops` (schema can run parallel to Phase 1) | Migrations apply cleanly; RLS reviewed |
| 3 | **Guardrail middleware** — build before any agent gets real write access | `guardrail_builder` | All guardrail-break tests pass |
| 4 | LangGraph skeleton: state schema, nodes stubbed, checkpointer, static interrupts wired | `orchestration_builder` | Graph compiles, dry-run with mocked tools completes a full cycle |
| 5 | Wire real tool calls (trend/supplier APIs, ad platform APIs, support inbox) behind guardrail calls | `orchestration_builder` | Every side-effecting node has a passing guardrail-denial test |
| 6 | Owner Cockpit: telemetry, interrupt UI, Pause + Kill Switch | `cockpit_builder` | Interrupt resolve → graph resume round-trip works end to end |
| 7 | Kill-switch hardening: isolated deploy, credential separation, drill | `infra_devops`, then `qa_tester` | Kill-switch drill passes with main stack intentionally stopped |
| 8 | Staging pilot: real supplier, capped ad budget, capped refund pool | Human owner | Owner sign-off before scaling spend ceilings |

**Example prompts to type into Codex:**

Phase 0:
> Have `repo_scaffolder` set up the monorepo per Section 8, plus CI that runs lint/build/test on every push. Wait for it to finish before starting anything else.

Phases 1–2 (parallel):
> Spawn `commerce_core_builder` to implement Phase 1 and `infra_devops` to implement the Supabase schema and LiteLLM proxy config from Phase 2, in parallel. Wait for both and summarize what each produced.

Phase 3 (hard gate):
> Now that the schema exists, have `guardrail_builder` implement Phase 3 exactly per `/docs/guardrail-api.md`. This must pass its own test suite before `orchestration_builder` starts Phase 4 — every orchestrator node depends on this contract being real, not mocked.

Phases 4–5 (sequential, safety-critical — don't parallelize):
> Have `orchestration_builder` implement Phase 4, then Phase 5, calling the real guardrail-service (not a mock) for every side-effecting node.

Phase 6:
> Have `cockpit_builder` implement Phase 6 per `/docs/cockpit-schema.md`.

Phase 7:
> Have `qa_tester` run the full drill suite. Once it's green, have `infra_devops` deploy the kill-switch service to its isolated environment and re-run the drill against the deployed version.

---

## 5. Runtime Agent Swarm — LangGraph State Machine

This is the **product's own** multi-agent graph (not Codex subagents). Built with `@langchain/langgraph`. Exact `Annotation`/reducer syntax shifts between LangGraph.js versions — verify against current docs when `orchestration_builder` implements this — but the topology below is stable.

### 5.1 Shared state

```typescript
import { Annotation } from "@langchain/langgraph";

const CommerceState = Annotation.Root({
  runId: Annotation<string>,
  cycle: Annotation<"daily" | "weekly" | "monthly">,
  targets: Annotation<{
    revenueTarget: number;
    marginFloor: number;      // 0.40
    adSpendCeiling: number;   // daily, absolute
  }>,
  telemetry: Annotation<{
    revenueToDate: number;
    marginToDate: number;
    adSpendToday: number;
  }>,
  productDrafts: Annotation<ProductDraft[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  campaignDrafts: Annotation<CampaignDraft[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  supplierOrders: Annotation<SupplierOrder[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  supportTickets: Annotation<TicketState[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  guardrailDecisions: Annotation<GuardrailDecision[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  killSwitchEngaged: Annotation<boolean>({ default: () => false }),
});
```

### 5.2 Graph topology

| Node | Kind | Job | Calls guardrail-service? |
|---|---|---|---|
| `kill_switch_watcher` | guard, runs first every cycle | Checks `kill_switch_state`; if engaged, routes straight to `halted` | read-only check |
| `master_orchestrator` | planner | Splits monthly targets into daily milestones, routes to department subgraphs | no |
| `sourcing.trend_scan` | tool | Pulls TikTok/Google Trends signals | no |
| `sourcing.supplier_query` | tool | Queries CJ Dropshipping/AliExpress for candidate SKUs + landed cost | no |
| `sourcing.margin_gate` | **guardrail call** | `POST /listing/margin-check` | yes |
| `sourcing.publish_or_reject` | branch | allow → queue listing draft; deny → log + retry sourcing | — |
| `marketing.copy_and_creative` | tool | Drafts ad copy + image variants | no |
| `marketing.spend_gate` | **guardrail call** | `POST /spend/check` before requesting platform spend | yes |
| `marketing.launch_or_hold` | branch | allow → call Meta/TikTok Ads API; deny → hold, notify orchestrator | — |
| `order.stock_sync` | tool | Polls Medusa inventory + supplier stock | no |
| `order.reorder_and_fulfill` | tool | Places supplier POs, updates shipment tracking | optional, for large POs |
| `support.triage` | tool | Classifies inbound ticket | no |
| `support.refund_gate` | **guardrail call** | `POST /refunds/evaluate` | yes |
| `support.resolve_or_escalate` | branch → interrupt | ≤$25 auto-resolves; >$25 → `human_interrupt` | — |
| `human_interrupt` | `interrupt()` call | Pauses graph, writes an `interrupts` row, waits for `Command(resume=…)` | — |
| `halted` | terminal | No-op end state while kill switch is engaged | — |

### 5.3 Guardrail gate + interrupt pattern (sketch)

```typescript
async function refundGate(state: typeof CommerceState.State) {
  const ticket = state.supportTickets.at(-1)!;
  const decision = await guardrailClient.evaluateRefund({
    orderId: ticket.orderId,
    amount: ticket.refundAmount,
    currency: ticket.currency,
    reasonCode: ticket.reasonCode,
    requestedBy: "support_agent",
  });

  if (decision.decision === "allow") {
    return { supportTickets: [{ ...ticket, status: "auto_resolved" }] };
  }

  // Escalate: pause the graph and surface the case to the owner.
  const ownerDecision = interrupt({
    category: "refund_escrow",
    orderId: ticket.orderId,
    amount: ticket.refundAmount,
    reason: decision.reason,
  });

  return {
    supportTickets: [{ ...ticket, status: ownerDecision.decision, resolutionNote: ownerDecision.note }],
  };
}
```

Resuming from the cockpit's API route, after the owner acts:

```typescript
await graph.invoke(
  new Command({ resume: { decision: "approve", note: "Customer verified via photo." } }),
  { configurable: { thread_id: runId } }
);
```

### 5.4 Checkpointing

Use a Postgres checkpointer pointed at the shared Supabase database so an interrupted run resumes exactly where it left off, even across a service restart. `thread_id` = `runId`, so the cockpit only needs to track `runId` to resume any paused thread.

---

## 6. Deterministic Guardrail Middleware — API Contracts

Base path: `/api/guardrails/v1`. All calls from runtime agents use a short-lived service JWT scoped to that agent only. The owner cockpit calls a separate owner-scoped set (config, kill-switch, interrupt resolution) authenticated via Supabase Auth session.

| Endpoint | Method | Purpose | Idempotent? |
|---|---|---|---|
| `/spend/check` | POST | Pre-flight check before requesting ad spend | no (read) |
| `/spend/commit` | POST | Records confirmed spend after platform confirms | yes (`Idempotency-Key`) |
| `/listing/margin-check` | POST | Pre-flight check before publishing a listing | no (read) |
| `/refunds/evaluate` | POST | Auto-approve ≤ threshold, else create an interrupt | yes |
| `/interrupts/:id/resolve` | POST | Owner resolves a pending interrupt, resumes the graph | yes |
| `/kill-switch/engage` | POST | Irreversible full stop | yes, but only fires once |
| `/pause/engage` / `/pause/release` | POST | Reversible hold, no infra teardown | yes |
| `/guardrails/config` | GET / PATCH | Read ceilings/floors; PATCH is owner-only | — |
| `/audit-log` | GET | Query the append-only log | — |

**Common error envelope:**
```json
{ "error": { "code": "MARGIN_BELOW_FLOOR", "message": "string", "details": {} } }
```

**`POST /spend/check`**
```json
// request
{ "agentId": "marketing_agent", "campaignId": "string", "requestedAmount": 25.00, "currency": "USD" }
// response (allow)
{ "decision": "allow", "remainingDailyBudget": 75.00, "ceiling": 100.00 }
// response (deny)
{ "decision": "deny", "reason": "DAILY_CEILING_EXCEEDED", "remainingDailyBudget": 0, "ceiling": 100.00 }
```

**`POST /listing/margin-check`**
```json
// request
{ "sku": "string", "sellingPrice": 29.99, "landedCost": 9.50, "estimatedCac": 6.00, "currency": "USD" }
// response
{ "decision": "allow", "marginPct": 0.483, "floor": 0.40 }
```
`marginPct = (sellingPrice - landedCost - estimatedCac) / sellingPrice`; deny if `< floor`.

**`POST /refunds/evaluate`**
```json
// request
{ "orderId": "string", "amount": 42.00, "currency": "USD", "reasonCode": "item_not_as_described", "requestedBy": "support_agent" }
// response (auto-approved, <= $25)
{ "decision": "allow", "refundId": "string" }
// response (escalated, > $25)
{ "decision": "escalated", "interruptId": "uuid", "threshold": 25.00 }
```

**`POST /interrupts/:id/resolve`**
```json
// request
{ "decision": "approve", "modifiedPayload": null, "note": "string", "resolvedBy": "owner_user_id" }
// response
{ "status": "resolved", "resumedThreadId": "string" }
```

**`POST /kill-switch/engage`**
```json
// request
{ "reason": "string", "requestedBy": "owner_user_id", "confirmationPhrase": "STOP EVERYTHING" }
// response
{
  "status": "engaged",
  "engagedAt": "ISO8601",
  "actionsTaken": ["queues_drained", "storefront_maintenance_on", "meta_token_revoked", "tiktok_token_revoked", "supplier_key_rotated"]
}
```
No matching disengage endpoint exists — see Section 7.4.

---

## 7. Owner Cockpit — Data Model & Realtime Interrupt Schema

### 7.1 Supabase (Postgres) tables

```sql
create table agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  cycle text not null check (cycle in ('daily','weekly','monthly')),
  status text not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(run_id),
  agent_name text not null,
  action_type text not null,
  payload jsonb not null,
  guardrail_decision text,
  created_at timestamptz not null default now()
);

create table interrupts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(run_id),
  thread_id text not null,
  category text not null check (category in ('spend','margin','refund_escrow','anomaly','other')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','modified','expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('agent','owner','system')),
  actor_id text not null,
  event_type text not null,
  payload jsonb not null,
  prev_hash text,   -- hash-chained for tamper evidence on financial events
  hash text,
  created_at timestamptz not null default now()
);

create table kill_switch_state (
  id int primary key default 1,
  engaged boolean not null default false,
  engaged_at timestamptz,
  engaged_by text,
  reason text,
  actions_taken jsonb,
  check (id = 1)
);

create table guardrail_config (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
```

Enable Row Level Security on all tables; only the guardrail-service's service role writes to `interrupts`, `audit_log`, and `kill_switch_state`. The cockpit reads via the owner's authenticated session and writes only through Next.js API routes (never directly).

### 7.2 Realtime contract

Cockpit subscribes to Postgres changes on `interrupts`:

```typescript
supabase
  .channel("interrupts-feed")
  .on("postgres_changes", { event: "*", schema: "public", table: "interrupts" }, handleInterruptEvent)
  .subscribe();
```

Normalized event shape the UI renders:

```json
{
  "type": "interrupt.created",
  "interrupt": {
    "id": "uuid",
    "runId": "uuid",
    "threadId": "string",
    "category": "refund_escrow",
    "summary": "Refund of $42.00 for order #1029 exceeds the $25 auto-approval threshold",
    "payload": { "orderId": "...", "amount": 42.0, "currency": "USD", "reasonCode": "item_not_as_described" },
    "createdAt": "ISO8601",
    "expiresAt": null,
    "requiredAction": "approve|reject|modify"
  }
}
```

### 7.3 Next.js API routes

| Route | Method | Does |
|---|---|---|
| `/api/interrupts` | GET | List pending interrupts |
| `/api/interrupts/[id]/resolve` | POST | Owner resolves → proxies to guardrail-service → resumes LangGraph thread |
| `/api/pause` | POST/DELETE | Engage/release the reversible Pause |
| `/api/kill-switch` | POST | Engage the irreversible Kill Switch (routes to the isolated kill-switch service, not the main API) |
| `/api/telemetry` | GET | Revenue/margin/spend dashboard data |

### 7.4 Kill Switch vs. Pause

Your spec calls the kill switch "irreversible" — that's the right property for a true emergency stop, but it's a bad fit as the *only* stop control, since owners will hesitate to use an irreversible tool for minor anomalies. This package gives you two distinct controls:

- **Pause** (reversible): halts new agent actions, keeps existing infra/credentials live, releasable from the cockpit with one click. Use for "something looks off, hold on."
- **Kill Switch** (irreversible): drains queues, flips the storefront to maintenance mode, and revokes every external API token. Requires a typed confirmation phrase and re-auth. Recovery is a manual runbook (re-provision credentials, redeploy, owner sign-off) — deliberately not a button, so it can't be flipped back on by mistake or by a compromised session.

The kill-switch service itself should be deployed independently (separate cloud project/account, its own secrets vault) per the `infra_devops` instructions in Section 3 — so it can act even if the main stack is unhealthy or compromised.

---

## 8. Suggested Repo Structure

```
.
├── AGENTS.md
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── repo-scaffolder.toml
│       ├── commerce-core-builder.toml
│       ├── guardrail-builder.toml
│       ├── orchestration-builder.toml
│       ├── cockpit-builder.toml
│       ├── infra-devops.toml
│       └── qa-tester.toml
├── docs/
│   ├── langgraph-design.md      # Section 5
│   ├── guardrail-api.md         # Section 6
│   ├── cockpit-schema.md        # Section 7
│   └── repo-structure.md        # this section
├── apps/
│   ├── commerce-core/           # MedusaJS
│   ├── orchestrator/            # LangGraph.js service
│   ├── guardrail-service/       # deterministic middleware
│   ├── cockpit/                 # Next.js owner dashboard
│   └── storefront/              # Next.js public storefront
├── packages/
│   └── schemas/                 # shared Zod types/contracts
└── infra/
    ├── docker-compose.yml
    ├── litellm-config.yaml
    └── kill-switch/             # deployed separately from everything above
```

---

## 9. Definition of Done Checklist

- [ ] Every side-effecting runtime-agent action calls the guardrail-service; none reimplement its math
- [ ] Guardrail-service has passing "break the rule" tests for spend, margin, and refund
- [ ] `human_interrupt` → cockpit → `Command(resume)` round-trip verified end to end
- [ ] Kill-switch drill passes with the main stack intentionally stopped
- [ ] Kill-switch credentials/infra fully separate from main app
- [ ] Pause is reversible from the cockpit with no infra teardown
- [ ] Audit log is append-only and hash-chained for financial events
- [ ] Per-agent LiteLLM budget/rate limits configured and alerting

