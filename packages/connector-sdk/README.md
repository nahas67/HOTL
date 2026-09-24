# HOTL connector SDK

Typed, server-only Shopify GraphQL Admin 2026-07 and WooCommerce REST `wc/v3` readers. Provider writes are unavailable. Read the [contract and research notes](../../docs/connector-research.md) before integrating.

```ts
import { createConnector } from '@hotl/connector-sdk';

const connector = createConnector({
  provider: 'shopify',
  shop: 'your-shop.myshopify.com',
  accessToken: process.env.SHOPIFY_READ_TOKEN!,
});
const page = await connector.listProducts({ limit: 50 });
// Persist nextCursor and continue later under a bounded sync job.
// Variants and order lines require their own paginated calls.
```

For WooCommerce, provide `baseUrl`, `consumerKey`, `consumerSecret`, `currency`, and `allowedHosts`. The host allowlist must come from trusted server configuration. Use a read-only key and store all credentials encrypted in the integrating service.

Available methods: `health`, `listProducts`, `listVariants`, `listInventory`, `listOrders`, `listOrderLines`, and `requireCapability`. Monetary amounts retain provider decimal strings. Customer details and custom metadata are omitted. A health result verifies catalog access only.

`verifyWebhookSignature({provider, rawBody, signature, secret})` returns a boolean. `assertWebhookSignature` throws `INVALID_WEBHOOK` or returns `{bodySha256}`. Neither deduplicates deliveries, proves store ownership from unsigned headers, nor authorizes effects. Implement durable connection-bound receipts and canonical provider reconciliation in the consuming service.

Transport injection exists for fixtures and trusted server integrations. The default transport uses public IPv4 HTTPS with DNS pinning, no redirects, request deadlines and a 2 MiB response cap. No token, raw upstream error, or customer object is included in a `ConnectorError`.

Run `pnpm --filter @hotl/connector-sdk typecheck` and `pnpm --filter @hotl/connector-sdk test`. These checks use fixtures; actual merchant test-account drills remain unrun.
