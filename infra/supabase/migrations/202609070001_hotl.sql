-- Supabase production schema. Run as the migration administrator, never from a browser.
-- Monetary values are integer USD cents. UTC dates define daily spend windows.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'hotl_guardrail') then
    create role hotl_guardrail nologin noinherit;
  end if;
end $$;

create table public.owners (
  owner_id uuid primary key references auth.users(id),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  thread_id text not null,
  cycle text not null check (cycle in ('daily','weekly','monthly')),
  status text not null default 'running' check (status in ('running','interrupted','completed','failed','halted')),
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(owner_id, run_id), unique(owner_id, thread_id)
);

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  run_id uuid,
  agent_name text not null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  guardrail_decision text check (guardrail_decision in ('allow','deny','escalated')),
  status text not null default 'proposed' check (status in ('proposed','denied','reserved','executing','succeeded','failed','simulated')),
  created_at timestamptz not null default now(),
  foreign key(owner_id,run_id) references public.agent_runs(owner_id,run_id)
);

create table public.interrupts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  run_id uuid,
  thread_id text not null,
  category text not null check (category in ('spend','margin','refund_escrow','anomaly','other')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','modified','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_note text,
  modified_payload jsonb,
  resume_status text not null default 'not_requested' check (resume_status in ('not_requested','pending','resumed','failed')),
  foreign key(owner_id,run_id) references public.agent_runs(owner_id,run_id),
  unique(owner_id,id),
  check ((status = 'pending' and resolved_at is null and resolved_by is null) or status <> 'pending')
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  sequence bigint not null,
  actor_type text not null check (actor_type in ('agent','owner','system')),
  actor_id text not null,
  event_type text not null,
  payload jsonb not null,
  prev_hash text not null,
  hash text not null check (length(hash) = 64),
  created_at timestamptz not null,
  unique(owner_id,sequence)
);

create table public.kill_switch_state (
  owner_id uuid primary key references public.owners(owner_id),
  engaged boolean not null default false,
  engaged_at timestamptz,
  engaged_by text,
  reason text,
  actions_taken jsonb not null default '[]'::jsonb,
  external_revision bigint not null default 0,
  observed_at timestamptz not null default now(),
  check ((engaged and engaged_at is not null) or (not engaged and engaged_at is null))
);

create table public.pause_state (
  owner_id uuid primary key references public.owners(owner_id),
  paused boolean not null default false,
  reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.guardrail_config (
  owner_id uuid primary key references public.owners(owner_id),
  daily_ad_spend_ceiling_cents bigint not null default 10000 check (daily_ad_spend_ceiling_cents between 0 and 9007199254740991),
  margin_floor_bps integer not null default 4000 check (margin_floor_bps between 4000 and 9900),
  auto_refund_threshold_cents bigint not null default 2500 check (auto_refund_threshold_cents between 0 and 2500),
  daily_refund_pool_cents bigint not null default 10000 check (daily_refund_pool_cents between 0 and 9007199254740991),
  currency text not null default 'USD' check (currency = 'USD'),
  version bigint not null default 1,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.idempotency_records (
  owner_id uuid not null references public.owners(owner_id),
  key text not null check (length(key) between 8 and 200),
  actor_id text not null,
  operation text not null,
  request_hash text not null check (length(request_hash) = 64),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,key)
);

create table public.spend_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  agent_id text not null,
  campaign_id text not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  committed_cents bigint check (committed_cents between 0 and amount_cents),
  currency text not null default 'USD' check (currency = 'USD'),
  budget_date date not null,
  status text not null default 'reserved' check (status in ('reserved','executing','committed','released','expired')),
  external_receipt text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  committed_at timestamptz,
  unique(owner_id,id),
  unique(owner_id,external_receipt),
  check ((status = 'committed' and external_receipt is not null and committed_cents is not null and committed_at is not null) or status <> 'committed')
);

create table public.commerce_orders (
  id text not null,
  owner_id uuid not null references public.owners(owner_id),
  customer_id text not null,
  total_cents bigint not null check (total_cents between 0 and 9007199254740991),
  paid_cents bigint not null default 0 check (paid_cents between 0 and total_cents),
  currency text not null default 'USD' check(currency = 'USD'),
  payment_status text not null check (payment_status in ('pending','paid','partially_refunded','refunded','failed')),
  created_at timestamptz not null default now(),
  primary key(owner_id,id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  order_id text not null,
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  currency text not null default 'USD' check (currency = 'USD'),
  requested_by text not null,
  reason_code text not null,
  interrupt_id uuid,
  status text not null check (status in ('pending_approval','reserved','executing','succeeded','failed','rejected')),
  external_receipt text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(owner_id,order_id) references public.commerce_orders(owner_id,id),
  foreign key(owner_id,interrupt_id) references public.interrupts(owner_id,id),
  unique(owner_id,external_receipt),
  check (status <> 'succeeded' or (external_receipt is not null and completed_at is not null))
);

create table public.webhook_events (
  owner_id uuid not null references public.owners(owner_id),
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key(owner_id,provider,event_id)
);

create table public.action_outbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id),
  operation text not null,
  payload jsonb not null,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','executing','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(owner_id,idempotency_key)
);

create index agent_actions_owner_created on public.agent_actions(owner_id,created_at desc);
create index interrupts_owner_pending on public.interrupts(owner_id,created_at) where status = 'pending';
create index spend_owner_day on public.spend_reservations(owner_id,budget_date,status);
create index refunds_owner_order on public.refunds(owner_id,order_id,status);
create index outbox_pending on public.action_outbox(next_attempt_at) where status = 'pending';

-- Every exposed relation is protected. Browser sessions get SELECT only on their own rows.
do $$ declare relation text; begin
  foreach relation in array array['owners','agent_runs','agent_actions','interrupts','audit_log','kill_switch_state','pause_state','guardrail_config','idempotency_records','spend_reservations','commerce_orders','refunds','webhook_events','action_outbox'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('alter table public.%I force row level security',relation);
    execute format('revoke all on public.%I from anon, authenticated, service_role, hotl_guardrail',relation);
    execute format('grant select on public.%I to authenticated, hotl_guardrail, service_role',relation);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select auth.jwt()->''app_metadata''->>''role'') = ''owner'')',relation);
    execute format('create policy guardrail_read on public.%I for select to hotl_guardrail using (true)',relation);
  end loop;
  foreach relation in array array['agent_runs','agent_actions','interrupts','kill_switch_state','pause_state','guardrail_config','commerce_orders','refunds','webhook_events','action_outbox'] loop
    execute format('grant insert,update on public.%I to hotl_guardrail,service_role',relation);
    execute format('create policy guardrail_insert on public.%I for insert to hotl_guardrail with check (true)',relation);
    execute format('create policy guardrail_update on public.%I for update to hotl_guardrail using (true) with check (true)',relation);
  end loop;
end $$;
grant usage on schema public,extensions to hotl_guardrail;

create function public.block_immutable_mutation() returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'APPEND_ONLY: % cannot be updated, deleted, or truncated',TG_TABLE_NAME; end $$;
create trigger audit_immutable before update or delete on public.audit_log for each row execute function public.block_immutable_mutation();
create trigger audit_no_truncate before truncate on public.audit_log for each statement execute function public.block_immutable_mutation();
create trigger idempotency_immutable before update or delete on public.idempotency_records for each row execute function public.block_immutable_mutation();
create trigger idempotency_no_truncate before truncate on public.idempotency_records for each statement execute function public.block_immutable_mutation();

create function public.prevent_kill_reset() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if TG_OP = 'DELETE' or (old.engaged and (not new.engaged or new.engaged_at is distinct from old.engaged_at)) then
    raise exception 'KILL_SWITCH_IRREVERSIBLE';
  end if;
  return new;
end $$;
create trigger kill_latch before update or delete on public.kill_switch_state for each row execute function public.prevent_kill_reset();
create trigger kill_no_truncate before truncate on public.kill_switch_state for each statement execute function public.block_immutable_mutation();

create function public.append_audit(p_owner uuid,p_actor_type text,p_actor_id text,p_event text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog,public,extensions as $$
declare v_previous text := ''; v_sequence bigint := 1; v_at timestamptz := clock_timestamp(); v_id uuid := gen_random_uuid(); v_hash text;
begin
  -- Tenant-scoped transaction lock makes the previous hash + append atomic across every writer.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1307));
  select hash,sequence + 1 into v_previous,v_sequence from public.audit_log where owner_id = p_owner order by sequence desc limit 1;
  v_previous := coalesce(v_previous,''); v_sequence := coalesce(v_sequence,1);
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('id',v_id,'owner_id',p_owner,'sequence',v_sequence,'created_at',v_at,'actor_type',p_actor_type,'actor_id',p_actor_id,'event_type',p_event,'payload',p_payload,'prev_hash',v_previous)::text,'UTF8'),'sha256'),'hex');
  insert into public.audit_log(id,owner_id,sequence,actor_type,actor_id,event_type,payload,prev_hash,hash,created_at)
  values(v_id,p_owner,v_sequence,p_actor_type,p_actor_id,p_event,p_payload,v_previous,v_hash,v_at);
  return v_id;
end $$;

create function public.reserve_ad_spend(p_owner uuid,p_actor text,p_campaign text,p_amount_cents bigint,p_currency text,p_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public,extensions as $$
declare v_config public.guardrail_config; v_used bigint; v_remaining bigint; v_hash text; v_existing public.idempotency_records; v_response jsonb; v_id uuid; v_day date := (now() at time zone 'UTC')::date;
begin
  if p_currency <> 'USD' or p_amount_cents <= 0 or p_amount_cents > 9007199254740991 then raise exception 'INVALID_MONEY'; end if;
  if length(p_key) < 8 or length(p_key) > 200 or coalesce(length(p_actor),0) = 0 then raise exception 'INVALID_IDEMPOTENCY'; end if;
  select * into strict v_config from public.guardrail_config where owner_id = p_owner for update;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('actor',p_actor,'campaign',p_campaign,'amount_cents',p_amount_cents,'currency',p_currency)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.idempotency_records where owner_id = p_owner and key = p_key;
  if found then
    if v_existing.actor_id <> p_actor or v_existing.request_hash <> v_hash or v_existing.operation <> 'spend.reserve' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing.response;
  end if;
  if not exists(select 1 from public.kill_switch_state where owner_id=p_owner and not engaged) then raise exception 'KILL_STATE_UNAVAILABLE_OR_ENGAGED'; end if;
  if not exists(select 1 from public.pause_state where owner_id=p_owner and not paused) then raise exception 'PAUSED_OR_STATE_UNAVAILABLE'; end if;
  -- Executing reservations never expire automatically: a provider may have accepted an in-flight request.
  update public.spend_reservations set status='expired' where owner_id=p_owner and status='reserved' and expires_at <= now();
  select coalesce(sum(case when status='committed' then committed_cents else amount_cents end),0) into v_used
    from public.spend_reservations where owner_id=p_owner and budget_date=v_day and status in ('reserved','executing','committed');
  v_remaining := greatest(0,v_config.daily_ad_spend_ceiling_cents-v_used);
  if p_amount_cents > v_remaining then
    v_response := jsonb_build_object('decision','deny','reason','DAILY_CEILING_EXCEEDED','remainingDailyBudgetCents',v_remaining,'ceilingCents',v_config.daily_ad_spend_ceiling_cents);
  else
    insert into public.spend_reservations(owner_id,agent_id,campaign_id,amount_cents,budget_date)
      values(p_owner,p_actor,p_campaign,p_amount_cents,v_day) returning id into v_id;
    v_response := jsonb_build_object('decision','allow','reservationId',v_id,'remainingDailyBudgetCents',v_remaining-p_amount_cents,'ceilingCents',v_config.daily_ad_spend_ceiling_cents);
  end if;
  perform public.append_audit(p_owner,'agent',p_actor,'spend.reserve',v_response || jsonb_build_object('campaignId',p_campaign,'amountCents',p_amount_cents));
  insert into public.idempotency_records(owner_id,key,actor_id,operation,request_hash,response) values(p_owner,p_key,p_actor,'spend.reserve',v_hash,v_response);
  return v_response;
end $$;

create function public.begin_ad_spend(p_owner uuid,p_actor text,p_reservation uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_row public.spend_reservations;
begin
  perform 1 from public.guardrail_config where owner_id=p_owner for update;
  select * into strict v_row from public.spend_reservations where owner_id=p_owner and id=p_reservation for update;
  if v_row.agent_id <> p_actor then raise exception 'ACTOR_MISMATCH'; end if;
  if v_row.status <> 'reserved' or v_row.expires_at <= now() or v_row.budget_date <> (now() at time zone 'UTC')::date then raise exception 'INVALID_OR_EXPIRED_RESERVATION'; end if;
  if not exists(select 1 from public.kill_switch_state where owner_id=p_owner and not engaged) or not exists(select 1 from public.pause_state where owner_id=p_owner and not paused) then raise exception 'HALTED'; end if;
  update public.spend_reservations set status='executing' where id=p_reservation;
  perform public.append_audit(p_owner,'agent',p_actor,'spend.executing',jsonb_build_object('reservationId',p_reservation));
  return jsonb_build_object('status','executing','reservationId',p_reservation);
end $$;

create function public.commit_ad_spend(p_owner uuid,p_actor text,p_reservation uuid,p_confirmed_cents bigint,p_receipt text,p_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public,extensions as $$
declare v_row public.spend_reservations; v_existing public.idempotency_records; v_hash text; v_response jsonb;
begin
  perform 1 from public.guardrail_config where owner_id=p_owner for update;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('actor',p_actor,'reservation',p_reservation,'confirmed_cents',p_confirmed_cents,'receipt',p_receipt)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.idempotency_records where owner_id=p_owner and key=p_key;
  if found then
    if v_existing.actor_id <> p_actor or v_existing.operation <> 'spend.commit' or v_existing.request_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing.response;
  end if;
  select * into strict v_row from public.spend_reservations where owner_id=p_owner and id=p_reservation for update;
  if v_row.agent_id <> p_actor then raise exception 'ACTOR_MISMATCH'; end if;
  if v_row.status <> 'executing' then raise exception 'RESERVATION_NOT_EXECUTING'; end if;
  if p_confirmed_cents < 0 or p_confirmed_cents > v_row.amount_cents or coalesce(length(p_receipt),0)=0 then raise exception 'INVALID_PROVIDER_RECEIPT'; end if;
  -- Reconciliation is permitted after a kill: recording a completed charge does not authorize new spend.
  update public.spend_reservations set status='committed',committed_cents=p_confirmed_cents,external_receipt=p_receipt,committed_at=now() where id=p_reservation;
  v_response := jsonb_build_object('status','committed','reservationId',p_reservation,'confirmedCents',p_confirmed_cents);
  perform public.append_audit(p_owner,'agent',p_actor,'spend.committed',v_response || jsonb_build_object('providerReceipt',p_receipt));
  insert into public.idempotency_records(owner_id,key,actor_id,operation,request_hash,response) values(p_owner,p_key,p_actor,'spend.commit',v_hash,v_response);
  return v_response;
end $$;

create function public.enforce_refund_aggregate() returns trigger language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_paid bigint; v_allocated bigint; v_daily bigint; v_config public.guardrail_config;
begin
  if TG_OP = 'UPDATE' and (new.owner_id <> old.owner_id or new.order_id <> old.order_id or new.amount_cents <> old.amount_cents) then raise exception 'REFUND_IDENTITY_IMMUTABLE'; end if;
  if TG_OP = 'UPDATE' and old.status in ('succeeded','rejected') and new.status <> old.status then raise exception 'REFUND_TERMINAL_STATE'; end if;
  select * into strict v_config from public.guardrail_config where owner_id=new.owner_id for update;
  select paid_cents into strict v_paid from public.commerce_orders where owner_id=new.owner_id and id=new.order_id for update;
  select coalesce(sum(amount_cents),0) into v_allocated from public.refunds where owner_id=new.owner_id and order_id=new.order_id and id<>new.id and status in ('pending_approval','reserved','executing','succeeded');
  if new.status in ('pending_approval','reserved','executing','succeeded') and v_allocated+new.amount_cents > v_paid then raise exception 'REFUND_EXCEEDS_PAID_BALANCE'; end if;
  if new.status in ('reserved','executing','succeeded') then
    -- The threshold applies cumulatively to the order so several small refunds cannot bypass escrow.
    if v_allocated+new.amount_cents > v_config.auto_refund_threshold_cents and not exists(select 1 from public.interrupts where owner_id=new.owner_id and id=new.interrupt_id and category='refund_escrow' and status in ('approved','modified') and resolved_by=new.owner_id and resolved_at is not null and payload->>'orderId'=new.order_id) then raise exception 'REFUND_OWNER_APPROVAL_REQUIRED'; end if;
    select coalesce(sum(amount_cents),0) into v_daily from public.refunds where owner_id=new.owner_id and id<>new.id and status in ('reserved','executing','succeeded') and (created_at at time zone 'UTC')::date=(new.created_at at time zone 'UTC')::date;
    if v_daily+new.amount_cents > v_config.daily_refund_pool_cents then raise exception 'REFUND_POOL_EXCEEDED'; end if;
  end if;
  return new;
end $$;
create trigger refund_aggregate before insert or update on public.refunds for each row execute function public.enforce_refund_aggregate();

create function public.audit_service_mutation() returns trigger language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_owner uuid; v_row jsonb;
begin
  if TG_OP='UPDATE' and new.owner_id<>old.owner_id then raise exception 'OWNER_IMMUTABLE'; end if;
  -- Rule 2 covers every successful mutation, so DELETE is journalled too. A DELETE trigger has
  -- no NEW record: reading `new` would journal an empty row and lose the deleted state.
  if TG_OP='DELETE' then v_owner := old.owner_id; v_row := to_jsonb(old);
  else v_owner := new.owner_id; v_row := to_jsonb(new); end if;
  perform public.append_audit(v_owner,'system',session_user,TG_TABLE_NAME || '.' || lower(TG_OP),jsonb_build_object('row',v_row,'databaseRole',current_setting('role',true)));
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
do $$ declare relation text; begin
  foreach relation in array array['agent_runs','agent_actions','interrupts','kill_switch_state','pause_state','guardrail_config','commerce_orders','refunds','webhook_events','action_outbox'] loop
    execute format('create trigger audit_service_mutation after insert or update or delete on public.%I for each row execute function public.audit_service_mutation()',relation);
  end loop;
end $$;

-- SECURITY DEFINER routines are never callable by browser roles or PUBLIC.
revoke all on function public.append_audit(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_ad_spend(uuid,text,text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.begin_ad_spend(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.commit_ad_spend(uuid,text,uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.enforce_refund_aggregate() from public,anon,authenticated;
revoke all on function public.block_immutable_mutation() from public,anon,authenticated;
revoke all on function public.prevent_kill_reset() from public,anon,authenticated;
revoke all on function public.audit_service_mutation() from public,anon,authenticated;
-- Only the three spend RPCs are callable by the service roles. append_audit is deliberately
-- NOT granted: all four of its call sites are inside SECURITY DEFINER code that already runs
-- with definer rights, so granting it would let any holder of the guardrail login append a
-- forged, hash-chain-valid, irreversible audit row for any owner (rule 2).
grant execute on function public.reserve_ad_spend(uuid,text,text,bigint,text,text),public.begin_ad_spend(uuid,text,uuid),public.commit_ad_spend(uuid,text,uuid,bigint,text,text) to hotl_guardrail,service_role;
revoke all on function public.append_audit(uuid,text,text,text,jsonb) from hotl_guardrail,service_role;

-- Realtime emits only the rows visible to each authenticated owner's SELECT policy.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.interrupts,public.agent_actions,public.agent_runs;
  end if;
end $$;
commit;
