# Gate B2: isolated restore verification

Recorded 2026-09-24, 11:54 Asia/Kolkata, against source commit
`2c40573a43379510ae7a2a62ab65437e4cf3e97c`. This is local recovery
evidence for the simulation and disposable PostgreSQL runtime ledger. It is not
a production recovery certificate. Gate B2 is **incomplete** because the changed
Docker restore drill could not run without the Docker Desktop Linux daemon.

## Environment and boundaries

- Windows PowerShell 7.6.5; Node.js v25.9.0; pnpm 10.17.1; Vitest 3.2.7.
- Native PostgreSQL 18.3 at `C:\Program Files\PostgreSQL\18\bin`.
- All commands ran from `C:\Users\nahas\OneDrive\Desktop\HOTL`.
- The file and emergency tests used per-test temporary directories. The
  PostgreSQL runner created its own temporary cluster and a second restore
  database, both bound to a random loopback port. It did not read `DATABASE_URL`
  or connect to an existing database.
- The working files `data/guardrail-state.json`,
  `data/orchestrator-checkpoints.json`,
  `infra/kill-switch/data/events.jsonl`, and `.secrets/connectors.key` were not
  used as restore inputs or mutated by these drills. The first three existed in
  the workspace; the connector key path was absent when checked. No contents or
  secret values were copied into this evidence.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @hotl/guardrail-service exec vitest run test/file-initialization.test.ts test/restore.test.ts` | Exit 0; 13 tests passed in 2 files (10 initialization and 3 restore). |
| `pnpm --filter @hotl/orchestrator exec vitest run test/checkpointer.test.ts test/restore.test.ts test/graph.test.ts` | Exit 0; 29 tests passed in 3 files (11 checkpointer, 7 restore, 11 real graph). |
| `pnpm --filter @hotl/kill-switch exec vitest run test/restore.test.ts` | Exit 0; 4 tests passed in 1 file. |
| `./infra/scripts/test-runtime-ledger.ps1` | Exit 0; 32 PostgreSQL tests passed (7 configuration, 25 actual database), server restart, custom-format `pg_dump` / `pg_restore` to `hotl_runtime_restored`, digest equality and restored authorization checks all passed. |
| `docker info --format '{{.ServerVersion}}\|{{.OSType}}'` | Exit 1; Docker client could not connect to `npipe:////./pipe/dockerDesktopLinuxEngine` because the daemon pipe was absent. `bash infra/scripts/test-runtime-ledger.sh` was **not run**. |

The first three commands passed **46 tests** total. They are separate from the
32-test native PostgreSQL drill. These totals are not a full application suite
and do not add new unique tests to earlier records.

## Recovery assertions exercised

The file-ledger tests copied a quiescent source to separate backup and restore
paths, compared SHA-256 bytes, then started a fresh engine. The restored state,
audit prefix, actor-bound idempotency, replayed denial and persisted pause
remained intact. A fresh write while paused was denied. Corrupt audit history
failed startup with `AUDIT_INTEGRITY_FAILED` and did not alter the verified
backup. Missing initialized data and invalid initialization markers failed
closed.

The checkpoint tests preserved checkpoint values, pending writes and a saved
refund interrupt across a new `FileSaver` and actual LangGraph/HTTP runtime.
An unresolved owner approval still blocked the refund. After owner approval,
resuming and replaying the workflow did not add a second refund or mutation
audit. Truncated, unsupported-version and structurally corrupt checkpoint
files were rejected without overwriting the supplied bytes. The tests compare
SHA-256 digests of both data files and both `.initialized` markers, and preserve
the audit head. Their random fixture digest values were held only in the test
process and were not printed or retained after fixture cleanup.

The independent kill-journal test restored an engaged one-way latch and
incomplete `queues_halted`/`litellm_keys_revoked` receipts. A retry that still
failed remained recorded as failed after restart; no success or revocation was
fabricated. Tampered, truncated and missing journals were refused when
initialization was disabled. The journal fixture's SHA-256 was compared in
process; its value was not printed or retained after cleanup.

The native PostgreSQL test covered competing spend reservations, concurrent
first initialization, workspace binding and isolation, audit rollback,
historical replay, policy/product revision races, order/fulfillment/refund
persistence, pause/kill and database-outage denials. The runner then restarted
the actual server, restored a custom dump into a second database, and ran
`infra/scripts/verify-runtime-restore.sql`. That SQL confirmed FORCE RLS on
state and audit tables, both workspace policies, narrow runtime grants,
preserved login bindings, and denial of direct audit history updates.

## Exact database digests and cleanup

- Disposable cluster path:
  `C:\Users\nahas\AppData\Local\Temp\hotl-runtime-drill-d16e90a53e9a4174bf8560cbda885544`;
  loopback port `55398`.
- MD5 of all committed `workspace_state` and `audit_entries` JSONB rows before
  and after the real server restart: `f6269bc4b3125089f039d3a16df108d5`.
- MD5 of the same rows in the separately restored database:
  `f6269bc4b3125089f039d3a16df108d5`.
- SHA-256 of the custom-format PostgreSQL backup archive before and after
  restoration:
  `56AEAABF1DDCBE65B0CAAEE6514CBBEF6E5A6417E3FD959CF4E0E6B0C2DDEE05`.
- The runner reported server shutdown, and `Test-Path` confirmed the owned
  temporary cluster directory no longer existed after successful cleanup.

The digest includes deliberately corrupt tamper fixtures from the tests. Equal
digests show the drill preserved the database rows; they do not certify the
fixture database as an operational business snapshot. The native restore is
within one cluster, where login roles already exist. It does not test
cross-cluster role and secret recovery, hosted backups, recovery-time targets,
or an externally witnessed audit chain.

## Code and remaining evidence

`infra/scripts/test-runtime-ledger.ps1` now prints the verified state/audit MD5
and backup SHA-256 values after comparison so a future run can retain its own
evidence. This changed only drill output; it did not change migrations, state,
authorization or cleanup. The changed script itself passed in the native run
above.

The changed Docker restore stage is still unrun on this host. The older
2026-09-14 Docker result in `docs/postgres-runtime.md` predates its restore
stage and cannot close this gap. No hosted CI, Supabase, independently deployed
emergency service, actual provider revocation or production restore was tested.
See `docs/restore-verification.md`, `docs/postgres-runtime.md` and
`docs/continuation-verification.md` for prior evidence and recovery limits.
