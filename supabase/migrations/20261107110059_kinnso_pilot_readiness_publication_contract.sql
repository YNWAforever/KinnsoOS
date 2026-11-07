-- The authenticated self contract exposes only the caller's run and slot.
-- Readiness here describes the participant's own workflow; full run acceptance
-- and its evidence remain behind the operations boundary.
create function kinnso_internal.pilot_self_snapshot(r kinnso_internal.pilot_runs, p kinnso_internal.pilot_participants)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'run',case when r.id is not null then jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,
  'participant',case when p.id is not null then jsonb_build_object('id',p.id,'role',p.role,'status',p.status,'consentVersion',p.consent_version) end,
  'nextStep',case when r.status in ('recruiting','running') and p.status in ('joined','active') then
    jsonb_build_object('code',case when p.consented_at is null then 'accept_consent' else 'open_workflow' end,
     'href',case p.role when 'creator' then '/en/studio/guides' when 'merchant' then '/en/merchant' else '/en/trips' end,
     'messageKey','pilot.next.open_workflow')
   end,
  'readiness',jsonb_build_object('stage',case when r.status='running' and p.status='active'
    and p.consented_at is not null and p.consent_version=r.participation_notice_version then 'executing' else 'blocked' end,
   'readyToBegin',false,'executionComplete',false,'blockers','[]'::jsonb));
$$;
revoke all on function kinnso_internal.pilot_self_snapshot(kinnso_internal.pilot_runs,kinnso_internal.pilot_participants)
 from public,anon,authenticated,service_role;

create or replace function public.get_kinnso_pilot_self() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); p kinnso_internal.pilot_participants; r kinnso_internal.pilot_runs;
begin
 select s.* into p from kinnso_internal.pilot_participants s join kinnso_internal.pilot_runs x on x.id=s.run_id
 where s.user_id=a
 order by (x.status in ('recruiting','running','paused')) desc,s.created_at desc,s.id limit 1;
 if found then select * into r from kinnso_internal.pilot_runs where id=p.run_id;end if;
 return kinnso_internal.pilot_self_snapshot(r,p);
end $$;

create or replace function public.apply_kinnso_pilot_participant_command(p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); kind text:=p_command->>'type'; allowed text[]; prior kinnso_internal.requests; dg text; result jsonb;
 p kinnso_internal.pilot_participants; r kinnso_internal.pilot_runs; inv kinnso_internal.pilot_invites; i kinnso_internal.pilot_content_intakes;
 x jsonb; urls text[]; raw_code text; entity uuid; entity_type text:='participant'; rid uuid; k text; n public.notifications; support kinnso_internal.support_cases;
begin
 allowed:=case kind when 'claimInvite' then array['type','requestId','code'] when 'acceptConsent' then array['type','requestId','noticeVersion'] when 'submitContentIntake' then array['type','requestId','intake'] when 'updateOwnedContentIntake' then array['type','requestId','id','expectedRevision','intake'] when 'acknowledgeNotification' then array['type','requestId'] when 'acknowledgeSupportResponse' then array['type','requestId'] end;
 if allowed is null or p_request_id is null then raise exception 'INVALID';end if;
 perform kinnso_internal.pilot_keys(p_command,allowed);
 if p_command ? 'requestId' and (jsonb_typeof(p_command->'requestId')<>'string' or (p_command->>'requestId')::uuid is distinct from p_request_id) then raise exception 'INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 dg:=kinnso_internal.request_digest(jsonb_build_array('pilot.participant',p_command)::text);
 select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;
 if found then
  if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;
  -- Use the original scope and current ownership. Never replay stored fields.
  select * into p from kinnso_internal.pilot_participants
  where id=(prior.result#>>'{snapshot,participant,id}')::uuid
   and run_id=(prior.result#>>'{snapshot,run,id}')::uuid and user_id=a;
  if not found then raise exception 'FORBIDDEN';end if;
  select * into r from kinnso_internal.pilot_runs where id=p.run_id;
  return jsonb_build_object('snapshot',kinnso_internal.pilot_self_snapshot(r,p));
 end if;
 if kind='claimInvite' then
  raw_code:=kinnso_internal.pilot_text(p_command,'code',32,512);
  select pi.* into inv from kinnso_internal.pilot_invites pi where code_hash=extensions.digest(raw_code,'sha256');
  if not found then raise exception 'CONFLICT';end if;
  select run_id into rid from kinnso_internal.pilot_participants where id=inv.participant_id;
 else
  select pp.* into p from kinnso_internal.pilot_participants pp join kinnso_internal.pilot_runs rr on rr.id=pp.run_id where pp.user_id=a and rr.status in ('recruiting','running','paused') order by pp.created_at desc,pp.id limit 1;
  if not found then raise exception 'FORBIDDEN';end if;rid:=p.run_id;
 end if;
 select * into r from kinnso_internal.pilot_runs where id=rid for update;
 if not found or r.status not in ('recruiting','running') then raise exception 'CONFLICT';end if;
 if kind='claimInvite' then
  select * into inv from kinnso_internal.pilot_invites where id=inv.id for update;
  select * into p from kinnso_internal.pilot_participants where id=inv.participant_id for update;
  if not found or p.run_id is distinct from r.id or inv.status<>'active' or inv.expires_at<=clock_timestamp() or p.user_id is not null or p.status<>'invited'
  or exists(select 1 from kinnso_internal.pilot_participants where run_id=r.id and user_id=a)
  or (r.data_classification='real' and not kinnso_internal.pilot_begin_ready(r)) then raise exception 'CONFLICT';end if;
  update kinnso_internal.pilot_invites set status='claimed',claimed_at=clock_timestamp() where id=inv.id;
  update kinnso_internal.pilot_participants set user_id=a,status='joined',revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 else
  select * into p from kinnso_internal.pilot_participants where id=p.id for update;
  if not found or p.run_id is distinct from r.id or p.user_id is distinct from a or p.status not in ('joined','active') then raise exception 'FORBIDDEN';end if;
 end if;
 entity:=p.id;
 case kind
 when 'claimInvite' then null;
 when 'acceptConsent' then
  if kinnso_internal.pilot_text(p_command,'noticeVersion',1,120) is distinct from r.participation_notice_version or r.privacy_notice_version is null then raise exception 'CONFLICT';end if;
  if p.consented_at is not null then raise exception 'CONFLICT';end if;
  update kinnso_internal.pilot_participants set consent_version=r.participation_notice_version,consented_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 when 'submitContentIntake','updateOwnedContentIntake' then
  if r.status<>'running' or p.role<>'creator' or p.status<>'active' or p.consented_at is null or p.consent_version<>r.participation_notice_version
  or not exists(select 1 from public.creators where id=a and status='active') then raise exception 'FORBIDDEN';end if;
  x:=p_command->'intake';
  perform kinnso_internal.pilot_keys(x,array['title','destination','authoredLocale','sourceSummary','sourceUrls','rightsBasis','rightsEvidenceReference','authorConsentVersion','coverRightsConfirmed','coverRightsEvidenceReference']);
  if jsonb_typeof(x->'sourceUrls') is distinct from 'array' or jsonb_array_length(x->'sourceUrls')>20 or exists(select 1 from jsonb_array_elements(x->'sourceUrls') u where jsonb_typeof(u)<>'string') or x->>'authorConsentVersion' is distinct from r.content_consent_version or x->'coverRightsConfirmed' not in ('null'::jsonb,'true'::jsonb,'false'::jsonb) then raise exception 'INVALID';end if;
  select coalesce(array_agg(value),'{}') into urls from jsonb_array_elements_text(x->'sourceUrls');
  if kind='submitContentIntake' then
   if (select count(*) from kinnso_internal.pilot_content_intakes where run_id=r.id)>=100 then raise exception 'CONFLICT';end if;
   entity:=gen_random_uuid();
   insert into kinnso_internal.pilot_content_intakes(id,run_id,creator_participant_id,title,destination,authored_locale,source_summary,source_urls,rights_basis,rights_evidence_reference,author_consent_version,author_consented_at,consent_digest,cover_rights_confirmed,cover_rights_evidence_reference,status)
   values(entity,r.id,p.id,kinnso_internal.pilot_text(x,'title',1,160),kinnso_internal.pilot_text(x,'destination',1,160),kinnso_internal.pilot_text(x,'authoredLocale',2,20),kinnso_internal.pilot_text(x,'sourceSummary',1,4000),urls,kinnso_internal.pilot_text(x,'rightsBasis',1,20),kinnso_internal.pilot_text(x,'rightsEvidenceReference',1,500),kinnso_internal.pilot_text(x,'authorConsentVersion',1,120),clock_timestamp(),kinnso_internal.request_digest(jsonb_build_array(r.content_consent_version,x)::text),(x->>'coverRightsConfirmed')::boolean,kinnso_internal.pilot_text(x,'coverRightsEvidenceReference',1,500,true),'submitted');
  else
   entity:=(kinnso_internal.pilot_text(p_command,'id',36,36))::uuid;
   if jsonb_typeof(p_command->'expectedRevision')<>'number' or (p_command->>'expectedRevision')!~'^[1-9][0-9]{0,8}$' then raise exception 'INVALID';end if;
   select * into i from kinnso_internal.pilot_content_intakes where id=entity and creator_participant_id=p.id and run_id=r.id for update;
   if not found then raise exception 'NOT_FOUND';end if;
   if i.revision<>(p_command->>'expectedRevision')::int or i.status in ('published','withdrawn') then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_content_intakes set title=kinnso_internal.pilot_text(x,'title',1,160),destination=kinnso_internal.pilot_text(x,'destination',1,160),authored_locale=kinnso_internal.pilot_text(x,'authoredLocale',2,20),source_summary=kinnso_internal.pilot_text(x,'sourceSummary',1,4000),source_urls=urls,rights_basis=kinnso_internal.pilot_text(x,'rightsBasis',1,20),rights_evidence_reference=kinnso_internal.pilot_text(x,'rightsEvidenceReference',1,500),author_consent_version=kinnso_internal.pilot_text(x,'authorConsentVersion',1,120),author_consented_at=clock_timestamp(),consent_digest=kinnso_internal.request_digest(jsonb_build_array(r.content_consent_version,x)::text),cover_rights_confirmed=(x->>'coverRightsConfirmed')::boolean,cover_rights_evidence_reference=kinnso_internal.pilot_text(x,'coverRightsEvidenceReference',1,500,true),status='submitted',guide_draft_revision=null,content_digest=null,reviewed_guide_version=null,reviewed_at=null,reviewed_by_ops_member_id=null,review_reason=null,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
  end if;
  entity_type:='intake';
 when 'acknowledgeNotification' then
  if r.status<>'running' or p.status<>'active' or p.consented_at is null then raise exception 'CONFLICT';end if;
  select nn.* into n from public.notifications nn join kinnso_internal.pilot_collaborations c on c.run_id=r.id and c.status='active' and c.mission_id=nn.entity_id and c.creator_participant_id=p.id
  join public.mission_milestone_submissions s on s.id::text=nn.payload->>'submission_id' and s.status='approved' and s.created_at>r.acceptance_started_at
  join public.mission_participants mp on mp.id=s.mission_participant_id and mp.creator_id=a and mp.mission_id=c.mission_id
  where nn.creator_id=a and nn.entity_type='mission' and nn.notification_type='submission.approved' and nn.created_at>r.acceptance_started_at
  and not exists(select 1 from public.mission_milestone_submissions newer join public.mission_participants np on np.id=newer.mission_participant_id where np.mission_id=c.mission_id and np.creator_id=a and newer.id<>s.id and newer.created_at>=s.created_at)
  and not exists(select 1 from public.notifications tied where tied.id<>nn.id and tied.creator_id=a and tied.entity_id=c.mission_id and tied.entity_type='mission' and tied.notification_type='submission.approved' and tied.payload->>'submission_id'=s.id::text and tied.created_at=nn.created_at)
  order by nn.created_at desc,nn.id desc limit 1;
  if not found then raise exception 'CONFLICT';end if;
  entity:=n.id;entity_type:='notification';
 when 'acknowledgeSupportResponse' then
  if r.status<>'running' or p.status<>'active' or p.consented_at is null then raise exception 'CONFLICT';end if;
  select sc.* into support from kinnso_internal.support_cases sc join kinnso_internal.pilot_evidence e on e.entity_type='support_case' and e.entity_id=sc.id and e.run_id=r.id and e.check_code='support_resolved'
  where sc.recipient_id=a and sc.status='resolved' and sc.created_at>r.acceptance_started_at and kinnso_internal.pilot_reference_allowed(r.id,'support_resolved','support_case',sc.id)
  and exists(select 1 from kinnso_internal.support_messages sm where sm.case_id=sc.id and sm.actor_id<>a and sm.created_at>r.acceptance_started_at)
  order by sc.updated_at desc,sc.id limit 1;
  if not found then raise exception 'CONFLICT';end if;
  entity:=support.id;entity_type:='support_case';
 else raise exception 'INVALID';
 end case;
 perform kinnso_internal.pilot_audit(p.id,kind,entity_type,entity);
 result:=jsonb_build_object('snapshot',kinnso_internal.pilot_self_snapshot(r,p));
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then raise exception 'INVALID';
 when unique_violation then raise exception 'CONFLICT';
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
 -- The initial lookup was unlocked. A concurrent operator may have rebound
 -- the intake while this transaction waited for the run lock.
 if not found then raise exception 'CONFLICT';end if;
 select * into i from kinnso_internal.pilot_content_intakes
 where id=i.id and run_id=r.id and guide_id=p_draft_id for update;
 if not found then raise exception 'CONFLICT';end if;
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
