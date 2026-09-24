# PostgreSQL runtime ledger

`PostgresRuntimeStateStore` in `apps/guardrail-service/src/stores/postgres.ts`
implements the guardrail engine's `RuntimeStateStore` interface. It stores the
existing versioned engine state in a private JSONB workspace ledger and mirrors
every audit entry into an append-only table in the same database transaction.
This is a compatibility persistence adapter, separate from the normalized domain
tables in migration `202609070001_hotl.sql` and LangGraph's checkpoint tables.

The application remains a local simulation. This adapter does not enable provider
writes, supply deployed safety evidence, or migrate an existing file ledger
automatically. Preserve existing data files and journals. An operator must plan and
verify any later import before selecting a different persistence backend.

## Contract and guarantees

The constructor accepts a server-owned `connectionString` and `workspaceId` UUID,
plus optional `maxPoolSize`, `connectionTimeoutMillis`,
`statementTimeoutMillis`, and `lockTimeoutMillis`. Defaults are four connections,
five seconds to connect or acquire a lock, and fifteen seconds per statement or
idle transaction. Pool size is bounded to twenty and timeouts to sixty seconds.
Do not derive the connection or workspace from browser or agent request data.

The HTTP server sets statement and idle-transaction timeouts to thirty seconds
for its runtime store, accommodating the bounded development-store provider
preflight/write/read-back inside the transaction. The standalone store defaults
above remain fifteen seconds; provider timeouts and durable dispatch claims are
separate controls.

- `read()` returns a consistent state snapshot, or `null` for a provisioned
  workspace that has never been initialized. Missing tables, unavailable storage,
  mismatched credentials, malformed state, or a broken audit chain throw.
- `transaction(callback)` takes a PostgreSQL advisory transaction lock for the
  workspace before reading state. This serializes independent clients, including
  concurrent first initialization when no row exists. The callback returns
  `{ state, result }`; the store reports that result only after `COMMIT` succeeds.
- A changed state must append an audit entry. Existing audit entries cannot be
  removed or rewritten, including through callback mutation of its input. An
  unchanged idempotent replay creates no new state revision or authorization.
- Callback failures, lock timeouts, audit insert failures, and deferred constraint
  failures roll back the complete state, including its idempotency record.
- SQL triggers enforce append-only audit rows, contiguous sequence numbers,
  previous-hash linkage, immutable workspace identity, monotonic revisions, and
  exact agreement between state and ledger before commit. The store additionally
  verifies SHA-256 hashes on every load and proposed write.
- There is no memory or file fallback, automatic schema creation, or automatic
  repair. `close()` shuts down the connection pool.

The JSONB state contains the complete audit history, so transaction cost grows
with that history. It is suitable for compatibility and correctness drills; large
production workloads require measured capacity planning and a reviewed migration
to normalized state. Database administrators can disable constraints or replace
data. Hash chaining detects the corrupt-hash fixture tested here; it is not an
external witness that defeats an administrator who rewrites an entire valid
history. Independent backups and audit exports remain necessary.

## Explicit database provisioning

The guardrail HTTP service selects this store when `GUARDRAIL_DATABASE_URL` is
configured, with the administrator-selected `GUARDRAIL_WORKSPACE_ID`. The database
backend replaces the file ledger; there is no fallback. An injected test engine
does not read these environment settings. The service closes its pool on shutdown.

An empty database fails startup by default. For a deliberately provisioned new
workspace only, set `GUARDRAIL_INITIALIZE_EMPTY_DATABASE=true` for the first startup,
verify the bootstrap audit, and remove that setting. It is not a recovery switch:
restore missing data from verified backups. Simulation initialization contains
clearly labeled sample records; live-mode initialization starts without them and
still cannot execute provider writes. Programmatic tests explicitly opt in using
`createEngine({ store, initializeEmptyStore: true })`.

Apply `infra/supabase/migrations/202609090002_runtime_ledger.sql` once using a
migration administrator. Runtime credentials must never have DDL, superuser,
`BYPASSRLS`, schema ownership, or role-administration privileges. The adapter rejects
superuser and `BYPASSRLS` logins during every transaction.

The migration creates the `NOLOGIN` role `hotl_runtime_guardrail` and a private
`hotl_runtime.workspace_bindings` table. An administrator provisions one login for
one workspace. For example, replacing the role and UUID with deployment-specific
values:

```sql
CREATE ROLE hotl_workspace_runtime LOGIN INHERIT
  NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
GRANT hotl_runtime_guardrail TO hotl_workspace_runtime;
GRANT CONNECT ON DATABASE your_database TO hotl_workspace_runtime;
INSERT INTO hotl_runtime.workspace_bindings (login_role, workspace_id)
VALUES ('hotl_workspace_runtime', '00000000-0000-0000-0000-000000000001');
```

Provision its password or workload identity through the deployment's secret
manager, outside SQL committed to the repository. Use this dedicated login in the
guardrail service's database URL. Do not use the Supabase service role, a browser
credential, or the migration administrator. Use a direct connection, or a pooler
that preserves the authenticated PostgreSQL `session_user` and transaction
semantics; compatibility with a deployed pooler has not been verified.

RLS requires both the private login binding and the transaction-local
`hotl.workspace_id` setting to agree. The runtime role cannot read or change the
binding table. Changing a session setting cannot expose another workspace. A
misbound store raises `WORKSPACE_BINDING_INVALID` before invoking a callback,
rather than presenting hidden data as an empty workspace.

The private schema is not a public PostgREST or browser API. Route all reads and
mutations through the authenticated guardrail service. Runtime agents receive no
database credentials. Keep emergency-stop storage and credentials in their
independent deployment; this schema does not replace the kill journal.

## Reproducible verification

Run the normal package checks from the repository root:

```powershell
pnpm --filter @hotl/guardrail-service typecheck
pnpm --filter @hotl/guardrail-service test
```

For the native Windows database drill, install PostgreSQL locally and run:

```powershell
./infra/scripts/test-runtime-ledger.ps1
# Or choose the installed PostgreSQL binary directory:
./infra/scripts/test-runtime-ledger.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\18\bin'
```

The script creates its own temporary cluster and database on a random loopback
port, applies the migration, provisions scoped test logins, and runs
`test/postgres-store.test.ts`. It never reads `DATABASE_URL` or connects to an
existing database. It restarts PostgreSQL and compares a digest of every committed
state and audit row. Cleanup stops only its own cluster and verifies the resolved
temporary directory and ownership marker before deleting it. Failed drill files
are retained for inspection. The temporary trust authentication is restricted to
the disposable loopback cluster and is not deployment configuration.

For Linux or a shell with Docker and the workspace's Node.js/pnpm installation:

```bash
bash infra/scripts/test-runtime-ledger.sh
```

The Docker script creates a uniquely labeled container on a dedicated bridge
network, publishes a random port only on `127.0.0.1`, and applies only migration
`202609090002_runtime_ledger.sql`. It invokes the same test file, with its own
`HOTL_RUNTIME_TEST_DATABASE_URL` and `HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE=1`.
The tests create passwordless scoped logins, so the disposable container uses
trust authentication; this must never be copied into deployment configuration.
It restarts the container and compares the same persisted state/audit digest.
Its exit trap checks ownership labels before removing its container, anonymous
volume, and network. Existing application databases, networks, containers, file
ledgers, and emergency journals are untouched. Failures print the container's
recent logs before cleanup.

The main CI workflow runs the Docker drill after the normal application checks.
It requires a working Docker daemon and can pull the official `postgres:18-alpine`
image. It uses no application database credentials or emergency deployment secrets.

Verified on 2026-09-14 with native PostgreSQL 18.3:

- Dedicated database drill: **32 passed** (7 configuration tests and 25 actual
  PostgreSQL tests), plus a real database restart with unchanged persisted data.
- Database coverage includes concurrent reservations, concurrent initialization,
  new-client persistence, callback and audit-write rollback, audit-prefix rewrite
  denial, missing-audit denial, hash corruption, idempotent replay, workspace
  isolation even after changing the session setting, direct SQL mutation denial,
  omitted-ledger commit denial, invalid login binding, lock timeout, and missing
  table failure without fallback.
- Actual guardrail engine coverage includes explicit first initialization,
  competing spend reservations, stale Constitution/product edits, immutable
  replay after policy changes, order and supplier fulfillment, owner-approved
  refunds, below-margin denial, audit-write rollback and retry, kill/unreachable
  emergency-state denial, and refusal to use cached state during a database outage.
- The regular package suite explicitly skips the 25 database tests when no
  disposable database is provided; it does not count them as passing.

Also verified on 2026-09-14 using Git Bash and Docker Desktop 29.5.3:

- Bash syntax check passed.
- Docker PostgreSQL **18.6**: **32 tests passed**, followed by a real container
  restart with an unchanged digest of all persisted state and audit rows.
- The container, its anonymous data volume, and its dedicated network were
  removed by the ownership-checked cleanup.

Not run: the hosted CI job, hosted Supabase or pooler integration, production
rollout, or provider execution and deployed emergency revocation drills.
The older normalized-schema Docker drill is separate:
`bash infra/scripts/test-database.sh`.

## Continuation restore drill — 2026-09-21

The native PostgreSQL 18.3 runner passed **32 tests** again, then restarted its
own server, created a custom-format `pg_dump`, and restored into the separate
`hotl_runtime_restored` database. The full state/audit digest matched the original
before restart and after restoration; the backup archive hash remained unchanged.
`verify-runtime-restore.sql` confirmed FORCE RLS, the two isolation policies,
restricted runtime grants, saved login bindings, and rejection of ordinary SQL
updates to restored audit history. The runner stopped its own server afterward.
Evidence: `artifacts/continuation-postgres-native.log`.

This is a same-cluster restore, where database roles already exist. It does not
prove cross-cluster role/secret recovery, a hosted backup system, recovery-time
objectives or restoration of an external audit anchor. The fixtures include
deliberately corrupt rows; the runner preserves their digest, rather than repairing
them or presenting the disposable database as a deployable business snapshot.

Both native and Docker scripts contain the restore stage. The updated Docker
script was **not executed** in this continuation because the Docker Desktop Linux
daemon was unavailable. The September 14 Docker evidence above covers its earlier
restart-only implementation. Hosted CI remains unrun.
