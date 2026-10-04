-- Cost units are owner-configured integer units, never an invented currency budget.
create table kinnso_internal.service_budgets (
 service text not null check(service in('ai','maps','storage','jobs')),
 period date not null, unit text not null check(unit in('microcurrency','requests','bytes','jobs')),
 limit_units bigint not null check(limit_units between 0 and 9000000000000),
 spent bigint not null default 0 check(spent>=0), reserved bigint not null default 0 check(reserved>=0),
 stop_behavior text not null check(stop_behavior in('stop','degrade')),
 primary key(service,period)
);
create table kinnso_internal.budget_reservations (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id) on delete set null,actor_key text not null,
 request_id uuid not null, service text not null,period date not null,
 estimate bigint not null check(estimate between 1 and 9000000000000),actual bigint check(actual between 0 and 9000000000000),
 successful boolean,state text not null check(state in('reserved','settled','released')),
 created_at timestamptz not null default now(),finished_at timestamptz,
 unique(actor_key,request_id),foreign key(service,period) references kinnso_internal.service_budgets(service,period)
);
alter table kinnso_internal.service_budgets enable row level security;
alter table kinnso_internal.budget_reservations enable row level security;
revoke all on kinnso_internal.service_budgets,kinnso_internal.budget_reservations from public,anon,authenticated,service_role;

create function public.configure_kinnso_budget(p_owner_id uuid,p_service text,p_period date,p_unit text,p_limit bigint,p_stop_behavior text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_owner_id and deleted_at is null and (banned_until is null or banned_until<now())) or
 not exists(select 1 from public.kinnso_ops_members where user_id=p_owner_id and status='active' and role in('owner','admin')) then raise exception 'forbidden';end if;
 if p_service is null or p_service not in('ai','maps','storage','jobs') or p_period is null or p_unit is null or p_unit not in('microcurrency','requests','bytes','jobs') or p_limit is null or p_limit not between 0 and 9000000000000 or p_stop_behavior is null or p_stop_behavior not in('stop','degrade') then raise exception 'invalid_budget';end if;
 insert into kinnso_internal.service_budgets(service,period,unit,limit_units,stop_behavior) values(p_service,p_period,p_unit,p_limit,p_stop_behavior)
 on conflict(service,period) do update set limit_units=excluded.limit_units,stop_behavior=excluded.stop_behavior
 where kinnso_internal.service_budgets.unit=excluded.unit;
 if not found then raise exception 'budget_unit_conflict';end if;
end $$;
revoke all on function public.configure_kinnso_budget(uuid,text,date,text,bigint,text) from public,anon,authenticated;
grant execute on function public.configure_kinnso_budget(uuid,text,date,text,bigint,text) to service_role;

create function public.reserve_kinnso_budget(p_actor_id uuid,p_session_id uuid,p_service text,p_request_id uuid,p_estimate bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=p_actor_id; day date:=(now() at time zone 'UTC')::date;
 b kinnso_internal.service_budgets;r kinnso_internal.budget_reservations;
begin
 if not exists(select 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'unauthenticated';end if;
 -- Only the trusted server may choose an approved operation estimate after authenticating its actor.
 if not exists(select 1 from auth.sessions where id=p_session_id and user_id=actor and(not_after is null or not_after>now()))then raise exception 'unauthenticated';end if;
 if p_service is null or p_service not in('ai','maps','storage','jobs') or p_request_id is null or p_estimate is null or p_estimate not between 1 and 9000000000000 then raise exception 'invalid_budget';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into r from kinnso_internal.budget_reservations where actor_key=kinnso_internal.request_digest(actor::text) and request_id=p_request_id;
 if found then
  if r.service<>p_service or r.estimate<>p_estimate then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('allowed',false,'reason',case when r.state='reserved' then 'in_flight' else 'already_finished' end,'stopBehavior','stop');
 end if;
 select * into b from kinnso_internal.service_budgets where service=p_service and period=day for update;
 if not found then return jsonb_build_object('allowed',false,'reason','disabled','stopBehavior','stop');end if;
 if p_estimate>b.limit_units-b.spent-b.reserved then return jsonb_build_object('allowed',false,'reason','exhausted','stopBehavior',b.stop_behavior);end if;
 insert into kinnso_internal.budget_reservations(actor_id,actor_key,request_id,service,period,estimate,state)
 values(actor,kinnso_internal.request_digest(actor::text),p_request_id,p_service,day,p_estimate,'reserved') returning * into r;
 update kinnso_internal.service_budgets set reserved=reserved+p_estimate where service=p_service and period=day;
 return jsonb_build_object('allowed',true,'reservationId',r.id);
end $$;
revoke all on function public.reserve_kinnso_budget(uuid,uuid,text,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.reserve_kinnso_budget(uuid,uuid,text,uuid,bigint) to service_role;

create function public.finish_kinnso_budget(p_actor_id uuid,p_request_id uuid,p_reservation_id uuid,p_actual bigint,p_successful boolean,p_release boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r kinnso_internal.budget_reservations;target text;
begin
 -- Historical charges must reconcile even after the actor is banned or deleted. This service-only
 -- command authorizes accounting of an existing reservation, never a new provider operation.
 if p_request_id is null or p_reservation_id is null or p_release is null or
 (p_release and (p_actual is distinct from 0 or p_successful is distinct from false)) or
 (not p_release and (p_actual is null or p_actual not between 0 and 9000000000000 or p_successful is null)) then raise exception 'invalid_budget';end if;
 select * into r from kinnso_internal.budget_reservations where id=p_reservation_id and actor_key=kinnso_internal.request_digest(p_actor_id::text) and request_id=p_request_id for update;
 if not found then raise exception 'reservation_not_found';end if;
 target:=case when p_release then 'released' else 'settled' end;
 if r.state<>'reserved' then
  if r.state<>target or r.actual is distinct from p_actual or r.successful is distinct from p_successful then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('status',r.state);
 end if;
 -- Always debit actual cost, including an overrun and charged failed workflows.
 update kinnso_internal.service_budgets set reserved=reserved-r.estimate,spent=spent+p_actual where service=r.service and period=r.period;
 update kinnso_internal.budget_reservations set state=target,actual=p_actual,successful=p_successful,finished_at=now() where id=r.id;
 return jsonb_build_object('status',target);
end $$;
revoke all on function public.finish_kinnso_budget(uuid,uuid,uuid,bigint,boolean,boolean) from public,anon,authenticated;
grant execute on function public.finish_kinnso_budget(uuid,uuid,uuid,bigint,boolean,boolean) to service_role;

-- Durable measurement: only fixed dimensions and bounded numerical values, no private payloads.
create table kinnso_internal.telemetry_receipts (
 scope_digest text not null,request_id uuid not null,kind text not null,digest text not null,
 created_at timestamptz not null default now(),primary key(scope_digest,request_id,kind)
);
create table kinnso_internal.funnel_daily (
 day date not null,event_name text not null check(event_name in('guide_viewed','bookmark_saved','trip_created','trip_imported','return_visit','record_saved','guide_published','verified_outcome')),
 count bigint not null check(count>=0),primary key(day,event_name)
);
create table kinnso_internal.performance_samples (
 day date not null,metric text not null check(metric in('request','query','LCP','INP','CLS')),
 value double precision not null check(value>=0 and value<=600000)
);
create index kinnso_performance_day on kinnso_internal.performance_samples(day,metric);
create table kinnso_internal.scheduled_health (
 job text primary key check(job in('media_cleanup','telemetry_retention','notifications')),
 owner text not null default 'platform_operations',runbook text not null default '/docs/implementation/METRICS_AND_ALERTS.md#scheduled-jobs',
 last_success_at timestamptz,last_attempt_at timestamptz,last_status text check(last_status in('succeeded','failed'))
);
alter table kinnso_internal.telemetry_receipts enable row level security;
alter table kinnso_internal.funnel_daily enable row level security;
alter table kinnso_internal.performance_samples enable row level security;
alter table kinnso_internal.scheduled_health enable row level security;
revoke all on kinnso_internal.telemetry_receipts,kinnso_internal.funnel_daily,kinnso_internal.performance_samples,kinnso_internal.scheduled_health from public,anon,authenticated,service_role;

create function public.ingest_kinnso_telemetry(p_actor_id uuid,p_event jsonb,p_sample jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_day date:=(now() at time zone 'UTC')::date;scope text;digest text;prior text;
begin
 perform kinnso_internal.keys(p_event,array['name','mode','context','consent','requestId','anonymousSessionId','actorPseudonym']);
 if p_event->>'mode' is distinct from 'connected' or p_event->>'context' not in('traveller','creator') or p_event->>'context' is null or p_event->>'consent' is distinct from 'accepted' then return jsonb_build_object('accepted',false);end if;
 if p_event->>'name' is null or p_event->>'name' not in('guide_viewed','bookmark_saved','trip_created','trip_imported','return_visit','record_saved','guide_published','verified_outcome') or
 p_event->>'requestId' is null or (p_event->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
 (p_event ? 'actorPseudonym' and coalesce(p_event->>'actorPseudonym','')!~'^[0-9a-f]{64}$') or
 (p_event ? 'anonymousSessionId' and coalesce(p_event->>'anonymousSessionId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then raise exception 'invalid_telemetry';end if;
 if p_actor_id is not null then
  if not exists(select 1 from auth.users where id=p_actor_id and deleted_at is null and (banned_until is null or banned_until<now())) then raise exception 'unauthenticated';end if;
  if exists(select 1 from public.kinnso_ops_members where user_id=p_actor_id and status='active') then return jsonb_build_object('accepted',false);end if;
 elsif p_event->>'name'<>'guide_viewed' or p_event->>'anonymousSessionId' is null then return jsonb_build_object('accepted',false);end if;
 if p_event->>'name' in('guide_published','verified_outcome') and not exists(select 1 from public.creators where id=p_actor_id and status='active') then return jsonb_build_object('accepted',false);end if;
 if p_sample is not null then
  perform kinnso_internal.keys(p_sample,array['metric','value']);
  if p_sample->>'metric' is null or p_sample->>'metric' not in('request','query','LCP','INP','CLS') or jsonb_typeof(p_sample->'value') is distinct from 'number' or
  (p_sample->>'value')::double precision not between 0 and (case when p_sample->>'metric'='CLS' then 100 else 600000 end) then raise exception 'invalid_telemetry';end if;
 end if;
 scope:=kinnso_internal.request_digest(coalesce(p_actor_id::text,p_event->>'anonymousSessionId'));
 digest:=kinnso_internal.request_digest(jsonb_build_object('event',p_event,'sample',p_sample)::text);
 perform pg_advisory_xact_lock(hashtextextended(scope||(p_event->>'requestId'),0));
 select r.digest into prior from kinnso_internal.telemetry_receipts r where scope_digest=scope and request_id=(p_event->>'requestId')::uuid and kind='event';
 if found then
  if prior<>digest then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('accepted',true,'replayed',true);
 end if;
 insert into kinnso_internal.telemetry_receipts(scope_digest,request_id,kind,digest) values(scope,(p_event->>'requestId')::uuid,'event',digest);
 insert into kinnso_internal.funnel_daily(day,event_name,count) values(v_day,p_event->>'name',1) on conflict(day,event_name) do update set count=kinnso_internal.funnel_daily.count+1;
 if p_sample is not null then insert into kinnso_internal.performance_samples(day,metric,value) values(v_day,p_sample->>'metric',(p_sample->>'value')::double precision);end if;
 return jsonb_build_object('accepted',true,'replayed',false);
end $$;
revoke all on function public.ingest_kinnso_telemetry(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_kinnso_telemetry(uuid,jsonb,jsonb) to service_role;

create function public.record_kinnso_performance(p_request_id uuid,p_sample jsonb,p_mode text,p_context text,p_consent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare digest text;prior text;
begin
 if p_mode is distinct from 'connected' or p_context is null or p_context not in('traveller','creator','admin') then return jsonb_build_object('accepted',false);end if;
 perform kinnso_internal.keys(p_sample,array['metric','value']);
 if p_request_id is null or p_sample->>'metric' is null or p_sample->>'metric' not in('request','query','LCP','INP','CLS') or jsonb_typeof(p_sample->'value') is distinct from 'number' or
 (p_sample->>'value')::double precision not between 0 and (case when p_sample->>'metric'='CLS' then 100 else 600000 end) then raise exception 'invalid_telemetry';end if;
 -- Operational server timings have no personal dimensions. Browser field tracking needs consent.
 if p_sample->>'metric' in('LCP','INP','CLS') and (p_consent is distinct from 'accepted' or p_context='admin') then return jsonb_build_object('accepted',false);end if;
 digest:=kinnso_internal.request_digest(p_sample::text);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text||(p_sample->>'metric'),0));
 select r.digest into prior from kinnso_internal.telemetry_receipts r where scope_digest='performance' and request_id=p_request_id and kind=p_sample->>'metric';
 if found then
  if prior<>digest then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('accepted',true,'replayed',true);
 end if;
 insert into kinnso_internal.telemetry_receipts(scope_digest,request_id,kind,digest) values('performance',p_request_id,p_sample->>'metric',digest);
 insert into kinnso_internal.performance_samples(day,metric,value) values((now() at time zone 'UTC')::date,p_sample->>'metric',(p_sample->>'value')::double precision);
 return jsonb_build_object('accepted',true,'replayed',false);
end $$;
revoke all on function public.record_kinnso_performance(uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.record_kinnso_performance(uuid,jsonb,text,text,text) to service_role;

create function public.record_kinnso_scheduled_run(p_job text,p_successful boolean,p_started_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_job is null or p_job not in('media_cleanup','telemetry_retention','notifications') or p_successful is null or p_started_at is null or p_started_at>now()+interval '1 minute' then raise exception 'invalid_run';end if;
 insert into kinnso_internal.scheduled_health(job,last_success_at,last_attempt_at,last_status)
 values(p_job,case when p_successful then now() end,p_started_at,case when p_successful then 'succeeded' else 'failed' end)
 on conflict(job) do update set last_success_at=case when p_successful then greatest(kinnso_internal.scheduled_health.last_success_at,excluded.last_success_at) else kinnso_internal.scheduled_health.last_success_at end,
 last_attempt_at=greatest(kinnso_internal.scheduled_health.last_attempt_at,excluded.last_attempt_at),
 last_status=case when excluded.last_attempt_at>=kinnso_internal.scheduled_health.last_attempt_at then excluded.last_status else kinnso_internal.scheduled_health.last_status end;
end $$;
revoke all on function public.record_kinnso_scheduled_run(text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.record_kinnso_scheduled_run(text,boolean,timestamptz) to service_role;

create function public.get_kinnso_monitoring(p_day date default (now() at time zone 'UTC')::date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();result jsonb;
begin
 if not exists(select 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<now())) or
 not exists(select 1 from public.kinnso_ops_members where user_id=actor and status='active') then raise exception 'forbidden';end if;
 if p_day is null then raise exception 'invalid_day';end if;
 select jsonb_build_object(
 'day',p_day,
 'funnel',(select jsonb_agg(jsonb_build_object('name',n,'count',f.count,'status',case when f.count is null then 'unknown' else 'measured' end)) from unnest(array['guide_viewed','bookmark_saved','trip_created','trip_imported','return_visit','record_saved','guide_published','verified_outcome']) n left join kinnso_internal.funnel_daily f on f.day=p_day and f.event_name=n),
 'performance',(select jsonb_agg(jsonb_build_object('metric',m,'count',s.count,'status',case when s.count=0 then 'unknown' when s.count<20 then 'insufficient' else 'measured' end,'p75',case when s.count>=20 then s.p75 end)) from unnest(array['request','query','LCP','INP','CLS']) m cross join lateral(select count(*) count,percentile_disc(.75) within group(order by value) p75 from kinnso_internal.performance_samples where day=p_day and metric=m) s),
 'budgets',(select jsonb_agg(jsonb_build_object('service',s,'period',p_day,'unit',b.unit,'limit',b.limit_units,'spent',b.spent,'reserved',b.reserved,'stopBehavior',b.stop_behavior,'status',case when b.service is null then 'disabled' when b.spent>b.limit_units then 'overrun' when b.spent+b.reserved>=b.limit_units then 'exhausted' else 'available' end,
 'successfulFlows',case when b.service is not null then (select count(*) from kinnso_internal.budget_reservations r where r.service=s and r.period=p_day and r.state='settled' and r.successful) end,
 'costPerSuccessfulFlow',case when (select count(*) from kinnso_internal.budget_reservations r where r.service=s and r.period=p_day and r.state='settled' and r.successful)>0 then b.spent::numeric/(select count(*) from kinnso_internal.budget_reservations r where r.service=s and r.period=p_day and r.state='settled' and r.successful) end,
 'owner','platform_operations','runbook','/docs/implementation/METRICS_AND_ALERTS.md#cost-limits')) from unnest(array['ai','maps','storage','jobs']) s left join kinnso_internal.service_budgets b on b.service=s and b.period=p_day),
 'scheduledRuns',(select jsonb_agg(jsonb_build_object('job',j,'owner',coalesce(h.owner,'platform_operations'),'runbook',coalesce(h.runbook,'/docs/implementation/METRICS_AND_ALERTS.md#scheduled-jobs'),'lastSuccessAt',h.last_success_at,'lastAttemptAt',h.last_attempt_at,'lastStatus',h.last_status)) from unnest(array['media_cleanup','telemetry_retention','notifications']) j left join kinnso_internal.scheduled_health h on h.job=j)
 ) into result;
 return result;
end $$;
revoke all on function public.get_kinnso_monitoring(date) from public,anon,authenticated;
grant execute on function public.get_kinnso_monitoring(date) to authenticated;

create function public.prune_kinnso_telemetry() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from kinnso_internal.telemetry_receipts where created_at<now()-interval '7 days';
 delete from kinnso_internal.performance_samples where day<(now() at time zone 'UTC')::date-30;
 delete from kinnso_internal.funnel_daily where day<(now() at time zone 'UTC')::date-90;
end $$;
revoke all on function public.prune_kinnso_telemetry() from public,anon,authenticated;
grant execute on function public.prune_kinnso_telemetry() to service_role;
