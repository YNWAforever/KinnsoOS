-- Extension of the existing consented measurement pipeline. No private text or raw account/trip IDs.
create table kinnso_internal.pilot_events (
 scope_digest text not null,
 phase text not null check (phase in ('guide_viewed','started','confirmed','adopted','edited','read','reopen_attempt','reopened','experience_referral','merchant_referral')),
 request_id uuid not null, flow_id uuid not null, session_id uuid not null,
 guide_id uuid not null, actor_digest text, trip_digest text, experience_id uuid, revision integer,
 payload_digest text not null, recorded_at timestamptz not null default now(),
 primary key (scope_digest,phase,request_id)
);
create index pilot_events_flow on kinnso_internal.pilot_events(flow_id,phase,recorded_at);
create index pilot_events_trip on kinnso_internal.pilot_events(actor_digest,trip_digest,recorded_at) where trip_digest is not null;
create index pilot_events_retention on kinnso_internal.pilot_events(recorded_at);
alter table kinnso_internal.pilot_events enable row level security;
revoke all on kinnso_internal.pilot_events from public,anon,authenticated,service_role;

create function public.record_kinnso_pilot_event(p_actor_id uuid,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<pilot>>
declare
 phase text:=p_event->>'phase'; request_id uuid; session_id uuid; flow_id uuid; guide_id uuid; trip_id uuid;
 actor_digest text; trip_digest text; scope_digest text; payload_digest text; prior text; base kinnso_internal.pilot_events;
begin
 perform kinnso_internal.keys(p_event,array['phase','requestId','sessionId','flowId','guideId','tripId','experienceId','revision']);
 if phase is null or phase not in ('guide_viewed','started','confirmed','adopted','edited','read','reopen_attempt','reopened','experience_referral','merchant_referral') then raise exception 'invalid_pilot_event'; end if;
 if p_event->>'requestId' is null or p_event->>'sessionId' is null then raise exception 'invalid_pilot_event'; end if;
 request_id:=(p_event->>'requestId')::uuid; session_id:=(p_event->>'sessionId')::uuid;
 flow_id:=(p_event->>'flowId')::uuid; guide_id:=(p_event->>'guideId')::uuid; trip_id:=(p_event->>'tripId')::uuid;
 if p_event ? 'revision' and (jsonb_typeof(p_event->'revision') is distinct from 'number' or
  (p_event->>'revision')::numeric<>trunc((p_event->>'revision')::numeric) or (p_event->>'revision')::numeric not between 1 and 2147483647) then raise exception 'invalid_pilot_event'; end if;
 if phase in ('adopted','edited','read','reopened') and not (p_event ? 'revision') then raise exception 'invalid_pilot_event'; end if;
 if p_actor_id is not null then
  if not exists(select 1 from auth.users where id=p_actor_id and deleted_at is null and (banned_until is null or banned_until<now())) then return jsonb_build_object('accepted',false); end if;
  if exists(select 1 from public.kinnso_ops_members where user_id=p_actor_id and status='active') then return jsonb_build_object('accepted',false); end if;
  actor_digest:=kinnso_internal.request_digest(p_actor_id::text);
 elsif phase not in ('guide_viewed','started','experience_referral','merchant_referral') then return jsonb_build_object('accepted',false);
 end if;
 if phase in ('guide_viewed','started','experience_referral','merchant_referral') then
  if flow_id is null or guide_id is null or trip_id is not null then raise exception 'invalid_pilot_event'; end if;
  if not exists(select 1 from public.guides g where g.id=guide_id and g.status='published' and exists(
   select 1 from public.guide_versions v where v.guide_id=g.id and v.withdrawn_at is null)) then return jsonb_build_object('accepted',false); end if;
  if phase in ('experience_referral','merchant_referral') and not exists(
   select 1 from public.experiences e join public.merchant_profiles m on m.id=e.merchant_profile_id
   join public.guides g on g.id=guide_id
   where e.id=(p_event->>'experienceId')::uuid and e.status='published' and m.status='active' and e.city=g.city
  ) then return jsonb_build_object('accepted',false); end if;
 else
  if p_actor_id is null or trip_id is null or not exists(
   select 1 from public.trips t where t.id=trip_id and t.owner_user_id=p_actor_id
  ) then return jsonb_build_object('accepted',false); end if;
  trip_digest:=kinnso_internal.request_digest(trip_id::text);
  if phase in ('confirmed','adopted') then
   if flow_id is null or guide_id is null then raise exception 'invalid_pilot_event'; end if;
   if not exists(select 1 from public.guides g where g.id=guide_id) then return jsonb_build_object('accepted',false); end if;
   if phase='adopted' and not exists(
    select 1 from kinnso_internal.trip_requests r
    where r.actor_id=p_actor_id and r.request_id=pilot.request_id and r.trip_id=pilot.trip_id
     and (r.result->>'revision')::integer=(p_event->>'revision')::integer
   ) then return jsonb_build_object('accepted',false); end if;
  else
   select e.* into base from kinnso_internal.pilot_events e where e.phase='adopted' and
    e.actor_digest=pilot.actor_digest and e.trip_digest=pilot.trip_digest
    order by e.recorded_at desc,e.flow_id limit 1;
   if not found then return jsonb_build_object('accepted',false); end if;
   flow_id:=base.flow_id; guide_id:=base.guide_id;
   if phase in ('reopen_attempt','reopened') and base.session_id=session_id then return jsonb_build_object('accepted',false); end if;
   if p_event ? 'revision' and not exists(select 1 from public.trip_revisions r where r.trip_id=pilot.trip_id and r.revision_no=(p_event->>'revision')::integer) then return jsonb_build_object('accepted',false); end if;
  end if;
 end if;
 scope_digest:=coalesce(actor_digest,kinnso_internal.request_digest(session_id::text));
 payload_digest:=kinnso_internal.request_digest(p_event::text);
 perform pg_advisory_xact_lock(hashtextextended(scope_digest||phase||request_id::text,0));
 select e.payload_digest into prior from kinnso_internal.pilot_events e
 where e.scope_digest=pilot.scope_digest and e.phase=pilot.phase and e.request_id=pilot.request_id;
 if found then
  if prior<>payload_digest then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('accepted',true,'replayed',true);
 end if;
 if (select count(*) from kinnso_internal.pilot_events e where e.scope_digest=pilot.scope_digest and e.recorded_at>now()-interval '10 minutes')>=600 then return jsonb_build_object('accepted',false); end if;
 insert into kinnso_internal.pilot_events(scope_digest,phase,request_id,flow_id,session_id,guide_id,actor_digest,trip_digest,experience_id,revision,payload_digest)
 values(scope_digest,phase,request_id,flow_id,session_id,guide_id,actor_digest,trip_digest,(p_event->>'experienceId')::uuid,(p_event->>'revision')::integer,payload_digest);
 return jsonb_build_object('accepted',true,'replayed',false);
end $$;
revoke all on function public.record_kinnso_pilot_event(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_kinnso_pilot_event(uuid,jsonb) to service_role;

-- Cohorts use the selected UTC day, with a seven-day conversion window.
create function kinnso_internal.pilot_metrics(p_day date)
returns jsonb language sql stable security definer set search_path='' as $$
with events as (
 select * from kinnso_internal.pilot_events
 where recorded_at>=p_day-7 and recorded_at<p_day+8
), attempts as (
 select distinct flow_id,request_id from events where phase='confirmed' and (recorded_at at time zone 'UTC')::date=p_day
), adoptions as (
 select a.* from events a join attempts c using(flow_id,request_id) where a.phase='adopted'
), completions as (
 select a.flow_id,min(greatest(e.recorded_at,r.recorded_at)) completed_at
 from adoptions a join events e on e.phase='edited' and e.flow_id=a.flow_id and e.actor_digest=a.actor_digest and e.trip_digest=a.trip_digest and e.revision>a.revision
 join events r on r.phase='read' and r.flow_id=a.flow_id and r.actor_digest=a.actor_digest and r.trip_digest=a.trip_digest and r.revision>=e.revision
 group by a.flow_id
), durations as (
 select greatest(0,extract(epoch from (c.completed_at-min(s.recorded_at)))*1000) elapsed
 from completions c join events s on s.phase='started' and s.flow_id=c.flow_id group by c.flow_id,c.completed_at
), open_requests as (
 select actor_digest,trip_digest,session_id,request_id,recorded_at from events where phase='reopen_attempt' and (recorded_at at time zone 'UTC')::date=p_day
), opens as (
 select distinct actor_digest,trip_digest,session_id from open_requests
), reopened as (
 select distinct o.actor_digest,o.trip_digest,o.session_id from open_requests o
 join events r using(actor_digest,trip_digest,session_id,request_id)
 where r.phase='reopened' and r.recorded_at>=o.recorded_at and r.recorded_at<=o.recorded_at+interval '7 days'
), views as (
 select distinct flow_id from events where phase='guide_viewed' and (recorded_at at time zone 'UTC')::date=p_day
), referrals as (
 select distinct v.flow_id from views v join events e using(flow_id) where e.phase='experience_referral'
), merchant_clicks as (
 select distinct v.flow_id from views v join events e using(flow_id) where e.phase='merchant_referral'
)
select jsonb_build_object(
 'adoptionAttempts',(select count(*) from attempts),'adoptions',(select count(*) from adoptions),
 'adoptionSuccessRate',(select count(*) from adoptions)::numeric/nullif((select count(*) from attempts),0),
 'firstCompletions',(select count(*) from durations),'firstCompletionP50Ms',(select percentile_cont(.5) within group(order by elapsed) from durations),
 'reopenAttempts',(select count(*) from opens),'reopens',(select count(*) from reopened),
 'reopenSuccessRate',(select count(*) from reopened)::numeric/nullif((select count(*) from opens),0),
 'qualifiedGuideViews',(select count(*) from views),'experienceReferrals',(select count(*) from referrals),'merchantReferrals',(select count(*) from merchant_clicks),
 'merchantReferralRate',(select count(*) from referrals)::numeric/nullif((select count(*) from views),0)
)
$$;
revoke all on function kinnso_internal.pilot_metrics(date) from public,anon,authenticated,service_role;
create function public.get_kinnso_pilot_metrics(p_day date default (now() at time zone 'UTC')::date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 if not exists(select 1 from public.kinnso_ops_members where user_id=actor and status='active') then raise exception 'forbidden'; end if;
 if p_day is null then raise exception 'invalid_day'; end if;
 if p_day<(now() at time zone 'UTC')::date-22 or p_day>(now() at time zone 'UTC')::date then return null; end if;
 return kinnso_internal.pilot_metrics(p_day);
end $$;
revoke all on function public.get_kinnso_pilot_metrics(date) from public,anon;
grant execute on function public.get_kinnso_pilot_metrics(date) to authenticated;

-- Keep the original retention work and add the private pilot ledger to the same scheduled job.
create or replace function public.prune_kinnso_telemetry()
returns void language plpgsql security definer set search_path='' as $$
begin
 delete from kinnso_internal.telemetry_receipts where created_at<now()-interval '7 days';
 delete from kinnso_internal.performance_samples where day<(now() at time zone 'UTC')::date-30;
 delete from kinnso_internal.funnel_daily where day<(now() at time zone 'UTC')::date-90;
 delete from kinnso_internal.pilot_events where recorded_at<now()-interval '30 days';
end $$;
