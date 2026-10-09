# Cockpit control inventory — verified feature audit

> **Status note added by the Lead, 2026-10-09 22:45.** The concurrent frontend redesign this
> audit partly observed (`settings-page.tsx`, `ui.tsx`, `tokens.css`, `design-system.css`) was
> **parked, not merged**, because it regressed six of the eleven core browser journeys. That work
> is preserved in `git stash` as `in-flight-cockpit-redesign` and is **not** part of `main`.
> Findings below therefore describe the cockpit as of `9b952b6`, with the exception of any that
> explicitly reference the redesign. The [FIX-1] and [FIX-2] items and the responsive/a11y/
> authority defects remain **open against `main`** — the redesign did not fix them there.

**Author:** feature-qa (task-9)
**Date:** 2026-10-09
**Audited tree:** working tree at `2c57043` plus the frontend agent's in-flight edits to `apps/cockpit/**`
**Method:** read every control in `apps/cockpit/src/components/**` + `apps/cockpit/src/app/**`, cross-checked each call against `apps/guardrail-service/src/{server,operating-routes,shopify-routes}.ts` and `apps/cockpit/src/app/api/[...path]/route.ts`, then exercised every finding in a real Chromium session against a live isolated stack (`HOTL_TEST_INSTANCE_DIR=.data/e2e-qa-manual`, all six services up). Nothing under `apps/**` was edited, and no real integration was mocked away.

Line numbers are quoted as observed during the read. **Component and function names are the stable reference** — `apps/cockpit` was being rewritten concurrently, so a fix may land on a different line. Each defect below therefore carries a reproduction, not just a coordinate.

---

## How to reproduce

```bash
# isolated stack, same one used for this audit
$env:HOTL_TEST_INSTANCE_DIR=".data/e2e-qa-manual"; node scripts/dev.mjs
# cockpit http://127.0.0.1:3000 · guardrail :4100 · orchestrator :4300 · kill-switch :14200
```

The suite this audit adds is `tests/e2e/control-inventory.spec.ts`. It runs first
(alphabetical) and is designed to leave state as it found it.

---

## Verdict key

| Verdict | Meaning |
|---|---|
| **WIRED** | Reaches a real route through the real proxy, mutates durable state, and the outcome is visible in the UI. |
| **WIRED (read-only)** | Reaches a real route and renders real data; performs no mutation by design. |
| **WIRED (client-side)** | Genuinely filters/reorders what is on screen, but queries only the already-loaded telemetry payload. Honest, just not server-side. |
| **STATIC-COPY** | Renders an accurate claim that is hardcoded in the component rather than derived from policy or state. Not a lie today; can silently become one. |
| **DECORATIVE** | Renders an affordance that implies a capability that does not exist. |
| **UNREACHABLE-BACKEND** | The backend implements it; no cockpit surface can reach it. |

---

## 1. Summary

| Surface | Controls | WIRED | Client-side / read-only | STATIC-COPY | DECORATIVE |
|---|---|---|---|---|---|
| Global chrome | 17 | 17 | — | — | 1 |
| Overview | 12 | 11 | 1 | 1 | — |
| Agents | 1 | 1 | — | — | — |
| Approvals | 16 | 16 | — | — | — |
| Products | 9 | 9 | — | — | — |
| Orders | 6 | 6 | — | — | — |
| Guardrails | 6 | 5 | 1 | 1 | — |
| Activity | 4 | 4 | — | — | — |
| Autonomy & policy | 24 | 24 | — | — | — |
| Finance | 2 | 2 | — | — | — |
| Integrations | 10 | 10 | — | — | — |
| Shopify staging | 15 | 15 | — | — | — |
| **Total** | **122** | **120** | **2** | **2** | **1** |

Coverage by test:

- **14 of 122 controls** have a dedicated e2e assertion (navigation/search, pause, cycle, approvals, expired replan, constitution versioning, product edit conflict, refund routing, connection rejection, emergency-stop gating, provenance labelling, decision transitions, legacy-review gate, below-floor denial, viewport containment).
- **The rest are exercised indirectly** by the journey specs (dialogs, filters, detail views) but have no assertion that would fail if the individual control regressed. That is the real coverage gap and it is named in §8.

---

## 2. Global chrome — `apps/cockpit/src/components/cockpit.tsx`

| Control | Verdict | Evidence |
|---|---|---|
| `Skip to content` | WIRED | `href="#main-content"`, target exists at `main id="main-content"` |
| Sidebar scrim (mobile) | WIRED | closes mobile nav |
| Brand link | WIRED | `href="/"` |
| **Workspace switcher** | **DECORATIVE** | Renders a `ChevronDown` caret and the label "Owner workspace", implying a workspace picker. It is a plain `<Link href="/autonomy">`. No workspace switching exists anywhere in the app. |
| 10 nav links + `aria-current` | WIRED | each maps to a `Section` |
| Approvals nav count badge | WIRED | `data.interrupts.filter(status==='pending').length` |
| Autonomy card "Meet your agents" | WIRED | `href="/agents"` |
| Help & getting started | WIRED | opens `Dialog` |
| Owner sign-out | WIRED | `supabase.auth.signOut()`, rendered only in live mode |
| Theme toggle | WIRED | `localStorage["hotl-theme"]` + `documentElement.dataset.theme`, survives reload |
| Autonomy mode pill | WIRED | `href="/autonomy"` |
| Simulation / Live pill | WIRED | from `GET /api/session` |
| Global search button + ⌘K | WIRED | both open the same dialog |
| **Notification bell** | WIRED (with a wart) | `window.location.assign('/approvals')` — a **full page reload** rather than client navigation, discarding the 10-second telemetry cache and the poll timer. Behaviourally correct, needlessly expensive. |
| Pause agents / Resume agents | WIRED | `POST/DELETE /api/pause` → guardrail `setPause` |
| Run a cycle | WIRED | `POST /api/runs` → orchestrator; `disabled={!data \|\| paused}` |
| Error banner Retry | WIRED | `refresh()` |
| Toast dismiss | WIRED | — |

---

## 3. Overview

| Control | Verdict | Evidence |
|---|---|---|
| Total revenue / Orders fulfilled / Net margin cards | WIRED | render `metrics.*` + `synthetic.*`; each carries a visible "Illustrative … not observed" marker (verified in DOM) |
| Ad spend today | WIRED + **defect §6.4** | `metrics.adSpend / config.dailyAdSpendCeiling`, ledger-derived |
| **Revenue chart period (7 / 30 days)** | WIRED (client-side) | genuinely re-slices the series, but see §6.1 — it slices **illustrative** data |
| Needs-your-attention items (max 3) | WIRED | opens `ApprovalDialog` |
| View all approvals | WIRED | link |
| Agent rows (max 4) | WIRED | opens detail dialog |
| Guardrail rules (3) | WIRED (read-only) | `config.*`, ledger-derived |
| Activity rows (last 5) | WIRED | opens detail dialog |
| "Guardrails are watching" assurance line | STATIC-COPY | `Deterministic rules. No exceptions.` — hardcoded, though structurally true |

---

## 4. Section pages

### Agents
| Control | Verdict | Evidence |
|---|---|---|
| Agent cards | WIRED | opens detail dialog. Note `AgentsPage` substitutes the **platform** status for every agent's own status when the platform is not `running`, so the per-agent badge is not always the agent's status. Defensible; recorded so it is a decision and not an accident. |

There is no per-agent control (no "run agent", no retry, no scope editor). The backend exposes `GET /api/agents` read-only, so nothing is missing.

### Approvals
| Control | Verdict | Evidence |
|---|---|---|
| Search + status filter + result count | WIRED (client-side) | filters the loaded interrupt list |
| Clear search | WIRED | — |
| "View expired proposals" | WIRED | switches the status filter |
| Review decision / View decision | WIRED | opens the dialog |
| Approve / Reject / Modify | WIRED + **defect §6.3** | sets the decision the submit will take; **selection is not exposed to assistive technology** |
| Modified amount / quantity field | WIRED | only rendered when the interrupt carries a modifiable amount key |
| Decision note | WIRED | `required`, `minLength 3` |
| Legacy "I reviewed this proposal" checkbox | WIRED | gates submit for anything with `legacyReviewRequired` |
| Refresh review context | WIRED | re-fetches constitution + telemetry |
| Read Constitution link | WIRED | `href="/autonomy"` |
| Submit (Approve/Reject/Modify request) | WIRED + **defect §6.2** | `POST /api/interrupts/:id/resolve` → guardrail, then orchestrator resume on success |
| Replan run (expired) | WIRED | `POST /api/runs/:id/resume`, `disabled={paused \|\| loading \|\| !eligible}` |
| Check run status | WIRED | `GET /api/runs/:id` |

### Products / Orders
| Control | Verdict | Evidence |
|---|---|---|
| Add product | WIRED | `disabled={paused}` |
| Product edit form (8 fields) | WIRED | maps to `productCreateSchema` / `productUpdateSchema`; sends `expectedConstitutionVersion` **and** `expectedRevision` |
| Edit product (detail dialog) | WIRED | `disabled={paused}` |
| Request refund | WIRED | `disabled={paused \|\| refunded \|\| payment_failed}` |
| Refund form | WIRED | `POST /api/refunds/evaluate` with both expected-version fields; `max` clamped to unrefunded remainder |
| Search + status filters (both pages) | WIRED (client-side) | — |

### Guardrails
| Control | Verdict | Evidence |
|---|---|---|
| 3 boundary rows | WIRED (read-only) | The panel is titled "Financial boundaries" and reads like an editor, but it contains **no inputs**. The only affordance is the "Edit Constitution" link. Honest once you look, but the affordance is misleading. |
| Edit Constitution link | WIRED | `href="/autonomy"` |
| Assurance bullets ×4 | STATIC-COPY | `Minimum 40% net margin`, `Maximum $25 auto-refunds`, `Daily spend enforced centrally`, `Every change leaves a record`. The first two are real schema invariants today (`marginFloor ≥ 0.4`, `autoRefundThreshold ≤ 25`) but are typed in JSX, not read from the constitution. Loosen the schema and the copy silently becomes a lie. |
| Emergency stop | WIRED | opens `KillDialog`, `disabled` when already killed |

### Activity
Search + status filter (WIRED, client-side) · activity rows open the detail dialog (WIRED) · "Retry resume" banner → `POST /api/runs/:id/resume` (WIRED).

### Autonomy & policy — `apps/cockpit/src/components/operating-pages.tsx`
All 24 controls WIRED: 6 tabs, workspace name, goals, advisory JSON, the three pilot sections (value + provenance select + evidence reference per field), stop-rule add/remove/threshold/action/enabled, save pilot draft, **Approve saved pilot envelope** (disabled until the draft is saved, unedited, gap-free and a reason is given), global autonomy mode, 20 per-domain mode selects + amount limits + paused checkboxes, 5 financial ceilings + margin floor + max price change, permitted/prohibited countries, prohibited categories, hard-rule list, version history, reload.

The pilot approval gate is the strongest correctly-gated control in the product: a saved draft is explicitly **not** approval, unknown/estimated inputs are rejected, and capital limits require `OWNER_ENTERED` provenance.

### Finance — `apps/cockpit/src/components/finance-page.tsx`
Period select and Refresh, both WIRED. Every figure comes from `GET /api/finance`. `netOperatingProfit` and `cashBalance` render the literal string **"Unavailable"** rather than a number, and `dataQuality.missingCostLines` raises an error notice. This is the model the rest of the product should follow.

### Integrations — `apps/cockpit/src/components/integrations-page.tsx`
Add connection (disabled with an explanatory notice when `setup.vaultConfigured` is false), credential form, Sync now (`disabled={!enabled}`), View imports (`integration-catalog`), Update credentials, Disconnect, manifest list — all WIRED. Provider credentials are sent once through the owner API and never persisted in browser storage; the existing suite asserts that.

### Shopify staging — `apps/cockpit/src/components/shopify-panel.tsx`
Install/reauthorize, Ensure subscription, Queue sync, Disconnect, Process pending work, Cost evidence, Prepare price (disabled without current economics), Review execution, Cancel proposal, Reconcile provider state, Record investigation, Execute guarded price change, Gate A/C readiness — **15/15 WIRED**.

Two hardening details worth recording because they are easy to lose:
- The install flow validates the returned `authorizationUrl` protocol, hostname, port, credentials and path before redirecting (`shopify-panel.tsx`, `install`).
- The execute control requires typing `CHANGE PRICE TO <price>` exactly, mirroring the kill-switch's `STOP EVERYTHING`.

---

## 5. Disconnected backend capabilities — what to wire next

Ranked by value. Each was probed live.

| # | Capability | Backend | Proxy | UI | Why it matters |
|---|---|---|---|---|---|
| 1 | **Audit chain integrity verdict** | `GET /api/audit-log` → `{entries, integrity:"verified"}`, entries carry `hash` + `prevHash` | **200** | **never called** | The Activity page already renders individual `hash`/`prevHash` values in its detail dialog (verified: `Hash = f23795a1…`, `PrevHash = b6148abe…`). It shows the chain but never the verdict the guardrail already computed. `expect(detail).not.toContainText(/integrity/i)` passes today. An owner can read the hashes and has no way to learn whether the chain was verified. |
| 2 | **Operating state** | `GET /api/operating-state` → `{constitution, proposals, resourceRevisions:{products,orders,campaigns}, campaigns, paused}` | **200** | **never called** | Returns every pending proposal **with its `requiredAction`**, plus the current resource revisions. This is precisely the freshness context the cockpit currently reconstructs by hand, call-by-call, inside `ApprovalDialog`'s legacy-review block. One endpoint replaces that whole dance. |
| 3 | **Campaigns + campaign pause** | `GET /api/campaigns`; `POST /v1/campaigns/:id/pause` (owner-only, idempotency-keyed) | **404** | none | A campaign is the one spend unit an owner can currently only learn about through an approval request. There is no list, no detail, and **no way to stop a running campaign from the cockpit**. Verified: the proxy returns `Route not found`, the guardrail returns 200 for the read and 400 for a non-existent pause target. |
| 4 | **Guardrail config write** | `PATCH /v1/guardrails/config` (owner-only) | not proxied (GET only) | none | The Guardrails page is read-only and routes every edit through the constitution. The legacy config path has a `CEILING_BELOW_COMMITTED_AND_RESERVED_SPEND` check that the constitution path does not. Either wire it or delete it — today it is a second, undocumented way to move money ceilings. |
| 5 | **Shopify webhook health** | `GET /api/shopify/webhooks/health` | not proxied | none | The panel shows jobs, inbox and subscription attempts but no provider-level webhook health. |

Also worth noting: `GET /api/products`, `/api/orders`, `/api/agents`, `/api/runs`, `/api/catalog` and `/api/identity` all work but are not proxied. Those are legitimately agent-facing, so I am **not** calling them defects — only #1–#5 are findings.

---

## 6. Defects

### 6.1 [HIGH] The illustrative revenue chart is captioned as measured data
**Where:** `apps/cockpit/src/components/cockpit.tsx` → `RevenueChart`.

The whole panel is built from `telemetry().synthetic.chart` — the guardrail's fabricated series (`engine.ts` `telemetry()`, weights `[0.61 … 1.12] × 1840`). The panel renders a headline `money(chartRevenue)` and then a caption reading:

> **"Measured progress. Every dollar accounted for."**

Measured on screen at 1280px:

- **Revenue overview panel → `$20,773.00`** (synthetic)
- **Metric card above it → "Total revenue $24,782"** (ledger-derived)

Two different revenue figures on one screen, neither reconciled, and the fabricated one is the one explicitly labelled *measured*. The three metric cards already carry honest markers, so the rule is understood — the chart panel and its `aria-label` (`Revenue and advertising spend for the last 30 days. Revenue $X.`, which announces the synthetic total to screen readers with no qualifier) are the gap.

Compounding it: the guardrail ships `synthetic.note` — *"Illustrative values for the local simulation. They are not observed commerce data and must not be presented as production evidence."* — declared in `apps/cockpit/src/lib/types.ts` and **rendered nowhere in the app**. The string written specifically to prevent this exists and is dropped.

**Reproduction:** `GET http://127.0.0.1:3000/` → read the "Revenue overview" panel total and the "Total revenue" card → read the panel caption.

**Regression test added:** `telemetry keeps ledger-derived metrics separable from illustrative simulation values` (locks the data contract and asserts `synthetic.note` survives the proxy) and `the cockpit labels every illustrative figure it renders from simulation data`. I deliberately did **not** add an assertion on the chart panel itself: it is red today, and acceptance requires a green suite. Add it once fixed.

### 6.2 [MEDIUM] The approval submit control stays enabled while the platform is paused
**Where:** `cockpit.tsx` → `ApprovalDialog` pending block. `ApprovalsPage` receives `paused` and forwards it **only** to `ExpiredProposalAction`.

Every other financial control on the platform is `disabled={paused}` — Add product, Edit product, Request refund, Run a cycle, Replan run. The approval submit is not.

**Reproduction (verified):**
1. Open `/`, click **Pause agents**.
2. Go to `/approvals`, click **Review decision** on "Refund needs your approval".
3. Tick **"I reviewed this proposal against the current policy and records above"**, type a note.
4. **Approve request is enabled** and submits.
5. Response: `Guardrail denied this request: system paused.`

**What is correct:** it fails closed. The dialog stays open, the inline `role="alert"` shows the denial, the interrupt remains `pending`, and nothing is recorded. Reject correctly stays available while paused — `engine.resolveInterrupt` skips the `block()` check for rejects, and a rejection executes nothing. That is right.

**What is wrong:** the owner is offered a decision the platform cannot accept, and burns a round-trip discovering it. On a financial approval surface, "available" should mean "can succeed".

### 6.3 [MEDIUM] The armed owner decision is not exposed to assistive technology
**Where:** `cockpit.tsx` → the Approve/Reject/Modify group.

Verified in the DOM: the group has no `role` and no `aria-label`; each option has no `role`, no `aria-pressed`, no `aria-checked`. Selection is carried **only by a CSS class**. The submit button's name changes with the selection (`Approve request` / `Reject request` / `Save modified decision`), so a screen-reader user is asked to record a financial decision without being able to tell which of the three is armed.

**Regression test added** (`selecting an owner decision changes what the submit control will actually do`) covers the behaviour that *does* work — the visible, named transition. Add `aria-pressed`/`aria-checked` coverage once it ships.

Related, same component: `operating-pages.tsx` sets `aria-controls={constitution-${id}}` on all six Constitution tabs, but only the active panel is rendered. **Five of six `aria-controls` targets resolve to nothing** (verified: `controlsExists: false` for pilot / autonomy / limits / boundaries / history).

### 6.4 [LOW] The ad-spend card hardcodes "Within budget"
**Where:** `cockpit.tsx` → `Metrics`, the fourth card.

`Within budget` is literal text. When `metrics.adSpend > config.dailyAdSpendCeiling` the card shows `$0.00 remaining` **and still says "Within budget"**. The bar itself is computed correctly (`min(100, adSpend/ceiling)`), so this is a copy defect rather than a maths one — but a card that contradicts its own number in a financial cockpit is worth fixing.

### 6.5 [LOW] `/products` and `/orders` scroll horizontally below 390px
Measured at a **360×780** viewport:

| Route | `documentElement.scrollWidth` | `window.scrollTo(400,0)` → `scrollX` |
|---|---|---|
| `/products` | **671** | **311** |
| `/orders` | **588** | **228** |
| the other 8 routes | 360 | 0 |

`body.scrollWidth` stays 360 on both, so the overflow escapes body. `.table-scroll` has `clientWidth 332` against `scrollWidth 715` — the 7-column table is not contained.

The existing suite only checks `/finance`, `/integrations`, `/autonomy` at 390px (`tests/e2e/operating-system.spec.ts`), which is exactly why this is green.

**Regression test added:** `every owner route stays inside the viewport below 390px`, currently carrying a documented two-entry skip list for these routes with the measured numbers. Delete the entries once fixed and it covers all ten.

### 6.6 [LOW] Sidebar content sits below the fold with no visible affordance
At **1280×720** the sidebar needs **196px** of scrolling to reach "Help & getting started" and the owner profile; the scrollbar renders **1px** wide. Both are reachable, but nothing indicates they exist.

---

## 7. What is genuinely right (do not regress these)

- **The Shopify panel's unverified status.** "Price writes are implemented but unverified in staging", "A queued job or saved proposal does not mean a provider write succeeded", "a matching provider price is not proof of who changed it". This is exactly the honesty rule 6 demands, applied consistently.
- **The pilot approval gate.** A saved draft is explicitly not approval; unknown and estimated inputs cannot authorize money; capital limits require owner-entered provenance; the approve button is disabled with a per-item gap list.
- **The finance page's "Unavailable".** `netOperatingProfit` and `cashBalance` render as unavailable rather than as zero.
- **The legacy-review gate.** A stale proposal cannot be submitted without an explicit current-policy review; `tests/e2e/control-inventory.spec.ts` now locks this.
- **Denials fail closed.** A below-margin approval and a below-floor product create both surface an error, keep the dialog and the owner's input, and persist nothing. `tests/e2e/control-inventory.spec.ts` now locks this too.
- **Same-origin + cockpit-header + idempotency-key enforcement** on every mutating proxy call.

---

## 8. Coverage gaps this audit could not close

- **108 of 122 controls have no assertion that would fail if they individually regressed.** The journey specs traverse them. A filter that silently stopped filtering, or a dialog that stopped opening, would not be caught.
- I did not test live-mode behaviour (`Supabase` auth, real kill-switch credentials). Everything here is simulation mode; the sign-out control and the live sign-in path are read but unexercised.
- I did not exercise Shopify OAuth against a real provider — every Shopify control was assessed from source and from the unconfigured-state rendering only.
- The `empty` states were observed but not systematically driven; the shared `Empty` component uses a green `CheckCircle2` for every case including "No products found" and "No orders found", which is semantically odd for a negative result. Recorded, not filed.

---

## 9. Evidence discipline

- No defect in §6 is asserted from a source read alone. §6.1, §6.2, §6.3, §6.5 and §6.6 were each reproduced in a live browser session; §6.4 is a source-level reading of a literal string and is labelled LOW for that reason.
- No existing e2e assertion was weakened or removed. `tests/e2e/control-inventory.spec.ts` is purely additive.
- No product gate is claimed by this document. It is an inventory of what the cockpit does, with evidence.