# HOTL continuation plan — 2026-09-23

Source: the owner supplied continuation prompt in
`docs/production-continuation-prompt.md`. This file is the live, staged plan:
what is in the repository, what remains, and which dependency comes next. Read it
with [the checkpoint](readit.md), [product scope](docs/commerce-os-progress.md),
and [current verification](docs/continuation-verification.md). For platform
research, maturity levels and the full comparative recommendation, read
[platform comparison](docs/platform-comparison-and-level.md).

## Current result

The local system has an owner-operated Shopify **development-store** price path in
the guardrail service. A merchant can be installed through browser-bound OAuth,
credentials stay encrypted inside guardrails, read sync/webhook work is durable,
owners submit revision-bound cost evidence and price proposals, and a proposed
change can be cancelled before dispatch. Eligible proposals require a fresh policy
and kill-state check, a provider preflight, one non-retried write and provider
read-back. Receipts, audit entries, reconciliation and operation status appear in
the cockpit.

Local checks on September 23 passed 383 tests, lint, typecheck and all eight build
tasks. Eleven browser tests and the 32-test native PostgreSQL restart/restore drill
passed September 21; they were not rerun September 23. The changed Docker restore
runner is still unrun. No actual Shopify merchant was connected or changed. These
details and log names are in `docs/continuation-verification.md`.

## What exists and what does not

| Area | Exists now | Still missing or unverified |
| --- | --- | --- |
| Owner cockpit and simulation | Local storefront, cockpit, LangGraph, policy editor, approvals, finance, integrations and separate irreversible simulation kill service. | Hosted service, production telemetry and deployed stop/revocation drill. |
| Guardrails | Deterministic budgets, margin/refund/supplier limits, ownership, revisions, idempotency, durable audit, pause/kill checks and fail-closed file/PostgreSQL storage. | Hosted Auth/database, externally retained audit head, production backup recovery and operational monitoring. |
| Identity | Workspace-bound owner and agent verification, short lifetimes, revocation/version checks, agent scope restrictions and key rotation contract. | Real hosted Supabase users, staged key rotation/revocation and multi-workspace routing. |
| Shopify access | Encrypted OAuth lifecycle; durable bounded read sync; signed webhook inbox; owner-triggered shop-scoped subscription registration; owner cost evidence; one-price development-store proposal, cancellation, dispatch and receipt paths. | Real OAuth and token refresh; verified subscription/delivery; real price receipt; deployment. |
| Uncertain writes | Durable one-use claim, no automatic retry, read-only reconciliation, resource lock and new-proposal compensation boundary. | Auditable resolution of an ambiguous operation and protection from concurrent provider-side owner edits. Do not manually delete or clear its lock. |
| Other providers | Shopify and WooCommerce read-only connector SDKs; explicit simulation commerce. | Live checkout/payment, refunds, supplier orders, ads, marketplace writes, fulfillment, support and real customer transactions. |
| Broader commerce OS | Initial runtime agents, event orchestration, domain controls, finance estimates and historical simulation. | Supplier discovery/scoring/negotiation, forecasting, dynamic pricing, listing optimization, attribution, CRM, tax/localization, specialist roster, teams, notifications, experiments and measured autonomy. |

The repository remains an explicitly labeled local simulation. Only the separately
configured, owner-only and development-store-verified Shopify price path can make a
provider write, and actual provider behavior has not been verified. Do not enable
ordinary-merchant or autonomous Shopify writes. The external-edit race has no Shopify
compare-and-swap remedy in the current API contract.

## Next milestone: first real development-store proof

This is the next priority. Do not start a new live commerce domain before recording
the first controlled end-to-end result. The repository work needed for this proof is
ready; it depends on authorized external setup and an operator-provisioned isolated
environment.

### Preparation

1. Provision an authorized development store and registered Shopify app. Use the
   exact HTTPS callback described in `docs/shopify-oauth.md`; record the app version,
   callback and enabled scopes.
2. Provision a separate staging workspace/ledger, owner identity, guardrail-only
   provider credentials, connector encryption key, independent emergency-state
   reader and protected backup. Keep the working simulation ledger and kill journal.
3. Deploy the cockpit callback and guardrail API over trusted HTTPS. Configure the
   exact hostname in `SHOPIFY_STAGING_SHOPS` directly on the isolated guardrail
   process. The normal `pnpm dev` launcher deliberately cannot set this live gate.
4. Configure the public HTTPS guardrail webhook origin and use the owner cockpit
   to ensure each supported shop-scoped topic for the installation. Verify HMAC
   raw bytes and an authoritative sync on actual deliveries.

### Acceptance evidence

5. Complete the actual owner browser install and cookie callback. Verify granted
   scopes and encrypted expiring offline tokens without exposing credentials.
6. Sync a minimal product/variant/inventory/location fixture from the development
   store. Verify owner isolation, exact currency/shop identity and stale-result
   cancellation.
7. Use evidenced costs and the conservative active Constitution. First test
   denials (stale revisions, low margin, pause, kill, ordinary merchant store),
   cancellation and replay. Then make one explicitly owner-approved, small price
   change on a disposable development-store variant.
8. Capture provider request identifiers, before/after price, durable operation and
   audit linkage, deployment/code identifier, time, and sanitized logs. Confirm the
   price independently in Shopify. Exercise a forced lost response and restart;
   demonstrate no second mutation. Do not declare an uncertain operation resolved
   without provider evidence tied to that change.
9. Run the independent deployed emergency/revocation drill and restore the isolated
   workspace backup. Record every result and failure in
   `docs/continuation-verification.md`. Keep price capability labeled unverified
   until the complete acceptance evidence exists.

### Exit gate

The milestone passes only when real OAuth, read sync, configured webhooks,
development-store price write/read-back, durable audit, a denial simulation,
uncertain-outcome recovery, deployed emergency revocation and isolated restore have
recorded evidence. A fixture pass, hostname allowlist or local receipt is not an
exit gate. Ordinary-merchant Shopify writes remain disabled afterward until the
provider-side race and evidence-based uncertainty-resolution design are reviewed.

## Follow-on plan after the staging gate

### 1. Close Shopify operations safely

- Owner investigation annotations for `DISPATCHING`/`UNKNOWN`/`DRIFT` now bind
  reviewer, reason and the current reconciliation without clearing the lock.
  Actual uncertainty resolution still needs independently verified provider-side
  event evidence; a matching price alone cannot prove causality.
- Reconcile webhooks with bounded backfill, renew/disconnect lifecycle and real
  duplicate/outage drills; consider after-auth subscription registration only after app
  scopes and provider contract are verified.
- Address the read/write race. Without provider conditional writes, constrain
  write windows and stop on intervening edits; do not claim full concurrency safety.

### 2. Build supplier intelligence as a separate bounded domain

- Start with approved read-only catalog discovery and canonical supplier/product
  records, provenance, regions, lead times, stock and shipping evidence.
- Calculate explainable risk/quality scores and supplier alternatives. Test stale
  quotes, conflicting specifications, missing evidence and owner isolation.
- Only then add draft negotiation and a manually reviewed purchase proposal. Actual
  purchase orders remain denied until deterministic spend/currency/merchant/supplier
  checks, provider idempotency, durable receipts, cancellation and emergency drills
  are demonstrated. Never give an agent provider-write credentials.

### 3. Expand one capability at a time

Prioritize inventory reconciliation and read-only demand evidence; listing drafts;
fulfillment/status imports; support and refund proposals; payments/reconciliation;
then advertising and attribution. Every domain needs an explicit owner capability,
typed intent, deterministic policy, durable claim/idempotency, provider evidence,
uncertain-outcome treatment, audit linkage and denial/restart tests before an
external mutation is enabled. Keep domains disabled while that contract is absent.

### 4. Measure before expanding autonomy

Add shadow decisions, evaluation sets, forecast uncertainty, connector health,
intervention rates, model-cost accounting and outcome metrics. Establish owner
approvals and rollback/recovery evidence for each domain. Autonomy settings cannot
grant an unimplemented or unverified capability.

## Work already completed for this continuation

- Workspace-bound guardrail identity and scoped token checks.
- Shopify OAuth, token encryption/rotation, provider transport, canonical state,
  durable sync/webhook intake, guarded price dispatch, cockpit, receipts and
  read-only reconciliation.
- Audited owner cancellation for unclaimed price proposals.
- File/checkpoint initialization markers, restart checks and native PostgreSQL
  same-cluster backup/restore authorization drill.
- Fault-injection coverage for dispatch claim failure, post-provider result commit
  failure and lost commit acknowledgement; no blind resend after restart.
- Actual local Fastify route tests for owner isolation, OAuth cookie callback,
  raw webhook signature/size/replay and audited cancellation.

## Operating rules

- Preserve `data/guardrail-state.json`, `data/orchestrator-checkpoints.json`,
  `infra/kill-switch/data/events.jsonl` and `.secrets/connectors.key`.
- Keep provider write credentials inside guardrails and emergency revocation keys
  inside the independent kill service.
- Never treat historic idempotent allow results as fresh provider authorization.
- Missing/corrupt storage or emergency state denies execution. Do not recreate it.
- Keep local fixtures, actual provider evidence and unrun deployment checks distinct.
- The first local source commit is `f83938ff51a0f5531998ed11380d55863f55ad2f`, tagged `hotl-baseline-2026-09-24`; see `evidence/gate-b1-source-control/README.md`. Report the exact current commit for later work.
