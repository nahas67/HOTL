-- Explicit administrator migration; the application never runs schema DDL.
-- This compatibility ledger is separate from the normalized domain tables in 001.
begin;

create schema if not exists hotl_runtime;
revoke all on schema hotl_runtime from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'hotl_runtime_guardrail') then
    create role hotl_runtime_guardrail nologin noinherit;
  end if;
end $$;

-- A runtime login is bound by an administrator to exactly one workspace. The
-- session setting narrows access; changing it cannot broaden the login's scope.
create table hotl_runtime.workspace_bindings (
  login_role name primary key,
  workspace_id uuid not null
);
create function hotl_runtime.current_workspace() returns uuid
language sql stable security definer set search_path = pg_catalog as $$
  select workspace_id from hotl_runtime.workspace_bindings
  where login_role = session_user
    and workspace_id = nullif(current_setting('hotl.workspace_id', true), '')::uuid;
$$;

create table hotl_runtime.workspace_state (
  workspace_id uuid primary key,
  state jsonb not null check (
    jsonb_typeof(state) = 'object' and state ?& array['version','audit'] and state->'version' = '1'::jsonb
    and jsonb_typeof(state->'audit') = 'array' and jsonb_array_length(state->'audit') > 0
  ),
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table hotl_runtime.audit_entries (
  workspace_id uuid not null references hotl_runtime.workspace_state(workspace_id),
  sequence bigint not null check (sequence > 0),
  entry jsonb not null check (
    jsonb_typeof(entry) = 'object' and entry ?& array['id','hash','prevHash','actorType','actorId','eventType','createdAt']
    and entry->>'hash' ~ '^[0-9a-f]{64}$' and length(entry->>'id') > 0
  ),
  primary key (workspace_id, sequence)
);
create unique index runtime_audit_event_id on hotl_runtime.audit_entries(workspace_id, (entry->>'id'));

alter table hotl_runtime.workspace_state enable row level security;
alter table hotl_runtime.workspace_state force row level security;
alter table hotl_runtime.audit_entries enable row level security;
alter table hotl_runtime.audit_entries force row level security;
create policy runtime_state_workspace on hotl_runtime.workspace_state to hotl_runtime_guardrail
  using (workspace_id = hotl_runtime.current_workspace())
  with check (workspace_id = hotl_runtime.current_workspace());
create policy runtime_audit_workspace on hotl_runtime.audit_entries to hotl_runtime_guardrail
  using (workspace_id = hotl_runtime.current_workspace())
  with check (workspace_id = hotl_runtime.current_workspace());

create function hotl_runtime.reject_history_mutation() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Runtime audit history and workspace identity are append-only' using errcode = '23514';
end;
$$;
create trigger runtime_audit_immutable before update or delete on hotl_runtime.audit_entries
  for each row execute function hotl_runtime.reject_history_mutation();
create trigger runtime_audit_no_truncate before truncate on hotl_runtime.audit_entries
  for each statement execute function hotl_runtime.reject_history_mutation();
create trigger runtime_state_no_delete before delete on hotl_runtime.workspace_state
  for each row execute function hotl_runtime.reject_history_mutation();
create trigger runtime_state_no_truncate before truncate on hotl_runtime.workspace_state
  for each statement execute function hotl_runtime.reject_history_mutation();

create function hotl_runtime.check_state_update() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare prefix jsonb;
begin
  if new.workspace_id is distinct from old.workspace_id or new.revision <> old.revision + 1 then
    raise exception 'Workspace identity is immutable and revision must advance once' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb) into prefix
    from jsonb_array_elements(new.state->'audit') with ordinality
    where ordinality <= jsonb_array_length(old.state->'audit');
  if prefix is distinct from old.state->'audit' then
    raise exception 'Runtime audit prefix cannot change' using errcode = '23514';
  end if;
  if new.state is distinct from old.state and jsonb_array_length(new.state->'audit') <= jsonb_array_length(old.state->'audit') then
    raise exception 'Runtime state changes require an appended audit event' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger runtime_state_append_check before update on hotl_runtime.workspace_state
  for each row execute function hotl_runtime.check_state_update();

create function hotl_runtime.check_audit_append() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare last_sequence bigint; last_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 724026));
  select sequence, entry->>'hash' into last_sequence, last_hash from hotl_runtime.audit_entries
    where workspace_id = new.workspace_id order by sequence desc limit 1;
  if new.sequence <> coalesce(last_sequence, 0) + 1 or new.entry->>'prevHash' is distinct from last_hash then
    raise exception 'Runtime audit sequence or previous hash is invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger runtime_audit_append_check before insert on hotl_runtime.audit_entries
  for each row execute function hotl_runtime.check_audit_append();

create function hotl_runtime.check_state_audit_mirror() returns trigger
language plpgsql set search_path = pg_catalog as $$
declare expected jsonb; actual jsonb;
begin
  select state->'audit' into expected from hotl_runtime.workspace_state where workspace_id = new.workspace_id;
  select coalesce(jsonb_agg(entry order by sequence), '[]'::jsonb) into actual
    from hotl_runtime.audit_entries where workspace_id = new.workspace_id;
  if expected is null or expected is distinct from actual then
    raise exception 'Runtime state and append-only audit ledger must commit together' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger runtime_state_audit_mirror after insert or update on hotl_runtime.workspace_state
  deferrable initially deferred for each row execute function hotl_runtime.check_state_audit_mirror();
create constraint trigger runtime_audit_state_mirror after insert on hotl_runtime.audit_entries
  deferrable initially deferred for each row execute function hotl_runtime.check_state_audit_mirror();

revoke all on all tables in schema hotl_runtime from public;
revoke all on all functions in schema hotl_runtime from public;
grant usage on schema hotl_runtime to hotl_runtime_guardrail;
grant execute on function hotl_runtime.current_workspace() to hotl_runtime_guardrail;
grant select, insert on hotl_runtime.workspace_state to hotl_runtime_guardrail;
grant update (state, revision, updated_at) on hotl_runtime.workspace_state to hotl_runtime_guardrail;
grant select, insert on hotl_runtime.audit_entries to hotl_runtime_guardrail;

commit;
