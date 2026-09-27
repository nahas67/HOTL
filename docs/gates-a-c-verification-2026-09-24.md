# Gates A–C implementation checkpoint — 2026-09-24

This is a local engineering checkpoint for the [implementation mandate](gates-a-c-implementation-mandate.md). It does **not** certify real commerce, an external Shopify connection, a hosted deployment, or production readiness. The owner's current answer leaves every pilot business and risk value `UNKNOWN`; the authorized Shopify development store, development app and trusted HTTPS callback/webhook endpoints are not set up.

**Implementation source commit:** `52aaaf9e4b5a020c1c718aa895db0c53f942e12f` (`Add Gate A envelope and Gate B/C safeguards`). The verification changes below were run on that source tree before its commit.

## Gate decisions

| Gate | Current result | Evidence and missing condition |
| --- | --- | --- |
| A — business and risk envelope | **PARTIAL / OWNER INPUT REQUIRED** | Typed pilot draft, provenance, owner approval, version/digest invalidation, stop-rule validation, cockpit editor and fail-closed Shopify price path are locally tested. No actual country, product, currency, economics, capital, reserve, spend/exposure/refund caps or stop thresholds have been supplied or approved. |
| B — trusted execution foundation | **PARTIAL / STAGING BLOCKED** | Local source baseline, guarded state preservation, file/checkpoint/kill restore, native PostgreSQL restart/restore and cross-workspace HTTP denial are evidenced. No deployed owner identity, dedicated staging database/workspace, public trusted HTTPS ingress, independently deployed emergency reader, hosted restore or actual RLS deployment has been proven. Changed Docker restore drill is unrun because the Docker Desktop Linux daemon is unavailable. |
| C — first Shopify external proof | **UNVERIFIED / BLOCKED** | Official API contracts were reviewed; local webhook-secret rotation and a second pre-write provider read are tested. Real OAuth, sync, webhook, mutation, receipt, reconciliation, retry, race, uncertainty, compensation, restart, emergency denial and audit against Shopify have not run. See the [empty external evidence ledger](../evidence/gate-c-first-shopify-proof/README.md). |

The independent one-way emergency kill and simulation boundary remain in force. Live financial adapters still fail closed. The owner-only development-store price exception still requires its store allowlist, provider development-store attestation, authenticated owner, durable one-use claim, fresh policy/kill checks and approved pilot envelope. Ordinary merchant and autonomous price writes remain disabled. Shopify has no conditional variant-price compare-and-swap; the second pre-write read narrows but does not eliminate the final read-to-write race.

## Code and evidence added

- The versioned Constitution now stores a complete typed pilot draft with explicit unknowns and per-field provenance/evidence references. Owner-only approval stamps the current version and draft digest. Any Constitution edit invalidates approval. Approval denies incomplete or estimated inputs, non-owner capital limits, conflicting existing ceilings, missing mandatory stop rules, unsupported enabled stop-rule signals and a non-USD pilot until deterministic currency conversion exists. Local Shopify price proposal and dispatch both require valid current approval and measurable stop conditions.
- The cockpit displays the draft, missing-input list, evidence/source fields, units for stop thresholds and separate save/approve actions. Its ordinary Constitution save excludes the pilot envelope.
- The Shopify webhook verifier can accept a distinct previous app secret for an explicitly bounded one-hour rotation window. Provider preflight now reads the variant a second time and rechecks policy/kill before one price write. Changed external pre-state returns a denial without a provider mutation. This remains a local test, not provider proof.
- A static staging preflight checks the shape of environment, workspace, identity, HTTPS, app, encryption and emergency configuration without echoing credential values. It blocks the current simulation configuration; a future static pass would still need deployed verification.
- New local cross-workspace tests exercise signed foreign-workspace denial and same-workspace Shopify owner filtering. Existing and new restore evidence is recorded separately in [Gate B restore](../evidence/gate-b-restore/README.md), [isolation](../evidence/gate-b-isolation/README.md) and [staging preflight](../evidence/gate-b-staging-readiness/README.md).
- The [Shopify official contract review](shopify-official-contract-review.md) records the 2026-07 mutation, development-store check, shop-scoped webhook, HMAC/secret-rotation, OAuth/token and API-limit findings. No official review result is counted as an actual provider operation.

## Verification run

All commands below ran from the repository root on Windows on 2026-09-24 after the implementation edits, except where another location or earlier source revision is stated.

| Command | Actual result |
| --- | --- |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed, 11 Turbo tasks. |
| `pnpm test` | Passed: 6 root launcher/preflight tests; 257 guardrail, 31 cockpit, 49 connector, 17 commerce, 36 orchestrator and 12 kill-switch tests. **408 passed total** across distinct suites. The 25 PostgreSQL tests in the regular guardrail run were skipped because no database was supplied to that run; they are not counted as passes. |
| `pnpm build` | Passed, 8 Turbo tasks. |
| `pnpm test:e2e` | Passed, 11 browser tests against an isolated local simulation instance. These do not exercise the new pilot form against a real provider. |
| `pnpm --filter @hotl/guardrail-service exec vitest run test/pilot-envelope.test.ts test/shopify-price.test.ts test/shopify-tenant-isolation.test.ts` | Passed, 43 targeted tests. These overlap the 257 guardrail tests above and are not added to the full-suite total. |
| `./infra/scripts/test-runtime-ledger.ps1` | Passed in the independent Gate B restore drill: 32 native PostgreSQL tests plus restart, same-cluster dump/restore, equal state/audit digests and restored authorization/RLS checks. The exact digest and environment are in the restore evidence. This drill ran against the prior baseline revision; no database migration or runtime-ledger code changed during this continuation. |
| `docker info --format '{{.ServerVersion}}\|{{.OSType}}'` | Failed to connect to the Docker Desktop Linux daemon; `bash infra/scripts/test-runtime-ledger.sh` remains **UNRUN**. |
| `node scripts/staging-readiness.mjs` | Blocked against current configuration as intended; no provider operation was attempted. |
| `detect-secrets scan --no-verify` on the 37 staged files | Three candidate-bearing paths on first pass; manual review identified only commented localhost/example database URLs and clearly synthetic test secrets. A second pass excluding comments and named fixture/test lines found only the same two classes of candidates; no live credential was identified. |
| `git diff --cached --check` | Passed; no whitespace errors in the staged patch. |

The regular test command may replay Turbo cache entries; its 408-pass result includes both executed and cached package results. Relevant changed guardrail/cockpit tests were also run directly. The browser drill uses isolated `.data/e2e-*` paths. No working ledger, checkpoint, emergency journal or connector key was used as a fixture or reset. The native PostgreSQL drill uses a disposable loopback cluster; it is not hosted restore evidence.

## Freeze boundary

Gate C external evidence is absent, so no Shopify capability receives an external-staging maturity promotion. The next dependent work is owner-approved Gate A values and a separate authorized Shopify development-store/staging setup, followed by the actual Gate B/C drill. Gate D — one real supervised commerce cycle — remains out of scope until Gates A–C are genuinely evidenced and committed.
