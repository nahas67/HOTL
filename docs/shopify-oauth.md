# Shopify installation and token lifecycle

Implementation checkpoint: 2026-09-18. This is a standalone OAuth integration owned by the guardrail service. The tests use local fixtures and intercepted requests. No merchant installation, remote token rotation, deployed callback or actual Shopify price mutation has been verified by these tests.

## Configuration and ownership

Configure `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI`, `CONNECTOR_ENCRYPTION_KEY` and the server workspace identity exclusively in the guardrail process. The encryption key must be a canonical base64 representation of 32 random bytes. Back up the key separately from the ledger using the deployment secret manager. An unavailable or wrong key denies credential access; it never resets the ledger.

The callback must use HTTPS and exactly match the app's configured redirect URI. The deployed public endpoint must route to `/api/shopify/oauth/callback`. Installation initiation and the callback need the same browser cookie host. Cross-host proxies must forward the installation `Set-Cookie` correctly and must not log the callback query string, authorization code, cookie or tokens. Validate this on the intended HTTPS deployment before recording staging evidence.

Default scopes are `read_products`, `write_products`, `read_inventory` and `read_locations`. Shopify's corresponding write scope satisfies a requested read scope. Orders are not requested by default; adding `read_orders` requires the associated merchant approval and scope configuration. The OAuth grant does not itself authorize a price mutation: deterministic guardrails, resource revisions, economics, kill state and the staging capability gate still apply.

The durable extension binds each installation to its server workspace, owner, exact `myshopify.com` shop and app client ID. Another owner cannot reuse the shop's existing installation. Another configured workspace cannot read or modify that extension. Runtime business agents cannot manage installation credentials.

## Installation sequence

1. The authenticated owner calls `POST /api/guardrails/v1/shopify/install` with `{ "shop": "merchant.myshopify.com" }` and an idempotency key.
2. Guardrails atomically persist the installation, a ten-minute pending challenge and an audit event. Only challenge hashes are persisted. The response supplies an authorization URL and the route sets a Secure, HttpOnly, SameSite=Lax browser cookie scoped to the callback.
3. The callback verifies the exact shop, unique query parameters, timestamp, app HMAC, saved state and browser cookie. Verification happens before contacting the token endpoint.
4. A durable claim changes the challenge to `exchanging`. Parallel callbacks, replay and process restarts cannot exchange the same code again.
5. The server requests an expiring offline token pair. It makes one bounded POST, rejects redirects and oversized or malformed responses, validates granted scopes, then encrypts both tokens with AES-256-GCM. Associated data binds the ciphertext to workspace, owner, installation, shop and app.
6. A successful transaction saves metadata and appends the audit event before returning success. The callback route schedules initial synchronization. Tokens and encrypted envelopes never appear in owner responses or audit payloads.

Completed, failed, expired and superseded challenges cannot be reused. Retrying an initiation with its original idempotency key returns the original pending challenge only while that challenge remains valid. Use a new key for fresh authorization.

## Refresh, invalidation and recovery

`accessToken` is an internal guardrail method with no HTTP exposure. Within sixty seconds of access-token expiry it makes a durable refresh claim and blocks concurrent refresh or installation exchange. A successful refresh saves the new pair and advances the installation revision. Consumers must use that returned revision to prevent a stale provider result from invalidating or changing a newer installation.

An ambiguous token response fails closed and changes the installation to `AUTH_REQUIRED`. HOTL intentionally requires fresh merchant authorization instead of retrying a refresh with uncertain outcome. A process crash after claiming refresh leaves `REFRESHING` persisted: token access remains denied, and fresh installation may begin after the sixty-second claim expires. A crash during initial exchange similarly requires a fresh challenge after the pending challenge expires. Neither path resets canonical commerce records.

`invalidate(id, actor, expectedRevision, key)` is internal-only. Call it only after the credential-bound authoritative provider request returns HTTP 401. It atomically marks `AUTH_REQUIRED`, discards the unusable token envelope and expiry values, increments the revision, and audits the transition. A stale revision cannot invalidate newly installed or refreshed credentials. A raw webhook topic, delivery header, network timeout, HTTP 403 or HTTP 429 is insufficient evidence for this operation.

Owner disconnect is revision-bound and clears local credentials while preserving the installation, imported records and audit history. It supersedes pending installation challenges. A late token exchange or refresh cannot restore a disconnected installation. The response explicitly reports `providerRevoked: false`; local disconnect is not proof of remote revocation. An uninstall delivery triggers authoritative reconciliation rather than trusting unsigned topic/store headers to erase credentials.

Changing the encryption key without a controlled re-encryption migration makes previous credentials unreadable. Retain the original key backup or reauthorize affected installations. Changing the app client ID also requires reauthorization. There is no automated dual-secret rollout or key-envelope re-encryption tool in this module; plan and verify those deployment operations separately.

## Provider boundary

`shopify-provider.ts` targets `/admin/api/2026-07/graphql.json` and checks the returned `x-shopify-api-version`. It reads the exact shop domain, currency and `plan.partnerDevelopment` alongside the variant's price and product revision. Missing or mismatched evidence is rejected.

The price mutation sends one variant to `productVariantsBulkUpdate` with `allowPartialUpdates: false`. A provider result containing user errors, extra variants, a mismatched ID or price, an invalid schema, a different API version or GraphQL throttling is rejected. No POST is automatically retried, including 429 and 5xx responses. Provider execution uncertainty is handled by the durable commerce operation and reconciliation flow, not by this transport resending a mutation.

## Verification and remaining deployment work

Run the focused local suites with:

```powershell
pnpm --filter @hotl/guardrail-service exec vitest run test/shopify-oauth.test.ts test/shopify-provider.test.ts
pnpm --filter @hotl/guardrail-service typecheck
```

The tests cover browser/state/account binding, callback rejection before exchange, single durable exchange claim, restart, encrypted persistence, safe metadata, workspace and owner isolation, state expiry, scope denial, refresh rotation, ambiguous refresh, crash recovery, expired refresh, revision-bound 401 invalidation and disconnect during exchange. Provider tests inspect request documents, store evidence, exact variant results, version enforcement, partial errors and absent mutation retries. These are local implementation checks only.

Before claiming staging verification: register a real development-store app and exact HTTPS callback, verify the complete browser cookie round trip, install and sync real provider records, exercise expiry/revocation and reauthorization, and execute the bounded guarded price/read-back drill with provider request identifiers. Independently deployed kill/revocation and restore evidence remain separate release gates. Preserve all journals and receipts.

## Official contract references

- [Standalone authorization](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps): authorization-code flow, registered redirect URI, nonce and callback checks.
- [Access token lifecycle](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens): expiring offline pairs, refresh responses, token retirement and HTTP 401 after revocation. Current documentation permits a limited overlap for previous refresh tokens; HOTL's ambiguous-refresh policy deliberately remains more conservative.
- [Product variant bulk update](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate): single-product variant updates and the partial-update setting. Documentation URLs may redirect to the latest reference; the runtime request and response-version check remain pinned to 2026-07.

References inspected on 2026-09-18. Documentation research is not evidence of an executed merchant integration.
