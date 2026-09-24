-- Local Postgres compatibility shim for the production migration. This is NOT Supabase Auth.
create schema if not exists auth;
create schema if not exists extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
