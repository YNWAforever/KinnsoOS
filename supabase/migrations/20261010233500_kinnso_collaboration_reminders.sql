-- P11 service-only reminder job health; hosted registration is a separate release gate.
alter table kinnso_internal.scheduled_health drop constraint scheduled_health_job_check;
alter table kinnso_internal.scheduled_health add constraint scheduled_health_job_check check(job in('media_cleanup','telemetry_retention','notifications','collaboration_reminders'));

create or replace function public.record_kinnso_scheduled_run(p_job text,p_successful boolean,p_started_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_job is null or p_job not in('media_cleanup','telemetry_retention','notifications','collaboration_reminders') or p_successful is null or p_started_at is null or p_started_at>now()+interval '1 minute' then raise exception 'invalid_run';end if;
 insert into kinnso_internal.scheduled_health(job,last_success_at,last_attempt_at,last_status)
 values(p_job,case when p_successful then now() end,p_started_at,case when p_successful then 'succeeded' else 'failed' end)
 on conflict(job) do update set last_success_at=case when p_successful then greatest(kinnso_internal.scheduled_health.last_success_at,excluded.last_success_at) else kinnso_internal.scheduled_health.last_success_at end,
 last_attempt_at=greatest(kinnso_internal.scheduled_health.last_attempt_at,excluded.last_attempt_at),
 last_status=case when excluded.last_attempt_at>=kinnso_internal.scheduled_health.last_attempt_at then excluded.last_status else kinnso_internal.scheduled_health.last_status end;
end $$;
revoke all on function public.record_kinnso_scheduled_run(text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.record_kinnso_scheduled_run(text,boolean,timestamptz) to service_role;

create or replace function public.get_kinnso_monitoring(p_day date default (now() at time zone 'UTC')::date)
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
 'scheduledRuns',(select jsonb_agg(jsonb_build_object('job',j,'owner',coalesce(h.owner,'platform_operations'),'runbook',coalesce(h.runbook,'/docs/implementation/METRICS_AND_ALERTS.md#scheduled-jobs'),'lastSuccessAt',h.last_success_at,'lastAttemptAt',h.last_attempt_at,'lastStatus',h.last_status)) from unnest(array['media_cleanup','telemetry_retention','notifications','collaboration_reminders']) j left join kinnso_internal.scheduled_health h on h.job=j)
 ) into result;
 return result;
end $$;
revoke all on function public.get_kinnso_monitoring(date) from public,anon,authenticated;
grant execute on function public.get_kinnso_monitoring(date) to authenticated;


create table kinnso_internal.collaboration_reminder_facts(
 event_kind text not null check(event_kind in('collaboration.due_soon','collaboration.overdue')),
 milestone_id uuid not null references public.mission_milestones(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 deadline_version timestamptz not null,
 notification_id uuid references public.notifications(id) on delete set null,
 created_at timestamptz not null default now(),primary key(event_kind,milestone_id,recipient_id,deadline_version));
alter table kinnso_internal.collaboration_reminder_facts enable row level security;
revoke all on kinnso_internal.collaboration_reminder_facts from public,anon,authenticated,service_role;

create function kinnso_internal.collaboration_reminder_candidates(p_now timestamptz,p_participant uuid default null,p_milestone uuid default null)
returns table(participant_id uuid,milestone_id uuid,mission_id uuid,recipient_id uuid,deadline_version timestamptz,event_kind text,mission_title text)
language sql stable security definer set search_path='' as $$
 select p.id,l.id,m.id,p.creator_id,l.due_at,case when p_now<l.due_at then 'collaboration.due_soon' else 'collaboration.overdue' end,m.title
 from public.mission_participants p join public.missions m on m.id=p.mission_id join public.mission_milestones l on l.mission_id=m.id
 join public.creators c on c.id=p.creator_id join auth.users u on u.id=c.id
 left join public.merchant_profiles merchant on merchant.id=m.merchant_profile_id left join public.affiliate_network_programs program on program.id=m.affiliate_network_program_id
 where (p_participant is null or p.id=p_participant)and(p_milestone is null or l.id=p_milestone)
 and p.status='active' and m.status in('published','paused') and c.status='active' and u.deleted_at is null and(u.banned_until is null or u.banned_until<=now())
 and(m.mission_source='merchant'and merchant.status='active' or m.mission_source='travelpayouts'and program.status='active')
 and l.due_at is not null and l.due_at<=p_now+interval '24 hours'
 and(case when l.repeatable then m.max_receipts_per_creator is null or(select count(*)from public.mission_milestone_submissions s where s.mission_participant_id=p.id and s.mission_milestone_id=l.id and s.status in('submitted','approved'))<m.max_receipts_per_creator
 else not exists(select 1 from public.mission_milestone_submissions s where s.mission_participant_id=p.id and s.mission_milestone_id=l.id and s.status in('submitted','approved'))end);
$$;
revoke all on function kinnso_internal.collaboration_reminder_candidates(timestamptz,uuid,uuid)from public,anon,authenticated,service_role;

create function public.due_kinnso_collaboration_reminders(p_now timestamptz,p_after text default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare anchor_participant uuid;anchor_milestone uuid;items jsonb;cursor text;begin
 if p_now is null or p_now>clock_timestamp()+interval '1 minute' or p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_reminder';end if;
 if p_after is not null then
  if p_after!~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$' then raise exception 'invalid_cursor';end if;
  begin anchor_participant:=split_part(p_after,':',1)::uuid;anchor_milestone:=split_part(p_after,':',2)::uuid;exception when others then raise exception 'invalid_cursor';end;
 end if;
 with bounded as(select c.*,row_number()over(order by c.participant_id,c.milestone_id)n from kinnso_internal.collaboration_reminder_candidates(p_now)c
  where(p_after is null or(c.participant_id,c.milestone_id)>(anchor_participant,anchor_milestone))
  and not exists(select 1 from kinnso_internal.collaboration_reminder_facts f where f.event_kind=c.event_kind and f.milestone_id=c.milestone_id and f.recipient_id=c.recipient_id and f.deadline_version=c.deadline_version)
  order by c.participant_id,c.milestone_id limit p_limit+1)
 select coalesce(jsonb_agg(jsonb_build_object('participantId',participant_id,'milestoneId',milestone_id,'deadlineVersion',deadline_version,'eventKind',event_kind)order by n)filter(where n<=p_limit),'[]'),
  case when count(*)>p_limit then ((jsonb_agg(participant_id::text||':'||milestone_id::text order by n)->(p_limit-1))#>>'{}')end into items,cursor from bounded;
 return jsonb_build_object('items',items,'nextCursor',cursor);
end $$;

create function public.emit_kinnso_collaboration_reminder(p_now timestamptz,p_candidate jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare participant uuid;milestone uuid;deadline timestamptz;kind text;mission uuid;recipient uuid;c record;fact uuid;notification uuid;begin
 perform kinnso_internal.keys(p_candidate,array['participantId','milestoneId','deadlineVersion','eventKind']);
 if p_now is null or p_now>clock_timestamp()+interval '1 minute' or p_candidate->>'participantId' is null or p_candidate->>'milestoneId' is null or p_candidate->>'deadlineVersion' is null or p_candidate->>'eventKind' is null then raise exception 'invalid_reminder';end if;
 begin participant:=(p_candidate->>'participantId')::uuid;milestone:=(p_candidate->>'milestoneId')::uuid;deadline:=(p_candidate->>'deadlineVersion')::timestamptz;exception when others then raise exception 'invalid_reminder';end;
 kind:=p_candidate->>'eventKind';if kind not in('collaboration.due_soon','collaboration.overdue')then raise exception 'invalid_reminder';end if;
 select p.mission_id,p.creator_id into mission,recipient from public.mission_participants p where p.id=participant;
 if not found then return jsonb_build_object('emitted',false);end if;
 -- Match the mission -> participant -> milestone lock order used by native and legacy writes.
 perform 1 from public.missions m where m.id=mission for share;
 perform 1 from public.mission_participants p where p.id=participant for share;
 perform 1 from public.mission_milestones l where l.id=milestone and l.mission_id=mission for share;
 if not found then return jsonb_build_object('emitted',false);end if;
 perform 1 from public.creators c where c.id=recipient for share;
 perform 1 from auth.users u where u.id=recipient for share;
 perform 1 from public.merchant_profiles a join public.missions m on m.merchant_profile_id=a.id where m.id=mission for share of a;
 perform 1 from public.affiliate_network_programs a join public.missions m on m.affiliate_network_program_id=a.id where m.id=mission for share of a;
 select * into c from kinnso_internal.collaboration_reminder_candidates(p_now,participant,milestone);
 if not found or c.recipient_id is distinct from recipient or c.mission_id is distinct from mission or c.deadline_version is distinct from deadline or c.event_kind is distinct from kind then return jsonb_build_object('emitted',false);end if;
 insert into kinnso_internal.collaboration_reminder_facts(event_kind,milestone_id,recipient_id,deadline_version)values(kind,milestone,recipient,deadline)on conflict do nothing returning milestone_id into fact;
 if not found then return jsonb_build_object('emitted',false);end if;
 insert into public.notifications(creator_id,notification_type,entity_type,entity_id,payload)values(recipient,kind,'mission',mission,jsonb_build_object('mission_title',c.mission_title))returning id into notification;
 update kinnso_internal.collaboration_reminder_facts set notification_id=notification where event_kind=kind and milestone_id=milestone and recipient_id=recipient and deadline_version=deadline;
 return jsonb_build_object('emitted',true);
end $$;
revoke all on function public.due_kinnso_collaboration_reminders(timestamptz,text,integer),public.emit_kinnso_collaboration_reminder(timestamptz,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.due_kinnso_collaboration_reminders(timestamptz,text,integer),public.emit_kinnso_collaboration_reminder(timestamptz,jsonb)to service_role;
