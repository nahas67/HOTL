> Source design extracted from the user-supplied build prompt. Read [implementation notes](implementation-notes.md) for the actual runtime contract, deliberate corrections, and remaining production work. This section describes the target; it is not a claim that a production deployment exists.

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

