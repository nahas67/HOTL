# Infrastructure verification record

## Continuation checkpoint — 2026-09-22

The current suite passes 12 independent kill-service tests, including the new
restore cases. Native PostgreSQL 18.3 passed 32 runtime-ledger/configuration tests
on September 21, restart, custom dump/restore, matching state/audit digest and
restored RLS/grant/append-only denial assertions. See
[runtime evidence](postgres-runtime.md) and [continuation evidence](continuation-verification.md).
The Docker Linux daemon was unavailable on September 21, so the updated Docker
restore runner is unrun. No independent hosted kill deployment, real provider
revocation or hosted Supabase validation is claimed.

## Historical checks

Updated on 2026-09-14 in the local Windows workspace. Native normalized-schema results retain their original 2026-09-08 date.

| Check | Result |
| --- | --- |
| `pnpm --filter @hotl/kill-switch test` | Passed: 8 tests, including reauthentication, typed confirmation, persistence/restart, main-down latch, receipt matching/retry, concurrent engage, corruption rejection and timestamp validation. |
| `pnpm --filter @hotl/kill-switch typecheck` | Passed. |
| Independent Docker daemon availability | Docker Desktop Linux engine available on 2026-09-14. |
| Container build and independently deployed image | Independent emergency-service image/deployment drill not run. |
| `bash infra/scripts/test-database.sh` | Passed on 2026-09-14 using its disposable PostgreSQL 16 container: migration, owner isolation, write denial, audit immutability, refund escrow, kill latch and competing reservations. |
| `./infra/scripts/test-database.ps1` | Passed on native PostgreSQL 18.3: migration, RLS and denial assertions, plus two independent reservation connections under `hotl_guardrail`. The isolated temporary cluster was stopped and its generated directory removed after the successful run. |
| Live Supabase RLS/Auth/Realtime integration | Not run; local shim and migration are not a live Supabase deployment. |
| LiteLLM real key issuance, budget rejection and alert delivery | Not run; no configured proxy/provider credentials. |
| Provider revocations and queue draining with main stack stopped | Not run on a deployed environment. Automated unreachable-hook drill asserts failed/unconfigured action results. |

The SQL drill validates migration application, two-owner RLS isolation, denial of
browser writes and financial RPCs, non-owner denial, spend reserve/replay/ceiling,
concurrent reservations, audit linkage and recomputed hashes, append-only mutation
denial, cumulative refund escrow, paid balance, owner approval, pause denial, and the
irreversible database latch. Both runners use the same migration and SQL assertions.
The Bash runner creates a disposable PostgreSQL 16 container. The Windows runner
creates a fresh cluster in a uniquely named temporary directory, binds it to a random
loopback port, and never uses an existing database or `DATABASE_URL`. Both concurrent
reservation calls completed; the SQL assertion confirmed exactly one reservation
and one durable denial when two $60 requests contend for the $100 ceiling.

To repeat the native Windows drill:

```powershell
./infra/scripts/test-database.ps1
# For a different PostgreSQL installation:
./infra/scripts/test-database.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\18\bin'
```

The native and PostgreSQL 16 container results establish local database behavior.
The newer private runtime ledger has its own [verification record](postgres-runtime.md).
Live Supabase integration, independently deployed kill-service behavior and real
provider revocation still require their separate drills.

Root application checks and browser validation are recorded separately by the main
build task. This record makes no claim that CI has run on a remote repository.
