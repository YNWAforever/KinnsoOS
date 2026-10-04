-- One USD ceiling shared by AI, scan, maps, Storage and jobs. Existing daily/unit budgets remain unchanged.
-- No rates are invented, no configuration is seeded, and no provider is enabled by this migration.
create table kinnso_internal.monthly_cost_limits (
 month date primary key check(month=date_trunc('month',month)::date),
 limit_usd_micros bigint not null check(limit_usd_micros between 0 and 5000000),
 spent_usd_micros bigint not null default 0 check(spent_usd_micros>=0),
 reserved_usd_micros bigint not null default 0 check(reserved_usd_micros>=0),
 rates jsonb not null check(jsonb_typeof(rates)='object')
);
create table kinnso_internal.monthly_cost_reservations (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id) on delete set null,
 actor_key text not null,request_id uuid not null,service text not null check(service in('ai','scan','maps','storage','jobs')),
 month date not null references kinnso_internal.monthly_cost_limits(month),rate_version text not null,
 estimate_usd_micros bigint not null check(estimate_usd_micros between 1 and 9000000000000),
 actual_usd_micros bigint check(actual_usd_micros between 0 and 9000000000000),
 successful boolean,state text not null check(state in('reserved','settled','released')),
 created_at timestamptz not null default now(),finished_at timestamptz,unique(actor_key,request_id)
);
create index kinnso_monthly_cost_service on kinnso_internal.monthly_cost_reservations(month,service) include(actual_usd_micros,successful) where state='settled';
alter table kinnso_internal.monthly_cost_limits enable row level security;
alter table kinnso_internal.monthly_cost_reservations enable row level security;
revoke all on kinnso_internal.monthly_cost_limits,kinnso_internal.monthly_cost_reservations from public,anon,authenticated,service_role;

create function public.configure_kinnso_monthly_cost_limit(p_owner_id uuid,p_month date,p_limit_usd_micros bigint,p_rates jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare rate record;
begin
 if not exists(select 1 from auth.users where id=p_owner_id and deleted_at is null and(banned_until is null or banned_until<now())) or
 not exists(select 1 from public.kinnso_ops_members where user_id=p_owner_id and status='active' and role in('owner','admin')) then raise exception 'forbidden';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_limit_usd_micros is null or p_limit_usd_micros not between 0 and 5000000 or jsonb_typeof(p_rates) is distinct from 'object' then raise exception 'invalid_budget';end if;
 for rate in select key,value from jsonb_each(p_rates) loop
  if rate.key not in('ai','scan','maps','storage','jobs') or jsonb_typeof(rate.value)<>'string' or (rate.value#>>'{}')!~'^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$' then raise exception 'invalid_budget';end if;
 end loop;
 insert into kinnso_internal.monthly_cost_limits(month,limit_usd_micros,rates) values(p_month,p_limit_usd_micros,p_rates)
 on conflict(month) do update set limit_usd_micros=excluded.limit_usd_micros,rates=excluded.rates;
end $$;
revoke all on function public.configure_kinnso_monthly_cost_limit(uuid,date,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_kinnso_monthly_cost_limit(uuid,date,bigint,jsonb) to service_role;

create function public.reserve_kinnso_monthly_cost(p_actor_id uuid,p_session_id uuid,p_service text,p_request_id uuid,p_estimate_usd_micros bigint,p_rate_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare month_start date:=date_trunc('month',now() at time zone 'UTC')::date;
 r kinnso_internal.monthly_cost_reservations;b kinnso_internal.monthly_cost_limits;v_actor_key text;
begin
 if not exists(select 1 from auth.users where id=p_actor_id and deleted_at is null and(banned_until is null or banned_until<now())) or
 not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_actor_id and(not_after is null or not_after>now())) then raise exception 'unauthenticated';end if;
 if p_service is null or p_service not in('ai','scan','maps','storage','jobs') or p_request_id is null or p_estimate_usd_micros is null or p_estimate_usd_micros not between 1 and 9000000000000 or p_rate_version is null or p_rate_version!~'^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$' then raise exception 'invalid_budget';end if;
 v_actor_key:=kinnso_internal.request_digest(p_actor_id::text);
 perform pg_advisory_xact_lock(hashtextextended(v_actor_key||p_request_id::text,0));
 select * into r from kinnso_internal.monthly_cost_reservations where actor_key=v_actor_key and request_id=p_request_id;
 if found then
  if r.service<>p_service or r.estimate_usd_micros<>p_estimate_usd_micros or r.rate_version<>p_rate_version then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('allowed',false,'reason',case when r.state='reserved' then 'in_flight' else 'already_finished' end,'stopBehavior','stop');
 end if;
 -- This row lock serializes every service against the same current UTC calendar month.
 select * into b from kinnso_internal.monthly_cost_limits where month=month_start for update;
 if not found or b.rates->>p_service is distinct from p_rate_version then return jsonb_build_object('allowed',false,'reason','disabled','stopBehavior','stop');end if;
 if p_estimate_usd_micros>b.limit_usd_micros-b.spent_usd_micros-b.reserved_usd_micros then return jsonb_build_object('allowed',false,'reason','exhausted','stopBehavior','stop');end if;
 insert into kinnso_internal.monthly_cost_reservations(actor_id,actor_key,request_id,service,month,rate_version,estimate_usd_micros,state)
 values(p_actor_id,v_actor_key,p_request_id,p_service,month_start,p_rate_version,p_estimate_usd_micros,'reserved') returning * into r;
 update kinnso_internal.monthly_cost_limits set reserved_usd_micros=reserved_usd_micros+p_estimate_usd_micros where month=month_start;
 return jsonb_build_object('allowed',true,'reservationId',r.id);
end $$;
revoke all on function public.reserve_kinnso_monthly_cost(uuid,uuid,text,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_kinnso_monthly_cost(uuid,uuid,text,uuid,bigint,text) to service_role;

create function public.finish_kinnso_monthly_cost(p_actor_id uuid,p_request_id uuid,p_reservation_id uuid,p_actual_usd_micros bigint,p_successful boolean,p_release boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r kinnso_internal.monthly_cost_reservations;target text;
begin
 if p_actor_id is null or p_request_id is null or p_reservation_id is null or p_release is null or
 (p_release and(p_actual_usd_micros is distinct from 0 or p_successful is distinct from false)) or
 (not p_release and(p_actual_usd_micros is null or p_actual_usd_micros not between 0 and 9000000000000 or p_successful is null)) then raise exception 'invalid_budget';end if;
 select * into r from kinnso_internal.monthly_cost_reservations where id=p_reservation_id and actor_key=kinnso_internal.request_digest(p_actor_id::text) and request_id=p_request_id for update;
 if not found then raise exception 'reservation_not_found';end if;
 target:=case when p_release then 'released' else 'settled' end;
 if r.state<>'reserved' then
  if r.state<>target or r.actual_usd_micros is distinct from p_actual_usd_micros or r.successful is distinct from p_successful then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('status',r.state);
 end if;
 -- A charged failure or unexpected overrun is still a real cost. Preserve it and stop new reservations.
 update kinnso_internal.monthly_cost_limits set reserved_usd_micros=reserved_usd_micros-r.estimate_usd_micros,spent_usd_micros=spent_usd_micros+p_actual_usd_micros where month=r.month;
 update kinnso_internal.monthly_cost_reservations set state=target,actual_usd_micros=p_actual_usd_micros,successful=p_successful,finished_at=now() where id=r.id;
 return jsonb_build_object('status',target);
end $$;
revoke all on function public.finish_kinnso_monthly_cost(uuid,uuid,uuid,bigint,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.finish_kinnso_monthly_cost(uuid,uuid,uuid,bigint,boolean,boolean) to service_role;

create function public.get_kinnso_monthly_costs(p_month date default date_trunc('month',now() at time zone 'UTC')::date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();b kinnso_internal.monthly_cost_limits;
begin
 if not exists(select 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<now())) or
 not exists(select 1 from public.kinnso_ops_members where user_id=actor and status='active') then raise exception 'forbidden';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'invalid_budget';end if;
 select * into b from kinnso_internal.monthly_cost_limits where month=p_month;
 return jsonb_build_object('month',p_month,'currency','USD','unit','USD_micro','limit',b.limit_usd_micros,'spent',b.spent_usd_micros,'reserved',b.reserved_usd_micros,
 'status',case when b.month is null then 'disabled' when b.spent_usd_micros>b.limit_usd_micros then 'overrun' when b.spent_usd_micros+b.reserved_usd_micros>=b.limit_usd_micros then 'exhausted' else 'available' end,
 'services',(select jsonb_agg(jsonb_build_object('service',s,'enabled',coalesce(b.rates?s,false),'rateVersion',b.rates->>s,
  'spent',case when b.month is not null then (select coalesce(sum(r.actual_usd_micros),0) from kinnso_internal.monthly_cost_reservations r where r.month=p_month and r.service=s and r.state='settled') end,
  'successfulFlows',case when b.month is not null then (select count(*) from kinnso_internal.monthly_cost_reservations r where r.month=p_month and r.service=s and r.state='settled' and r.successful) end,
  'costPerSuccessfulFlow',(select sum(r.actual_usd_micros)::numeric/nullif(count(*) filter(where r.successful),0) from kinnso_internal.monthly_cost_reservations r where r.month=p_month and r.service=s and r.state='settled')
 )) from unnest(array['ai','scan','maps','storage','jobs']) s));
end $$;
revoke all on function public.get_kinnso_monthly_costs(date) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_monthly_costs(date) to authenticated;
