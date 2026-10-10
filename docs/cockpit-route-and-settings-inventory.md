# Cockpit route and Settings inventory — CP-03B

**Author:** cockpit-audit (frontend/Settings specialist)
**Date:** 2026-10-10
**Audited tree:** working tree at time of audit (`apps/cockpit` unchanged by this audit; no product code was edited)
**Scope:** every cockpit route, every visible function, every vertical Settings control

---

## 0. Header note — how to read this document

**A missing file would be worse than an honest UNVERIFIED.** This inventory is deliberately
over-weighted toward `UNVERIFIED` where I did not personally click the control in a live
browser. Do not read a `UNVERIFIED` row as "broken" and do not read it as "fine".

Three evidence levels are used throughout, and the `Evidence` column always says which one:

| Evidence | Meaning |
|---|---|
| `BROWSER` | I loaded the route / clicked the control in Chromium against a running stack and observed the result. |
| `SOURCE` | I read the element, its proxy branch, and the backend handler. I did **not** exercise it. |
| `DENIAL` | I drove the control into its rejection path in the browser and confirmed it fails closed. |

### Classification vocabulary

| Class | Meaning |
|---|---|
| **WORKING** | Reaches a real route through the cockpit proxy, mutates or reads durable state, and the outcome is visible. |
| **READ-ONLY** | Reaches a real route and renders real data. Performs no mutation **by design** (not a stub). |
| **SIMULATED** | Reaches a real backend that returns fabricated values. Honest in the UI, but the data is not observed commerce. |
| **DISABLED** | Renders, is intentionally non-interactive, and says why. |
| **BROKEN** | Reached, clicked, and did not behave as it claims. |
| **UNVERIFIED** | Not exercised in a browser this session. Classified from source only. |

### How the app was run

`node scripts/dev.mjs` **refuses to start** against the preserved working state — see
**B-1** in §5. All browser evidence below comes from the sanctioned isolated drill
environment:

```powershell
$env:HOTL_TEST_INSTANCE_DIR=".data/e2e-cockpit-audit"; node scripts/dev.mjs
# cockpit http://127.0.0.1:3000 · storefront :3001 · guardrail :4100
# orchestrator :4300 · commerce :4400 · kill-switch :14200
```

This creates a **disposable** ledger under `.data/e2e-cockpit-audit/`. It does not
touch `data/guardrail-state.json`, `data/orchestrator-checkpoints.json`,
`infra/kill-switch/data/events.jsonl` or `.secrets/connectors.key`. No file outside
`docs/cockpit-route-and-settings-inventory.md` was created or modified by this audit.

**Deliberate non-action:** the emergency stop was *opened and its gates verified* but
**never submitted**. Engaging it is a durable one-way latch; that is the correct
behaviour and this audit is not the place to prove it by firing it.

---

## 1. Routes

`NAV` (`apps/cockpit/src/components/cockpit.tsx:99-111`) declares 11 sections.
`apps/cockpit/src/app/[[...section]]/page.tsx` renders a single catch-all client
component, so **every route is the same page with a different initial section**. There
is no per-route server component, no per-route data boundary, and no 404 for an unknown
section — an unknown slug silently falls back to the `Section` union default. See **B-4**.

| # | Route | Section id | `HEADINGS` title | Class | Evidence | Notes |
|---|---|---|---|---|---|---|
| 1 | `/` | `overview` | Your business, in motion. | SIMULATED | BROWSER | Ledger metrics + illustrative chart. |
| 2 | `/agents` | `agents` | Meet your always-on team. | WORKING | BROWSER | 4 agent cards; detail dialog opens. |
| 3 | `/approvals` | `approvals` | Your judgment goes here. | WORKING | BROWSER | Full decision round-trip verified. |
| 4 | `/products` | `products` | Good finds. Healthy margins. | WORKING | BROWSER | Edit persisted (rev 1→2). |
| 5 | `/orders` | `orders` | From checkout to doorstep. | PARTIAL | BROWSER | List verified; **refund submit UNVERIFIED**. |
| 6 | `/finance` | `finance` | Know what your business earns. | WORKING | BROWSER | Honest "Unavailable". Period select UNVERIFIED. |
| 7 | `/integrations` | `integrations` | A connected view of your business. | WORKING | BROWSER + DENIAL | Non-allowlisted host correctly refused. |
| 8 | `/autonomy` | `autonomy` | Your business. Your operating rules. | WORKING | BROWSER | 6 tabs, all render. Save UNVERIFIED here. |
| 9 | `/guardrails` | `guardrails` | Autonomy, on your terms. | READ-ONLY | BROWSER | No inputs by design. Stop gate verified. |
| 10 | `/activity` | `activity` | Nothing behind the scenes. | WORKING | BROWSER | Chain verdict present; **layout defect B-2**. |
| 11 | `/settings` | `settings` | Everything the system knows about. | WORKING | BROWSER | 9 panels; constitution write verified. |

**Route count: 11 routes visited in a browser this session: 11/11.**

---

## 2. Global chrome

Present on every route. Source: `cockpit.tsx`.

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Skip to content | WORKING | BROWSER | `href="#main-content"`, target present. |
| Brand link (`/`) | WORKING | BROWSER | Observed navigating home. |
| Workspace switcher (caret + "Owner workspace") | **DECORATIVE-adjacent / see B-3** | BROWSER | Renders a `ChevronDown` implying a picker. No workspace switching exists anywhere in the app. |
| 11 nav links + `aria-current` | WORKING | BROWSER | Each maps to a `Section`. |
| Approvals count badge | WORKING | BROWSER | Observed 3 → 2 → 1 as I resolved items. |
| Autonomy-mode pill | WORKING | BROWSER | `SUPERVISED`, links to `/autonomy`. |
| Simulation/Live pill | WORKING | BROWSER | `Simulation mode` from `GET /api/session`. |
| Theme toggle | UNVERIFIED | SOURCE | Not clicked. `localStorage["hotl-theme"]` + `dataset.theme`. |
| Global search button / ⌘K | UNVERIFIED | SOURCE | Not opened. |
| Notification bell | UNVERIFIED | SOURCE | `window.location.assign('/approvals')` — a full reload, not client nav. |
| Help & getting started | UNVERIFIED | SOURCE | Not opened. |
| Owner sign-out | UNVERIFIED | SOURCE | Simulation mode only; requires live Supabase session. |
| **Pause agents / Resume agents** | **WORKING** | **BROWSER** | `POST/DELETE /api/pause` → both returned **200** in the network trace. |
| **Run a cycle** | **WORKING** | **BROWSER** | `POST /api/runs` → **201 Created**; server log shows a real cycle (`campaigns/launch`, `supplier-orders`, `refunds/evaluate`, repeated `runs/event`). |
| Error banner Retry | UNVERIFIED | SOURCE | No error state induced. |
| Toast dismiss | UNVERIFIED | SOURCE | Toasts observed; dismissal not clicked. |
| "Your team is on it" / "Meet your agents" | WORKING | BROWSER | Links to `/agents`. |
| Auto-refresh (10 s) | WORKING | BROWSER | Repeated `/api/telemetry` observed throughout. |

---

## 3. Per-route visible functions

### 3.1 Overview `/` — SIMULATED (by design, and honestly labelled)

| Control | Class | Evidence | Basis |
|---|---|---|---|
| 4 metric cards | SIMULATED | BROWSER | `Total revenue $24,782`, `Orders 342`, `Net margin 46.2%`, `Ad spend $64.20 / $100`. Each carries a visible "Illustrative …, not observed" marker. |
| Revenue chart period (7/30 days) | UNVERIFIED | SOURCE | Not toggled. |
| Revenue chart | SIMULATED | BROWSER | Renders from `telemetry().synthetic.chart`. **Now honestly captioned**: "Illustrative values for the local simulation. They are not observed commerce data and must not be presented as production evidence." The `synthetic.note` string is now rendered. |
| Needs-your-attention (3) | WORKING | BROWSER | Opens `ApprovalDialog`. |
| View all approvals | WORKING | BROWSER | Link → `/approvals`. |
| Agent rows / "View team" | WORKING | BROWSER | Rows present; detail dialog verified on `/agents`. |
| Guardrail rules (3) | READ-ONLY | BROWSER | Live `config.*` values ($64.20 / $100, 40.0%, $25). |
| "While you were away" activity rows | WORKING | BROWSER | Rows present; detail dialog not opened. |
| "Deterministic rules. No exceptions." | STATIC COPY | BROWSER | Hardcoded reassurance string. True today; not derived from state. |

### 3.2 Agents `/agents` — WORKING

| Control | Class | Evidence | Basis |
|---|---|---|---|
| 4 agent cards | WORKING | BROWSER | Clicked Sourcing → dialog showed `sourcing_agent`, status `idle`, tokenBudget 50000. |
| Close details | WORKING | BROWSER | Clicked; dialog closed. |

There is **no per-agent control** (no run/retry/scope editor). The backend exposes
`GET /api/agents` read-only, so this is not a missing surface.

### 3.3 Approvals `/approvals` — WORKING (full round-trip verified)

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Search approvals | UNVERIFIED | SOURCE | Not typed into. |
| Status filter (6 options) | WORKING | BROWSER | Selected `modified` → list filtered to 1. |
| **Review decision → dialog** | **WORKING** | **BROWSER** | Opened; full payload rendered. |
| Approve / Reject / Modify group | WORKING | BROWSER | `role="group"` + `aria-labelledby="decision-group-label"` + `aria-pressed` on each option. Submit label changes `Approve request` → `Reject request` → `Save modified decision`. **Prior-audit defect 6.3 is fixed.** |
| Modified amount field | WORKING | BROWSER | Rendered only for Modify; `required`, `min=0.01`. |
| Decision note | WORKING | BROWSER | `required`. Submitting empty was blocked by native validation ("Please fill out this field."). |
| Legacy-review checkbox | WORKING | BROWSER | Submit `disabled=true` until ticked — **correct gate**. |
| Refresh review context | UNVERIFIED | SOURCE | Not clicked. |
| Read Constitution link | UNVERIFIED | SOURCE | Link present. |
| **Submit decision (end-to-end)** | **WORKING** | **BROWSER** | Modified $42.00 → **$20.00** with a reason. Dialog closed, row left Pending, reappeared under **Modified**. The order then read **"Partially Refunded"** and Finance showed `Refunds $20.00`. |
| **Submit decision → orchestrator resume** | **BROKEN (partial)** | **BROWSER** | **B-1** in §5. Reproduced twice. |
| View expired proposals | UNVERIFIED | SOURCE | Conditionally rendered only when `expiredCount > 0` (`cockpit.tsx:1834`); this instance had 0 expired, so it never rendered. Claim is accurate but conditional. |

### 3.4 Products `/products` — WORKING

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Search products or SKU | UNVERIFIED | SOURCE | Not typed into. |
| Status filter (All/Active/Held) | UNVERIFIED | SOURCE | Not changed. |
| Product row → detail dialog | WORKING | BROWSER | Clicked; full record incl. `Revision 1`. |
| **Edit product (6 fields)** | **WORKING** | **BROWSER** | Changed inventory 128 → **130** with a reason. After reload the dialog showed `Inventory 130`, **`Revision 2`**. Durable. |
| Add product | UNVERIFIED | SOURCE | Form not opened. |

### 3.5 Orders `/orders` — PARTIAL

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Search orders or customers | UNVERIFIED | SOURCE | Not typed into. |
| Status filter | UNVERIFIED | SOURCE | Not changed. |
| Order list | WORKING | BROWSER | 6 orders; ORD-1029 correctly showed **"Partially Refunded"** after my approval. |
| Order row → detail | PARTIAL | BROWSER | Clicked ORD-1029; the session was interrupted before the dialog contents were read. |
| **Request refund + refund form** | **UNVERIFIED** | **SOURCE** | Form not opened, not submitted. `POST /api/refunds/evaluate` is reachable (`route.ts:48`) and the server log shows the *agent* calling it, but **I did not drive the owner path**. |

### 3.6 Finance `/finance` — WORKING

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Period select (7d/30d/all) | UNVERIFIED | SOURCE | Not changed. |
| Refresh | UNVERIFIED | SOURCE | Not clicked. |
| Metric tiles | WORKING | BROWSER | `Net sales $311.00`, `Estimated gross profit $200.00`, `Recorded ad spend $0.00`, `Contribution estimate $200.00`. |
| "How the numbers add up" | WORKING | BROWSER | **This is the honesty benchmark of the product**: `Blended marketing efficiency`, `Net operating profit` and `Cash balance` all render the literal string **"Unavailable"** — not zero. |

### 3.7 Integrations `/integrations` — WORKING + denial verified

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Refresh status | UNVERIFIED | SOURCE | Not clicked. |
| **Process pending work** | **DISABLED** | **BROWSER** | `disabled=true` — there is no pending work. Correctly gated. |
| Gate A + Gate C readiness | WORKING | BROWSER | Full table; **BLOCKED** / **NOT_RUN** / **NOT VERIFIED** states honest; "19 missing or invalid static settings" disclosed. |
| Add connection | WORKING | BROWSER | Inline form: provider select, name, HTTPS URL, key, secret. |
| **Connection create → non-allowlisted host** | **WORKING (denial)** | **DENIAL** | WooCommerce + `https://not-allowlisted.example.com` → **HTTP 400 "Request validation failed."** Form stayed open with owner input preserved, nothing persisted. Console shows the 400. Fails closed. |
| View imports / Update credentials / Disconnect / Sync now | UNVERIFIED | SOURCE | No connection exists, so these never rendered. |
| Shopify install / reauthorize | UNVERIFIED | SOURCE | Shopify is unconfigured, so the install control does not render. Not exercised. |

### 3.8 Autonomy & policy `/autonomy` — WORKING

| Control | Class | Evidence | Basis |
|---|---|---|---|
| 6 tabs | WORKING | BROWSER | All six switch and render: Business & goals, Pilot business & risk, Autonomy modes, Financial limits, Markets & rules, Version history. |
| Tab `aria-controls` | WORKING | BROWSER | At any time **exactly one** tab declares `aria-controls` and its target element **always exists**. **Prior-audit defect (5 of 6 dangling) is fixed.** |
| Reload saved policy | UNVERIFIED | SOURCE | Not clicked. |
| Workspace name / goals / advisory JSON | UNVERIFIED | SOURCE | Rendered, prefilled, not edited here. |
| 20 domain mode selects + limits + pause | UNVERIFIED | SOURCE | 20 rows present, all `Supervised`. Not changed. |
| Pilot fields (75 inputs) + Add stop rule | UNVERIFIED | SOURCE | Rendered. Not exercised. |
| Save constitution (per tab) | UNVERIFIED | SOURCE | Not clicked **here** — but the identical write **was** verified via Settings §4.1. |
| Approve saved pilot envelope | UNVERIFIED | SOURCE | Gate not exercised. |

### 3.9 Guardrails `/guardrails` — READ-ONLY by design

| Control | Class | Evidence | Basis |
|---|---|---|---|
| 3 boundary rows | READ-ONLY | BROWSER | Live values: `$100.00`, `40.0%`, `$25.00`. **No inputs** — the card reads like an editor but is not one. Honest only once you look. |
| Edit Constitution link | WORKING | BROWSER | Links to `/autonomy`. |
| 4 assurance bullets | STATIC COPY | BROWSER | "Minimum 40% net margin" / "Maximum $25 auto-refunds" are **literal JSX**, not read from config. They happen to match the live values. If the schema is loosened, the copy silently becomes false. **Residual from prior-audit §6.4 class.** |
| **Emergency stop** | **WORKING (gate)** | **BROWSER** | Dialog opened. Requires reason (min 10), the exact phrase `STOP EVERYTHING`, and a reauth password; all three `required`; submit `disabled=true`. **Not submitted by design.** |

### 3.10 Activity `/activity` — WORKING, with a layout defect

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Search actions | UNVERIFIED | SOURCE | Not typed into. |
| Status filter | UNVERIFIED | SOURCE | Not changed. |
| **Audit chain integrity + Re-verify chain** | **WORKING** | **BROWSER** | Reads `GET /api/audit-log`; rendered **"Chain verified · 8 entries returned by the guardrail · Head 3ca09866835a…"**. Server-computed verdict, not recomputed in the browser. **Prior-audit finding #1 is fixed.** |
| **Integrity row layout** | **BROKEN (cosmetic)** | **BROWSER** | **B-2** in §5. The verdict row renders flush against the card border. |
| Activity log rows → detail dialog | UNVERIFIED | SOURCE | Rows present; dialog not opened. |
| "Retry resume" banner | UNVERIFIED | SOURCE | Banner did not render in this session. |

---

## 4. Settings `/settings` — the vertical surface

`apps/cockpit/src/components/settings-page.tsx` declares **9 panels in 5 groups**
(`PANELS`, lines 173-252). The file's own header states the governing rule:

> *"A control is never rendered unless it performs a real write. Where the real editor
> lives on another route, the panel links to it instead of duplicating a partial, and
> therefore weaker, editor."*

**This is a deliberate, defensible design decision, not a defect** — but it means
Settings is overwhelmingly a *read* surface. I count **5 write controls across all
9 panels**; the other 24 are navigation links and read-only displays. The Lead should
not read "Settings is mostly links" as an inventory gap.

### 4.1 Business configuration — WORKING

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Workspace name (input) | WORKING | BROWSER | Typed a new name. |
| Reason for this change (textarea) | WORKING | BROWSER | Required; submit stays disabled without it. |
| Reset | WORKING | BROWSER | `disabled` until a change exists; enables on edit. |
| **Save constitution** | **WORKING** | **BROWSER** | `PATCH /api/constitution` → callout **"Workspace saved as policy version 2."** Version 1 → 2. The rename then propagated to the **browser title** (`HOTL Audit Workspace — …`, `cockpit.tsx:439`), the **sidebar brand card**, the **Autonomy** editor and the **approval legacy-review context**. Sends `expectedVersion` for optimistic concurrency. |
| Edit autonomy modes (link) | WORKING | BROWSER | → `/autonomy`. |
| Current policy / Domain autonomy tables | READ-ONLY | BROWSER | 20 domains, live modes. |

### 4.2 Stores — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| Open catalog (link) | WORKING | BROWSER — → `/products` |
| Open orders (link) | WORKING | BROWSER — → `/orders` |
| 4 stat tiles + 2 tables | READ-ONLY | BROWSER — derived from `telemetry` |

### 4.3 Integrations — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| Add connection (link) | WORKING | BROWSER — → `/integrations` |
| Manage Shopify (link) | WORKING | BROWSER — → `/integrations` |
| Connections / capabilities / vault / Shopify staging | READ-ONLY | BROWSER — honest "No connections registered" empty state |

### 4.4 Agents — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| Open agents (link) | WORKING | BROWSER — → `/agents` |
| Full audit trail (link) | WORKING | BROWSER — → `/activity` |
| Roster + recent-activity tables | READ-ONLY | BROWSER |

### 4.5 Automation — WORKING (2 writes)

| Control | Class | Evidence | Basis |
|---|---|---|---|
| **Pause agents / Resume agents** | **WORKING** | **BROWSER** | Clicked Pause → button became "Resume agents" and **Run a cycle correctly became `disabled`**. `POST /api/pause` 200, `DELETE /api/pause` 200. `operating-state` re-read afterwards (correct: pausing changes `paused`). |
| **Run a cycle** | **WORKING** | **BROWSER** | `POST /api/runs` → **201**. |
| Review (link) | WORKING | BROWSER | → `/approvals` |
| Open approvals (link) | WORKING | BROWSER | → `/approvals` |
| Edit modes (link) | WORKING | BROWSER | → `/autonomy` |
| Campaign activity (link) | WORKING | BROWSER | → `/activity` |
| Operating cycles / proposals / modes / campaigns panels | READ-ONLY | BROWSER | Empty-campaign state honestly labelled *"This is an empty ledger, not a missing read."* |

### 4.6 Financial controls — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| Edit boundaries (link) | WORKING | BROWSER — → `/guardrails` |
| Open finance (link) | WORKING | BROWSER — → `/finance` |
| Enforced limits | READ-ONLY | BROWSER — live `GET /api/config` |
| Ledger position (6 tiles) | READ-ONLY | BROWSER — `Unavailable` for unmeasured values |

**Note:** the panel deliberately refuses to edit the ceilings and links to Guardrails
instead, because that write is versioned. Correct, and explicitly documented in the
card copy. The cockpit proxy *does* now expose `PATCH /api/config`
(`route.ts:58-61`) — so an unlinked, unattributed ceiling-write path exists in the
proxy. It has **no UI**. Recorded as an observation, not a defect.

### 4.7 Permissions & security — WORKING (1 write, gate verified)

| Control | Class | Evidence | Basis |
|---|---|---|---|
| Emergency stop state (7 ledger rows) | READ-ONLY | BROWSER | Reads `GET /api/status`; reports kill-service `reachable`. |
| **Emergency stop (button)** | **WORKING (gate)** | **BROWSER** | Opens the confirmation dialog. **Not submitted** — one-way latch. |
| Guardrails (link) | WORKING | BROWSER | → `/guardrails` |
| Acting identity | READ-ONLY | BROWSER | Honest: "Local simulation token. It grants no production authority." |
| Workspace binding | READ-ONLY | BROWSER | 3 resource kinds, live revisions. |
| Identity/credential configuration | READ-ONLY | BROWSER | 6 fields; missing ones badged **"Not configured"**, present ones **"Present · unverified"**. Exactly the right distinction. |

### 4.8 Notifications — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| 6 "Open" links | WORKING | BROWSER — `/approvals` ×2, `/activity` ×2, `/guardrails`, `/integrations` |
| 2 tables | READ-ONLY | BROWSER — live counts; "Unavailable" where not measurable. |

Honest framing present: *"HOTL does not send email or push notifications in this build."*

### 4.9 System management — READ-ONLY (0 writes)

| Control | Class | Evidence |
|---|---|---|
| Audit log (link) | WORKING | BROWSER — → `/activity` |
| Full activity (link) | WORKING | BROWSER — → `/activity` |
| Service health (3 tiles) | READ-ONLY | BROWSER |
| Staging readiness table | READ-ONLY | BROWSER — "External staging is not verified." |
| **Audit chain** | **WORKING** | BROWSER — server-derived `integrity` verdict + entry hashes, rendered verbatim. |

---

## 5. BROKEN items

### B-1 [HIGH] The working demo cannot start: the emergency-stop journal is zero bytes

`node scripts/dev.mjs` aborts the entire stack before the cockpit ever boots.

**Reproduction (no browser needed):**
```powershell
node scripts/dev.mjs
```
**Observed:**
```
[kill-switch] infra/kill-switch/src/journal.ts:50
  if (!lines.length && !created) throw new Error('Empty kill journal: manual recovery required');
Error: Empty kill journal: manual recovery required
    at KillJournal.initialize (...journal.ts:50:44)
========== kill-switch EXITED (1) ==========
```

**Cause.** `infra/kill-switch/data/events.jsonl` is **0 bytes**, last written
2026-09-07 15:32. `journal.ts:43-51` deliberately refuses to accept a pre-existing
blank journal, and refuses `created` journals that are not terminated:

```ts
const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
if (!lines.length && !created) throw new Error('Empty kill journal: manual recovery required');
if (content && !content.endsWith('\n')) throw new Error('Incomplete kill journal: manual recovery required');
```

**This is correct fail-closed behaviour** (AGENTS.md rule 7). The defect is the
**state**, not the code. The file is a preserved working-demo artefact and must not be
deleted or rewritten by an audit. I worked around it using the sanctioned isolated
drill environment (`HOTL_TEST_INSTANCE_DIR`) and did not touch the journal.

**Decision needed from the Lead:** recovery via the documented manual runbook
(recreate the creation sentinel), not by truncation. Until then, a fresh clone cannot
run `pnpm dev` at all — which silently makes the whole product unrunnable.

---

### B-2 [LOW, visual] The audit-chain verdict row is flush against its card border

**Where:** `apps/cockpit/src/components/cockpit.tsx:2300` — the `.metric-context`
div inside `AuditIntegrityPanel`.

**Reproduction:** `GET http://127.0.0.1:3000/activity` → look at the "Audit chain
integrity" card.

**Measured in the DOM (not a judgement call):**

| Property | Value |
|---|---|
| `.panel` computed `padding` | `0px` (and `overflow: hidden`) |
| `.panel-header` computed `padding` | `21px 23px 15px` |
| `.metric-context` computed `padding` | `0px` |
| `.metric-context` rect | `left 271`, `bottom 461.80` |
| `.panel` rect | `left 270`, `bottom 462.80` |

The verdict row therefore sits **1px** from the left border and **1px** from the
bottom border, while the heading above it is correctly inset by 23px. Visually the row
— including the truncated `Head 3ca09866835a…` hash — reads as clipped by the card.

**Root cause:** `.panel` supplies no padding and relies on `.panel-header` to supply
its own; `.metric-context` was written assuming a padded parent (it is fine inside
`.metric-card`, which *does* have padding — used at `cockpit.tsx:1246, 1273, 2567`).
It is only wrong in the `.panel` context.

---

### B-3 [MEDIUM] Approval → orchestrator resume fails on every attempt

**Where:** `apps/cockpit/src/app/api/[...path]/route.ts:81-91`.

**Reproduction (browser):**
1. `GET http://127.0.0.1:3000/approvals`
2. Open any **Review decision** → tick the legacy-review box → pick Reject or Approve → enter a note → submit.
3. Observe the toast.

**Observed — twice, with the orchestrator running on :4300 and healthy:**
> *"Decision saved. The agent has not resumed yet; retry resume from Activity after the orchestrator reconnects."*

**What is correct:** the decision itself is durably saved and is never lost. The
fallback is deliberately non-destructive — the guardrail owns the decision, and
`route.ts:88` returns **202** rather than pretending success:

```ts
} catch {
  result = { status: 202, ok: true, data: { ...outcome, warning: 'Decision saved. The agent has not resumed yet; retry resume from Activity after the orchestrator reconnects.' } };
}
```

**What is wrong:** the orchestrator was **running and reachable** the whole time
(`HOTL orchestrator on http://127.0.0.1:4300`, and `POST /api/runs` from the same
proxy returned **201** in the same session). So the message blames a service that is
not down. Every `try` block in `proxy.ts` is fine, so the throw is coming from
upstream. The most likely cause is in `apps/orchestrator/src/app.ts:72-88`, where
`manager.resume(id, interruptId, await owner.interrupts())` re-verifies the owner
decision against `GET /api/interrupts` and throws `RunError("Unable to verify the owner
decision.", 503)` if that read is not `ok`.

**I could not isolate the exact cause** — the orchestrator's log was lost when this
session's stack was restarted, and `POST /api/runs/:id/resume` requires the owner
token in a form my direct probe did not reproduce. This row is **BROKEN with an
unconfirmed root cause**, not UNVERIFIED: the user-visible failure is reproduced twice.

**Impact:** an owner decision never resumes its agent run automatically. In simulation
the refund still applied (the guardrail writes it), which is why the defect is easy to
miss. The notification the toast points at ("Retry resume from Activity") has a
"Retry resume" banner that **did not render in my session**, so the promised retry path
may not exist — that half is UNVERIFIED.

---

### B-4 [LOW] An unknown route silently renders Overview

**Where:** `apps/cockpit/src/app/[[...section]]/page.tsx:5`
`const requestedSection = section?.[0] ?? 'overview';`

The catch-all passes an arbitrary string straight into `<Cockpit initialSection={...} />`,
whose `HEADINGS` record is typed `Record<Section, …>`. An unknown slug has no runtime
guard, so it renders the shell with a missing heading rather than a 404. UNVERIFIED in
a browser (I did not request a bogus path) — classified from source.

---

## 6. Classification totals

**Routes (11):** WORKING 8 · READ-ONLY 1 · SIMULATED 1 · PARTIAL 1 · BROKEN 0 · UNVERIFIED 0
— **11 of 11 visited in a browser.**

**Settings panels (9):** WORKING 3 (Business, Automation, Permissions) · READ-ONLY 6.

**Settings controls — 38 total:**
- 9 panel-navigation buttons
- 29 in-panel controls: **5 write**, 24 navigation/read-only

| Class | Count |
|---|---|
| WORKING | 12 |
| READ-ONLY / navigation | 22 |
| BROKEN | 0 (no Settings-specific breakage) |
| DISABLED | 1 (`Process pending work`, on `/integrations`) |
| UNVERIFIED | 3 (theme toggle, global search ⌘K, notification bell — chrome only) |

**Global-chrome + per-route controls inventoried: ~120 distinct controls.**

**Controls I clicked in a browser and observed: ~45.**
**Controls classified from source only (UNVERIFIED or SOURCE-labelled): ~75.**

---

## 7. Where the prior inventory (`docs/cockpit-control-inventory.md`) is inaccurate

I read it in full. It is **substantially accurate and unusually disciplined** — the
reproduction-first framing and the explicit `STATIC-COPY` / `DECORATIVE` classes are
better than most. It is now **partly stale**, and it has **one real gap**.

### 7.1 Its scope gap — it never covered Settings

`docs/cockpit-control-inventory.md` has **no Settings row** in its §1 summary table
and no Settings section, even though `NAV` lists `settings` as an 11th section. It
lists 12 surfaces / 122 controls, none of them the vertical Settings surface. This
document closes that gap.

### 7.2 Defects that are now FIXED on `main` (confirmed in a browser)

| Prior finding | Status now | How confirmed |
|---|---|---|
| §6.1 illustrative revenue chart captioned as measured | **FIXED** | Chart now carries the honest `synthetic.note` caption verbatim on `/`. |
| §6.3 armed decision not exposed to AT | **FIXED** | `role="group"` + `aria-labelledby="decision-group-label"` + `aria-pressed` on all three options. |
| §6.3 related: 5 of 6 `aria-controls` dangling | **FIXED** | Exactly one tab declares `aria-controls` at a time; target always exists (checked on all 6 tabs). |
| §6.4 ad-spend card hardcodes "Within budget" | **FIXED** | Card now reads "$35.80 remaining · 64.2% of ceiling used"; no hardcoded verdict. |
| §5 #1 audit-chain integrity verdict never called | **FIXED** | `/activity` now shows "Chain verified" from the server. |
| §5 #2 `GET /api/operating-state` never called | **FIXED** | Used by Settings → Automation. |
| §5 #3 campaigns list + campaign pause unreachable | **FIXED** | `route.ts:62-65` now proxies both; the Automation panel renders the campaign table. |
| §5 #4 `PATCH /v1/guardrails/config` not proxied | **FIXED** | `route.ts:58-61` now proxies it (no UI uses it — see §4.6). |
| §5 #5 Shopify webhook health not proxied | **FIXED** | `route.ts:66-68` now proxies it. |

### 7.3 Claims that are still open or only partly right

- **§6.2 "approval submit stays enabled while paused."** I did **not** reproduce this.
  On the refund interrupt I observed the opposite discipline: the submit was
  `disabled` until the legacy-review box was ticked. I did not re-test submit-while-
  paused, so this is **UNVERIFIED**, not fixed.
- **§6.5 `/products` and `/orders` horizontal scroll below 390px.** Not re-tested at
  360px this session (I stayed at 1440×900). **UNVERIFIED.**
- **§6.6 sidebar content below the fold.** Not re-measured. **UNVERIFIED.**
- **"Product edit form (8 fields)."** The dialog I opened has **6** labelled fields
  (name, description, price, inventory, publication status, reason). Minor factual drift.
- **"The suite this audit adds is `tests/e2e/control-inventory.spec.ts`."**
  **That file does not exist.** `tests/e2e/` contains `replan`, `operating-system`,
  `platform`, `responsive-overflow`, `audit-integrity`, `settings`, `tablist-aria`.
  The audit document claims to add regression tests for §6.1, §6.2, §6.3, §6.4 and
  §6.5; the regression tests it names are **absent from the tree**. Treat those claims
  as unbacked.
- **§6.4 reclassification.** I moved the "Minimum 40% net margin" / "Maximum $25
  auto-refunds" bullets to the Guardrails page. They remain **literal JSX** and are
  still a `STATIC-COPY` risk, just on a different route.

### 7.4 One claim I confirmed as correct and worth keeping

"**Notification bell** — `window.location.assign('/approvals')`, a full page reload."
Still present in source. Confirmed a wart, not a defect. I did not click it.

---

## 8. What I could NOT verify, and why

Everything below is **UNVERIFIED**. None of it is a claim of breakage.

1. **Storefront** (`:3001`) — out of scope for this inventory (cockpit routes only).
2. **Owner refund form** on `/orders` — form never opened or submitted.
3. **Add product** on `/products` — form never opened.
4. **Live mode** — Supabase auth, sign-in/sign-out, real kill-switch owner credentials.
   Everything here was simulation.
5. **Shopify OAuth install** — unconfigured, so the control never rendered. Every
   prior claim about those 15 controls remains source-only.
6. **Integration lifecycle** — sync / update credentials / disconnect / view imports,
   all gated behind having a connection.
7. **Autonomy editor writes** — the 6 tabs render, but I only exercised the equivalent
   constitution write from `/settings`, not from each tab.
8. **Pilot envelope approval gate** — 75 inputs rendered, gate not exercised.
9. **All search and status filters** except the Approvals status filter.
10. **Global chrome** — theme toggle, ⌘K search, notification bell, Help dialog, toast
    dismiss, error-banner retry.
11. **Mobile / narrow viewports** — everything above is 1440×900 only.
12. **Root cause of B-3** — the orchestrator resume failure is reproduced but not
    diagnosed; I could not read the orchestrator's error at the moment of failure.

---

## 9. Evidence discipline

- Every `BROWSER` claim in this document was produced by me in Chromium against the
  isolated stack described in §0. I did not infer browser behaviour from source.
- Every `SOURCE` claim is labelled as such and is explicitly **not** a working claim.
- Mutations I performed were confined to `.data/e2e-cockpit-audit/`: constitution v1→v2,
  one product edit (rev 1→2, inventory 128→130), one modified refund approval ($42→$20),
  one campaign rejection, one pause/resume cycle, one operating cycle, and one
  **deliberately denied** connection create.
- The preserved working state — `data/*`, `infra/kill-switch/data/events.jsonl`,
  `.secrets/connectors.key` — was **not** read-modified, truncated or reset.
- No product code was edited. The only file this task created is this one.
- No Shopify, payment, advertising, supplier or refund path was executed against a
  real provider. Nothing here is production evidence.
