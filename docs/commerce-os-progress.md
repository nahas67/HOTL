# Commerce OS: implemented scope and remaining work

Updated 2026-09-28. Gate C local preflight hardening is recorded in
[the preflight hardening evidence](../evidence/gate-c-preflight-hardening-2026-09-28/README.md).
The detailed implementation sequence is in
[production-continuation.md](../production-continuation.md); current evidence is in
[continuation-verification.md](continuation-verification.md). The user's 100-section
Commerce OS specification is in [commerce-os-build-prompt.md](commerce-os-build-prompt.md).
The researched vendor comparison, HOTL maturity level and recommended pilot gates
are in [platform-comparison-and-level.md](platform-comparison-and-level.md).
The system remains a local simulation until production integrations and deployed
safety drills are proven.

## What works in the repository

| System | Implemented behavior | Evidence boundary |
| --- | --- | --- |
| Storefront/cockpit | Local storefront checkout, owner cockpit, policies, approvals, finance view, activity and integrations. | Simulated commerce; browser checks use isolated state. |
| Commerce rules | Integer-cent deterministic guardrails for margin, budgets, supplier limits, refund escrow, ownership, revisions, pause and authorization. | Local policy tests; no real payment, supplier PO, ad spend or refund. |
| Audit/replay | Durable SHA-256 audit chain, actor/operation/request idempotency, persistence and append-before-success. | Local file/PostgreSQL tests. Audit head is not independently anchored. |
| Stop controls | Reversible pause; independent persistent, irreversible kill latch. | Local isolated drills. Independent deployed revocation remains unverified. |
| Agent runtime | LangGraph workflows, bounded department roles, checkpoints, interrupts and LiteLLM routing contracts. | Sample/deterministic outputs by default; real key provisioning and hosted runtime unverified. |
| Identity | Workspace-bound owner/agent token verification, short lifetimes, revocation and scope reduction. | Signed fixtures and local HTTP tests; hosted Supabase/Auth unverified. |
| Gate A unit economics | Distinct amount/ratio/fraction schemas; deterministic modeled contribution, break-even CAC and ROAS; mismatches fail approval. | Local schema/engine/UI tests with synthetic inputs. Owner values and pilot approval remain UNKNOWN. |
| Connector SDK | Canonical product, inventory and order types; Shopify 2026-07 and WooCommerce read adapters; encrypted connector data and network constraints. | Intercepted requests/fixtures; no real merchants connected. |
| Shopify guarded path | Browser-bound OAuth/token vault; strict persisted OAuth/commerce state schemas and owner/workspace/job reference checks; status-accurate durable webhook inbox/retry/dead-letter; explicit credential rotation; worker mode and Gate C preflight v2; owner price proposal/cancel/execute, read-back, receipts and investigation. | M2/local checks only. No real merchant installation, secret revocation, subscription/delivery, or price mutation. External staging remains blocked. Uncertain-price clearance, autonomous writes and ordinary-store price changes disabled. |
| Gate C readiness report | Exact static missing-field list; opt-in read-only HTTPS callback, guardrail, ingress and emergency-reader probes; explicit manual/durable/disabled worker reporting. | Local tests only. It cannot prove Shopify connectivity/delivery, deployment independence, DDL denial or restore. |
| Persistence | File ledger, initialization markers, checkpoint recovery, independent kill journal and private PostgreSQL transactional runtime ledger. | Native PostgreSQL restart and same-cluster dump/restore passed; hosted, cross-cluster and Docker restore unverified. |

## What is still missing

- First authorized real development-store proof: HTTPS OAuth, real token lifecycle,
  webhook subscriptions/delivery, provider read sync and one guarded price write
  with actual receipt, read-back and audit linkage.
- Deployed emergency revocation, lost-response drill, identity/session rotation,
  monitored backup recovery and hosted database/auth verification.
- Shopify ambiguous-outcome resolution with provider evidence tied to causality,
  and mitigation for merchant/provider edits racing between preflight and update.
- Supplier catalog discovery, reliability/risk scoring, redundancy and purchasing.
- Marketplace listings, inventory synchronization/forecasting, shipping and
  fulfillment exceptions, returns, fraud and chargebacks.
- Payment execution/reconciliation, advertising and attribution, CRM, customer
  communications, tax/localization, multi-workspace roles and notifications.
- Experiments, shadow operation, forecast uncertainty, agent outcome evaluations,
  complete specialist roster and measured domain-by-domain autonomy.

Simulation examples and estimated finance metrics must stay labeled as such. No
provider credential by itself grants a feature or overrides deterministic controls.

## Recommended sequence

1. Complete the isolated Shopify development-store evidence gate in
   [the continuation plan](../production-continuation.md).
2. Resolve Shopify uncertainty and concurrency behavior before expanding its write
   capability. Keep ordinary merchants and autonomous pricing disabled.
3. Build supplier intelligence as read-only evidence and owner-reviewed proposals;
   enable spending only after its own guardrail and failure drills.
4. Add one other commerce domain at a time, applying the same authorization,
   durable audit, idempotency, recovery and external-evidence requirements.
5. Measure outcomes in shadow mode before any owner-approved increase in autonomy.

## Gate C external checkpoint — 2026-09-28

The latest static preflight remains blocked with 19 missing staging fields, and no active probe or Shopify request was made. The owner has not set up the authorized development store/app or trusted HTTPS endpoints, and Gate A owner authority remains incomplete. See the [dated evidence package](../evidence/gate-c-shopify-external-2026-09-28/README.md). Keep the existing owner-operated, development-store-only boundary; no maturity promotion or Gate D work is authorized by this result.
