# Program maturity register

**Reviewed:** 2026-09-24

**Status source:** [locked program plan](locked-program-plan.md) §3 and [continuation evidence](continuation-verification.md).
**Rule:** Each row has exactly one M0–M7 state. A local check never grants an external or production state. Reassess when new evidence is recorded.

| Major capability | State | Evidence and limit |
| --- | --- | --- |
| Local owner cockpit and demo storefront | M3 — Integration verified | Isolated local browser checks across the local stack; simulated commerce only. |
| Deterministic policy/guardrail API | M3 — Integration verified | Local policy, denial and HTTP/workflow integration checks; no real financial provider authority. |
| Versioned Constitution and autonomy controls | M3 — Integration verified | Service/UI and local approval behavior; pilot capital/stop fields not yet owner-approved. |
| Typed pilot business/risk envelope | M2 — Local verified | Schema, owner draft/approval API, cockpit editor and fail-closed price-path tests; all real owner values remain UNKNOWN and no pilot has been approved. |
| LangGraph workflow, checkpoint and interrupts | M3 — Integration verified | Local guardrail round trip, restart and interrupt resume. |
| Durable local ledger, audit and idempotency | M3 — Integration verified | Local file/HTTP and actual native PostgreSQL restart/restore drills; no externally anchored audit. |
| Independent kill latch | M3 — Integration verified | Local isolated denial/recovery drills; deployed revocation unverified. |
| Workspace identity and scope contracts | M3 — Integration verified | Local signed JWT/HTTP tests; hosted identity and real rotation unverified. |
| Shopify/WooCommerce read connector framework | M2 — Local verified | Provider requests intercepted in local tests; no authorized merchant integration. |
| Shopify OAuth/token lifecycle | M2 — Local verified | Browser-binding and encrypted storage tests; no real install/token exchange evidence. |
| Shopify read sync and webhook processing | M2 — Local verified | Local durable inbox/job and provider-fixture checks; no real delivery. |
| Shopify owner-only development-store price flow | M2 — Local verified | Guardrail and HTTP tests with intercepted provider; no real price receipt or causal uncertainty clearance. |
| Production deployment and hosted identity | M0 — Not implemented as an operating deployment | Config/migrations exist; no hosted evidence. |
| Real checkout, payment and settlement | M0 — Not implemented | Demo checkout is separate; no live payment execution. |
| Real supplier discovery/procurement | M0 — Not implemented | Simulation supplier path does not create a real PO. |
| Real inventory/fulfillment/returns cycle | M0 — Not implemented as one real cycle | Some local concepts exist; no end-to-end provider evidence. |
| Real advertising spend/attribution | M0 — Not implemented | No live advertising authority or reconciliation. |
| Reconciled business finance/cash ledger | M0 — Not implemented | Simulation finance and estimates do not establish settled contribution. |
| Customer/CRM learning memory | M0 — Not implemented | Workflow checkpoints and policy history are operational state, not customer learning. |
| Shadow-validated autonomy | M0 — Not implemented | No real-outcome comparison window. |
| Domain autonomy eligibility | M0 — Not implemented | No prespecified production evaluation gate has passed. |

M0 on a **real business capability** can coexist with a simulated workflow for that domain. `M3` here means locally verified cross-service integration; it does not imply `M4` external staging. The first planned promotion target is the bounded Shopify development-store path after the real evidence in [Gate C](locked-program-plan.md) is produced.
