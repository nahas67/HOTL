# HOTL Owner Control UI — 2026-10-08

This evidence package records the private owner-facing UI redesign. It documents a presentation-layer change only; it does not change HOTL runtime state, risk limits, business decisions, authorization, or gate status.

## What was built

The Site contains 16 primary workspace views and three Gate A/B/C detail routes:

- Dashboard, AI agents, approvals
- Products, orders, inventory, customers, suppliers
- Marketing, finance
- Integrations, autonomy, guardrails, activity, launch readiness, settings
- Gate A business approval, Gate B protected infrastructure, Gate C Shopify development store

The UI includes shared navigation, workspace search, filters, sample record details, export summaries, reporting periods, a revenue/orders chart toggle, theme and density preferences, and responsive mobile navigation. It is a static browser application. No HOTL backend, agent, database, payment processor, provider API, live telemetry, or authorization service is connected. The Site exposes no business mutation or approval action.

## Data modes

**Demo** uses invented records and calculated example metrics. The interface labels the mode `DEMO WORKSPACE` and states `Sample data only. No commerce actions.` Sample order IDs and product SKUs use `DEMO-` prefixes. The dashboard’s 30-day series spans 2026-09-09 through 2026-10-08. It is illustrative and must never be represented as historical business performance.

**Checkpoint** reads the static project facts in the Site source, last reviewed on 2026-10-03. It displays unknown live revenue, order counts, agent state, inventory, and service health as `Unknown`, and disables commerce actions. Gate A remains owner-input-required; Gate B remains externally unverified; Gate C remains unconfigured for its development-store drill. AI product recommendations do not authorize the business envelope.

Preferences for theme, density, and selected view are stored only in browser local storage. The static Content Security Policy denies network connections (`connect-src 'none'`) and form submissions (`form-action 'none'`). No secrets or business/customer records are included.

## Visual evidence

`dashboard-concept.png` is the generated design reference. `dashboard-desktop-viewport.png` shows the updated 1536×1024 dashboard with the complete footer visible. `dashboard-mobile.png` shows the complete 390px narrow layout.

The implementation follows the concept’s navigation, pale canvas, green emphasis, dashboard hierarchy, metric band, trend chart, agent panel, recent orders, and readiness panel. The sample series uses the current 30-day display range. The concept’s `+8.2%` order comparison was corrected to `+8.1%` because the shown example totals 186 versus 172 orders. The contribution comparison is calculated as 32.4% versus 30.3%, a 2.1-point change. The repository checkpoint remains dated 2026-10-03 and is not advanced by the design work.

## Verification

- `node scripts/build.mjs` — passed for the isolated Site source.
- `node --check` — passed for `src/assets/data.js`, `ui.js`, `views.js`, and `app.js`.
- Manual browser review — passed: demo/checkpoint switch, mobile navigation, products list and detail, filtering/search surfaces, dashboard readiness links, and theme controls were inspected.
- Responsive preview — passed: 1536×1024 desktop document fits its viewport; 390px mobile document has no horizontal overflow. No page errors were observed.
- Site test suite — not run for this UI update. The earlier Site test results belong to the previous saved version and do not validate these changes.
- Provider, Shopify, payment, real checkout, live-data, backend, and deployed runtime drills — not run; no such service is connected to the Site.

## Deployment record

The Site remains the existing owner-private `HOTL Owner Control` at <https://hotl-owner-control.jesttest8.chatgpt.site>. Sites saved and deployed **version 2** (`appgprj_6ac023fa1fe081919f86c1d53dc217d2~appgver_0e3e725da4a08191984e2e5c150eb69e`) from source commit `22eccdf62be0a292fdad479837438dbc044e26d7`. The deployment `appgdep_6ac7526df5088191966fc716e6249af0` reported `succeeded`; the deployment URL is the existing private Site URL. The uploaded static archive measured 29,990 bytes. A fresh post-deploy Site read confirmed active status, owner role, one allowed account, and zero groups, editors, or external visitors.

Gate A, Gate B, Gate C, and HOTL’s production maturity level are unchanged by this UI update.
