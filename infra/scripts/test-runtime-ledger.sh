#!/usr/bin/env bash
# Disposable Docker database only. Never reads DATABASE_URL or uses an existing DB.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for binary in docker node pnpm; do
  command -v "$binary" >/dev/null || { printf 'Required command missing: %s\n' "$binary" >&2; exit 1; }
done
docker info >/dev/null

drill_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
container_name="hotl-runtime-drill-${drill_id}"
network_name="${container_name}-network"
container_id=''
network_id=''
ownership_label='hotl.runtime-drill'

# Disposable drill image, pinned by digest. Same reasoning and same mirror as
# infra/scripts/test-database.sh: GitHub-hosted runners are rate-limited against auth.docker.io,
# and public.ecr.aws/docker/library/postgres is byte-identical to Docker Hub's official image.
# `docker buildx imagetools inspect postgres:18-alpine` and
# `docker buildx imagetools inspect public.ecr.aws/docker/library/postgres:18-alpine` both resolve
# to sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873. CI uses this default
# and must not override it; HOTL_DRILL_POSTGRES_IMAGE is for local debugging only.
#
# Do not "simplify" this back to postgres:18-alpine.
postgres_image="${HOTL_DRILL_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873}"

# Only resources carrying this invocation's UUID may be removed. In particular,
# never remove a name that belonged to an existing container after a failed run.
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$container_id" ]]; then
    if [[ "$(docker inspect --format "{{index .Config.Labels \"${ownership_label}\"}}" "$container_id" 2>/dev/null)" == "$drill_id" ]]; then
      if (( status != 0 )); then docker logs --tail 100 "$container_id" >&2 || true; fi
      docker rm --force --volumes "$container_id" >/dev/null || status=1
    else
      printf 'Container ownership check failed; retained %s\n' "$container_id" >&2
      status=1
    fi
  fi
  if [[ -n "$network_id" ]]; then
    if [[ "$(docker network inspect --format "{{index .Labels \"${ownership_label}\"}}" "$network_id" 2>/dev/null)" == "$drill_id" ]]; then
      docker network rm "$network_id" >/dev/null || status=1
    else
      printf 'Network ownership check failed; retained %s\n' "$network_id" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Separate bridge network: no existing application containers are attached.
# Trust authentication is for this disposable test only. Docker publishes its
# randomly selected port exclusively on host loopback, never on 0.0.0.0.
network_id="$(docker network create --label "${ownership_label}=${drill_id}" "$network_name")"
container_id="$(docker create --name "$container_name" \
  --label "${ownership_label}=${drill_id}" --network "$network_id" \
  --publish '127.0.0.1::5432' \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_USER=hotl_runtime_drill \
  --env POSTGRES_DB=hotl_runtime_drill \
  "$postgres_image")
docker start "$container_id" >/dev/null

wait_for_database() {
  local attempt
  for (( attempt=0; attempt<60; attempt++ )); do
    # TCP readiness avoids the image's temporary initialization-only socket.
    if docker exec "$container_id" pg_isready --host 127.0.0.1 \
      --username hotl_runtime_drill --dbname hotl_runtime_drill >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'Disposable runtime database did not become ready.\n' >&2
  return 1
}
wait_for_database

binding="$(docker port "$container_id" 5432/tcp)"
if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
  printf 'Expected exactly one loopback port binding, got: %s\n' "$binding" >&2
  exit 1
fi
port="${BASH_REMATCH[1]}"
sql() {
  docker exec --interactive "$container_id" psql --no-psqlrc --no-password \
    --host 127.0.0.1 --username hotl_runtime_drill --dbname hotl_runtime_drill \
    --set ON_ERROR_STOP=1 "$@"
}

printf 'Disposable runtime ledger drill: %s (loopback port %s)\n' "$container_name" "$port"
sql --command 'SELECT version();'
sql < "$root/infra/supabase/migrations/202609090002_runtime_ledger.sql"
(
  cd "$root"
  # The test file provisions dedicated workspace LOGIN roles in this database.
  # Explicit URL and opt-in replace any inherited disposable-test configuration.
  HOTL_RUNTIME_TEST_DATABASE_URL="postgresql://hotl_runtime_drill@127.0.0.1:${port}/hotl_runtime_drill" \
  HOTL_RUNTIME_TEST_ALLOW_DISPOSABLE=1 \
    pnpm --filter @hotl/guardrail-service exec vitest run test/postgres-store.test.ts
)

# Real database restart, with all committed state and ledger rows in the digest.
# This includes the deliberately corrupt fixture; the drill never repairs it.
digest_sql='SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(s) ORDER BY workspace_id) FROM hotl_runtime.workspace_state s),(SELECT jsonb_agg(to_jsonb(a) ORDER BY workspace_id,sequence) FROM hotl_runtime.audit_entries a))::text)'
before="$(sql --tuples-only --no-align --command "$digest_sql")"
if [[ ! "$before" =~ ^[0-9a-f]{32}$ ]]; then
  printf 'Could not capture pre-restart persistence digest.\n' >&2
  exit 1
fi
docker restart --time 30 "$container_id" >/dev/null
wait_for_database
after="$(sql --tuples-only --no-align --command "$digest_sql")"
if [[ "$after" != "$before" ]]; then
  printf 'Persisted ledger changed across PostgreSQL restart.\n' >&2
  exit 1
fi
docker exec "$container_id" pg_dump --host 127.0.0.1 --username hotl_runtime_drill \
  --dbname hotl_runtime_drill --format custom --file /tmp/hotl-runtime-backup.dump
docker exec "$container_id" createdb --host 127.0.0.1 --username hotl_runtime_drill hotl_runtime_restored
docker exec "$container_id" pg_restore --host 127.0.0.1 --username hotl_runtime_drill \
  --dbname hotl_runtime_restored --exit-on-error /tmp/hotl-runtime-backup.dump
restored="$(docker exec "$container_id" psql --no-psqlrc --no-password --host 127.0.0.1 \
  --username hotl_runtime_drill --dbname hotl_runtime_restored --tuples-only --no-align --command "$digest_sql")"
if [[ "$restored" != "$before" ]]; then
  printf 'Restored state/audit differs from its backup source.\n' >&2
  exit 1
fi
docker exec --interactive "$container_id" psql --no-psqlrc --no-password --host 127.0.0.1 \
  --username hotl_runtime_drill --dbname hotl_runtime_restored --set ON_ERROR_STOP=1 \
  < "$root/infra/scripts/verify-runtime-restore.sql"
printf '%s\n' '[OK] Runtime ledger tests, restart, backup/restore digest and restored authorization checks passed.'
