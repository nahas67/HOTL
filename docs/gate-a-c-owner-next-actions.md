# Owner actions to unblock Gates A–C

**Status:** Preparation guide only. It is not an approval, a credential store, or evidence that a Shopify connection exists.

The local engineering work for Gates A–C is committed. The owner asked AI to choose the initial business direction, so HOTL has a [dated AI research recommendation](pilot-ai-recommendation-2026-09-28.md): the U.S./USD is a provisional target-market hypothesis, but no product currently passes the launch screen. An under-desk cable tray is only the simplest research lead. The AI may rank markets and products from evidence, but it cannot establish owner financial authority. The legal seller country, payment eligibility, fulfillment origin, economics, capital/reserve, spend/exposure/refund caps and stop thresholds remain `UNKNOWN`; no purchase, advertising or live checkout is authorized. Shopify staging is still not set up. Keep the local simulation isolated while completing these steps.

## 1. Decide one bounded pilot (Gate A)

Use the [AI pilot recommendation](pilot-ai-recommendation-2026-09-28.md) as a research candidate, then complete [the pilot business and risk worksheet](pilot-business-risk-envelope.md). AI may rank target markets/products and estimate economics for review. The owner must verify the seller's legal country, target market, fulfillment model and evidence, then personally set and approve actual business/risk limits in the authenticated cockpit. For each value, identify its source, date, unit, period and evidence. Leave unresolved values `UNKNOWN`; do not use a model estimate as owner authorization.

The owner decision must cover:

| Area | Values to decide |
| --- | --- |
| Business profile | Seller's legal country, target sales market, Shopify development-store channel, customer profile, product/category, supplier model and origin, fulfillment model, currency, return model, expected order value, sales target and target period. |
| Unit economics | Supplier cost, inbound freight, outbound shipping, packaging, store fees, payment fees, advertising acquisition estimate, refund and return allowances, fulfillment expense, tax treatment, target contribution, break-even CAC and break-even ROAS. |
| Capital and exposure | Maximum pilot capital, protected reserve, daily/weekly/monthly spend, advertising exposure, supplier exposure, inventory exposure, experiment loss, refund authority and maximum single autonomous transaction. |
| Stop conditions | Metric, threshold, unit, measurement window, authoritative data source and response for each business stop rule. |

The current implementation permits an approved pilot only in **USD**. All capital limits must be owner-entered and consistent with the broader Constitution ceilings. The locally measurable stop signals are uncertain provider operations and provider reconciliation failures; each must be enabled at a threshold of at least one. Other enabled stop rules are rejected as unavailable until their deterministic signals are implemented. Record desired but unavailable metrics in the worksheet and keep them disabled in the cockpit.

After the values and evidence are ready, enter them through the authenticated owner cockpit's **Pilot business & risk** page. Save the draft, review its version and validation gaps, then use the separate owner approval action. A saved worksheet or chat message does not approve the Business Constitution.

## 2. Create an authorized development environment (Gate C prerequisite)

Use a Shopify **development store** owned by the organization's development account and a development app created for this HOTL pilot. Do not connect a merchant's operating store. Shopify distinguishes development stores from client-transfer stores and merchant collaborations; select the development-store type intended for app testing. See Shopify's [store types](https://shopify.dev/docs/apps/build/stores) and [development-store guide](https://shopify.dev/docs/apps/build/stores/development-stores).

In Shopify Dev Dashboard, create the development app, create and release an app version, and set its app URL, OAuth redirect URL and scopes. Shopify's [Dev Dashboard app guide](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) describes this flow; [app configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration) documents versioned URLs. For HOTL, the redirect URL must exactly match:

```text
https://<owner-cockpit-host>/api/shopify/oauth/callback
```

Use a trusted, public HTTPS origin for the owner cockpit and a trusted public HTTPS origin for the separately hosted guardrail webhook service. The guardrail receives Shopify deliveries under:

```text
https://<guardrail-host>/api/shopify/webhooks/<installation-id>
```

Use an isolated staging deployment with valid TLS and limited routes. Do not expose a local development server or the simulation environment as the staging endpoint.

Declare the pilot scopes required by the current implementation:

```text
read_products,write_products,read_inventory,read_locations
```

Release the app version and approve those scopes during installation. A declared scope alone does not prove it was granted; Shopify documents checking the [granted access scopes](https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes). Record the actual granted scopes without recording any token. Record the webhook payload API version too; it is configured separately from HOTL's pinned Admin GraphQL API version. See Shopify's [webhook subscription guide](https://shopify.dev/docs/apps/build/webhooks/subscribe).

## 3. Provision isolated Gate B staging controls

Before setting live mode, provision a separate workspace and database/login for the staging instance. Do not reuse the simulation ledger or local provider credentials. Apply the existing migrations and verify workspace RLS/grants, backups and restore. Deploy the kill service independently with separate credentials, state and revocation authority; never put its deployment secrets in the main app pipeline.

The existing [static staging preflight](../scripts/staging-readiness.mjs) checks only configuration shape. Its relevant variables are:

| Component | Variables |
| --- | --- |
| Staging identity and ledger | `HOTL_MODE`, `GUARDRAIL_WORKSPACE_ID`, `GUARDRAIL_DATABASE_URL`, `GUARDRAIL_AUTHORIZATION_VERSION`, `AGENT_JWT_KEYS`, `OWNER_USER_IDS`, `SUPABASE_URL` |
| Trusted origins | `HOTL_PUBLIC_ORIGIN`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_WEBHOOK_ORIGIN`, `KILL_SWITCH_URL` |
| Shopify app | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STAGING_SHOPS`, `SHOPIFY_SCOPES` |
| Credential storage and emergency read | `CONNECTOR_ENCRYPTION_KEY`, `KILL_SWITCH_READ_TOKEN` |

Set these only in the appropriate staging service's secret manager. The Shopify client secret, connector-encryption key and emergency read token belong in server-side secret storage; never paste them into chat, evidence, a browser bundle or the cockpit. Shopify app credentials and connector-encryption material belong only to the guardrail service. Emergency deployment credentials stay exclusively with the separately deployed emergency service.

The preflight must pass in the isolated staging environment, but that is only a configuration check. Gate B still needs actual TLS, identity, database/RLS, restore and independent emergency evidence. Gate C then needs real OAuth, sync, webhook, one owner-approved variant price change, provider read-back, reconciliation, retry/race/uncertainty/restart/compensation and emergency-denial evidence. Record sanitized identifiers and results in the [Gate C evidence ledger](../evidence/gate-c-first-shopify-proof/README.md).

## 4. What to send back

To continue without sharing credentials, provide the completed business/risk decisions and their evidence references, plus these non-secret staging details when available:

- Development store hostname (`<name>.myshopify.com`) and confirmation that Shopify identifies it as a development store.
- App/client ID, released app version, configured scopes, and webhook payload API version.
- Owner cockpit, callback and guardrail webhook HTTPS origins.
- Confirmation that the database/workspace, owner identity, independent emergency service, backup and restore belong to the isolated staging environment.

Do not send passwords, OAuth client secrets, access tokens, cookies, signing keys, database URLs containing credentials, or emergency service credentials. When those prerequisites are ready, run the static preflight and then schedule the controlled external drill. Do not begin Gate D before Gates A–C have evidence and pass.
