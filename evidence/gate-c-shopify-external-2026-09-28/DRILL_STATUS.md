# Gate C drill status — 2026-09-28

## Owner authority

Gate A is **OWNER INPUT REQUIRED**. The prior answer that AI should choose the direction is not legal/business source evidence or owner approval. The dated U.S./USD market direction and under-desk cable-tray lead are research recommendations only.

Still unknown or unapproved in the authenticated cockpit: legal seller jurisdiction; final category and exact test product; currency approval; verified product and landed cost/tax basis; margin floor; maximum price action; capital and protected reserve; spend and supplier/inventory exposure limits; refund ceiling; and stop thresholds. No owner-approved Business Constitution authorizes a Shopify write. A price mutation is therefore **BLOCKED — OWNER AUTHORITY INCOMPLETE**.

## Staging infrastructure

| Requirement | Status | Evidence |
| --- | --- | --- |
| Authorized Shopify development store | BLOCKED | Owner previously said it is not set up; no store connection was attempted. |
| Shopify development app | BLOCKED | Owner previously said setup is incomplete; no app credentials were supplied or inspected. |
| Trusted HTTPS OAuth callback | BLOCKED | No staging callback configured; static preflight field SHOPIFY_REDIRECT_URI is missing. |
| Trusted HTTPS webhook endpoint | BLOCKED | No staging ingress configured; static preflight field SHOPIFY_WEBHOOK_ORIGIN is missing. |
| Isolated staging workspace and database | BLOCKED | No staging workspace/database binding; GUARDRAIL_WORKSPACE_ID and GUARDRAIL_DATABASE_URL are missing. |
| Independent emergency control | BLOCKED | No staging emergency reader is configured; KILL_SWITCH_URL and KILL_SWITCH_READ_TOKEN are missing. |
| Remaining static configuration | BLOCKED | PREFLIGHT.json lists 19 missing fields, including live mode, owner identity, JWT keys, app/scopes, encryption, backup target, and reconciliation mode. |
| Active read-only probes | NOT RUN | Their endpoints are absent; no probe request was sent. |
| Runtime database authority and external restore | UNVERIFIED | No staging database exists for live role/RLS/DDL or restore evidence. |

The static report also lists active-only readiness URLs as absent and identifies database DDL privilege, kill deployment independence, backup restore, Shopify connectivity, and webhook delivery as not probed.

## External Shopify evidence

| Drill | Result | Basis |
| --- | --- | --- |
| OAuth installation and negative cases | UNVERIFIED | No development app/store or callback; no OAuth request. |
| Product, variant, inventory, and location read sync | UNVERIFIED | No provider connection or read request. |
| Webhook subscription registration/read-back | UNVERIFIED | No app, endpoint, or provider registration call. |
| Real webhook delivery, HMAC, inbox, and deduplication | UNVERIFIED | No Shopify delivery occurred. |
| Authoritative reconciliation | UNVERIFIED | No provider observation exists. |
| Guarded price proposal | BLOCKED | No staging installation and no owner-approved Gate A authority. |
| Provider price mutation | BLOCKED | No owner authority or staging prerequisites; no write request occurred. |
| Provider receipt and authoritative read-back | UNVERIFIED | No mutation occurred. |
| Idempotent replay and stale external edit | UNVERIFIED | No real provider operation/resource exists. |
| Unknown-outcome behavior | LOCAL-ONLY | Local failure-injection tests are not external evidence; no live uncertainty was induced. |
| Compensation | UNVERIFIED | No original provider operation exists to compensate. |
| Staging restart, pause, kill, and main-stack-down drills | UNVERIFIED | No isolated staging environment or deployed emergency control. |
| Shopify-side credential revocation/rotation | UNVERIFIED | No app credentials or installation; EXTERNAL ROTATION UNVERIFIED. |

No Shopify API request was made during this checkpoint. The local source pins Admin GraphQL API 2026-07, but the API version used by a real external request remains unverified.

## Local regression and security review

- pnpm --filter @hotl/guardrail-service exec vitest run test/shopify-provider.test.ts test/shopify-price.test.ts test/shopify-state-corruption.test.ts test/shopify-oauth.test.ts test/shopify-sync.test.ts test/shopify-webhook-rotation.test.ts test/shopify-webhooks.test.ts test/shopify-routes.test.ts test/shopify-tenant-isolation.test.ts test/pilot-envelope.test.ts test/pilot-economics.test.ts: **PASSED**, 11 files / 134 tests.
- node --test tests/staging-readiness.test.mjs: **PASSED**, 9 tests.
- node scripts/staging-readiness.mjs --json: expected exit 1 with status BLOCKED; sanitized output is preserved as PREFLIGHT.json.
- Active preflight: **NOT RUN**, because required endpoint URLs are absent.
- Credential exposure: **PASS for changed files**. The detect-secrets scan of this checkpoint's changed documentation/evidence files found zero candidates. The prior full-repository scan's lockfile digests, examples, fixtures, tests, and runtime secret variables were reviewed separately; no live credential was identified or copied into this evidence.
- Cross-workspace isolation: **PASS in local tests only**, including the targeted tenant-isolation suite. Hosted identity and database isolation remain unverified.
- Shopify mutation bypass: **PASS in static code-path review**. Shopify price writes remain in the guardrail provider boundary; no alternate direct write path was found in the searched application packages.
- Evidence sanitization: **PASS**. The package contains only sanitized preflight reasons and non-secret status; it contains no provider receipt because none exists.

The complete repository-wide local verification from the prior implementation checkpoint is in the linked hardening package. The focused commands above do not replace that full release record or prove external staging behavior.

## Residual risk and maturity

The provider read → external change → write race remains because the Shopify mutation has no generic compare-and-swap primitive. The second provider read and local controls narrow that interval but do not eliminate it. No interval was measured externally because no provider transaction occurred.

Maturity is unchanged: Shopify OAuth, sync, webhook, guarded price workflow, and preflight remain M2 local/integration verified. No capability moved to M4. Gate D remains out of scope.

## Next checkpoint

Resume Gate C only after the owner-approved business/risk envelope is recorded in the authenticated cockpit and isolated Gate B staging, an authorized Shopify development store/app, trusted HTTPS callback/webhook endpoints, restricted staging database, encryption key, and independent emergency control are provisioned through approved secret mechanisms. Then rerun sanitized static preflight, review it, and only afterward request read-only active probes. Do not paste secrets into chat or evidence.
