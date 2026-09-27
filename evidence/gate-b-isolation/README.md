# Gate B5: local cross-workspace isolation evidence

Status: **local HTTP tests passed; deployed and database isolation remain unverified.**

Source: [`apps/guardrail-service/test/shopify-tenant-isolation.test.ts`](../../apps/guardrail-service/test/shopify-tenant-isolation.test.ts). This file was added for Gate B5 without changing application policy or provider logic.

## Test setup

The tests use two separately constructed live-mode guardrail engines and Fastify servers. Each server has a different trusted workspace UUID, its own Shopify installation, synced variant observation, queued sync job, webhook inbox record, price operation and receipt, unresolved investigation, audit entry, and owner approval fixture. ES256 owner JWTs are signed by a local test key and verified with the same identity path used by the HTTP server. Provider fetch is trapped and must not occur. The fixture uses an opaque dummy token envelope; no real provider credential is supplied.

## Observed assertions

1. A validly signed owner token for workspace B cannot read workspace A's Shopify overview, private products, audit history, approvals, or telemetry. The same token cannot invoke A's Shopify sync, webhook registration, disconnect, economics, price proposal, price execution, reconciliation, cancellation, investigation, or approval resolution routes. All tested responses are HTTP 403 with `WORKSPACE_REQUIRED`, even when the URL names a real resource. The A ledger is unchanged and no provider call occurs.
2. A validly signed workspace A owner token is rejected by workspace B, including when client headers try to select B. The server accepts only the signed workspace binding against its trusted workspace configuration.
3. A second signed owner in workspace A sees no first-owner Shopify installation, observation, jobs, inbox records, operations, receipt, or investigation through `/api/shopify`. Guessed installation and operation IDs fail with HTTP 404 for sync, subscription registration, disconnect, execution, reconciliation, cancellation, and investigation. The ledger remains unchanged and no provider call occurs.

The audit and approval checks above are **cross-workspace**. The current one-instance-per-workspace model gives authenticated owners of the same workspace access to workspace-level audit and approvals. This test does not claim per-owner isolation for those resources.

## Commands and result

Run from the repository root:

```powershell
pnpm --filter @hotl/guardrail-service exec vitest run test/shopify-tenant-isolation.test.ts
pnpm --filter @hotl/guardrail-service typecheck
```

Observed on 2026-09-24: **3 tests passed, 0 failed; guardrail TypeScript typecheck passed.** The first test iteration exposed a fixture setup error (`test.*` is not an accepted extension operation); after using the permitted `integration.*` prefix, one iteration exposed a missing fixture webhook origin. Both were corrected in the new test file, and the final run is the result reported here.

## Limits and next evidence

This is an in-process local HTTP test with synthetic signed JWTs and fixture ledgers. It does not establish Supabase session issuance, remote JWKS retrieval, deployed ingress isolation, PostgreSQL role/RLS enforcement, cross-workspace backup restore separation, or real Shopify provider behavior. Gate B still needs staging identity, database, and restore evidence before it can pass. The intentionally public Shopify OAuth callback and HMAC-signed webhook routes are outside the owner-JWT route assertions and require their own provider-origin and delivery tests.
