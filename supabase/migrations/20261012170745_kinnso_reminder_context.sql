-- Add optional event-time milestone context; retain legacy notifications unchanged.
-- Existing lock order, eligibility recheck, four-key input, dedupe and atomic insert are preserved.
create or replace function public.emit_kinnso_collaboration_reminder(p_now timestamptz,p_candidate jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare participant uuid;milestone uuid;deadline timestamptz;kind text;mission uuid;recipient uuid;candidate record;fact uuid;notification uuid;milestone_title text;begin
 perform kinnso_internal.keys(p_candidate,array['participantId','milestoneId','deadlineVersion','eventKind']);
 if p_now is null or p_now>clock_timestamp()+interval '1 minute' or p_candidate->>'participantId' is null or p_candidate->>'milestoneId' is null or p_candidate->>'deadlineVersion' is null or p_candidate->>'eventKind' is null then raise exception 'invalid_reminder';end if;
 begin participant:=(p_candidate->>'participantId')::uuid;milestone:=(p_candidate->>'milestoneId')::uuid;deadline:=(p_candidate->>'deadlineVersion')::timestamptz;exception when others then raise exception 'invalid_reminder';end;
 kind:=p_candidate->>'eventKind';if kind not in('collaboration.due_soon','collaboration.overdue')then raise exception 'invalid_reminder';end if;
 select p.mission_id,p.creator_id into mission,recipient from public.mission_participants p where p.id=participant;
 if not found then return jsonb_build_object('emitted',false);end if;
 -- Match the mission -> participant -> milestone lock order used by native and legacy writes.
 perform 1 from public.missions m where m.id=mission for share;
 perform 1 from public.mission_participants p where p.id=participant for share;
 select l.title into milestone_title from public.mission_milestones l where l.id=milestone and l.mission_id=mission for share;
 if not found then return jsonb_build_object('emitted',false);end if;
 perform 1 from public.creators c where c.id=recipient for share;
 perform 1 from auth.users u where u.id=recipient for share;
 perform 1 from public.merchant_profiles a join public.missions m on m.merchant_profile_id=a.id where m.id=mission for share of a;
 perform 1 from public.affiliate_network_programs a join public.missions m on m.affiliate_network_program_id=a.id where m.id=mission for share of a;
 select * into candidate from kinnso_internal.collaboration_reminder_candidates(p_now,participant,milestone);
 if not found or candidate.recipient_id is distinct from recipient or candidate.mission_id is distinct from mission or candidate.deadline_version is distinct from deadline or candidate.event_kind is distinct from kind then return jsonb_build_object('emitted',false);end if;
 insert into kinnso_internal.collaboration_reminder_facts(event_kind,milestone_id,recipient_id,deadline_version)values(kind,milestone,recipient,deadline)on conflict do nothing returning milestone_id into fact;
 if not found then return jsonb_build_object('emitted',false);end if;
 insert into public.notifications(creator_id,notification_type,entity_type,entity_id,payload)values(recipient,kind,'mission',mission,jsonb_build_object('mission_title',candidate.mission_title,'milestone_id',candidate.milestone_id,'milestone_title',milestone_title,'due_at',candidate.deadline_version,'deadline_version',candidate.deadline_version))returning id into notification;
 update kinnso_internal.collaboration_reminder_facts set notification_id=notification where event_kind=kind and milestone_id=milestone and recipient_id=recipient and deadline_version=deadline;
 return jsonb_build_object('emitted',true);
end $$;

-- Explicit recipient-scoped projection: never return the complete notification payload.
create or replace function public.get_kinnso_inbox(p_cursor jsonb default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();rows jsonb;cursor jsonb;n integer;begin
 if p_cursor is not null then perform kinnso_internal.keys(p_cursor,array['createdAt','id']);end if;
 with mine as (
 select n.id,n.notification_type event_type,n.entity_type,n.entity_id,n.read_at,n.created_at,jsonb_strip_nulls(jsonb_build_object('missionTitle',n.payload->>'mission_title','currency',n.payload->>'currency') ||
  case when n.entity_type='mission' and n.notification_type in('collaboration.due_soon','collaboration.overdue') then
   jsonb_build_object('milestoneId',n.payload->>'milestone_id','milestoneTitle',n.payload->>'milestone_title','dueAt',n.payload->>'due_at','deadlineVersion',n.payload->>'deadline_version')
  else '{}'::jsonb end) payload from public.notifications n where creator_id=a and exists(select 1 from public.creators where id=a and status='active')
 union all select id,event_type,entity_type,entity_id,read_at,created_at,'{}'::jsonb from kinnso_internal.inbox_events where recipient_id=a
 ),bounded as(select *,row_number()over(order by created_at desc,id desc)rn from mine where p_cursor is null or (created_at,id)<((p_cursor->>'createdAt')::timestamptz,(p_cursor->>'id')::uuid) order by created_at desc,id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'entityType',entity_type,'entityId',entity_id,'readAt',read_at,'createdAt',created_at,'payload',payload) order by created_at desc,id desc)filter(where rn<=50),'[]'),case when count(*)>50 then (jsonb_agg(jsonb_build_object('createdAt',created_at,'id',id)order by created_at desc,id desc))->49 else null end into rows,cursor from bounded;
 select (select count(*)from public.notifications where creator_id=a and read_at is null and exists(select 1 from public.creators where id=a and status='active'))+(select count(*)from kinnso_internal.inbox_events where recipient_id=a and read_at is null) into n;
 return jsonb_build_object('items',rows,'nextCursor',cursor,'unreadCount',n,'externalDelivery','unconfigured');
end $$;

revoke all on function public.emit_kinnso_collaboration_reminder(timestamptz,jsonb),public.get_kinnso_inbox(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.emit_kinnso_collaboration_reminder(timestamptz,jsonb) to service_role;
grant execute on function public.get_kinnso_inbox(jsonb) to authenticated;
