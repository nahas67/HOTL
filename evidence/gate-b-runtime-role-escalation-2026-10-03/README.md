# Gate B runtime-role privilege denial follow-up — 2026-10-03

## Result

The local PostgreSQL readiness test now rejects a scoped runtime login when it has either a direct application-schema DDL grant or inherited membership in a role with `CREATEROLE`. The isolated PostgreSQL 18.6 runtime-ledger drill passed all 33 tests and its restart, backup/restore and restored authorization checks.

This closes a local regression-test gap. It is not evidence about a hosted staging role, Shopify, or production deployment. Gate A still requires owner-supplied facts and authenticated approval; Gate C remains blocked because its authorized Shopify development store/app and trusted HTTPS endpoints are not set up.

## Change and test behavior

[`apps/guardrail-service/test/postgres-store.test.ts`](../../apps/guardrail-service/test/postgres-store.test.ts) now verifies these denial cases against a dedicated runtime login created only in the disposable drill database:

1. Grant `CREATE` on `hotl_runtime`; `verifyRuntimePrivileges()` must reject with `RUNTIME_PRIVILEGES_UNSAFE`.
2. Revoke that grant, create a temporary `NOLOGIN CREATEROLE` role, and grant its membership to the runtime login; the readiness check must reject with the same error.
3. Revoke the membership and drop the temporary role in cleanup.

The test does not alter a saved application database or use a hosted credential. The drill script creates a uniquely labeled PostgreSQL container/network, binds its random port to loopback, checks ownership before cleanup, and performs restart plus backup/restore authorization checks.

## Verification

| Check | Result |
| --- | --- |
| Guardrail service typecheck | Passed after the test change. |
| PostgreSQL runtime-ledger drill | Passed: 33 tests on PostgreSQL 18.6. |
| Database restart and backup/restore digest | Passed. |
| Restored RLS, grants, workspace/login bindings and append-only denial | Passed. |
| Hosted Gate B readiness / HTTPS probes | Not run; no staging endpoints or hosted runtime were available. |
| Shopify OAuth, webhook, price mutation, Gate D | Not run. |

The full local and external blocker status remains in the [Gate A/C provisioning checkpoint](../gate-a-c-staging-provisioning-2026-10-01/README.md) and [verification ledger](../../docs/continuation-verification.md).
