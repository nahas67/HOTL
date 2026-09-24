-- Only called against the second database in the disposable runtime drill.
-- No production connection strings, credentials or live state are used.
do $$
begin
  if current_database() <> 'hotl_runtime_restored' then
    raise exception 'This verification is restricted to the disposable restored database';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='hotl_runtime' and c.relname in ('workspace_state','audit_entries')
        and c.relrowsecurity and c.relforcerowsecurity) <> 2 then
    raise exception 'Restored row-level isolation is missing';
  end if;
  if (select count(*) from pg_policies where schemaname='hotl_runtime') <> 2 then
    raise exception 'Restored workspace policies are missing';
  end if;
  if has_table_privilege('hotl_runtime_guardrail','hotl_runtime.audit_entries','UPDATE')
     or has_table_privilege('hotl_runtime_guardrail','hotl_runtime.audit_entries','DELETE')
     or has_table_privilege('hotl_runtime_guardrail','hotl_runtime.workspace_bindings','SELECT') then
    raise exception 'Restored runtime privileges are too broad';
  end if;
  if not exists(select 1 from hotl_runtime.workspace_bindings) then
    raise exception 'Restored login bindings are missing';
  end if;
  -- Even an administrator cannot update restored history through normal SQL.
  begin
    update hotl_runtime.audit_entries set entry=entry;
    raise exception 'Restored append-only trigger failed';
  exception when check_violation then null;
  end;
end $$;
select 'Restored RLS, grants, login bindings and append-only denial verified' as result;
