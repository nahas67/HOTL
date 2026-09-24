-- Runs against a disposable database prepared by test-database.sh or test-database.ps1.
insert into auth.users(id,email) values
('00000000-0000-0000-0000-000000000001','owner-one@example.test'),
('00000000-0000-0000-0000-000000000002','owner-two@example.test');
insert into public.owners(owner_id,display_name) select id,email from auth.users;
insert into public.guardrail_config(owner_id) select owner_id from public.owners;
insert into public.pause_state(owner_id) select owner_id from public.owners;
insert into public.kill_switch_state(owner_id) select owner_id from public.owners;
insert into public.commerce_orders(id,owner_id,customer_id,total_cents,paid_cents,payment_status)
values('test-order','00000000-0000-0000-0000-000000000001','customer',10000,10000,'paid');

set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}',false);
do $$ begin
  if (select count(*) from public.guardrail_config) <> 1 then raise exception 'RLS owner isolation failed'; end if;
  if exists(select 1 from public.guardrail_config where owner_id='00000000-0000-0000-0000-000000000002') then raise exception 'Other owner visible'; end if;
  begin
    update public.guardrail_config set daily_ad_spend_ceiling_cents=999999;
    raise exception 'Browser financial write unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','browser',1,'USD','browser-write-key');
    raise exception 'Browser financial RPC unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"customer"}}',false);
do $$ begin
  if exists(select 1 from public.guardrail_config) then raise exception 'Non-owner financial read unexpectedly succeeded'; end if;
end $$;
reset role;

create function pg_temp.expect_failure(statement text, fragment text) returns void language plpgsql as $$
declare observed text;
begin
  begin execute statement; exception when others then observed:=sqlerrm; end;
  if observed is null or position(fragment in observed)=0 then raise exception 'Expected failure %, got %',fragment,coalesce(observed,'success'); end if;
end $$;

select pg_temp.expect_failure('update public.guardrail_config set margin_floor_bps=3999','check constraint');
select pg_temp.expect_failure('update public.guardrail_config set margin_floor_bps=9901','check constraint');
select pg_temp.expect_failure('update public.guardrail_config set auto_refund_threshold_cents=2501','check constraint');

set role hotl_guardrail;
do $$ declare first jsonb; replay jsonb; denied jsonb; begin
  first:=public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','campaign',6000,'USD','reservation-key-1');
  replay:=public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','campaign',6000,'USD','reservation-key-1');
  denied:=public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','campaign-2',5000,'USD','reservation-key-2');
  if first->>'decision'<>'allow' or first is distinct from replay or denied->>'decision'<>'deny' then raise exception 'Spend reserve/replay/ceiling failed'; end if;
  perform public.begin_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent',(first->>'reservationId')::uuid);
  perform public.commit_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent',(first->>'reservationId')::uuid,5500,'confirmed-receipt','commit-key-1');
end $$;
reset role;
select pg_temp.expect_failure($q$select public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','campaign',6100,'USD','reservation-key-1')$q$,'IDEMPOTENCY_CONFLICT');
select pg_temp.expect_failure('update public.audit_log set payload=''{}''::jsonb','APPEND_ONLY');
select pg_temp.expect_failure('delete from public.audit_log','APPEND_ONLY');
select pg_temp.expect_failure('truncate public.audit_log','APPEND_ONLY');
select pg_temp.expect_failure('update public.idempotency_records set response=''{}''::jsonb','APPEND_ONLY');

insert into public.refunds(owner_id,order_id,amount_cents,requested_by,reason_code,status)
values('00000000-0000-0000-0000-000000000001','test-order',2000,'support_agent','damaged','reserved');
select pg_temp.expect_failure($q$insert into public.refunds(owner_id,order_id,amount_cents,requested_by,reason_code,status) values('00000000-0000-0000-0000-000000000001','test-order',1000,'support_agent','split-refund','reserved')$q$,'REFUND_OWNER_APPROVAL_REQUIRED');
select pg_temp.expect_failure($q$insert into public.refunds(owner_id,order_id,amount_cents,requested_by,reason_code,status) values('00000000-0000-0000-0000-000000000001','test-order',9000,'support_agent','over-balance','pending_approval')$q$,'REFUND_EXCEEDS_PAID_BALANCE');
insert into public.interrupts(id,owner_id,thread_id,category,payload,status,resolved_at,resolved_by)
values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','test-thread','refund_escrow','{"orderId":"test-order"}','approved',now(),'00000000-0000-0000-0000-000000000001');
insert into public.refunds(owner_id,order_id,amount_cents,requested_by,reason_code,status,interrupt_id)
values('00000000-0000-0000-0000-000000000001','test-order',1000,'support_agent','owner-approved','reserved','10000000-0000-0000-0000-000000000001');

update public.pause_state set paused=true where owner_id='00000000-0000-0000-0000-000000000001';
select pg_temp.expect_failure($q$select public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','paused',100,'USD','paused-spend-key')$q$,'PAUSED_OR_STATE_UNAVAILABLE');
update public.pause_state set paused=false where owner_id='00000000-0000-0000-0000-000000000001';
update public.kill_switch_state set engaged=true,engaged_at=now() where owner_id='00000000-0000-0000-0000-000000000001';
select pg_temp.expect_failure($q$update public.kill_switch_state set engaged=false,engaged_at=null where owner_id='00000000-0000-0000-0000-000000000001'$q$,'KILL_SWITCH_IRREVERSIBLE');
select pg_temp.expect_failure('delete from public.kill_switch_state','KILL_SWITCH_IRREVERSIBLE');
select pg_temp.expect_failure('truncate public.kill_switch_state','APPEND_ONLY');
select pg_temp.expect_failure($q$select public.reserve_ad_spend('00000000-0000-0000-0000-000000000001','marketing_agent','killed',100,'USD','killed-spend-key')$q$,'KILL_STATE_UNAVAILABLE_OR_ENGAGED');

do $$ begin
  if exists(select 1 from (select sequence,prev_hash,lag(hash,1,'') over(partition by owner_id order by sequence) as expected from public.audit_log) chain where prev_hash<>expected) then
    raise exception 'Audit chain linkage failed';
  end if;
  if exists(select 1 from public.audit_log where hash<>encode(extensions.digest(convert_to(jsonb_build_object('id',id,'owner_id',owner_id,'sequence',sequence,'created_at',created_at,'actor_type',actor_type,'actor_id',actor_id,'event_type',event_type,'payload',payload,'prev_hash',prev_hash)::text,'UTF8'),'sha256'),'hex')) then
    raise exception 'Audit hash verification failed';
  end if;
end $$;
