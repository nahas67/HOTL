# Local build verification

## Current checkpoint — 2026-09-23

`pnpm test` passed **371 tests** (229 guardrail, 26 cockpit, 49 connectors,
17 commerce, 36 orchestrator, 12 kill service and 2 launcher), with 25 database
tests skipped in that command. Lint and typecheck passed. The new guardrail cases
exercise post-write commit failure without provider replay, owner cancellation of
an unclaimed proposal, and actual HTTP route authorization, OAuth callback and raw
webhook behavior using fixtures. Build status and log locations are in
[current evidence](continuation-verification.md). Browser and native PostgreSQL
drill outcomes below are from September 21 and were not rerun this date. No actual
merchant/provider interaction was performed.

## Latest continuation — 2026-09-22

The current [continuation evidence](continuation-verification.md) supersedes the
package totals below: **350 package/launcher tests**, **11 browser tests**, lint,
typecheck and production builds passed. The native PostgreSQL 18.3 drill passed
**32 tests**, real restart, dump/restore digest comparison and restored RLS/grant/
append-only denial checks. These database tests overlap the package configuration
suite and should not be added as unique test cases.

The modified Docker restore path is unrun because the Docker Linux daemon was
unavailable on September 21. Historical Docker successes below predate that change.
Shopify OAuth, sync, webhook handling and guarded development-store price execution
have local fixture coverage, with **no actual merchant interaction** yet. Hosted
identity, independent deployed revocation and production rollout remain unverified.

## Earlier evidence — retained without changing its dates

Updated on 2026-09-14 in the Windows workspace with Node.js 25.9.0 and pnpm 10.17.1. This record describes local simulation and compilation checks. No live financial provider was called, and no remote deployment or CI run is claimed. Earlier Medusa and normalized SQL results retain their original dates.

| Check | Result |
| --- | --- |
| Frozen root dependency install | Passed with pnpm install --frozen-lockfile --offline. |
| pnpm lint | Passed. |
| pnpm typecheck | Passed across all workspace packages. |
| pnpm test | **201 passed**: 92 guardrail, 49 connector SDK, 17 commerce, 18 orchestration/model-routing, 15 cockpit, 8 independent emergency-stop, and 2 launcher tests. The 25 database tests are explicitly skipped here and run separately below. Turbo may reuse unchanged successful results. |
| pnpm build | Passed: both Next.js production builds and workspace TypeScript checks. |
| pnpm test:e2e | **11 Chromium tests passed**: policy conflicts/20 domains, manual inventory conflicts, unsafe connection rejection, finance/mobile/theme, checkout destination, pause/margin denial, emergency confirmation, graph interrupt/resume, and expired-proposal replanning without approval. |
| Native PostgreSQL runtime ledger/engine drill | **32 passed** on 2026-09-14: 7 configuration and 25 actual database tests, including 11 actual guardrail-engine tests. A real PostgreSQL 18.3 restart preserved the full state/audit digest. See [runtime ledger evidence](postgres-runtime.md). |
| Optional Medusa staging adapter | Previously verified 2026-09-08: independent typecheck, 25 tests and JavaScript build. Unchanged in this expansion. Native mutations remain disabled until guarded workflows exist. |
| Native normalized migration/RLS drill | Previously verified on PostgreSQL 18.3, including independent concurrent reservation connections. See [infrastructure evidence](infra-verification.md). |
| Docker normalized migration/RLS drill | Passed on 2026-09-14 using disposable PostgreSQL 16, including competing reservations and denial assertions. |
| Docker runtime ledger/engine drill | **32 passed** on PostgreSQL 18.6 with Docker Desktop 29.5.3, a real restart preserving the state/audit digest and verified cleanup. The same 25 database cases also passed natively; these are separate environment runs, not distinct additional tests. Main CI now includes this drill; remote CI execution is unrun. |
| Visual inspection | Cockpit, Constitution, Integrations, Finance and storefront captured at 1440px and 390px widths; no page errors or horizontal page overflow. Images and release logs are in the ignored artifacts directory. |

The guardrail tests cover competing writers, request/actor/operation binding, refund splitting, immutable historical replay, restart integrity, missing storage, and Windows lock failures without state mutation or lock deletion. The file test uses a bounded retry window for expected lock contention; it still requires exactly four $25 reservations to fit the $100 ceiling. File snapshots are flushed before atomic replacement. Database state and audit entries commit in one transaction. Database failures never fall back to file or cached state, and a missing ledger requires explicit first initialization rather than a silent reset.

Workflow tests use the actual LangGraph runtime and guardrail HTTP API. They cover sequential Copilot approvals and supplier lines, checkpoint restart, lost campaign responses, previous-approval replay, Manual mode, owner edits and bounded stale replanning. LiteLLM routing tests use intercepted HTTP calls to verify scoped keys and model aliases; they do not prove real key issuance, billing or budget denial.

Connector tests use fixtures and intercepted requests. They cover canonical data, credential redaction, owner isolation, encrypted persistence, DNS/SSRF protections, bounded pagination/retries, signature checks, stale sync commits and preserved snapshots on provider failures. No real merchant account was connected in these tests. Read-only imports remain separate from simulated commerce state.

Browser tests run in independent .data/e2e-<id> directories, exclude external service configuration and preserve the working demo's state and emergency journal. The emergency-stop suite uses isolated journals and covers durable irreversible engagement, reauthentication, concurrent engagement, restart, corrupt state and incomplete revocation receipts. It does not prove deployed provider revocation.

## Infrastructure and production checks

Hosted Supabase Auth/RLS/Realtime, deployed poolers and LangGraph PostgresSaver; Medusa database startup and native guarded workflows; real Redis delivery; central payment execution and provider receipts; paid model/key provisioning and alerts; independent emergency deployment, provider revocation, queue draining, and the owner pilot remain unverified. The Docker drills have separate results in their runbooks.

See [remaining product scope](commerce-os-progress.md), [implementation limits](implementation-notes.md), and the [production runbook](production-runbook.md). Passing these local checks does not complete the broader Commerce OS specification or authorize live financial actions.
