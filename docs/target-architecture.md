# HOTL — Reconciled Target Architecture

**Status:** as-built description derived from source, plus the divergence from the intended design.
**Date:** 2026-10-10 · **Closes:** 🆕 N10 in [`FULL_PROGRAM_CHECKPOINT.md`](FULL_PROGRAM_CHECKPOINT.md) §9.4.
**Derived from:** the working tree at `912bf63`, branch `codex/cp02-ci-red-2026-10-10`.

> **What this document is.** A map of the system that exists, read from the source files named
> beside each claim. Where the repository does something different from what its own plans
> describe, both are stated and the difference is called out in §6.
>
> **What this document is not.** It is **not** a production-readiness assessment, and it does
> **not** assert that any gate is satisfied. Gates A, B and C are blocked
> (`FULL_PROGRAM_CHECKPOINT.md` §8.7, §9.3) and nothing here changes that. Every runnable
> capability in this system today executes against **simulated** commerce; there is no external
> provider evidence anywhere in the tree.

**Method.** Every structural claim names a file and line. Where a claim could not be established
from source it is written `[ ]` with the reason, rather than inferred. Commands I ran to
confirm the current values are recorded inline.

---

## 1. Service topology

Six runnable services, three shared libraries, and one static-site builder.
`pnpm-workspace.yaml` declares `apps/*`, `packages/*`, `infra/kill-switch` — **9 workspace
packages**.

| # | Service | Entrypoint | Bind address | Package | Role |
|---|---|---|---|---|---|
| 1 | Guardrail service | `apps/guardrail-service/src/index.ts` | `127.0.0.1:4100` (`GUARDRAIL_PORT`) | `@hotl/guardrail-service` | **The only financial authority.** Ledger, audit chain, Constitution, identities, provider credentials |
| 2 | Orchestrator | `apps/orchestrator/src/server.ts` | `127.0.0.1:4300` (`ORCHESTRATOR_PORT`) | `@hotl/orchestrator` | LangGraph run orchestration, checkpoints, interrupts. Decides nothing financial |
| 3 | Commerce core | `apps/commerce-core/src/server.ts` | `127.0.0.1:4400` (`COMMERCE_PORT`) | `@hotl/commerce-core` | Storefront-facing read + checkout ingress |
| 4 | Kill switch | `infra/kill-switch/src/index.ts` | `127.0.0.1:4200` (`KILL_SWITCH_PORT`) | `@hotl/kill-switch` | Independent one-way emergency latch and revocation hooks |
| 5 | Cockpit | `apps/cockpit` (Next.js) | `127.0.0.1:3000` | `@hotl/cockpit` | Owner UI + the **only** browser-facing proxy into every other service |
| 6 | Storefront | `apps/storefront` (Next.js) | `127.0.0.1:3001` | `@hotl/storefront` | Public catalogue; calls commerce-core only |

Supporting packages:

| Package | Role | Notable |
|---|---|---|
| `packages/schemas` | `@hotl/schemas` | Every zod contract shared across services, incl. the Constitution and the 20 autonomy domains |
| `packages/connector-sdk` | `@hotl/connector-sdk` | Shopify/WooCommerce transport + webhook signature helpers. **No dependency on any app** |
| `sites/hotl-owner-console` | `hotl-owner-console-sites` | Static owner Site. **Outside the pnpm workspace** — no `package.json` in the workspace globs |

**Launcher.** `scripts/dev.mjs` starts all six in one process group and tears the stack down
when any child exits, so a crash is not masked as a cascade of `ECONNREFUSED`
(`scripts/dev.mjs:80-104`). It refuses to start unless `HOTL_MODE === 'simulation'`
(`scripts/dev.mjs:44-47`) — the demo launcher cannot be pointed at a live environment.

**Outside the workspace.** `apps/commerce-core/medusa` exists with its own `package.json` and
`package-lock.json`. `apps/*` matches `apps/commerce-core` but not its `medusa` child, so it is
**not** a workspace member, is **not** covered by the root build, and is not covered by the
`N9b` build-credential scrub until that gap is closed
(`FULL_PROGRAM_CHECKPOINT.md` §9.4 N9b). Its build status is `[ ]` — I did not build it.

---

## 2. The authority boundary

This is the section the system exists to get right, so it is stated at length and every claim
is anchored.

### 2.1 What the deterministic guardrail decides

`GuardrailEngine.execute()` (`engine.ts:624-628`) is the single funnel for every consequential
mutation. In order:

1. **`block(state)`** — `engine.ts:528-535`. Emergency latch, pause, and adapter mode:
   - `kill.engaged` → `KILL_SWITCH_ENGAGED`
   - `state.paused` → `SYSTEM_PAUSED`
   - `mode === 'live'` → **`LIVE_ADAPTERS_UNAVAILABLE`**, *"This build supports simulation
     execution only. Live provider writes are disabled."*
2. **`scope(operation, actor)`** — `engine.ts:575-579`. A hard-coded per-agent operation map,
   checked **inside the engine**, not only at the HTTP layer.
3. **`context(state, input, actor, operation)`** — `engine.ts:580-585`. Requires
   `expectedConstitutionVersion`, and for agents requires a revision token for every referenced
   resource. Stale version → `CONSTITUTION_CHANGED`.
4. **Domain policy and money arithmetic** — margin floor, price-change limit, daily/monthly
   ceilings, supplier purchase limit, refund balance, country and category restrictions.
5. **`MAX_ORDER_VALUE = 10_000`** — `engine.ts:30`, applied at `engine.ts:927`. A hard ceiling
   that denies **for every actor including the owner**, because no approval path may construct
   an order beyond the ledger's money domain.

**The live-adapter gate at step 1 is the load-bearing fact of this architecture.** Every path
that calls `block()` — spend, listings, campaigns, supplier orders, refunds, checkout, commerce
events — returns `LIVE_ADAPTERS_UNAVAILABLE` in `live` mode. Live financial adapters therefore
**fail closed by construction**, not by configuration.

There is exactly **one** deliberate exception, and it is narrow. `shopifyPricePolicy()`
(`engine.ts:398-425`) and `assertShopifyWebhookWrite()` (`engine.ts:339-348`) do **not** call
`block()`. They substitute their own gate, which additionally requires:

- `mode === 'live'` **and** the shop is in `SHOPIFY_STAGING_SHOPS` (`engine.ts:401`, `:342`)
- an approved, current pilot envelope whose `constitutionVersion` and `draftDigest` match
  (`engine.ts:408`, `:352-353`)
- `salesChannel === SHOPIFY_DEVELOPMENT_STORE` and `currency === USD` (`engine.ts:409`)
- the variant is owned by the actor, its `revision` matches, and its observation is under
  120 s old (`engine.ts:413-417`)
- the installation holds `write_products` (`engine.ts:412`)

This is the owner-only Shopify **development-store** price path in AGENTS.md rule 6. It is
externally unverified: **no installation, token, store or receipt exists in this repository.**

### 2.2 Where authorization cannot be bypassed

Each of these is enforced in code on a path a caller cannot skip.

| Property | Where | Why it holds |
|---|---|---|
| **Live provider writes are impossible outside the Shopify dev-store exception** | `engine.ts:533` | `block()` is reached before any mutation body |
| **An agent cannot exceed its fixed operation map** | `engine.ts:575-579` | The map is a literal; a JWT cannot widen it |
| **A JWT cannot claim a scope outside its role** | `identity.ts:114` | Requested scopes are filtered through `agentScopes[id]`; `AGENT_SCOPE_LIMITS` may only narrow (`identity.ts:57`) |
| **Owner means an allowlisted account with `app_metadata.role === 'owner'`** | `identity.ts:123` | `sub` ∈ `OWNER_USER_IDS` **and** role check |
| **Cross-workspace use is refused** | `identity.ts:83-86`, `:111`, `:125` | Token `workspace_id` must equal the instance's `GUARDRAIL_WORKSPACE_ID`; `authorization_version` must match |
| **The workspace cannot drift from the ledger's binding** | `server.ts:23` | Service refuses to start on `WORKSPACE_MISMATCH` |
| **Every owner-only mutation is owner-gated at the engine, not only the route** | `engine.ts:762` (`owner()`), `server.ts:102-110` | e.g. pause, Constitution, pilot approval, product write, interrupt resolve |
| **A replayed allow is never fresh authority** | `engine.ts:212-218` | Returns the stored result with `replayed: true`; the action is not re-run |
| **A pure denial does not burn the caller's key** | `engine.ts:243` | Only non-denial results record, so a refused request cannot lock another actor out |
| **An unexpected fault commits nothing** | `engine.ts:222-231` | State is restored from a pre-action clone before denying |
| **The audit chain is verified before every write** | `engine.ts:113-131`, esp. `:120-125` | Every entry's `prevHash` and SHA-256 digest re-checked; failure raises `AUDIT_INTEGRITY_FAILED` and refuses writes |
| **Missing or vanished persistent state denies; it is never served from cache** | `engine.ts:132-135`, `:174-175` | A ledger observed once and later missing raises `STATE_MISSING` |
| **Unreadable emergency state denies** | `engine.ts:146-150` | A failing kill reader raises `KILL_SWITCH_UNAVAILABLE`; `block()` turns that into a denial |
| **The emergency latch is one-way and durable** | `journal.ts:68-88` | A second `engaged` event is a hard fault; there is no transition that clears it |
| **A truncated kill journal refuses to look safe** | `journal.ts:43-51` | An empty or unterminated existing journal throws *"manual recovery required"* rather than reporting `engaged: false` |
| **An approval cannot retarget its own resource** | `engine.ts:774` | `orderId`/`productId`/`campaignId`/`reservationId` are immutable; `engine.ts:788-790` limits modifiable fields per operation |
| **Approval re-executes policy as the original actor** | `engine.ts:792` | `execute(state, operation, request, executionActor, true)` — approval clears the *autonomy* threshold only, not `block`/`scope`/`context`/money rules |
| **A run cannot resume on a decision the caller cannot see** | `orchestrator/src/server.ts:44-52` | Interrupt list is re-read from the guardrail with the caller's own credentials |
| **A resume cannot outrun pause or kill** | `orchestrator/src/manager.ts:104-114` | Refuses unless status is `running`, not paused, not engaged, and kill reader reachable |
| **A run with no checkpoint cannot resume** | `orchestrator/src/manager.ts:95-96` | Deliberate 404; previously fabricated success for hard-coded demo run ids |
| **The kill switch refuses to start without an explicit mode** | `kill-switch/src/index.ts:9-15` | An unset `HOTL_MODE` is fatal. Simulation is opt-in, so a missing variable cannot yield a write-capable emergency plane on published demo credentials |
| **A revocation hook must confirm its own action** | `kill-switch/src/server.ts:58-60` | HTTP 200 is insufficient; the body must be `{status:'succeeded', action:<name>}`. An unconfigured hook records `unconfigured`, never `succeeded` |
| **Provider write credentials reach one service only** | `scripts/dev-env.mjs:5-12` | `SHOPIFY_CLIENT_SECRET`, `CONNECTOR_ENCRYPTION_KEY`, `AGENT_JWT_*`, `GUARDRAIL_DATABASE_URL` are in the `guardrails` allowlist only |
| **The LLM cannot authorize spending** | `orchestrator/src/client.ts:126-135` | The system prompt states financial authorization is deterministic; the return value is a draft string that is never parsed into authority |
| **The LiteLLM master key reaches no runtime agent** | `scripts/dev-env.mjs:10` | Only per-agent `LITELLM_*_KEY` virtual keys are passed to the orchestrator |

### 2.3 Where authorization depends on discipline, not enforcement

Stated plainly, because this is where a production deployment would break.

1. **In simulation mode, one static string is full owner authority.**
   `identity.ts:90-97`: any request carrying `x-hotl-internal-token` equal to
   `HOTL_INTERNAL_TOKEN` becomes `{type:'owner', id:'simulation-owner'}` with scope `'*'`.
   The default value is `hotl-local-development-token`, published in `scripts/dev.mjs:29` and
   `.env.example`. **Every** owner-only route is therefore open to any caller that knows one
   string. The only thing standing between a local process and the ledger is knowing a token that
   is deliberately public. This is acceptable for a labelled local simulation and unacceptable
   anywhere else; it is why `live` mode exists and why `kill-switch/src/index.ts:9-15` refuses to
   inherit simulation implicitly.

2. **In simulation mode an agent identity is a self-asserted header.**
   `identity.ts:92-96`: `x-hotl-agent-id` names the acting agent, and the engine then derives
   that agent's scopes. Moot while the internal token already grants `'*'`, but it means the
   simulation grants *no* agent-identity authenticity.

3. **Services bind `127.0.0.1` by default and there is no mTLS or network policy in the tree.**
   `guardrail-service/src/index.ts:3`, `orchestrator/src/server.ts:60-61`,
   `commerce-core/src/server.ts:8-9`, `kill-switch/src/index.ts:40`. Loopback binding is a
   local-development default; deployment must add network isolation, and **no such mechanism
   exists in this repository** — `[ ]`.

4. **The cockpit holds the internal token and the kill **owner** token server-side.**
   `scripts/dev-env.mjs:7` grants `HOTL_INTERNAL_TOKEN` and `KILL_SWITCH_OWNER_TOKEN` to the
   cockpit process. These are non-`NEXT_PUBLIC_`, so they are not in the browser bundle — but
   the cockpit server is the holder. `route.ts:120` attaches the owner token automatically when
   `simulationEnabled(request)`. In live mode the guardrail's own owner check is the real gate;
   in simulation the cockpit is a credential-bearing intermediary for a public demo token.

5. **The CSRF defence is a header check, not a token.**
   `cockpit/src/lib/proxy.ts:36-44`: an `Origin` comparison plus a required `x-hotl-cockpit: 1`
   header on non-GET. A same-origin script can satisfy both. It prevents cross-site submission,
   not a compromised first-party origin.

6. **Environment separation is a launcher convention, not a deployment control.**
   `scripts/dev-env.mjs` enforces per-service variable allowlists for `pnpm dev`. A separately
   deployed orchestrator or cockpit gets whatever its process environment contains. `[ ]` — there
   is no runtime enforcement outside the local launcher.

7. **The build-credential scrub covers the build pipeline only.**
   `scripts/dev-env.mjs:52-139` is a fail-closed allowlist applied by `scripts/build-env.mjs`.
   It does not govern runtime process environments, and `apps/cockpit/package.json` /
   `apps/storefront/package.json` still contain a raw `next build` that `pnpm --filter` can
   bypass (`FULL_PROGRAM_CHECKPOINT.md` §9.4 N9a).

### 2.4 What the orchestrator, an agent, or the browser may decide

- **The browser decides nothing.** `apps/cockpit/src/app/api/[...path]/route.ts` is an explicit
  route allowlist; an unlisted path returns 404 (`:122-124`). Every branch proxies to a service
  and returns that service's verdict. The cockpit holds no financial rule.
- **The cockpit adds exactly three things**: same-origin enforcement, an `Idempotency-Key`
  requirement on every non-GET (`:22`), and honest translation — a guardrail `deny` is re-surfaced
  as 409 and an `unknown` outcome as **502** so no caller treats an uncertain provider write as
  success (`proxy.ts:70-93`).
- **The orchestrator decides sequencing, candidacy and escalation.** Every graph node that
  acts calls `gateway.execute(...)` and accepts the returned decision (`graph.ts:70-84`).
  `support_triage` selects a candidate order and explicitly delegates the refund arithmetic to
  the guardrail, with a comment recording that this node **previously reimplemented** the policy
  and drifted (`graph.ts:144-152`).
- **An agent may** propose, draft and re-plan. It may not raise its own scope, widen a ceiling,
  alter a target resource, or convert its own draft into authority.
- **The owner may** approve, reject or modify a proposal, change the Constitution, the ceilings,
  the pilot envelope and the domain policies — and the owner's decision is itself re-executed
  through policy before it takes effect.

---

## 3. Persistence

| Store | Location | Backend | Durable across restart | Notes |
|---|---|---|---|---|
| Guardrail ledger | `GUARDRAIL_STATE_PATH`, default `data/guardrail-state.json` | JSON file, atomic `rename` | Yes | 97 883 bytes on disk now. Write-temp → `rename` (`engine.ts:286-299`); init marker `<path>.initialized` (`:136-141`) |
| Guardrail ledger (production) | `GUARDRAIL_DATABASE_URL` | Postgres via `PostgresRuntimeStateStore` | Yes | Selected whenever `GUARDRAIL_DATABASE_URL` is set (`server.ts:22-24`). **Not exercised by this document** — `[ ]` |
| Connector key | `CONNECTOR_KEY_PATH`, default `.secrets/connectors.key` | File | Yes | Provider credential material; git-ignored |
| Kill journal | `KILL_SWITCH_JOURNAL`, default `infra/kill-switch/data/events.jsonl` | Append-only JSONL, hash-chained, `fsync` per event | Yes | **Currently 0 bytes on disk** — see §6 D-7 |
| Orchestrator checkpoints | `ORCHESTRATOR_STATE_PATH`, default `data/orchestrator-checkpoints.json` | LangGraph `FileSaver` (extends `MemorySaver`) | Yes | 161 958 bytes. Rejects a malformed file rather than resetting runs (`checkpointer.ts:8`) |
| Orchestrator checkpoints (production) | `DATABASE_URL` | `@langchain/langgraph-checkpoint-postgres` | Yes | Declared as a dependency; **not exercised** — `[ ]` |
| Queues | `REDIS_URL` | BullMQ | n/a | Optional. Workers start only when `ENABLE_QUEUE_WORKERS === 'true'` (`orchestrator/src/server.ts:64-67`) |
| Isolated drill state | `.data/e2e-<id>/` | All of the above, redirected | Disposable | `dev.mjs:11-17` refuses any test dir outside `.data/e2e-<id>` |

**Both persistence backends are mutually exclusive and enforced.** `engine.ts:65` throws
`STATE_CONFIG_INVALID` if both `filePath` and `store` are given — *"Choose one persistence
backend; file fallback is not supported."*

**The audit chain is the integrity spine.** Every mutation appends a hash-linked record before
the state is persisted (`engine.ts:142-145`, `:233`), and the whole chain is re-verified on every
load (`engine.ts:120-125`).

**Fail-closed rules that matter for restart.** A ledger that was observed once and then becomes
unreadable denies (`engine.ts:132-135`). A kill journal that exists but yields no events is a
hard fault (`journal.ts:50`). A checkpoint file that exists but will not parse throws rather
than resetting (`checkpointer.ts:8`). None of these silently reinitialize.

**Git-ignore posture.** `data/`, `.data/` and `.secrets/` are ignored, so runtime simulation
state is not committed. Verified in `.gitignore`.

---

## 4. Data flows

### 4.1 Traced browser → persistence

```
Browser 127.0.0.1:3000
  → cockpit /api/<route>                     assertSameOrigin + Idempotency-Key
  → cockpit proxy                            route allowlist; returns upstream verdict verbatim
  → guardrail 127.0.0.1:4100                 authenticate → requireAccess(scope, ownerOnly)
  → engine.transaction()                     serialize → acquire lock → snapshot → verify
  → engine.execute()                         block → scope → context → policy → action
  → applyTransaction()                       idempotency fingerprint; audit appended
  → persist (file rename | Postgres txn)     audit + state committed together
  ← decision {allow|deny|escalated|unknown}
```
The browser never receives a decision it did not get from the engine. Denials are preserved as
denials; an `unknown` provider outcome is deliberately **not** rendered as success.

### 4.2 Checkout

`POST /api/checkout` (storefront) → `commerce-core` `POST /store/checkout` (`app.ts:94`) →
`GuardrailClient` → guardrail `/commerce/checkout` with the `commerce` scope.
Engine: `block()` → `scope()` → `context()` → country check → per-line quantity ≤ 20, product
active, product restriction, inventory, margin floor → `MAX_ORDER_VALUE` → order created with
`paymentStatus: 'simulated'` and the message *"Simulation order created. No payment was charged."*
(`engine.ts:901-932`). **No payment provider is contacted in any mode.**

### 4.3 Owner approval → resume

```
Agent action exceeds autonomy threshold
  → engine.proposal()                        interrupt persisted with policy snapshot
  → graph afterAction() → 'human_interrupt'  run status = interrupted
Owner opens /approvals
  → cockpit POST /api/interrupts/:id/resolve → guardrail resolveInterrupt()
      owner(actor) → block() → target immutability → execute(as original actor, approved:true)
  → guardrail persists the decision + audit
  → cockpit then POSTs orchestrator /api/runs/:id/resume { interruptId }
  → orchestrator re-reads /api/interrupts with the CALLER's credentials
  → resume() verifies: belongs to run, already resolved, is the awaited interrupt,
       status interrupted, platform running / not paused / not killed / kill reachable
  → graph.invoke(Command({resume:{status,note}}))
```
The browser supplies only an interrupt id. The **decision** is read from the guardrail under the
caller's own credentials (`orchestrator/src/server.ts:44-52`), so no browser-supplied approval
can be substituted.

### 4.4 Pause and kill

- **Pause** is reversible state in the guardrail ledger (`setPause`, `engine.ts:800`), owner-only,
  and checked by `block()` on every mutation.
- **Kill** is an independent HTTP service on `4200` with its own journal, its own credentials and
  its own `node:http` stack — no dependency on any application package. The guardrail *reads* it
  (`killState()`, `engine.ts:146-150`) and denies if unreachable.
- The orchestrator polls status at every node (`graph.ts:51-59`) and refuses to start or resume a
  cycle when paused, killed, or kill-unreachable.
- The cockpit's kill route requires `confirmationPhrase: 'STOP EVERYTHING'` and, in simulation,
  a reauth proof token minted by the kill switch's own `/reauth`
  (`route.ts:113-121`, `kill-switch/src/auth.ts:37-41`).
- **Seven** independent revocation actions are defined (`kill-switch/src/server.ts:5`):
  `queues_halted`, `storefront_maintenance_on`, `litellm_keys_revoked`, `meta_token_revoked`,
  `tiktok_token_revoked`, `supplier_key_revoked`, `stripe_restricted_key_revoked`. Each requires
  its own hook URL **and** token; a missing hook records `unconfigured`, which is honest, not
  `succeeded`.

---

## 5. Trust boundaries

| Zone | Reachable by | Holds | Enforced by |
|---|---|---|---|
| **Browser-reachable** | Any HTTP client on the cockpit origin | Rendered UI; same-origin + `x-hotl-cockpit: 1`; `Idempotency-Key` | `proxy.ts:36-44`, `route.ts:15-23` |
| **Cockpit server** | Browser, transitively | `HOTL_INTERNAL_TOKEN`, `KILL_SWITCH_READ_TOKEN`, `KILL_SWITCH_OWNER_TOKEN`, Supabase anon key | Non-`NEXT_PUBLIC_`, so absent from the bundle; but the process holds them (`dev-env.mjs:7`) |
| **Application services** (loopback) | Any local process | Guardrail: provider credentials, connector key, database URL, agent signing keys, owner allowlist | `dev-env.mjs:6` allowlist; loopback bind |
| **Guardrail engine** | Nothing outside the guardrail process | Financial policy, ledger, audit chain, Constitution | §2.2 |
| **Emergency plane** | Owner's authenticated request + reauth | One-way latch, revocation hooks, its own journal | Independent service; refuses implicit mode |
| **Provider egress** | Guardrail only | Shopify/Woo tokens, write scopes | `SHOPIFY_STAGING_SHOPS` allowlist, development-store check, owner-only, live-mode gate (`engine.ts:398-425`) |
| **LLM egress** | Orchestrator | Per-agent LiteLLM virtual keys | `draftWithLiteLLM`; master key never passed (`dev-env.mjs:10`, `client.ts:110-118`) |
| **Build pipeline** | CI | Scrubbed env only | `dev-env.mjs:52-139`, fail-closed allowlist — **except** raw `next build` in two package scripts (N9a) and all of `apps/commerce-core/medusa` (N9b) |

**Publicly reachable without authentication:** `GET /api/session` (returns mode and Supabase
public config), and `GET /api/shopify/webhooks/health` proxied to a non-secret readiness endpoint
(`route.ts:16-19`, `:67-69`).

---

## 6. As-built vs intended

| # | Intended | As-built | Traceable to |
|---|---|---|---|
| **D-1** | 20 autonomy domains configured as independent operating policies | **6 of 20 are consulted by any decision.** `advertising` (`engine.ts:636`, `:684`, `:716`), `catalog` (`:645`, `:346`, `:411`), `pricing` (`:645`, `:411`), `refunds` (`:652`), `purchasing` (`:675`), `fulfillment` (`:675`). The other **14** — `sourcing`, `supplier_contact`, `promotions`, `content`, `influencers`, `seo`, `email`, `sms`, `support`, `orders`, `inventory`, `finance`, `marketplaces`, `experimentation` — are persisted, editable through the Constitution, rendered in Settings, and **never read by a decision**. `checkout` (`engine.ts:901`) and `commerce.event` (`:934`) call `block`/`scope`/`context` but **not** `autonomy`, so `domains.orders` and `domains.inventory` are inert. | `packages/schemas/src/constitution.ts:3`. Verified by grep: a named domain policy (`domains.<name>`) is read on exactly **two** lines outside the Constitution writer — `engine.ts:346` and `engine.ts:411`; every other policy read is `autonomy()` reading `c.domains[domain]` (`:604`, `:609`) for whichever of the 6 domains it is called with. The Constitution writer is `engine.ts:832-833`, `:837` and `constitution.ts:6`. `apps/orchestrator/src` contains **0** references to `domains`, so no enforcement lives there. |
| **D-2** | Autonomous departments | Five agent roles exist. `master_orchestrator` plans, four specialists draft and escalate. No agent contacts a supplier, publishes content, replies to a customer or spends money. | `orchestrator/src/identity.ts` scope map; `graph.ts:39-41` |
| **D-3** | Live financial adapters | **Refused in `live` mode** with `LIVE_ADAPTERS_UNAVAILABLE`. Only the owner-only Shopify dev-store price path is exempt, and it is externally unverified. | `engine.ts:533` vs `:398-425` |
| **D-4** | Cockpit completeness | 11 routes visited in a browser: WORKING 8 · READ-ONLY 1 · SIMULATED 1 · PARTIAL 1 · BROKEN 0. 9 Settings panels (3 WORKING, 6 READ-ONLY); 38 Settings controls, only **5 of which write**. ~120 controls inventoried, ~45 clicked, ~75 source-only. | `docs/cockpit-route-and-settings-inventory.md` §1, §6 |
| **D-5** | Capabilities the cockpit inventory found unreachable | Refund submit, add-product form, Shopify OAuth install (unconfigured, so 15 controls never rendered), integration lifecycle (sync/credentials/disconnect/import — all gated behind having a connection), Autonomy per-tab saves, the 75-input pilot gate, and **all mobile viewports** (audit ran 1440×900 only). | `docs/cockpit-route-and-settings-inventory.md` §8, items 2-3, 5-11 |
| **D-6** | "19 unprovisioned staging settings" | The **count is confirmed**: `node scripts/staging-readiness.mjs` in this environment reports exactly **19** static failures, and the archived `evidence/gate-a-c-staging-provisioning-2026-10-01/PREFLIGHT.json` records `missing: 19`, `staticConfiguration.status: BLOCKED`, `activeProbes.status: NOT_RUN`, `externalStagingVerified: false`. **But the check has grown**: `scripts/staging-readiness.mjs` now contains 25 `requireField` calls, so "19" is *currently failing*, not *total*. The list has never been recomputed against a provisioned host. | `scripts/staging-readiness.mjs`; N1 in §9.4 |
| **D-7** | Working demo | `node scripts/dev.mjs` **cannot start**: `infra/kill-switch/data/events.jsonl` is 0 bytes on disk, and `journal.ts:50` refuses an empty existing journal. This is B-1 and requires owner-authorised runbook recovery. | Verified: file is 0 bytes; `FULL_PROGRAM_CHECKPOINT.md` §9.4 |
| **D-8** | Independent emergency plane | Structurally independent — separate package, separate journal, separate credentials, `node:http` only, refuses implicit mode. But **not deployed**, and none of the 7 revocation hooks is configured; engaging would record 7 × `unconfigured`. | `kill-switch/src/index.ts`, `server.ts:42-67` |
| **D-9** | Workspace isolation | Enforced by credential binding (`identity.ts:83-86`) and by a startup mismatch check (`server.ts:23`). Never exercised across two real workspaces. | `[ ]` — no multi-workspace evidence in tree |
| **D-10** | Build/test credential isolation | The fail-closed scrub exists and was canary-verified, but `apps/cockpit/package.json` and `apps/storefront/package.json` retain a raw `next build`, and `apps/commerce-core/medusa` is outside the workspace entirely. | N9a, N9b, N9c in §9.4 |
| **D-11** | Honest evidence labelling | Genuinely strong and worth preserving: telemetry separates ledger-derived `metrics` from a `synthetic` block carrying its own disclaimer (`engine.ts:986-991`); the preflight hardcodes `activeProbes.status: NOT_RUN` and `externalStagingVerified: false`; self-reported claims are marked `GUARDRAIL_SELF_REPORTED_NOT_INDEPENDENTLY_VERIFIED`. | `engine.ts:976-993`, `staging-readiness.mjs:34-40`, `:108-109` |

---

## 7. What is missing for a production commerce OS

In dependency order. None of this is done, and none of it is claimed.

1. **A provisioned, live-mode environment.** Every downstream item is blocked on it. The 19
   static settings, a real workspace UUID, a real identity issuer, an owner allowlist and a
   dedicated database login. *(N1)*
2. **A restored emergency journal and a deployed kill plane.** The 0-byte journal must be
   recovered by runbook, not reset by an agent; then the 7 revocation hooks need real,
   independently authorized endpoints — and live-mode owner authentication needs a real issuer
   and pinned owner ids. *(B-1)*
3. **A live Postgres ledger.** The Postgres store exists but this document did not exercise it,
   and runtime privilege verification is reported as a **self-report** by the guardrail rather
   than an independent observation. The preflight names this limitation explicitly.
4. **Wiring the 14 inert autonomy domains, or deleting them.** Today they are configuration
   theatre: an owner can set `domains.finance.mode = AUTONOMOUS` in Settings and it changes no
   behaviour anywhere. Either each domain gates its operations, or the Settings surface must
   stop presenting it as an operating control. *(D-1)*
5. **Owner-only resume and pause/kill flows verified in live mode.** Everything browser-verified
   to date ran in simulation, where one published token is owner authority. *(§2.3)*
6. **Network and deployment isolation.** Loopback binding is the only control in the tree.
   *(§2.3 item 3)*
7. **Real commerce evidence.** Provider OAuth, sync, signed webhook delivery, one guarded price
   mutation with a receipt, read-back and causal audit chain. **None exists.** Gate C remains
   blocked.
8. **Settled finance.** No payment authorization, capture, settlement, refund-to-provider,
   chargeback, tax or reconciliation path exists. Gate D remains deferred.
9. **Supplier, CRM, content and advertising execution.** Absent beyond agent names and local
   drafts.
10. **Measured shadow performance.** No evaluation harness, no preregistered loss or incident
    limits. Autonomy maturity is M0. Gate E remains blocked.
11. **Close the remaining build-credential surfaces.** N9a (raw `next build`), N9b (medusa
    outside the workspace), N9c (purge the poisoned cache and rotate anything that reached a
    build).

---

## 8. Not verified by this document

Stated so a reader does not infer it from silence.

- The Postgres ledger, the Postgres checkpointer and BullMQ workers were **read, not run**. `[ ]`
- `apps/commerce-core/medusa` was **not built** and not exercised. `[ ]`
- `sites/hotl-owner-console` was **not built**; its deployment status is `[ ]` here.
- No provider was contacted. No Shopify store, token, webhook or receipt exists in this tree.
- No live-mode path was exercised — no live environment exists to exercise it against.
- Multi-workspace isolation, cross-tenant RLS denial and the runtime role's actual privileges
  are **self-reported** by the guardrail, not independently observed. `[ ]`
- The 20-domain enforcement count in D-1 is derived from a source grep across
  `apps/guardrail-service/src` and `apps/orchestrator/src`. The orchestrator contains **no**
  reference to `domains[...]`, so no enforcement lives there.

---

**Related:** [`FULL_PROGRAM_CHECKPOINT.md`](FULL_PROGRAM_CHECKPOINT.md) §8-9 ·
[`repo-structure.md`](repo-structure.md) · [`guardrail-api.md`](guardrail-api.md) ·
[`cockpit-route-and-settings-inventory.md`](cockpit-route-and-settings-inventory.md) ·
[`kill-switch-runbook.md`](kill-switch-runbook.md) · [`postgres-runtime.md`](postgres-runtime.md)