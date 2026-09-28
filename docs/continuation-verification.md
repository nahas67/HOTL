# Production continuation evidence

Record updated 2026-09-23. Implementation and checks are local unless a row says
otherwise. At the September 23 record date the repository had no initial commit.
The September 24 local source baseline is commit
`f83938ff51a0f5531998ed11380d55863f55ad2f`, tagged
`hotl-baseline-2026-09-24`; see [Gate B1 evidence](../evidence/gate-b1-source-control/README.md).
Logs under `artifacts/` are local ignored evidence, not remote
CI artifacts. Package test totals may include Turbo reuse of unchanged results.

## Current checks — 2026-09-23

| Check | Result | Local evidence |
| --- | --- | --- |
| `pnpm test` | **383 passed**: guardrail 241, cockpit 26, connector 49, commerce 17, orchestrator 36, kill service 12, launcher 2. The 25 database tests in the regular suite were skipped and retain their separate native drill result below. | `artifacts/continuation-sep23-price-investigation-tests.log`. |
| `pnpm lint` | Passed after webhook changes. | Current local terminal run; earlier log at `artifacts/continuation-sep23-lint-final.log`. |
| `pnpm typecheck` | 11 workspace tasks passed after webhook changes. | Current local terminal run; earlier log at `artifacts/continuation-sep23-typecheck.log`. |
| `pnpm build` | Eight workspace tasks passed after webhook changes, including the cockpit production build. | Current local terminal run; earlier log at `artifacts/continuation-sep23-build.log`. |
| Shopify price recovery | 29 fixture tests passed: rejected claim commit makes no provider call; failed or unacknowledged result commit never resends after restart; pending cancellation is audited; owner investigation stays bound to current reconciliation and cannot erase an uncertain outcome. | `test/shopify-price.test.ts`, included above |
| Shopify HTTP routes | Ten actual Fastify injection tests passed: owner/agent denial, strict bodies/keys, successful audited proposal cancellation and unresolved investigation, browser-bound OAuth callback, owner filtering, raw signed webhook, restart replay and 2 MiB limit. Provider exchange was intercepted. | `test/shopify-routes.test.ts`, included above |
| Cockpit cancellation | 26 cockpit tests passed, including typed proxy cancellation and key forwarding. | Cockpit portion of full suite |
| Webhook registration | Nine new provider/service tests passed: exact topic and URI, bounded query, claimed one-time create, readback, lost response/restart block, existing-subscription race/conflict, re-provision after confirmed deletion, normal-store/kill/scope denial. Existing HTTP/proxy tests also cover route authentication and typed allowlisting. | `test/shopify-webhook-provider.test.ts`, `test/shopify-webhooks.test.ts`; local fixtures only. |
| Price investigation | Three new guardrail/HTTP tests passed: owner-only durable review, current-reconciliation binding, replay conflict, restart preservation, unchanged uncertainty lock, and no provider write. Typed cockpit proxy validation passes. Owner references are unverified annotations. | `test/shopify-price.test.ts`, `test/shopify-routes.test.ts`, cockpit proxy test; local fixtures only. |

A full suite run exposed two timing-sensitive identity fixture failures: excessive
JWT lifetime claims were calculated at test collection time, while tokens were
issued later. Under full-suite load they fell back inside the permitted lifetime.
The fixtures now calculate those claims from the token's own issue time. The
production identity rule was unchanged; the final complete suite passed.

The isolated 11-browser-test result and PostgreSQL 32-test backup/restore result below
are from September 21; neither test environment was rerun on September 23.

## Earlier continuation checks — 2026-09-21/22

| Capability/check | Environment and date | Result | Evidence/status |
| --- | --- | --- | --- |
| Full package and launcher tests | Windows, 2026-09-21 | 350 passed: guardrail 210, connectors 49, commerce 17, orchestration 36, cockpit 24, kill service 12, launcher 2. 25 DB tests explicitly skipped here. | `artifacts/continuation-tests.log`; locally verified. |
| Production builds | Windows, 2026-09-21 | Eight workspace tasks passed, including both Next.js builds. | `artifacts/continuation-build.log`; locally verified. |
| Browser behavior | Isolated Chromium and six local services, 2026-09-21 | 11 passed, including Shopify staging/unconfigured UI, checkout and denial/approval flows. | `artifacts/continuation-e2e.log`; simulation only. |
| Runtime ledger, engine and restart | Disposable native PostgreSQL 18.3, 2026-09-21 | 32 passed (7 config + 25 DB); persisted state/audit digest matched after restart. | `artifacts/continuation-postgres-native.log`; actual local DB interactions. |
| Database backup/restore | Same disposable PostgreSQL cluster, 2026-09-21 | Custom `pg_dump` restored to a separate database; state/audit digest and archive hash matched. FORCE RLS, policies, narrow grants, login bindings and append-only denial verified. | Same native log and `infra/scripts/verify-runtime-restore.sql`; local restore verified. |
| Docker restore runner | Windows host, 2026-09-21 | Unrun: Docker Desktop Linux daemon unavailable. | Changed Bash restore path requires its own execution; Sep 14 Docker results predate this change. |
| File/checkpoint/emergency recovery | Isolated local fixtures, included in package suite | Initialization markers, missing/corrupt state, restored workflow interrupts and irreversible kill journal exercised. | [Recovery record](restore-verification.md); local only. |
| Production identity | Signed fixture JWTs and actual local HTTP server | Workspace, owner/session, token lifetime, revocation and scope checks pass. | `test/identity.test.ts` and [identity contract](production-identity.md); hosted Supabase unverified. |
| Shopify OAuth/provider boundary | Intercepted requests and fixtures | 18 OAuth and 27 provider tests pass. Browser binding, rotation/replay, encryption and response checks covered. | Guardrail package output; external interaction unverified. |
| Shopify sync/webhooks | Local fixtures | Seven tests pass for durable inbox, retries, stale results and preserved snapshots. | `test/shopify-sync.test.ts`; actual subscription/delivery unverified. |
| Guarded price workflow | Durable local ledger and fixture provider | 17 tests pass, including duplicate dispatch, restart, ambiguous response, pause/kill, margin, stale revisions, compensation and normal-store denial. | `test/shopify-price.test.ts`; no real provider receipt. |
| Owner integration UI/proxy | Local unit tests and isolated browser suite | Cockpit tests/build and integration display pass. | Full logs above; real HTTPS OAuth cookie deployment unverified. |

Final rechecks on 2026-09-22 passed: `pnpm lint` (exit 0), `pnpm typecheck`
(11 successful workspace tasks) and `node --test tests/dev-env.test.mjs` (2 passed).
Logs: `artifacts/continuation-final-lint.log`,
`artifacts/continuation-final-typecheck.log` and
`artifacts/continuation-final-launcher.log`. The launcher recheck repeats two of
the 350 tests above; it is not an additional unique-test count.

## External evidence boundary

This continuation executed actual PostgreSQL server operations locally: migrations,
scoped logins, concurrent transactions, rejection assertions, server restart,
`pg_dump`, `pg_restore`, digest comparisons and restored authorization checks.
It did not contact a merchant store to install, refresh, subscribe, mutate or revoke.
There are no actual Shopify mutation receipts in this record. No hosted Supabase,
production pooler, deployed kill switch or real provider revocation was verified.

## Safety evidence and limits

The simulation launcher does not forward the development-store price allowlist.
The independent emergency service uses port 14200 only for isolated browser tests;
the default demo port remains 4200. The unrelated process occupying 4200 was not
stopped. Existing simulation data, encrypted key material and emergency journals
were retained. Tests use dedicated `.data/e2e-*` or disposable temporary state.

Failed early native drill attempts left temporary diagnostic directories. Their
owned servers were stopped; retained diagnostics are not production backups.
Successful native drill cleanup stopped its own server. Same-cluster restoration
does not prove cross-cluster role/secret recovery, hosted recovery objectives or
independently anchored audit integrity.

## Next evidence dependency

Run the [guarded development-store procedure](shopify-closed-loop.md) with an
authorized real development store, registered app, trusted HTTPS callback and
provisioned staging identity/storage/emergency plane. Retain request IDs and audit
links, verify denial and recovery against that environment, then assess capability
promotion. Normal-store writes and autonomous execution remain disabled.

## 2026-09-28 Gate C local preflight hardening

This dated entry supplements, and does not replace, the September 23 and 24 evidence above. Starting source commit: `088f641` on branch `codex/gate-c-preflight-hardening`; initial working tree was clean. The code/evidence change commit is recorded in the [dated evidence package](../evidence/gate-c-preflight-hardening-2026-09-28/README.md). No remote is configured. Runtime simulation data, workflow checkpoints, and the independent kill journal were not included in the source diff or modified by the drills.

| Check | Result | Scope and limit |
| --- | --- | --- |
| `pnpm lint` | **PASSED** | ESLint over the repository. |
| `pnpm typecheck` | **PASSED**: 11 workspace tasks | Five task results came from Turbo cache; all changed TypeScript packages executed. |
| `pnpm test` | **PASSED**: 423 package tests plus 11 launcher/preflight tests; 25 regular PostgreSQL integration cases skipped | Guardrail 278, cockpit 31, connector SDK 49, commerce core 17, orchestrator 36, kill switch 12. Connector, commerce and kill-switch results were reused from Turbo cache. The 25 DB cases were run separately against native PostgreSQL. |
| Targeted Shopify/economics suite | **PASSED**: 134 tests in 11 files | Includes provider, price, strict state corruption, OAuth, webhook lifecycle/restart, rotation, routes, tenant isolation and pilot-envelope/economics tests. |
| Staging preflight tests | **PASSED**: 9 direct tests; included in the root test run | Exercises static/active separation, redaction, worker modes and rotation configuration. |
| `pnpm build` | **PASSED**: 8 workspace tasks | Six task results were cached; cockpit and orchestrator executed. |
| `pnpm test:e2e` | **PASSED**: 11 browser tests | Isolated local simulation only. |
| `infra/scripts/test-database.ps1` | **PASSED** | Disposable native PostgreSQL 18.3; migrations, RLS/workspace ownership, unauthorized writes, audit append-only rules, kill latch and concurrent spend reservation. |
| `infra/scripts/test-runtime-ledger.ps1` | **PASSED**: 32 DB tests | Disposable native PostgreSQL 18.3; real restart preserved the state/audit digest; custom-format dump restored to a second database with matching digest and restored RLS/grant/login-binding/append-only checks. |
| Docker PostgreSQL restore runner | **UNRUN — DOCKER DAEMON UNAVAILABLE** | `docker info` could not contact the Docker Desktop engine; WSL also has no installed distribution. The native Windows drills above are separate evidence, not a Docker pass. |
| `node scripts/staging-readiness.mjs --json` | **BLOCKED as expected** | Static-only status `BLOCKED`; worker and reconciliation `BLOCKED`; active probes `NOT_RUN`; `externalStagingVerified: false`. It reports 19 missing staging configuration fields. No credential values are emitted. |
| `node scripts/staging-readiness.mjs --active --json` | **NOT RUN** | No staging endpoints are configured; active requests would not provide useful external evidence. |
| `detect-secrets scan -n <changed files>` | **REVIEWED — no live credentials found** | All flagged strings were commented local examples or synthetic test values; no secret material was copied into the evidence package. |
| `git diff --check` | **PASSED** | Only expected CRLF conversion warnings were emitted; regular and CR-normalized diff summaries match, so no repository-wide line-ending policy was introduced. |

The 19 static-preflight fields still missing are `HOTL_MODE`, `GUARDRAIL_WORKSPACE_ID`, `GUARDRAIL_DATABASE_URL`, `SUPABASE_URL`, `OWNER_USER_IDS`, `GUARDRAIL_AUTHORIZATION_VERSION`, `AGENT_JWT_KEYS`, `HOTL_PUBLIC_ORIGIN`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_WEBHOOK_ORIGIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STAGING_SHOPS`, `SHOPIFY_SCOPES`, `CONNECTOR_ENCRYPTION_KEY`, `KILL_SWITCH_URL`, `KILL_SWITCH_READ_TOKEN`, `HOTL_BACKUP_RESTORE_TARGET`, and `SHOPIFY_RECONCILIATION_MODE`. Active-only probe URLs are separately listed by the script and were not attempted.

Gate A is **PARTIALLY VERIFIED / OWNER INPUT REQUIRED**: no legal seller country, verified landed costs/tax treatment, capital/reserve, exposure caps, refund limit or stop thresholds were invented or approved. Gate B is **PARTIALLY VERIFIED / STAGING BLOCKED**: local persistence/security drills passed, but hosted identity, the isolated hosted workspace/database and RLS, independently deployed kill/revocation, external backup restore and monitoring remain unverified. Gate C is **LOCAL VERIFIED / EXTERNAL STAGING BLOCKED**: no authorized Shopify development store/app or trusted HTTPS endpoints exist, so no OAuth install, live webhook, provider price write, Shopify-side revocation or external evidence occurred. No Shopify capability was promoted to M4 and Gate D did not start.

The remaining material code risk is the Shopify owner/provider read→write race: Shopify exposes no generic compare-and-swap for this operation. HOTL retains the provider read, policy check, provider re-read, final local/emergency check and write sequence; this narrows but cannot eliminate an external edit in the final gap. Provider calls still run while the serialized transaction is held; documented wait budgets and timeout tests cover only this narrow one-variant workflow, not scale or hard end-to-end latency guarantees.
