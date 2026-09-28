# Gate C Local Preflight Hardening Evidence

**Date:** 2026-09-28
**Scope:** Safe local engineering and verification for the existing HOTL Gates A–C. Gate D and broad autonomy are explicitly out of scope.
**Source snapshot:** `088f6412000c98f061f3e856cda753089fb25273` on `codex/gate-c-preflight-hardening`, initially clean.
**Ending implementation commit:** `b76674685007b4fae311b6b99aae59dd479d5d71` (`Harden Gate C Shopify preflight and persisted state`). A later documentation-only commit finalizes this evidence record; it contains no implementation changes.

## Executive result

The repository is a stronger **local Gate C drill candidate**. Shopify persisted state is validated at the authoritative boundary and fails closed when malformed; Gate A money, ratio and fraction values have distinct types and deterministic formula/version checks; webhook receipt is distinguished from actual authoritative reconciliation; Shopify secret rotation has a finite operator-configured overlap and a separately evidenced revocation/grace phase; and staging readiness separates static configuration from opt-in, read-only probes while reporting ingress, worker and reconciliation independently.

No external Shopify staging proof was created. Static preflight correctly remains blocked. Gate A values remain owner-controlled and unknown; Gate B hosted controls remain unverified; Gate C remains external-staging-blocked. No Gate D capability was started, and no capability was promoted to M4.

## Repository and environment

- Workspace: `C:\Users\nahas\OneDrive\Desktop\HOTL`.
- Host: Windows PowerShell; Node `v25.9.0`; pnpm `10.17.1`; native PostgreSQL `18.3`.
- Branch: `codex/gate-c-preflight-hardening`.
- Starting commit: `088f641` (full hash is recoverable from the repository history).
- The retained `hotl-baseline-2026-09-24` tag was not changed. There is no configured Git remote.
- Source diff contains application code, tests and documentation only. Simulation state, workflow checkpoints, the kill journal and connector key were not staged or modified by the verification runs.
- No dependency was added. The existing owner-only, allowlisted Shopify development-store boundary and local simulation label remain in force.

## Verification

| Command | Result | Evidence boundary |
| --- | --- | --- |
| `pnpm lint` | **PASSED** | Repository ESLint. |
| `pnpm typecheck` | **PASSED**, 11 workspace tasks | Five results were reused from Turbo cache; changed TypeScript packages executed. |
| `pnpm test` | **PASSED**, 423 package tests and 11 root launcher/preflight tests; 25 regular-suite PostgreSQL cases skipped | Guardrail 278 passed, cockpit 31, connector SDK 49, commerce core 17, orchestrator 36, kill switch 12. Some unaffected package results came from Turbo cache. The 25 DB cases were run separately below. |
| Targeted Shopify and economics Vitest command | **PASSED**, 134 tests in 11 files | Provider, guarded price path, persisted-state corruption, OAuth, sync/restart, webhook lifecycle, rotation, routes, tenant isolation, pilot envelope and economics. |
| `node --test tests/staging-readiness.test.mjs` | **PASSED**, 9 tests | Static/active separation, safe redaction, modes and rotation config. |
| `pnpm build` | **PASSED**, 8 workspace tasks | Six results were cached; cockpit and orchestrator ran in this invocation. |
| `pnpm test:e2e` | **PASSED**, 11 browser tests | Isolated local simulation; no live provider writes. |
| `infra/scripts/test-database.ps1` | **PASSED** | Fresh disposable native PostgreSQL 18.3 loopback cluster; migration, workspace isolation, denied writes, append-only audit, kill latch and concurrent-spend checks. |
| `infra/scripts/test-runtime-ledger.ps1` | **PASSED**, 32 tests plus restart and restore | Fresh disposable native PostgreSQL 18.3; exact state/audit digest survived server restart and custom-format backup/restore to a second database. Restored RLS, grants, login bindings and append-only denial verified. The temporary cluster was stopped and cleaned by its own runner. |
| Docker database/restore runner | **UNRUN — DOCKER DAEMON UNAVAILABLE** | Docker CLI exists, but `docker info` could not contact the Docker Desktop engine. WSL has no installed distribution. The native PostgreSQL result is not a Docker result. |
| `node scripts/staging-readiness.mjs --json` | **BLOCKED as expected** | Static status `BLOCKED`; ingress, worker and reconciliation `BLOCKED`; active probes `NOT_RUN`; `externalStagingVerified: false`. The process exited nonzero because required staging configuration is absent. |
| Active preflight (`--active`) | **NOT RUN** | Callback, webhook, guardrail, database and emergency endpoints are not configured. No network probe was attempted. |
| `detect-secrets scan -n <changed files>` | **REVIEWED** | Findings were limited to commented sample database URLs in `.env.example` and synthetic test fixture values. No live credentials were found or copied into this package. Scanner hashes/values are intentionally omitted. |
| `git diff --check` | **PASSED** | Git emitted expected Windows CRLF warnings. Regular and CR-normalized diff summaries match; no broad line-ending normalization was applied. |

The regular `pnpm test` output reported **423 package passes**, including the new state-corruption and lifecycle tests, plus 11 direct root tests. Its 25 PostgreSQL integration skips are not counted as passes; those tests ran in the separate 32-test native runtime-ledger drill. Turbo reused unchanged connector SDK, commerce-core and kill-switch test results. No failing tests were removed or disabled.

## Sanitized static preflight blockers

The static script identified exactly these 19 missing configuration fields; it did not reveal credential values:

`HOTL_MODE`, `GUARDRAIL_WORKSPACE_ID`, `GUARDRAIL_DATABASE_URL`, `SUPABASE_URL`, `OWNER_USER_IDS`, `GUARDRAIL_AUTHORIZATION_VERSION`, `AGENT_JWT_KEYS`, `HOTL_PUBLIC_ORIGIN`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_WEBHOOK_ORIGIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STAGING_SHOPS`, `SHOPIFY_SCOPES`, `CONNECTOR_ENCRYPTION_KEY`, `KILL_SWITCH_URL`, `KILL_SWITCH_READ_TOKEN`, `HOTL_BACKUP_RESTORE_TARGET`, `SHOPIFY_RECONCILIATION_MODE`.

Active-only probe URLs are separately listed by the machine report. Static success is not staging verification. This run made no callback, Shopify or kill-switch request.

## Gate status

- **Gate A — PARTIALLY VERIFIED / OWNER INPUT REQUIRED.** AI research is advisory. Legal seller country, final product, actual supplier/shipping/payment/tax costs, capital, protected reserve, spend and exposure limits, refund authority, and stop thresholds remain `UNKNOWN`. No AI-selected hypothesis was approved as business authority.
- **Gate B — PARTIALLY VERIFIED / STAGING BLOCKED.** Local SQL migration, isolation, ledger restart and restore checks passed. Hosted identity, dedicated hosted database/workspace and RLS, least-privileged deployed runtime role, independent deployed emergency service/revocation, monitoring and external backup recovery remain unverified.
- **Gate C — LOCAL VERIFIED / EXTERNAL STAGING BLOCKED.** The owner has not set up the authorized Shopify development store/app or trusted public HTTPS callback/webhook endpoints. There was no actual OAuth install, token exchange, webhook delivery, subscription, provider write/read-back or Shopify-side secret revocation. No Shopify maturity was promoted to M4.

## Security and residual risks

- Critical Shopify records and OAuth references now receive strict runtime validation; unknown schema versions, malformed states, invalid links and impossible provider receipts deny without rewriting corrupt state.
- Provider mutations remain behind the authenticated deterministic guardrail and durable audit/idempotency path. Provider write credentials do not go to browser, orchestrator or ordinary agents. The local launcher continues to exclude the Shopify staging-store allowlist.
- Secret rotation follows Shopify's documented distinction between old-secret activity, explicit revocation and delayed webhook HMAC transition. HOTL requires a finite overlap, separately attested revocation time for the short grace period, constant-time HMAC comparison and raw-body verification. The operator must verify Shopify-side revocation and migrate tokens before removing the old secret.
- The final provider read→write gap remains an external-edit race because Shopify has no generic compare-and-swap for this price update. The preflight-read, policy check, provider re-read and final local/emergency check narrow but cannot eliminate it. Ordinary-merchant and autonomous price writes remain disabled.
- The price path holds local serialization through provider calls. HTTP and transaction timeout tests and the documented wait calculation apply to this one-variant drill only; they do not prove hard end-to-end latency or horizontal scaling.
- Worker/readiness reporting shows whether webhook ingress and reconciliation are configured for durable, manual-owner or disabled mode. A received webhook is not called reconciled until authoritative provider state has been synchronized and committed.
- Simulation receipts, fixtures, mocked revocation, active probes not run and this local database evidence are not external Shopify evidence.

## Official Shopify contract references

Reviewed 2026-09-28. See the repository's [dated contract review](../../docs/shopify-official-contract-review.md), [rotation procedure](../../docs/shopify-oauth.md) and [closed-loop limits](../../docs/shopify-closed-loop.md).

- [Manage app credentials and rotate secrets](https://shopify.dev/docs/apps/build/authentication-authorization/manage-credentials)
- [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Shopify Admin API versioning](https://shopify.dev/docs/api/usage/versioning)
- [Shopify development stores](https://shopify.dev/docs/apps/build/stores/development-stores)

## Continuation order

1. Owner verifies the commercial and legal facts and enters/approves actual Gate A limits in the authenticated cockpit; leave unresolved values `UNKNOWN`.
2. Provision isolated Gate B staging identity, database/RLS/grants, backup/restore, HTTPS routing, monitoring and an independently deployed emergency reader/kill service.
3. Create the authorized Shopify development store/app and trusted callback/webhook endpoints; place secrets only in their intended server-side secret stores.
4. Run sanitized static preflight, then explicitly request read-only active probes. Review every negative result before the owner-authorized Gate C drill.
5. Execute the bounded real OAuth/sync/webhook/price proof and denial/restart/revocation drills; only then assess external maturity. Keep Gate D out of scope until Gates A–C have real evidence.

## Source-control completion

The ending implementation commit is `b76674685007b4fae311b6b99aae59dd479d5d71`. A subsequent documentation-only commit finalizes this evidence file; it contains no implementation changes. The existing baseline tag and history are preserved. No remote push was available or attempted.
