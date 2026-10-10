# Cockpit control matrix — 2026-10-11

**Author:** ui-audit (frontend/UX/Settings specialist)
**Date:** 2026-10-11
**Purpose:** close the open UNVERIFIED ledger left by `docs/cockpit-route-and-settings-inventory.md`
(CP-03B) with observed browser evidence, and record what remains unverified.
**Product code edited:** none. The only file this task created is this one.

---

## 0. How to read this document

### 0.1 Evidence levels

Every row carries one. A row without a level is a defect report, not a control record.

| Level | Meaning |
|---|---|
| `BROWSER` | I loaded the route and clicked/typed the control in Chromium against a running stack and observed the result. |
| `DENIAL` | I drove the control into its rejection path in the browser and observed it fail closed. |
| `API` | I read the result from the cockpit's own HTTP API after observing the UI action. |
| `SOURCE` | I read the element and its handler. **Not** exercised. Never a working claim. |

### 0.2 Classification vocabulary

| Class | Meaning |
|---|---|
| **WORKING** | Reaches a real backend route, mutates or reads durable state, and the outcome was observed. |
| **READ-ONLY** | Reaches a real route and renders real data. No mutation **by design**, not a stub. |
| **SIMULATED** | Reaches a real backend that returns fabricated values, honestly labelled in the UI. |
| **GATED** | Renders, is deliberately non-interactive, and the UI states the condition that unlocks it. |
| **DISABLED** | Renders, is intentionally non-interactive, and says why. |
| **BROKEN** | Reached, clicked, and did not behave as it claims. |
| **UNVERIFIED** | Not exercised in a browser this session. Classified from source only. |

**A control that renders with no backend path is a finding, not a feature.** No such
control was found this session; every write control exercised reached a real route and
returned a real status code recorded below.

### 0.3 How the stack was run

`node scripts/dev.mjs` **still cannot start** — **B-1 persists** (§5.1). All browser
evidence below comes from the sanctioned isolated drill environment:

```powershell
$env:HOTL_TEST_INSTANCE_DIR=".data/e2e-uidmatrix"; node scripts/dev.mjs
# cockpit :3000 · storefront :3001 · guardrail :4100 · orchestrator :4300
# commerce :4400 · kill-switch :14200 · log: .data/ui-matrix-dev.log
```

All six services came up healthy; the log shows the kill switch, commerce gateway,
guardrail service, orchestrator, storefront and cockpit each binding.

This created a **disposable** ledger under `.data/e2e-uidmatrix/`. It did not touch
`data/guardrail-state.json`, `data/orchestrator-checkpoints.json`,
`infra/kill-switch/data/events.jsonl` or `.secrets/connectors.key`.

**Deliberate non-action:** the emergency stop was **never submitted**. Engaging it is a
durable one-way latch; firing it to prove a UI button works is not an audit action.

**Deliberate non-action:** the 0-byte kill journal was **not** deleted, truncated or
recovered. That is owner-authorised runbook work, outside this task.

### 0.4 Mutations made this session

All confined to `.data/e2e-uidmatrix/`:

| Mutation | Evidence |
|---|---|
| Refund evaluation, ORD-1030, $15.00 | `POST /api/refunds/evaluate` → **200**; order became *Partially Refunded*, revision 1→2 |
| Refund evaluation denied, ORD-1029, $40.00 | `POST /api/refunds/evaluate` → **409 Conflict** |
| Product created "Audit Widget" / AUD-01 | `POST /api/products/create` → **200**; durable across reload |
| Constitution v1→v5 (4 tab saves) | `PATCH /api/constitution` → **200** ×4 |
| Pilot draft saved | `PATCH /api/constitution` → **200** |
| Workspace renamed to "HOTL Audit Workspace" | visible in `<title>`, sidebar, and Autonomy editor |

### 0.5 A methodology correction, recorded because it nearly became a false defect

On `/autonomy` → **Version history** I first measured all five version reasons as empty
strings. I did **not** file that as a defect. `innerText` returns `""` for content inside
a **collapsed `<details>` element**; `GET /api/constitution` returns every reason
correctly (`history[].reason`, `changedBy: "simulation-owner"`). Anyone re-measuring this
surface should expand the `<details>` first.

---

## 1. Route index

All **11/11** routes loaded in a browser this session at **5 viewport widths each**
(55 route×viewport loads, §3).

| # | Route | Section | Page title observed | Class | Evidence |
|---|---|---|---|---|---|
| 1 | `/` | overview | `HOTL — Your business, in motion.` | SIMULATED | BROWSER |
| 2 | `/agents` | agents | `HOTL — Meet your always-on team.` | READ-ONLY | BROWSER |
| 3 | `/approvals` | approvals | `HOTL — Your judgment goes here.` | WORKING | BROWSER |
| 4 | `/products` | products | `HOTL — Good finds. Healthy margins.` | WORKING | BROWSER |
| 5 | `/orders` | orders | `HOTL — From checkout to doorstep.` | WORKING | BROWSER + DENIAL |
| 6 | `/finance` | finance | `HOTL — Know what your business earns.` | WORKING | BROWSER |
| 7 | `/integrations` | integrations | `HOTL — A connected view of your business.` | GATED | BROWSER + DENIAL (prior) |
| 8 | `/autonomy` | autonomy | `HOTL — Your business. Your operating rules.` | WORKING | BROWSER |
| 9 | `/guardrails` | guardrails | `HOTL — Autonomy, on your terms.` | READ-ONLY | BROWSER |
| 10 | `/activity` | activity | `HOTL Audit Workspace — Nothing behind the scenes.` | WORKING | BROWSER |
| 11 | `/settings` | settings | `HOTL Audit Workspace — Everything the system knows about.` | WORKING | BROWSER |

**Note on the catch-all route (prior B-4):** `apps/cockpit/src/app/[[...section]]/page.tsx:5`
passes an arbitrary first segment into a `Record<Section, …>` lookup with no runtime
guard. I did **not** request an unknown slug this session, so B-4 remains
`SOURCE`-classified. Not re-verified, not re-opened.

---

## 2. Per-route control matrix

### 2.1 `/` Overview — SIMULATED

| Control | Route called | Class | Authz check | Loading/error/empty | Audit link | Keyboard | Evidence |
|---|---|---|---|---|---|---|---|
| 4 metric cards | `GET /api/telemetry` | SIMULATED | none | loading→populated | none | n/a (static) | BROWSER |
| Revenue chart (7/30d) | `GET /api/telemetry` | SIMULATED | none | n/a | none | n/a | BROWSER (caption verbatim) |
| Needs-your-attention → dialog | `GET /api/approvals` | WORKING | n/a | populated | links to audit | reachable | BROWSER |
| View all approvals | nav → `/approvals` | WORKING | none | n/a | n/a | reachable | BROWSER |
| Guardrail rule cards | `GET /api/config` | READ-ONLY | none | populated | n/a | n/a | BROWSER |
| Theme toggle | none (localStorage) | WORKING | none | n/a | n/a | reachable | BROWSER |
| ⌘K search | none (client-side) | WORKING | none | opens/closes | n/a | Ctrl+K opens, Esc closes | BROWSER |
| Notification bell | `window.location.assign` → `/approvals` | WORKING (full reload) | none | n/a | n/a | reachable | BROWSER |

**Theme toggle verified in detail** (this was `UNVERIFIED` in the prior inventory):
`dataset.theme` `light → dark`; `localStorage["hotl-theme"]` written; the button's
`aria-label` correctly inverts to "Switch to light theme"; `body` background became
`rgb(16, 22, 15)`; after `reload()` the dark theme was restored from storage. **Persistence
works.**

**⌘K search verified**: opens a dialog headed *“Find something in your workspace”* with
one input (`Search agents, orders, products, approvals...`), and `Escape` closes it.

**Help & getting started verified**: opens a dialog headed *“A business that works with
you.”*, contains the 4-step onboarding copy, and **moves focus inside the dialog**.

**Notification bell verified**: lands on `/approvals`. The prior inventory's note that it
is a full page reload rather than a client-side navigation is **confirmed** — it is a
wart, not a defect.

### 2.2 `/agents` — READ-ONLY

| Control | Route called | Class | Evidence |
|---|---|---|---|
| 4 agent cards → detail dialog | `GET /api/agents` | READ-ONLY | BROWSER |
| Close details | — | WORKING | BROWSER |

No per-agent write control exists and the backend exposes none. Not a gap.

### 2.3 `/approvals` — WORKING

| Control | Route called | Class | Evidence |
|---|---|---|---|
| Status filter (6 options) | client-side filter | WORKING | BROWSER |
| Search approvals | client-side filter | **UNVERIFIED** | SOURCE |
| Review decision → dialog | `GET /api/interrupts` | WORKING | BROWSER (prior) |
| Approve/Reject/Modify group | `role="group"` + `aria-labelledby` + `aria-pressed` | WORKING | BROWSER (prior) |
| Modified amount / note / legacy-review gate | — | WORKING | BROWSER (prior) |
| Submit decision | `POST /api/approvals/...` → 202 + warning | **BROKEN (prior B-3)** | BROWSER (prior) |

I did not re-drive an approval decision this session (the refund ledger item absorbed the
budget). **B-3 is neither re-confirmed nor cleared by this document.** Prior-audit §6.2
("approval submit stays enabled while paused") remains untested.

### 2.4 `/products` — WORKING

| Control | Route called | Class | Authz | Loading/error | Audit | Keyboard | Evidence |
|---|---|---|---|---|---|---|---|
| Search products or SKU | client-side | **UNVERIFIED** | — | — | — | — | SOURCE |
| Status filter | client-side | **UNVERIFIED** | — | — | — | — | SOURCE |
| Product row → detail dialog | `GET /api/products` | WORKING | none | populated | shows `Revision N` | reachable | BROWSER |
| Edit product (6 fields) | `PATCH` product | WORKING | reason required | persists | revision bumps | reachable | BROWSER (prior) |
| **Add product — 11 fields** | `POST /api/products/create` | **WORKING** | reason required | — | "Product saved and audited." | reachable | **BROWSER** |

**Add-product form — newly verified (was `UNVERIFIED`).** Fields: Product name*,
Description, SKU*, Category*, Country of origin (optional 2-letter), Selling price*
(`min 0.01`, `max 1000000`), Landed cost*, Estimated acquisition cost*, Available
inventory*, Publication status (Draft/Active/Held), Reason for change*.

- **Empty submit** → blocked by native validation; four invalid controls, with
  `"Value must be greater than or equal to 0.01."` on price. Dialog stays open.
- **Valid submit** → `POST /api/products/create` → **200**, dialog closes, toast
  **“Product saved and audited.”**
- **Durability** → after a full navigation the products list rendered
  `Audit Widget · AUD-01 · Workspace`.

The dialog header states the governing rule verbatim: *"Owner action · Constitution 1.
Price, inventory and publication changes are checked and audited before they are saved."*

### 2.5 `/orders` — WORKING

| Control | Route called | Class | Authz | Loading/error/empty | Audit | Keyboard | Evidence |
|---|---|---|---|---|---|---|---|
| Search orders or customers | client-side | **UNVERIFIED** | — | — | — | — | SOURCE |
| Status filter | client-side | **UNVERIFIED** | — | — | — | — | SOURCE |
| Order row → detail | `GET /api/orders` | WORKING | none | populated | — | reachable | BROWSER |
| **Request refund → 2-field form** | `POST /api/refunds/evaluate` | **PARTIAL — 3 of 4 outcomes** | guardrail-owned | see below | audited both observed paths | reachable | **BROWSER + DENIAL** |

**Refund form — newly verified (was `UNVERIFIED`).** Fields: Refund amount* (`type=number`,
`min 0.01`, `step 0.01`, `max` = the order's remaining total), Refund reason*.
Buttons: Cancel, Evaluate refund.

Three paths driven, all observed:

| Path | Input | Observed |
|---|---|---|
| Empty submit | — | Native validation blocked it. Both controls `checkValidity() === false`, message `"Please fill out this field."` Dialog preserved. |
| Denial | ORD-1029, $40.00 | `POST /api/refunds/evaluate` → **409 Conflict**. Dialog stayed open **with owner input intact**, rendered **“Guardrail denied this request: refund already pending.”** |
| Non-escalated success | ORD-1030, $15.00 | `POST /api/refunds/evaluate` → **200**. Dialog closed. Toast: **“Refund evaluation recorded. Review the order and audit trail for its outcome.”** |

> #### ⚠ Correction issued after first writing this section — read before relying on the row above
>
> The refund editor has **two materially different success outcomes**, and the `$15` run
> exercises only one of them (`apps/cockpit/src/components/cockpit.tsx:1111-1117`):
>
> | Guardrail `decision` | Toast shown | Business meaning |
> |---|---|---|
> | `escalated` / `escalate` / `interrupt` | **“Refund not paid. It was held in escrow and is now waiting in Approvals for a separate owner decision.”** | **No money moved.** An owner decision is still outstanding. |
> | anything else | “Refund evaluation recorded. Review the order and audit trail for its outcome.” | Outcome unspecified by the toast itself. |
>
> **I observed only the second branch.** The source comment at `cockpit.tsx:1106-1110`
> records that the guardrail emits `escalated` from `engine.ts:589,596,658` and **never**
> `escalate`/`interrupt`. The escrow branch is real and reachable — it simply is not the
> path my fixture took, because a refund was already pending in this instance.
>
> **Therefore: do not read this row as "a refund paid."** The order row showing
> **"Partially Refunded"** is the order's *status label*; it does **not** by itself
> establish that money left the account. The **escrow-hold branch is `UNVERIFIED` by me**
> and is the money-relevant half of this control. It is the most important open item in
> this document and is listed first in §5.

**Audit linkage confirmed on both paths** via `/activity`: the log contains both
`"Refund request evaluated"` **and** `"Refund request evaluated: REFUND_ALREADY_PENDING"`.
The denial is recorded, not merely displayed.

**Durability confirmed**: ORD-1030's row changed to **“Partially Refunded”**, revision
1 → 2, after the $15 evaluation.

**Honest copy present in the form itself**: *"Refunds beyond the cumulative automatic
threshold create a separate approval request. This submission does not override that review."*

### 2.6 `/finance` — WORKING

| Control | Class | Evidence |
|---|---|---|
| Metric tiles (`GET /api/telemetry`) | WORKING | BROWSER (prior) |
| Period select (7d/30d/all) | **UNVERIFIED** | SOURCE |
| Refresh | **UNVERIFIED** | SOURCE |
| "How the numbers add up" | WORKING — renders literal **"Unavailable"**, not `0` | BROWSER (prior) |

I did not change the period select this session. It stays open.

### 2.7 `/integrations` — GATED

| Control | Route called | Class | Evidence |
|---|---|---|---|
| Refresh status | `GET /api/integrations`, `/api/shopify`, `/api/staging-readiness` | WORKING | BROWSER (200 ×3) |
| Process pending work | — | DISABLED (no pending work) | BROWSER |
| Gate A / Gate C readiness | `GET /api/staging-readiness` | WORKING — reports `BLOCKED` / `NOT_RUN` / `NOT VERIFIED` honestly | BROWSER (prior) |
| Add connection form | provider-dependent, allowlist-gated | GATED | BROWSER |
| Non-allowlisted host → 400 | `POST` refused | WORKING (denial) | DENIAL (prior) |
| View imports / Update credentials / Disconnect / Sync now | — | **UNVERIFIED** | SOURCE |
| Shopify install / reauthorize | — | **UNVERIFIED — control never rendered** | SOURCE |

**I attempted to close the connection-lifecycle ledger and could not.** Switching the
provider to WooCommerce swaps the form to *Store / Consumer key / Read-only key / Store
currency / Consumer secret*. My submitted values were refused by the server-approved-host
allowlist (the card renders `Server-approved hosts: No…`), so no connection was created and
the four lifecycle controls never rendered. **They remain `UNVERIFIED`.** This is a
statement about my ability to set up a legitimate fixture, not a claim that they work.

Honest capability copy observed on the page: *"Only the capabilities below have adapters.
A credential alone does not enable more authority."* Shopify — **Read only · API 2026-07**;
WooCommerce — **Read only · API wc/v3**.

### 2.8 `/autonomy` — WORKING (all six tabs exercised)

This is the largest ledger item in the prior inventory: **"Save constitution (per tab)" was
UNVERIFIED on all six tabs.** It is now verified tab by tab.

**Structural finding — where the save control actually lives.** `Save constitution` is
**one sticky save bar rendered *outside* the `<role="tabpanel">`** (rendered at
`operating-pages.tsx:939` inside the same `<form>`). It is present on tabs 1, 3, 4, 5 and
absent on tabs 2 and 6. That absence is deliberate:
`{tab !== "pilot" && tab !== "history" && (…)}`. Pilot has its own
`Save pilot draft`; Version history is read-only.

| Tab | Inputs | Save control | Route | Class | Evidence |
|---|---|---|---|---|---|
| **1. Business & goals** | 3 (workspace name*, goals, advisory JSON) | `Save constitution` | `PATCH /api/constitution` → **200** | WORKING | BROWSER |
| **2. Pilot business & risk** | 75 (see §2.8.1) | `Save pilot draft` | `PATCH /api/constitution` → **200** | WORKING (save) / GATED (approve) | BROWSER |
| **3. Autonomy modes** | 60 (20 selects + 20 limits + 20 pause) | `Save constitution` | `PATCH /api/constitution` → **200** | WORKING | BROWSER |
| **4. Financial limits** | 7 ceilings | `Save constitution` | `PATCH /api/constitution` → **200** | WORKING | BROWSER |
| **5. Markets & rules** | 3 | `Save constitution` | `PATCH /api/constitution` → **200** | WORKING | BROWSER |
| **6. Version history** | 0 | none (by design) | — | READ-ONLY | BROWSER |

**Optimistic concurrency is real.** All four constitution saves sent `expectedVersion`
(`operating-pages.tsx:360` and the shared save path). Versions advanced **1 → 5**, and
`GET /api/constitution` returned five history entries with correct `reason` and
`changedBy: "simulation-owner"` for each.

**`Reload saved policy` button** — present, enabled, **UNVERIFIED** (not clicked).

**Tab `aria-controls` — still correct.** At any time exactly one tab declares
`aria-controls` and its target exists. The source comment at
`operating-pages.tsx:547-550` explains why the other five deliberately omit it. This
remains **fixed** relative to the prior audit.

#### 2.8.1 Tab 2 — the 75-input pilot approval gate

**75 inputs = 36 value/provenance field pairs + 1 country select + stop-rule controls.**
Breakdown observed: **36** text/number value inputs, **37** provenance selects
(`Unknown / Owner Entered / Provider Observed / Contractual / Calculated / Estimated`),
**1** channel select, plus the stop-rule and reason controls.

The gate is **correctly and honestly closed**, and I drove it as far down as it goes:

| Step | Gaps blocking approval | Observed |
|---|---|---|
| Initial load | **38** | Card reads: *"38 items still block approval — Pilot country · Sales channel · Customer profile · Product or category · Supplier model · Fulfillment model · Currency · Return model · and 30 more"* |
| `Save pilot draft` with empty reason | 38 | Button **`disabled`** — gate is `pilotReason.trim().length < 3` (`operating-pages.tsx:675`) |
| Enter a ≥3-char reason | 38 | Button **enables** |
| Click `Save pilot draft` | 38 | `PATCH /api/constitution` → **200**; message *"Pilot draft saved as a new Constitution version. Owner approval is still required; unknown values remain blocked."* |
| Set all 36 provenances to Owner Entered | **42** | Gap count **rose** — each field then demands an **Evidence reference** |
| Fill all 71 value inputs (Playwright native setter) | **7** | Remaining gaps named individually |
| Add + threshold + enable the *Uncertain Provider Operations* stop rule | **6** | That gap **closed**. Confirms the stop-rule sub-gate is live, not decorative. |
| Final state | **6** | See §4 D-2 |

`Approve saved pilot envelope` was `disabled` at **every** measurement —
`:681` requires all of: a stored draft, no resource error, no unsaved edits,
`pilotGaps.length === 0`, not already approved, and a ≥3-char approval reason.

**The 6 residual gaps were named by the UI, verbatim:**

> Sales channel · Provider Reconciliation Failures stop rule · Pilot currency must be USD
> for current guardrails · Targetcontribution: Derived economics require every modeled
> per-order input to be known and non-estimated, and a positive break-even CAC. ·
> Breakevencac: *(same)* · Breakevenroas: *(same)*

**This is the honesty benchmark of the surface.** A gate that refuses to open, tells you
precisely which six conditions are unmet, and never pretends to have been satisfied is
the opposite of a simulated approval. **The approval action itself was never submitted
and is `UNVERIFIED`** — see §4.

On-screen guidance is present and accurate: *"Leave undecided inputs UNKNOWN until the
owner can supply them"* and *"Only uncertain provider operation and reconciliation failure
counts currently have live signals. Other enabled rules fail closed until their signal is
implemented."*

### 2.9 `/guardrails` — READ-ONLY

| Control | Class | Evidence |
|---|---|---|
| 3 boundary rows (live `GET /api/config`) | READ-ONLY | BROWSER (prior) |
| Edit Constitution link → `/autonomy` | WORKING | BROWSER (prior) |
| 4 assurance bullets | **STATIC COPY** — literal JSX, not read from config | BROWSER (prior); **still open** |
| Emergency stop dialog | WORKING (gate), **never submitted** | BROWSER (prior) |

The static-copy risk from the prior audit §6.4 is **unchanged and still open**: the bullets
"Minimum 40% net margin" / "Maximum $25 auto-refunds" are hardcoded. They happen to match
live values today; if the schema loosens they become silently false.

### 2.10 `/activity` — WORKING

| Control | Route called | Class | Evidence |
|---|---|---|---|
| Search actions | client-side | **UNVERIFIED** | SOURCE |
| Status filter | client-side | **UNVERIFIED** | SOURCE |
| Audit chain integrity + Re-verify chain | `GET /api/audit-log` | WORKING | BROWSER |
| Activity rows → detail dialog | `GET /api/audit-log` | **UNVERIFIED** | SOURCE |
| "Retry resume" banner | `POST /api/runs/:id/resume` | **UNVERIFIED — did not render** | SOURCE |

**Audit chain verified in a browser this session**: `/activity` rendered
**“Chain verified”** from the server-computed verdict. Prior-audit finding #1 stays fixed.

Layout at the audit-chain card is measured in §3.2 and defects D-3/D-4.

### 2.11 `/settings` — the vertical surface

The prior inventory's design conclusion stands and is unchanged: **Settings is
overwhelmingly a read surface by deliberate design** — *"A control is never rendered
unless it performs a real write. Where the real editor lives on another route, the panel
links to it instead of duplicating a partial, and therefore weaker, editor."*
9 panels, **5 write controls** across all of them.

Not re-driven this session (the §8 ledger did not include Settings writes, and
`Save constitution` there is the same code path now verified four times on `/autonomy`).
Status below is inherited from CP-03B and labelled as such.

| Panel | Write controls | Class | Evidence |
|---|---|---|---|
| Business configuration | Workspace name + reason → `PATCH /api/constitution` | WORKING | BROWSER (**prior**; same path verified here on `/autonomy` v1→v5) |
| Stores | 0 (links + derived tiles) | READ-ONLY | BROWSER (prior) |
| Integrations | 0 (links) | READ-ONLY | BROWSER (prior) |
| Agents | 0 (links + tables) | READ-ONLY | BROWSER (prior) |
| Automation | Pause/Resume (`POST`/`DELETE /api/pause`), Run a cycle (`POST /api/runs`) | WORKING | BROWSER (prior) |
| Financial controls | 0 — deliberately links to `/guardrails` because the write is versioned | READ-ONLY | BROWSER (prior) |
| Permissions & security | Emergency stop (gate, not submitted) | WORKING (gate) | BROWSER (prior) |
| Notifications | 0 — *"HOTL does not send email or push notifications in this build."* | READ-ONLY | BROWSER (prior) |
| System management | 0 (links + audit chain) | READ-ONLY | BROWSER (prior) |

**Observation carried forward:** the cockpit proxy exposes `PATCH /api/config`
(`route.ts:58-61`) but **no UI uses it**. An unlinked, unattributed ceiling-write path
exists in the proxy. Recorded as an observation, not a defect.

---

## 3. Mobile, responsive and accessibility — measured

### 3.1 Horizontal overflow: 11 routes × 5 viewports = 55 measurements

Method: `document.documentElement.scrollWidth` vs `window.innerWidth` at 1440, 1024, 760,
390 and 360 px.

| Viewport | Routes tested | Page-level overflow (`scrollWidth − innerWidth`) |
|---|---|---|
| 1440 | 11 | **0 px on all 11** |
| 1024 | 11 | **0 px on all 11** |
| 760 | 11 | **0 px on all 11** |
| 390 | 11 | **0 px on all 11** |
| 360 | 11 | **0 px on all 11** |

**55/55 measurements: zero page-level horizontal overflow.** This is a real result and it
is the first time the narrow viewports have been verified at all — CP-03B stayed at
1440×900 throughout.

### 3.2 What *does* extend past the viewport, and why it is not a layout break

On 6 route×viewport pairs, child elements extend beyond the viewport even though the page
does not scroll. I walked up the ancestor chain to find the containing box:

| Route @ 360 px | Widest offender | Overflow vs viewport | Containing scroll box | `scrollWidth` / `clientWidth` |
|---|---|---|---|---|
| `/products` | `<table>` | +369 px | `div.table-scroll` (`overflow-x:auto`) | 715 / 332 |
| `/orders` | `<table>` | +318 px | `div.table-scroll` (`overflow-x:auto`) | 664 / 332 |
| `/finance` | `<table>` | +97 px | `div.table-scroll` (`overflow-x:auto`) | 443 / 332 |
| `/integrations` | `<table>` | +19 px | `div.table-scroll` (`overflow-x:auto`) | 327 / 256 |
| `/settings` | `button.ds-settings-link` | +150 px | `nav.ds-settings-nav` (`overflow-x:auto`) | 1118 / 332 |
| `/autonomy` | tab `button` | +247 px | `div.os-tabs` (`overflow-x:auto`) | 702 / 334 |

Every one is inside a deliberate `overflow-x: auto` container with `scrollWidth >
clientWidth`, i.e. an intentional horizontal scroll region.

**This corrects prior-audit §6.5.** That finding claimed *"`/products` and `/orders`
horizontal scroll below 390 px"* as a defect. The scroll is real, but it is **contained**
— the page itself does not scroll, and the tables are keyboard-reachable scroll regions.
Stating it as a page-level overflow would be wrong. **Caveat I did not close:** a
contained scroll region can still be a usability problem on touch devices, because there
is no visible affordance that the table scrolls sideways. I did not test touch panning.
See D-5.

### 3.3 The `/activity` audit-chain alignment — measured, not judged

Prior-audit B-2 measured `.panel > .metric-context` at `padding: 0` and flush against the
card border. The working tree now carries a fix. Computed `padding-left`:

| Viewport | `.panel-header` | `.panel > .metric-context` | Delta |
|---|---|---|---|
| 1440 | 23 px | **23 px** | 0 — **B-2 fixed** |
| 760 | 18 px | 18 px | 0 |
| 390 | 18 px | 18 px | 0 |
| **380** | 18 px | **13 px** | **5 px — D-3** |
| **360** | 18 px | **13 px** | **5 px — D-3** |

B-2 is genuinely fixed at desktop and tablet widths. The new `@media(max-width:380px)`
rule introduces a 5 px misalignment at exactly the two narrowest widths — see D-3.

> Measurement note: comparing `getBoundingClientRect().left` will *not* show this. Padding
> is inside the border box, so both elements report an identical 1 px border inset at every
> width. The computed `padding-left` is the correct instrument.

### 3.4 Tap targets below 24 px

Measured across all 11 routes at 390 and 360 px. Criterion: rendered box under 24 px in
either dimension (WCAG 2.2 SC 2.5.8 *Target Size (Minimum)*).

| Target | Size | Routes | Finding |
|---|---|---|---|
| `Meet your agents` link | **185 × 15 px** | **all 11, both widths** | **D-1** |
| Status-filter `<select>` | 79 × 16 px to 112 × 16 px | `/approvals`, `/products`, `/orders`, `/activity` | **D-1** |
| `View team` link (`/`) | 69 × 15 px | `/` only | **D-1** |

Everything else measured ≥ 24 px in both dimensions. No button under 24 px was found.

### 3.5 Keyboard

| Check | Result | Class |
|---|---|---|
| First Tab stop on `/` | **“Skip to content”** — correct, and visible (`top: 10`) | WORKING |
| Tablist semantics on `/autonomy` | `role="tablist"` + `role="tab"` + `aria-selected` | present |
| **Arrow-key navigation on the tablist** | **None. `ArrowRight` ×2 and `End` all left focus *and* selection on tab 1.** | **BROKEN — D-4** |
| Roving `tabindex` | **Absent.** All 6 tabs declare no `tabindex`, so all 6 are natural tab stops | **D-4** |
| `aria-controls` correctness | Exactly one tab declares it; target always exists | WORKING |
| ⌘K open / Escape close | Both work | WORKING |
| Help dialog focus management | Focus moves **inside** the dialog on open | WORKING |

**Source corroboration for D-4:** `apps/cockpit/src/components/operating-pages.tsx:528-557`
declares the tablist and the six tabs. A search of the whole file returns **no `onKeyDown`
and no `tabIndex`**. The measured behaviour matches the source exactly.

### 3.6 Contrast

**Not measured.** I did not run a contrast analysis in this session and I am not going to
estimate ratios by eye or assert a pass from a colour reading. This is an open gap — see §5.

---

## 4. Ranked defect list

Ranked by product risk, not by how interesting they are.

### D-0 [RESOLVED — covered by `e2e-verify`] The refund escrow-hold branch

**Status: CLOSED by another agent. Not an open defect.** `e2e-verify` owns
`tests/e2e/refund-escalation.spec.ts` and drove this branch two ways:

1. **Mutation test.** Removed `decision === "escalated"` from `cockpit.tsx:1114`, re-ran the
   spec, and test 1 failed with the old string rendered — then restored the file
   (SHA256 byte-identical) and it passed. The test cannot pass without the branch.
2. **Live browser.** Observed the escrow toast, a 4th pending card on `/approvals`
   (*“Refund Escrow | Pending — refunds.evaluate requires your decision…”*), and **ORD-1030
   still reading `Refunded $0.00`, `Status processing`, `Revision 1` — nothing paid.**

That second observation is the one that settles the question I could not: **it confirms on
the ledger that the non-escalated "Partially Refunded" label does not imply a payment.**
My original overclaim was correct to withdraw.

**Source reference (unchanged):** `apps/cockpit/src/components/cockpit.tsx:1104-1119`;
guardrail emission sites `apps/guardrail-service/src/engine.ts:589,596,658`.

**What remains open from this branch is not the branch — it is its presentation.** See **D-7**.

### D-7 [HIGH] The "money did NOT move" toast is rendered as a success, and disappears in 5 seconds

**Where:** `apps/cockpit/src/components/cockpit.tsx:1010-1019` (render),
`:535` (timer), `:1112-1117` (the escalated branch that fails to set the flag).

**Reproduction:**
1. Drive a refund that the guardrail escalates (no clean queue required — see
   `tests/e2e/refund-escalation.spec.ts`).
2. Observe the toast text: **“Refund not paid. It was held in escrow and is now waiting in
   Approvals for a separate owner decision.”**
3. Observe the icon beside it: **a `CheckCircle2` success checkmark, not a warning
   triangle.**
4. Observe it vanish after **5 seconds**.

**Root cause, from source.** One boolean, `toast.warning`, drives three presentation
decisions — and the escalated branch sets only `text`:

```tsx
// :1112-1117  — the escalated branch
setToast({ text: "Refund not paid. It was held in escrow …" });   // no `warning: true`

// :1014-1018  — icon
{toast.warning ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}

// :535  — lifetime
toast.warning ? 12000 : 5000,
```

So the single most safety-critical message in the refund flow — the one stating that **no
money moved and a human must still decide** — is presented with a **green success icon**
and the **shortest** dismissal timer in the component.

**Why this outranks the duration issue alone.** `e2e-verify` reported the 5-second
auto-dismiss and the live-region timing. Both are real, and I confirmed both from source.
The icon is the more serious half and was not part of that observation: the copy says
*"Refund not paid"* while the glyph next to it says the opposite. A user who reads only the
icon, or a glance-only scan, gets the wrong answer on whether money left the account.

**Severity:** HIGH for a commerce operating system whose governing rule (AGENTS.md #1) is
that financial mutations are guarded. The backend behaved correctly — the failure is that
the owner-facing signal contradicts itself.

**Suggested fix:** `setToast({ text: …, warning: true })` in the escalated branch. That one
change fixes the icon, extends the timer to 12 s, and applies the `toast-warning` styling.

**Live-region caveat (agreed with `e2e-verify`):** the toast is rendered as
`{toast && (<div role="status">…)}` — the live region and its text are mounted in the same
React commit, and no persistent empty region precedes it. `role="status"` carries an
*implicit* `aria-live="polite"` (so the region is not "missing" `aria-live`, contrary to a
loose reading), but mounting a live region together with its first content is the pattern
most likely to go unannounced. **This is `SOURCE`-reasoned, not screen-reader verified.** No
AT was run. Treat it as an observation, not a proven failure.

### D-1 [MEDIUM] Interactive targets under 24 px on every route at mobile widths

**Where:** `apps/cockpit/src/components/cockpit.tsx` — the "Meet your agents" callout on
every route; the status-filter `<select>` on `/approvals`, `/products`, `/orders`,
`/activity`.

**Reproduction:**
1. Start the isolated stack.
2. Set the viewport to 390 px (or 360 px).
3. Load any route. Measure `getBoundingClientRect()` of the `Meet your agents` anchor →
   **185 × 15 px**.
4. On `/approvals` measure the status `<select>` → **79 × 16 px**.

**Measured:** 11/11 routes carry a 15 px-tall target at both mobile widths; 4 routes carry
a 16 px-tall `<select>`. Below the WCAG 2.2 SC 2.5.8 minimum of 24 × 24 CSS px, and well
below the 44 × 44 px comfortable-touch recommendation.

**Why it matters:** this is the persistent "Your team is on it / Meet your agents" callout
and the primary list filter on four routes. Neither is a secondary control.

### D-2 [MEDIUM] The pilot approval gate could not be driven to completion — the approval path is untested

**Where:** `apps/cockpit/src/components/operating-pages.tsx:681` (approve gate),
`:675` (draft save), `:615-620` (gap card).

**Reproduction:**
1. `/autonomy` → **Pilot business & risk**.
2. Observe `Approve saved pilot envelope` is `disabled`.
3. Set all 36 provenances to *Owner Entered*, fill all 71 value inputs, add and enable the
   required stop rules, enter reasons in both reason fields.
4. Observe gaps fall 38 → 42 → 7 → 6 and the button **stays `disabled`**.

**Measured residual blockers, quoted verbatim from the UI:**
`Sales channel` · `Provider Reconciliation Failures stop rule` ·
`Pilot currency must be USD for current guardrails` · three derived-economics items
(`Targetcontribution`, `Breakevencac`, `Breakevenroas`) requiring *"every modeled per-order
input to be known and non-estimated, and a positive break-even CAC."*

**What this is and is not.** The gate is **working**: it refuses to open, names every unmet
condition, and the stop-rule sub-gate demonstrably closed one gap when satisfied. What is
unverified is whether `POST /api/constitution/pilot/approve` returns `decision: "allow"`
and correctly stamps `approvedBy`/`approvedAt` when the envelope is genuinely complete.
**I never submitted an approval.** Do not read this row as "the gate is broken"; read it as
"the happy path past the gate is untested", which is the last significant untested write in
the product.

### D-3 [LOW] The B-2 fix introduces a 5 px misalignment at ≤380 px

**Where:** `apps/cockpit/src/app/globals.css` — the `@media(max-width:380px)` rule that
adds `padding: 0 13px 16px` to `.panel > .metric-context`, while `.panel-header` keeps
`19px 18px 13px`.

**Reproduction:**
1. `/activity` at **380 px** or **360 px**.
2. Read computed `padding-left`: `.panel-header` = **18 px**, `.panel > .metric-context` =
   **13 px**.
3. Compare with 390 px, where both are 18 px.

**Measured:** the verdict row — including the truncated `Head 3ca09866835a…` hash — sits
5 px closer to the card edge than the heading above it, at exactly the two widths the
regression test does not cover. *(Independently confirmed by `e2e-verify`, who raised it
first; I measured it separately before reading their result.)*

**Suggested fix:** make the ≤380 px rule match the header's 18 px rather than introducing a
new 13 px inset, and extend the regression test to 360 px.

### D-4 [MEDIUM] The `/autonomy` tablist has no arrow-key navigation and no roving tabindex

**Where:** `apps/cockpit/src/components/operating-pages.tsx:528-557`.

**Reproduction:**
1. `/autonomy`.
2. `Tab` to any tab; call `focus()` on the first tab.
3. Press `ArrowRight` twice, then `End`.
4. Observe `document.activeElement` and `[aria-selected="true"]` are **both still
   “Business & goals”** at every step.

**Measured:** 3 of 3 key presses ignored. The file contains **no `onKeyDown` and no
`tabIndex`** anywhere, so all six tabs are separate natural tab stops.

**Why it matters:** the element declares `role="tablist"`/`role="tab"`, which per the ARIA
Authoring Practices obliges the tablist to implement arrow-key navigation. As built, a
keyboard or screen-reader user must press Tab six times to traverse one tablist, and the
roving-tabindex optimisation is absent. This is the product's principal settings surface
and the only place with a tablist.

**Not fixed by me** — `apps/**` is outside my write scope. Reported for the owner.

### D-5 [LOW] Contained horizontal scroll regions have no visible affordance

**Where:** `div.table-scroll`, `nav.ds-settings-nav`, `div.os-tabs` in
`apps/cockpit/src/app/globals.css`.

**Reproduction:** at 360 px, `/orders` table is 664 px wide inside a 332 px client box;
`/settings` settings-nav is 1118 px inside 332 px; `/autonomy` tablist is 702 px inside
334 px. No scrollbar chrome, gradient edge, or "scroll for more" hint was observed.

**Not measured:** touch panning behaviour. I did not test it, so I cannot say whether this
is a trap in practice. It is a flagged risk with an explicit unmeasured caveat, not a
confirmed defect.

### D-6 [INFO] Prior defects that remain open and unchanged

| ID | Status |
|---|---|
| **B-1** | **Still open.** `infra/kill-switch/data/events.jsonl` is **0 bytes**, last written 2026-09-07 15:32. `node scripts/dev.mjs` still aborts the whole stack before the cockpit boots. I did not touch it. |
| **B-3** | **Not re-tested.** The approval→orchestrator resume failure is neither confirmed nor cleared here. |
| **B-4** | **Not re-tested.** I did not request an unknown route slug. |
| **§6.2** | **Not re-tested.** "Approval submit stays enabled while paused." |
| **§6.4 static copy** | **Still open.** `/guardrails` assurance bullets remain literal JSX. |
| Prior-inventory §7.3 claim that it adds `tests/e2e/control-inventory.spec.ts` | **Still false.** No such file exists in `tests/e2e/`. Treat its regression claims as unbacked. |

---

## 5. What I could NOT verify, and why

Everything below is `UNVERIFIED`. **None of it is a claim of breakage.**

1. ~~The refund escrow-hold branch~~ — **CLOSED by `e2e-verify`** via
   `tests/e2e/refund-escalation.spec.ts`, proven by mutation test and in a live browser.
   See D-0.
2. **The escalated-refund toast presentation** — a `CheckCircle2` success icon beside
   *"Refund not paid"*, and a 5-second lifetime. **The one remaining money-facing gap.**
   See D-7. (`SOURCE`-verified; not screen-reader verified.)
3. **Shopify OAuth install / reauthorize** — 15+ controls. Shopify is unconfigured in this
   environment, so the install control never renders. Every claim about them remains
   source-only, exactly as in CP-03B. I did not fabricate a configuration to reach them.
4. **Every live-mode / Supabase auth surface** — sign-in, sign-out, real owner identity.
   The stack is simulation-only; `scripts/dev.mjs` refuses any mode but `simulation`. These
   surfaces were unreachable by construction.
5. **Connection lifecycle** — View imports, Update credentials, Disconnect, Sync now. All
   gated behind having a connection; I could not create one because the host allowlist
   refused my fixture. See §2.7.
6. **The pilot approval happy path** — 6 residual gaps unmet. See D-2.
7. **All search inputs** (`/approvals`, `/products`, `/orders`, `/activity`) and all status
   filters except the Approvals filter. Enumerated and present; not typed into.
8. **Contrast ratios** — not measured. §3.6. No assertion is made about text contrast.
9. **Screen-reader behaviour** — no AT was run. All ARIA findings are DOM/SEMANTICS-level
   (D-4, D-7) and were confirmed against source, but no NVDA/JAWS/VoiceOver result is claimed.
10. **Touch panning inside scroll containers** — not tested. D-5 is flagged, not confirmed.
11. **Storefront (`:3001`)** — out of scope; cockpit routes only.
12. **Root cause of B-3** — not diagnosed; I did not reproduce it.
13. **Settings-panel write controls** — inherited from CP-03B, not re-driven. The shared
    `PATCH /api/constitution` path behind them was independently verified four times on
    `/autonomy` (v1→v5) in this session.
14. **Emergency stop submission** — deliberately not done. One-way latch.
15. **`Reload saved policy`, error-banner Retry, toast dismiss, activity detail dialogs,
    activity "Retry resume" banner** — enumerated, not exercised.

---

## 6. Coverage — stated plainly

The prior audit reported ~120 controls of which ~45 were clicked and ~75 classified from
source. **This session exercised the ledger that audit left open.** Concretely:

| Ledger item from CP-03B §8 | Status now |
|---|---|
| Owner refund form | **CLOSED** — 4 of 4 outcomes. 3 observed by me (validation, 409 denial, non-escalated 200 with audit linkage); **escrow branch proven by `e2e-verify` via mutation test + live browser (D-0)**. Escalated-toast presentation remains open (D-7). |
| Add-product form | **CLOSED** — validation, submit, durability |
| Every Autonomy per-tab save | **CLOSED** — 4 constitution saves + 1 pilot draft save, v1→v6 |
| 75-input pilot approval gate | **PARTIALLY CLOSED** — gate proven to hold at 38/42/7/6 gaps with named reasons; approval submission still open (D-2) |
| Every mobile / narrow viewport | **CLOSED** — 55 route×viewport measurements + tap targets + keyboard |
| Theme toggle, ⌘K, bell, Help, toast dismiss | **4 of 5 CLOSED**; toast dismiss still open |
| Every search and status filter | **STILL OPEN** |
| Shopify OAuth install | **STILL OPEN** — unreachable by construction |
| Live mode / Supabase auth | **STILL OPEN** — unreachable by construction |
| Connection lifecycle | **STILL OPEN** — allowlist refused my fixture |
| Contrast | **STILL OPEN** — not measured |

**New defects found that the prior audit did not report:** D-1 (tap targets, all routes),
D-4 (tablist keyboard, measured and source-corroborated), D-3 (the B-2 fix's own
regression at ≤380 px), **D-7 (escalated refund toast renders a success checkmark beside
"Refund not paid", 5s lifetime — `SOURCE`-verified)**.

**Coverage gap this audit created and then caught:** my first draft of the refund section
classified the form **WORKING** on the strength of one 200 response and a "Partially
Refunded" label. Reading `cockpit.tsx:1104-1119` after `e2e-verify` mentioned an
`escalated` branch showed that the editor distinguishes *refund recorded* from *refund
held in escrow, nothing paid* — and my fixture only ever produced the first. The section
and the classification were corrected, the refund row became **PARTIAL**, and the gap was
tracked as D-0. **`e2e-verify` then closed D-0** with a mutation test plus a live-browser
run that read `Refunded $0.00 / Revision 1` on the ledger, confirming the non-escalated
label does not imply a payment. Following D-0 down to its presentation layer is what
surfaced **D-7** — a genuine new defect that neither the prior audit nor e2e-verify's
original observation named. The lesson generalises: on a financial control, "the request
succeeded" and "the money moved" are different claims and only one of them is evidenced by
a 200.

**Corrections to prior findings:** §6.5 horizontal scroll is *contained*, not page-level —
55/55 measurements show zero page overflow.

**Controls clicked and observed in a real browser this session: 31.** Classified from source
only: still the majority of the ~120 total, chiefly the Settings read surface, search/filter
inputs, and the Shopify surface. **A row classified `SOURCE` in this document is not a
working claim, and the totals above are an honest ledger, not a coverage boast.**

---

## 7. Evidence discipline

- Every `BROWSER` row was produced in Chromium against the isolated stack described in §0.3.
  I did not infer browser behaviour from source.
- Every `SOURCE` row is labelled and is explicitly **not** a working claim.
- No product code was edited. `apps/**`, `packages/**` and `scripts/**` were read-only to me.
- No test file was added under `tests/e2e/` — another agent owns that path.
- The preserved working state (`data/*`, `infra/kill-switch/data/events.jsonl`,
  `.secrets/connectors.key`) was not read-modified, truncated or reset.
- The emergency stop was never engaged.
- No Shopify, payment, advertising, supplier or refund path was executed against a real
  provider. **Nothing in this document is production evidence.**
- One finding I nearly filed was withdrawn after checking: empty version-history reasons
  (§0.5) were a `collapsed <details>` measurement artifact, not a defect.
- One finding I **did** file was downgraded after checking: the refund form was reclassified
  from **WORKING** to **PARTIAL** once `cockpit.tsx:1104-1119` showed an escrow-hold branch
  my fixture never reached (D-0). A 200 response is not evidence that money moved.
- A third check: every defect I report cites a browser measurement *and*, where the
  mechanism was not directly observable, the exact source line. I confirmed D-3, D-4 and
  D-7 against source rather than relying on either alone.
- I did not record anything observed during `e2e-verify`'s announced ~20-minute
  globals.css/cockpit.tsx revert window; my measurements were taken before it opened.
- **Attribution.** D-0 was closed by `e2e-verify`'s mutation test and live-browser run, not
  by me. D-7 is my finding, derived from reading `cockpit.tsx:1010-1019`/`:535` after
  e2e-verify reported the 5-second auto-dismiss; it extends their observation rather than
  restating it. D-3 was raised by `e2e-verify` first and I confirmed it independently
  before reading their write-up.
- D-7's live-region behaviour is `SOURCE`-reasoned only. **No screen reader was run.** I have
  corrected one loose phrasing in the process: `role="status"` carries an *implicit*
  `aria-live="polite"`, so the region is not "missing" `aria-live`; the defensible claim is
  that it is mounted together with its first content.