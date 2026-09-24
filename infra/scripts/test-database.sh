#!/usr/bin/env bash
# Disposable Postgres only. Never points at DATABASE_URL or an existing database.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="hotl-sql-drill-${RANDOM}-$$"
docker info >/dev/null
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$container" -e POSTGRES_PASSWORD=hotl-disposable-test-only -e POSTGRES_DB=hotl postgres:16-alpine >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres -d hotl >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$container"; exit 1; fi
sql() { docker exec -i "$container" psql -X -U postgres -d hotl -v ON_ERROR_STOP=1 "$@"; }
sql < "$root/infra/postgres/bootstrap.sql"
sql < "$root/infra/supabase/migrations/202609070001_hotl.sql"
sql < "$root/infra/scripts/test-database.sql"
# Each call runs in a separate connection and transaction. Only one $60 reservation fits $100.
sql -c "set role hotl_guardrail; select public.reserve_ad_spend('00000000-0000-0000-0000-000000000002','marketing_agent','race-a',6000,'USD','concurrent-key-a');" &
first=$!
sql -c "set role hotl_guardrail; select public.reserve_ad_spend('00000000-0000-0000-0000-000000000002','marketing_agent','race-b',6000,'USD','concurrent-key-b');" &
second=$!
wait "$first"
wait "$second"
sql < "$root/infra/scripts/test-database-concurrency.sql"
printf '%s\n' 'Migration, owner isolation, write denial, audit immutability, refund escrow, kill latch, and concurrent spend tests passed.'
