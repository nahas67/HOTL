# Shopify guarded development-store loop

Checkpoint: 2026-09-23. **Implemented; external verification pending.** The default
launcher remains a local simulation. This integration adds an owner-operated,
explicitly allowlisted development-store price workflow inside guardrails. It does
not enable autonomous price changes or writes to ordinary merchant stores.

## Implemented sequence

1. An authenticated owner starts installation. Guardrails bind the OAuth challenge
   to workspace, owner, shop, app and browser. A durable claim prevents callback
   replay. Expiring offline access/refresh tokens are encrypted inside the ledger.
2. Installation queues a durable read sync. The worker imports products, variants,
   aggregate inventory and locations into merchant state, separate from simulation
   records. Order import requires an explicitly granted order scope.
3. A raw-body HMAC-verified webhook is saved in a durable inbox before HTTP 202.
   Delivery identifiers bind to payload digests; duplicate bodies are deduplicated.
   Webhooks schedule authoritative reads. Headers and payload hints never directly
   overwrite prices or revoke an installation.
   The owner can explicitly provision one shop-scoped subscription at a time for
   `products/create`, `products/update`, `products/delete` and
   `inventory_levels/update`. The guardrail process lists existing subscriptions,
   verifies an exact HTTPS callback and development-store identity, saves a
   one-use dispatch claim, sends at most one create mutation, and reads back the
   result. A lost response stays `UNKNOWN`; the same topic is not sent again
   while unresolved. Another shop-scoped endpoint for the same topic blocks
   registration for owner review. An observed subscription proves presence, not
   who created it.
4. The owner records dated cost/category/origin evidence and proposes one variant
   price with current resource and Constitution revisions. The proposal is durable;
   it does not perform a provider write. Before dispatch, the owner may cancel the
   pending proposal with a recorded reason; cancellation cannot clear a dispatched
   or uncertain result.
5. Explicit execution obtains credentials, persists a one-use dispatch claim and
   checks deterministic authorization under the ledger lock. It validates owner,
   installation revision, scopes, live authentication mode, shop allowlist, durable
   storage, pause, fresh independent kill state, Constitution/domain controls,
   maximum price change, USD economics and the existing margin floor.
6. A provider preflight confirms the exact shop, `plan.partnerDevelopment`, price
   and product revision. State must be fresh (120 seconds) and owner cost evidence
   unexpired. Guardrails recheck policy and kill state after preflight. The service
   sends one `productVariantsBulkUpdate` for one variant, with partial updates off,
   then reads the provider again. Writes are never automatically retried.
7. A matching response/read-back produces a staging receipt and durable audit entry
   before success. Uncertain outcomes remain unresolved. The cockpit shows jobs,
   inbox events, operations, receipts and read-only reconciliation evidence.

## HTTP surface

Owner mutation paths below use `/api/guardrails/v1/shopify`, strict request schemas
and an `Idempotency-Key`. The cockpit proxies only its explicit allowlist.

| Method and path | Behavior |
| --- | --- |
| `GET /api/shopify` | Owner-filtered installation, job, inbox, variant and operation metadata; no secrets. |
| `POST /install` | Begin browser-bound OAuth installation. |
| `POST /installations/:id/sync` | Queue authoritative import. |
| `POST /installations/:id/subscriptions/ensure` | Owner-triggered shop-scoped webhook registration or exact-match observation; body `{ "topic": "products/update" }`. |
| `POST /installations/:id/disconnect` | Revision-bound local disconnect; does not claim remote revocation. |
| `POST /economics` | Save revision-bound, expiring owner cost evidence. |
| `POST /prices/propose` | Persist a typed price intention after deterministic checks. |
| `POST /prices/:id/cancel` | Owner withdraws an unclaimed pending proposal with a reason; audited and idempotent. |
| `POST /prices/:id/execute` | Claim and dispatch an eligible operation once. |
| `POST /prices/:id/reconcile` | Read provider state; never resend the mutation. |
| `POST /prices/:id/investigations` | Append an owner investigation to an unresolved operation; binds to current status and reconciliation time, and never clears the lock. |
| `POST /worker` | Run a bounded read-worker pass for this owner. |
| `GET /api/shopify/oauth/callback` | Public signed callback plus browser cookie; outside mutation base. |
| `POST /api/shopify/webhooks/:id` | Public raw-body HMAC intake, maximum 2 MiB; outside mutation base. |

The five-second background worker is opt-in through `SHOPIFY_WORKER_ENABLED=true`.
It uses durable job leases, a bounded request/page budget, limited read retries and
installation revisions. Failed or superseded imports preserve the previous snapshot.
An authoritative authentication failure invalidates only the credential revision
that failed. An unsigned uninstall hint cannot itself disconnect an installation.

## Outcome and recovery contract

| State | Meaning and permitted next step |
| --- | --- |
| `PENDING` | Saved proposal; explicit owner execution remains necessary. |
| `CANCELLED` | Owner withdrew before any dispatch claim; reason, actor and time remain in the ledger. A new proposal needs fresh authorization. |
| `DISPATCHING` | Dispatch claimed durably. Restart or replay must not send again; investigate and reconcile. |
| `DENIED` | Policy or preflight refused execution. Changed intent requires fresh authorization. |
| `CONFIRMED` | Accepted provider response plus matching read-back; receipt and audit committed. |
| `REJECTED` | Provider rejected the attempted operation; inspect receipt. |
| `UNKNOWN` | Outcome cannot be established; read-only reconciliation and operator investigation. |
| `DRIFT` | Provider evidence disagrees with the expected result; investigate external changes. |

An unresolved operation blocks another proposal for that resource. Observing the
requested target price later does not prove HOTL caused it, so reconciliation does
not turn `UNKNOWN` into `CONFIRMED`. There is no implemented automatic clearance
or manual resolution endpoint for that uncertainty lock. Never repair it by editing
the ledger or replaying a historical allow response.

For `DISPATCHING`, `UNKNOWN` or `DRIFT`, the owner can append an investigation
with a next step, a note and up to five evidence references. The request must name
the current operation status, latest reconciliation time and monotonic revision; a newer observation
requires the owner to refresh before saving. HOTL stores the reviewer, time and
observation snapshot durably. The audit event binds the full review by digest
without copying the note or references into the audit payload. References remain
owner supplied and **are not independently verified provider evidence**. A review
does not change operation status, grant authorization or release the price lock.

Compensation is a new owner proposal with `compensationFor`, referencing a confirmed
operation. It must restore the original price, match current provider observations
and pass all fresh guardrails. A later merchant edit prevents that compensation.
There is no unconditional rollback.

If the provider changes price but the final local commit fails, the earlier durable
dispatch claim prevents blind resend. The provider and local database do not share
an atomic transaction. Preserve operation evidence and investigate that ambiguity.
Local fault-injection tests cover rejected dispatch-claim commits, rejected
post-write result commits and lost commit acknowledgements. Only the first case
can be safely retried: no provider call was made. In the latter cases a restarted
service does not resend, even if the caller supplies a new HTTP idempotency key.
File/checkpoint/kill-journal restoration is documented in
[restore verification](restore-verification.md); database restoration in
[PostgreSQL runtime](postgres-runtime.md).

## Staging setup and evidence procedure

1. Provision an isolated authorized Shopify development store and app. Configure
   the exact HTTPS callback on the owner cockpit host. Follow
   [OAuth configuration](shopify-oauth.md) and [production identity](production-identity.md).
   Use a separate staging ledger/workspace; preserve the working simulation data.
2. Provision guardrail-only app credentials, a backed-up encryption key, authenticated
   owner identity and durable storage. Configure the independent kill-state reader.
   A new file ledger requires deliberate first initialization; never use that flag
   to recover missing data. Prefer the tested PostgreSQL ledger for deployment.
3. Set `SHOPIFY_STAGING_SHOPS` to the exact development-store hostname directly in
   the staging guardrail process. `pnpm dev` intentionally never forwards this
   variable and accepts simulation mode only. A hostname entry is insufficient:
   provider preflight must also report a partner development store.
4. Exercise the actual browser install and cookie round trip. Queue and run sync.
   Set `SHOPIFY_WEBHOOK_ORIGIN` to the public HTTPS **guardrail** origin, without a
   path, query or fragment. In the owner cockpit, ensure each supported topic for
   that installation. Shopify app configuration must not also register those same
   topics; its app-scoped subscriptions are not returned by the shop-scoped API and
   would cause duplicate deliveries. Do not interpret `CONFIRMED` registration as
   delivery proof. Verify real delivery, duplicates, outage recovery and
   authoritative resynchronization. An `UNKNOWN` or durable `DISPATCHING`
   registration needs provider-side investigation; never reset its ledger entry.
5. Supply evidenced costs and a small owner-approved price change within the active
   Constitution. Save its proposal, explicitly execute, and record provider request
   identifiers, original/resulting price, operation ID and audit linkage. Inspect
   the actual store independently. Do not store tokens, cookies or customer PII in
   evidence artifacts.
6. Exercise pause, stale revisions, low margin, normal-store denial, duplicate
   execution, lost response and restart in the controlled environment. Test
   compensation only with a fresh proposal and unchanged provider state. Execute
   token expiry/reauthorization and separately deployed emergency revocation drills.
7. Record each environment, date, code snapshot identifier, result and artifact in
   [continuation verification](continuation-verification.md). Leave capabilities
   unverified until these interactions actually run.

## Explicit limits

- Shopify's variant price mutation has no compare-and-swap field. Preflight cannot
  eliminate an external owner's edit between read and write. This is why ordinary
  merchant production and autonomous price execution remain disabled.
- Provider fixtures prove local request/response handling only. No real OAuth,
  token refresh, webhook subscription/delivery or Shopify price write has run here.
- Shop-specific subscriptions may be deleted by Shopify after failing deliveries.
  A returned registration is not durable delivery health; monitor provider status
  and run periodic authoritative sync in the staging environment. If a previously
  `CONFIRMED` subscription disappears from an authoritative query, a fresh owner
  ensure action can register it again. A `DISPATCHING` or `UNKNOWN` attempt remains
  blocked even when a later query shows no subscription.
- The current loop is USD and one variant at a time; it does not implement checkout,
  payment, supplier, refund, advertising or fulfillment provider execution.
- Locations are bounded to 100; overflow fails rather than silently claiming a
  complete import. Detailed order/fulfillment expansion remains future work.
- Tenant identity is one configured workspace per guardrail instance. Hosted Auth,
  secret rotation deployment, external audit anchoring, monitoring and cross-cluster
  disaster recovery remain deployment work.

## Provider contract references

The runtime pins API `2026-07` and verifies the response version. References were
inspected during this implementation; documentation research is not provider evidence.

- [API versioning](https://shopify.dev/docs/api/usage/versioning)
- [Variant bulk update](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate)
- [Shop plan and development-store flag](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ShopPlan)
- [Webhook delivery and reconciliation](https://shopify.dev/docs/apps/build/webhooks)
- [Shop-scoped subscriptions](https://shopify.dev/docs/apps/build/webhooks/subscribe)
- [Subscription query](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/webhookSubscriptions)
- [Subscription create mutation](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/webhookSubscriptionCreate)
- [Webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
