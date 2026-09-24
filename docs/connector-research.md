# Commerce connector contracts

Researched against official documentation on 2026-09-09. Implementation: `packages/connector-sdk`. This is a server-only, read-only SDK with real provider request construction. Passing local fixtures is not evidence of successful merchant authentication or provider sandbox execution.

## Implemented surface

| Capability | Shopify | WooCommerce |
| --- | --- | --- |
| Catalog | GraphQL `products` connection | `GET products` |
| Variants | `product(id).variants` connection | `GET products/{id}` and, for variable products, `GET products/{id}/variations` |
| Inventory | `productVariants`, or a product's variants; aggregate quantity and tracking flag | Product stock; explicit product ID expands variable-product stock |
| Orders | `orders` connection with totals and statuses | `GET orders` with totals and statuses |
| Order lines | `order(id).lineItems` connection | `GET orders/{id}`; bounded slices of the embedded line array |
| Webhooks | Raw-body HMAC verification | Raw-body HMAC verification |
| Provider writes | Unavailable | Unavailable |

`createConnector`, provider-specific factories, canonical types, `connectorManifests`, `ConnectorError`, `verifyWebhookSignature`, and `assertWebhookSignature` are exported from `@hotl/connector-sdk`. `requireCapability` rejects unsupported operations before any network request. Manifests describe implementation capability, not merchant-granted permissions. Health proves only `catalog.read`, the probe actually executed.

All publishing, pricing, discounts, inventory changes, orders, checkout, refunds, campaigns, and purchase orders remain outside this SDK. Any future write adapter must execute inside the authenticated guardrail service; a prior allow response never supplies fresh authorization.

## Shopify

The connector pins GraphQL Admin API **2026-07**, uses `POST https://{shop}.myshopify.com/admin/api/2026-07/graphql.json`, and sends `X-Shopify-Access-Token`. Documents are fixed queries; callers can provide only validated IDs and pagination variables. These match the [GraphQL Admin API contract](https://shopify.dev/docs/api/admin-graphql/2026-07).

Shopify releases versions quarterly and reports the served version through `X-Shopify-API-Version`. This SDK rejects a supplied response version that differs from its pin. Review the pin each quarter; do not silently accept a fall-forward schema. [Versioning policy](https://shopify.dev/docs/api/usage/versioning).

Install only required read scopes: `read_products` for catalog/variants, `read_inventory` together with product access for inventory items, and `read_orders` for orders. The default order history is 60 days; older history requires approved `read_all_orders` in addition to the order scope. [Access scopes](https://shopify.dev/docs/api/usage/access-scopes), [Order object](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Order).

Token acquisition and renewal are deployment responsibilities, not implemented by this SDK. For stores in the app's own organization, Shopify documents a client-credentials flow with expiring access tokens; other merchants use installation plus the appropriate token exchange or authorization-code flow. A supplied token must be valid at request time. [Authentication and installation restrictions](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant).

Omitting names, email, address, and phone does not exempt order data from protected-customer-data requirements. Public apps need the appropriate data-access review; development-store-only apps can configure the needed access without submitting that review. App distribution affects availability. [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data).

Pagination uses `first`, `after`, `pageInfo.hasNextPage`, and `pageInfo.endCursor`; products, variants and order lines each have separate cursors. The SDK caps each page at 100 and rejects nonadvancing or excessive responses. GraphQL errors cause the entire page to fail, including responses with partial data. [GraphQL pagination](https://shopify.dev/docs/api/usage/pagination-graphql).

Shopify uses calculated query-cost limits. `THROTTLED` becomes a retryable `RATE_LIMITED` error; the SDK does not automatically replay GraphQL POST requests. The job runner must reschedule with its own bounded policy. [API limits](https://shopify.dev/docs/api/usage/limits).

Variant price is a decimal string in shop currency. Inventory quantity is total sellable quantity, with `null` preserved for unknown/untracked inventory. It is not a location-level commitment. [ProductVariant fields](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ProductVariant).

For a provider drill, create a Shopify dev store, install the app with read scopes, create test catalog/orders, and verify multiple pages plus a denied scope. Dev stores are intended for testing and cannot process real transactions. **This drill has not been run.** [Dev stores](https://shopify.dev/docs/apps/build/stores/development-stores).

## WooCommerce

The connector targets the WordPress REST integration **`/wp-json/wc/v3/`**, including stores installed under a subdirectory. This is distinct from the old standalone legacy REST API. Product and variation reads use their documented resource contracts. [REST API overview](https://developer.woocommerce.com/docs/apis/rest-api/), [Products](https://developer.woocommerce.com/docs/apis/rest-api/v3/products/), [Product variations](https://developer.woocommerce.com/docs/apis/rest-api/v3/product-variations/).

Create a consumer key for a dedicated WordPress user with **Read** permission. The SDK sends consumer key/secret using HTTPS Basic authentication. Credentials never appear in query strings. WordPress user capabilities still restrict access; hosts that strip the Authorization header must fix their server configuration. This SDK does not use insecure HTTP, legacy OAuth1, or query-string credential fallbacks. [WooCommerce authentication](https://developer.woocommerce.com/docs/apis/rest-api/authentication).

Collection requests use `page` and `per_page`, bounded to 100 items. `X-WP-TotalPages` determines whether another page exists; missing or malformed pagination information fails the read. Caller cursors are decimal page numbers. A crawl is not a transactional snapshot; callers should deduplicate IDs and reconcile later provider changes. [WordPress pagination](https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/).

Order responses carry currency and embedded line items. The connector projects totals/statuses and a redacted customer marker; it never returns billing, shipping, notes, or custom metadata. Order-line pagination is a local slice of the provider's bounded response, not a separate WooCommerce endpoint. [Orders contract](https://developer.woocommerce.com/docs/apis/rest-api/v3/orders/).

Product price currency is trusted merchant configuration because the selected product response does not carry currency. Order totals use the order's currency. Top-level inventory lists product stock; pass each variable product ID to enumerate its variations. Parent-inherited variation stock is reported as unknown at that scope rather than fabricated zero stock.

Use a separate WordPress/WooCommerce test installation and read-only key for the provider drill. WooCommerce documents WordPress Studio and `wp-env` development environments. The production SDK transport deliberately rejects local/private endpoints; fixture transports or a separately approved public HTTPS test deployment are needed for testing. Do not weaken destination validation. **A real WooCommerce test-site drill has not been run.** [Development environments](https://developer.woocommerce.com/docs/getting-started/development-environment/).

## Transport and operational boundaries

These are HOTL implementation choices:

- Credentials remain in server-side connector closures. Canonical data and error messages omit request headers, URLs, provider error text and causes. Provider content is untrusted data, never agent instructions.
- Shopify accepts only ordinary `*.myshopify.com` shop names. WooCommerce requires an exact hostname from trusted server configuration. Browser-submitted input cannot approve its own host.
- HTTPS uses normal certificate verification. Each connection resolves IPv4, rejects any private/reserved result, and pins the checked address into a fresh TLS connection. IP literals, local hostnames, credentials in URLs, nondefault ports and redirects are denied. IPv6-only stores are currently unsupported.
- Responses are capped at 2 MiB; requests default to 10 seconds and can be configured up to 30 seconds. Schema violations and authentication/authorization errors are not retried. GET requests default to two retries, configurable to at most three, with bounded backoff. A provider retry-after longer than five seconds returns control to the job runner immediately.
- Custom transports are trusted server code for fixture tests or controlled deployment use. They are never selected through tenant input and must preserve TLS, DNS pinning, redirect and response-size protections.
- Connection ownership, encrypted credential storage/rotation, sync job budgets, audit journals, durable cursors, webhook receipts and status persistence belong to the integrating service. The SDK neither stores secrets nor grants cross-connection access.

## Webhook authenticity and receipt handling

Shopify signs the exact raw body with its app client secret using HMAC-SHA256 and sends base64 in `X-Shopify-Hmac-SHA256`. WooCommerce uses the webhook's configured secret and `X-WC-Webhook-Signature`. The SDK validates canonical base64 and compares the 32-byte digest in constant time. Parsed/reformatted JSON cannot replace the raw body. [Shopify delivery verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries), [WooCommerce webhooks](https://developer.woocommerce.com/docs/apis/rest-api/v3/webhooks/).

The verifier proves body authenticity only. It does not persist receipts, establish freshness or authorize a financial action. Bind the receiving route to stored connection configuration, verify before parsing, and durably bind connection ID + delivery ID to the body digest. Reject reuse of an ID with a changed body. Do not acknowledge success until durable receipt storage succeeds.

Security inference from the documented HMAC inputs: shop, topic, delivery ID and timestamp headers are not signed by the raw-body HMAC. Shopify app secrets may also be shared across installations. Such headers alone cannot prove store ownership or prevent replay under a changed delivery ID. Re-read canonical data through the intended stored connection, deduplicate effects by resource/version or digest, and obtain a fresh deterministic guardrail decision before effects. Webhook bodies must never become direct spending or state-mutation authority.

## Verification evidence

Local verification completed:

```text
pnpm --filter @hotl/connector-sdk typecheck
pnpm --filter @hotl/connector-sdk test
```

49 fixture/security tests pass across three files: read pagination and mapping, credential isolation, permission failures, partial GraphQL failures, unsupported capabilities, GET retry budgets, cancellation/timeouts, DNS pinning, private-address denial, redirects, oversized responses and forged webhooks. Tests use synthetic credentials and provider-shaped fixtures; no external account or provider write was used.

Not yet verified: real Shopify/WooCommerce credentials, merchant scopes and approvals, live API schema responses, provider webhook delivery, production secret rotation, deployed receipt durability and end-to-end sync jobs. Those require configured test accounts and integrating-service drills before a production-readiness claim.
