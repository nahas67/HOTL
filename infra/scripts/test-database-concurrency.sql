-- Both runner scripts issue the two reservations on independent connections first.
do $$ begin
  if (select count(*) from public.spend_reservations where owner_id='00000000-0000-0000-0000-000000000002' and status='reserved') <> 1 then
    raise exception 'Concurrent reservations exceeded the ceiling';
  end if;
  if (select count(*) from public.idempotency_records where owner_id='00000000-0000-0000-0000-000000000002' and response->>'decision'='deny') <> 1 then
    raise exception 'Concurrent loser was not durably denied';
  end if;
end $$;
