-- Derive the readiness input from the same authoritative snapshot as operations.
-- Participant sessions can call the RPC directly, so remove private text before
-- returning it and use viewer/run-scoped aliases for cross-record comparisons.
create function kinnso_internal.pilot_participant_readiness(value jsonb, viewer uuid, run_id uuid)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; field text; item jsonb;
begin
 case jsonb_typeof(value)
 when 'array' then
  select coalesce(jsonb_agg(kinnso_internal.pilot_participant_readiness(entry,viewer,run_id) order by ordinal),'[]')
   into result from jsonb_array_elements(value) with ordinality as entries(entry,ordinal);
 when 'object' then
  result:='{}';
  for field,item in select key,e.value from jsonb_each(value) e loop
   if field in ('displayLabel','title','destination','authoredLocale','readiness') then continue; end if;
   if field in ('evidenceReference','observedSummary') then
    item:=case when length(btrim(item#>>'{}'))>0 then to_jsonb('present'::text) else 'null'::jsonb end;
   elsif field in ('id','entityId','userId','creatorUserId','creatorParticipantId','merchantParticipantId',
       'guideId','intakeId','missionId','submissionId','notificationId',
       'contentDigest','publishedContentDigest','currentContentDigest')
       and item<>'null'::jsonb and item#>>'{}'<>run_id::text then
    item:=to_jsonb(kinnso_internal.request_digest(jsonb_build_array(viewer,run_id,item)::text));
   elsif jsonb_typeof(item) in ('array','object') then
    item:=kinnso_internal.pilot_participant_readiness(item,viewer,run_id);
   end if;
   result:=result||jsonb_build_object(field,item);
  end loop;
 else result:=value;
 end case;
 return result;
end $$;
revoke all on function kinnso_internal.pilot_participant_readiness(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.get_kinnso_pilot_self() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); p kinnso_internal.pilot_participants; r kinnso_internal.pilot_runs; view jsonb; inputs jsonb; begin
 select s.* into p from kinnso_internal.pilot_participants s join kinnso_internal.pilot_runs x on x.id=s.run_id where s.user_id=a order by (x.status in ('recruiting','running','paused')) desc,s.created_at desc,s.id limit 1;
 if p.id is not null then select * into r from kinnso_internal.pilot_runs where id=p.run_id; end if;
 view:=jsonb_build_object('run',case when r.id is not null then jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,'participant',case when p.id is not null then jsonb_build_object('id',p.id,'role',p.role,'status',p.status,'consentVersion',p.consent_version) end,
 'nextStep',case when p.id is not null and p.status not in ('withdrawn','completed') then jsonb_build_object('code',case when p.consented_at is null then 'accept_consent' else 'open_workflow' end,'href',case p.role when 'creator' then '/en/studio/guides' when 'merchant' then '/en/merchant' else '/en/trips' end,'messageKey','pilot.next.open_workflow') end,
 'readiness',jsonb_build_object('stage',case when r.status='running' and p.status='active' then 'executing' else 'blocked' end,'readyToBegin',false,'executionComplete',false,'blockers','[]'::jsonb));
 if r.id is null then return view; end if;
 inputs:=kinnso_internal.pilot_participant_readiness(kinnso_internal.pilot_snapshot(r.id),a,r.id);
 return view||inputs;
end $$;

create or replace function public.publish_kinnso_pilot_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); i kinnso_internal.pilot_content_intakes; r kinnso_internal.pilot_runs; d kinnso_internal.guide_drafts; p kinnso_internal.pilot_participants;
 prior kinnso_internal.requests; dg text; result jsonb; v public.guide_versions; begin
 if p_draft_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1 then raise exception 'INVALID';end if;
 if not exists(select 1 from public.guides g join public.creators cr on cr.id=g.creator_id and cr.status='active' where g.id=p_draft_id and g.creator_id=a) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 dg:=kinnso_internal.request_digest(jsonb_build_array('pilot.publish',p_draft_id,p_expected_revision)::text);
 select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;
 if found then if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;return prior.result;end if;
 select * into i from kinnso_internal.pilot_content_intakes where guide_id=p_draft_id;
 if i.id is null then
  perform 1 from public.guides where id=p_draft_id for update;
  if exists(select 1 from kinnso_internal.pilot_content_intakes where guide_id=p_draft_id) then raise exception 'CONFLICT';end if;
  return kinnso_internal.publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 end if;
 select * into r from kinnso_internal.pilot_runs where id=i.run_id for update;
 select * into i from kinnso_internal.pilot_content_intakes where id=i.id for update;
 select * into p from kinnso_internal.pilot_participants where id=i.creator_participant_id and user_id=a and status='active' for update;
 if not found or p.consented_at is null or p.consent_version<>r.participation_notice_version then raise exception 'FORBIDDEN';end if;
 perform 1 from public.guides where id=p_draft_id and status<>'withdrawn' for update;
 if not found then raise exception 'CONFLICT';end if;
 select * into d from kinnso_internal.guide_drafts where guide_id=p_draft_id for update;
 if r.status<>'running' or d.revision is distinct from p_expected_revision then raise exception 'CONFLICT';end if;
 if i.status<>'approved' or d.revision is distinct from i.guide_draft_revision or kinnso_internal.pilot_digest(d.payload) is distinct from i.content_digest or (select max(version) from public.guide_versions where guide_id=p_draft_id) is distinct from i.reviewed_guide_version then raise exception 'PILOT_REVIEW_REQUIRED';end if;
 -- This unexposed row also authenticates the table-level publishing guard.
 -- It rolls back with any publisher failure; client-settable GUCs are not used.
 perform kinnso_internal.pilot_audit(p.id,'publishGuide','guide',p_draft_id);
 result:=kinnso_internal.publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 select * into v from public.guide_versions where guide_id=p_draft_id order by version desc limit 1;
 if kinnso_internal.pilot_digest(jsonb_build_object('title',d.payload->'title','city',d.payload->'city','summary',d.payload->'summary','content',v.content)) is distinct from i.content_digest then raise exception 'CONFLICT';end if;
 update kinnso_internal.pilot_content_intakes set status='published',reviewed_guide_version=v.version,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
 result:=result||jsonb_build_object('runId',r.id,'contentIntakeId',i.id);
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return result;
end $$;
