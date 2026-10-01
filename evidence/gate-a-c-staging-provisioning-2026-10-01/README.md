# Gate A authorization + Gate C staging provisioning — 2026-10-01

**Result: STILL BLOCKED for external staging.** This checkpoint records the local safety/readiness work completed after the owner said Shopify staging is not set up. It does not claim a Shopify installation, live transaction, or production deployment.

## What changed

- Added owner-authenticated `GET /api/staging-readiness`. It calls the existing static checker and returns missing field names/reasons only; it never returns environment values or runs network probes.
- Added a Gate A/Gate C checklist to the Shopify panel. It distinguishes owner approval, configured settings, read-only probe results, and unverified external evidence. An AI recommendation is not represented as business authority.
- Hardened `/health/ready` to require the private PostgreSQL store and query the connected login's effective DDL privileges, elevated role membership, workspace binding, and application-object ownership. Readiness fails closed when those checks fail or cannot run.
- Tightened the active preflight contract: a guardrail response must provide live no-DDL evidence in addition to the existing workspace, persistence, role, and emergency-reader checks.

## Evidence and limits

The [sanitized static preflight](PREFLIGHT.json) was run against this shell process environment on 2026-10-01. It reports **19 missing fields**, `activeProbes: NOT_RUN`, and `externalStagingVerified: false`. It does not load a local `.env` file or inspect any hosted deployment or secret manager.

The Shopify CLI and Supabase CLI are not installed. The owner previously reported the Shopify development store/app are still not set up. No authenticated Shopify account, app, store, HTTPS callback/webhook, hosted owner identity, isolated staging database, independent staging emergency reader, or staging restore target was available to verify in this continuation. Docker is available for the local disposable database drill, but that does not provision Gate C infrastructure.

| Verification | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed, 11 Turbo tasks |
| `pnpm test` | Passed across all configured workspace test tasks; 13 root launcher/preflight tests passed. Guardrail: 280 passed, 26 database-only cases skipped in the ordinary run. |
| `pnpm build` | Passed, 8 Turbo tasks |
| `pnpm test:e2e` | Passed, 11 browser tests |
| `bash infra/scripts/test-runtime-ledger.sh` (Git Bash; `MSYS_NO_PATHCONV=1`) | Passed, 33 PostgreSQL 18.6 tests, restart, backup/restore digest, and restored RLS/grant checks. The drill used its uniquely labeled disposable container/network and ownership-checked cleanup. |
| `node --test tests/staging-readiness.test.mjs` | Passed, 11 staging-readiness tests |
| Cockpit focused tests | Passed, 7 tests |
| Active staging HTTPS probes | Not run; staging endpoints are absent |
| Shopify OAuth, webhook delivery, real price mutation, provider revocation | Not run |

The ordinary guardrail test skips are not counted as passing here; the separate PostgreSQL drill ran 33 cases on its own disposable database. The SQL drill did not use an existing application database. No provider write credential was supplied to this work, and no provider mutation was attempted.

## Owner actions required

1. Enter the actual legal seller country, pilot product/category, currency, evidence-backed costs/fees/tax, unit economics, capital/reserve, exposure/refund/spend limits, and stop thresholds in the authenticated Business Constitution cockpit. The owner must approve the saved version. AI may research or calculate proposals; it must not invent or approve these values.
2. Set up exactly one authorized Shopify development store and one dedicated API-only app with the required minimum scopes. Add the exact public HTTPS owner callback and webhook origins.
3. Provision isolated hosted identity/database/workspace, least-privilege runtime login, independent emergency control, secret storage, worker/reconciliation plan, and verified backup/restore target.
4. Run static configuration review and the explicit read-only HTTPS probes from that isolated staging environment. Keep the first real provider mutation as a separately controlled Gate C drill after its prerequisites and owner authority are verified.

Do not send Shopify, identity, database, tunnel, or emergency secrets through chat. Do not begin Gate D.

## ZIP snapshots

`HOTL-before-continuation-2026-10-01.zip` is the requested pre-work snapshot, created before the local changes above (**4.75 MB**). `HOTL-updated-share-2026-10-01.zip` is the current source package and includes this checkpoint. Both are verified below 500 MB. Each ZIP contains an in-archive `ZIP_CONTENTS.txt` manifest; generated dependencies/build caches, the local PostgreSQL drill cluster, local logs, and non-example secrets are excluded and remain untouched in the workspace.
