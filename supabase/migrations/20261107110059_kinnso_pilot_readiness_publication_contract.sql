alter table kinnso_internal.pilot_runs
 add column participation_notice_digest text check (participation_notice_digest ~ '^[0-9a-f]{64}$'),
 add check ((participation_notice_digest is null)=(participation_notice_version is null)),
 add column privacy_notice_digest text check (privacy_notice_digest ~ '^[0-9a-f]{64}$'),
 add check ((privacy_notice_digest is null)=(privacy_notice_version is null)),
 add column content_consent_digest text check (content_consent_digest ~ '^[0-9a-f]{64}$'),
 add check ((content_consent_digest is null)=(content_consent_version is null));
alter table kinnso_internal.pilot_participants
 add column consent_digest text check (consent_digest ~ '^[0-9a-f]{64}$');
alter table kinnso_internal.pilot_content_intakes
 add column author_consent_digest text check (author_consent_digest ~ '^[0-9a-f]{64}$');

create function kinnso_internal.pilot_lock_notice_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if (old.status<>'draft' or old.acceptance_started_at is not null or exists(
  select 1 from kinnso_internal.pilot_participants where run_id=old.id and user_id is not null))
 and row(old.participation_notice_version,old.participation_notice_digest,old.privacy_notice_version,
  old.privacy_notice_digest,old.content_consent_version,old.content_consent_digest)
 is distinct from row(new.participation_notice_version,new.participation_notice_digest,new.privacy_notice_version,
  new.privacy_notice_digest,new.content_consent_version,new.content_consent_digest) then
  raise exception 'CONFLICT';
 end if;
 return new;
end $$;
revoke all on function kinnso_internal.pilot_lock_notice_identity() from public,anon,authenticated,service_role;
create trigger pilot_lock_notice_identity before update on kinnso_internal.pilot_runs
 for each row execute function kinnso_internal.pilot_lock_notice_identity();

create function kinnso_internal.pilot_consent_identity(r kinnso_internal.pilot_runs)
returns text language sql stable set search_path='' as $$
 select case when r.participation_notice_digest is not null and r.privacy_notice_digest is not null then
  kinnso_internal.request_digest(jsonb_build_array(r.participation_notice_version,r.participation_notice_digest,
   r.privacy_notice_version,r.privacy_notice_digest)::text) end;
$$;
revoke all on function kinnso_internal.pilot_consent_identity(kinnso_internal.pilot_runs)
 from public,anon,authenticated,service_role;

-- The authenticated self contract exposes only the caller's run and slot.
-- Readiness here describes the participant's own workflow; full run acceptance
-- and its evidence remain behind the operations boundary.
create function kinnso_internal.pilot_self_snapshot(r kinnso_internal.pilot_runs, p kinnso_internal.pilot_participants)
returns jsonb language sql stable set search_path='' as $$
 with state as (
  select case
   when r.id is null or p.id is null then 'participant_unavailable'
   when p.status='withdrawn' then 'participant_withdrawn'
   when r.status='cancelled' then 'run_cancelled'
   when p.status='completed' then 'completed'
   when r.status='completed' then 'run_completed'
   when r.status='paused' then 'run_paused'
   when p.status='paused' then 'participant_paused'
   when r.status not in ('recruiting','running') then 'run_not_running'
   when p.status='invited' then 'invitation_required'
   when p.consented_at is null or r.participation_notice_version is null
    or p.consent_version is distinct from r.participation_notice_version
    or p.consent_digest is null or p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r) then 'consent_required'
   when p.status<>'active' then 'participant_not_active'
   when r.status<>'running' then 'run_not_running'
   else 'workflow_ready'
  end as code
 )
 select jsonb_build_object(
  'run',case when r.id is not null then jsonb_build_object('id',r.id,'name',r.name,'status',r.status,
   'participationNoticeVersion',r.participation_notice_version,'participationNoticeDigest',r.participation_notice_digest,
   'privacyNoticeVersion',r.privacy_notice_version,'privacyNoticeDigest',r.privacy_notice_digest) end,
  'contentConsent',case when p.role='creator' and p.status='active' and r.content_consent_digest is not null
   then jsonb_build_object('version',r.content_consent_version,'digest',r.content_consent_digest) end,
  'intake',case when p.role='creator' and p.status='active' then (
   select jsonb_build_object('id',i.id,'status',i.status,'revision',i.revision,'title',i.title,
    'destination',i.destination,'authoredLocale',i.authored_locale,'sourceSummary',i.source_summary,
    'sourceUrls',i.source_urls,'rightsBasis',i.rights_basis,'rightsEvidenceReference',i.rights_evidence_reference,
    'coverRightsConfirmed',i.cover_rights_confirmed,'coverRightsEvidenceReference',i.cover_rights_evidence_reference,
    'reviewReason',i.review_reason,'guideId',g.id,'currentDraftRevision',d.revision,
    'editorHref',case when d.guide_id is not null then '/en/studio/guides/'||g.id||'/edit' end)
   from kinnso_internal.pilot_content_intakes i
   left join public.guides g on g.id=i.guide_id and g.creator_id=p.user_id
   left join kinnso_internal.guide_drafts d on d.guide_id=g.id
   where i.run_id=r.id and i.creator_participant_id=p.id and i.status<>'withdrawn'
   order by i.updated_at desc,i.id limit 1
  ) end,
  'workflowLinks',case when p.status='active' then jsonb_build_object(
   'merchant',case when p.role='merchant' then (
    select '/en/merchant/campaigns/'||m.id from kinnso_internal.pilot_collaborations c
    join public.missions m on m.id=c.mission_id
    join public.merchant_profiles mp on mp.id=m.merchant_profile_id
    where c.run_id=r.id and c.merchant_participant_id=p.id and c.status='active'
      and mp.user_id=p.user_id and mp.status='active'
    order by m.id limit 1) end,
   'trip',case when p.role='traveller' then (
    select '/en/trips/'||t.id from public.trips t
    where t.owner_user_id=p.user_id and exists(select 1 from public.trip_stops ts
     join kinnso_internal.pilot_content_intakes i on i.guide_id=ts.source_guide_id
      and i.reviewed_guide_version=ts.source_guide_version
     where ts.trip_id=t.id and ts.source_withdrawn_at is null and i.run_id=r.id and i.status='published')
    order by t.id limit 1) end,
   'supportCaseId',(
    select sc.id from kinnso_internal.support_cases sc
    where sc.recipient_id=p.user_id and exists(select 1 from kinnso_internal.pilot_evidence e
     where e.run_id=r.id and e.entity_type='support_case' and e.entity_id=sc.id)
    order by sc.updated_at desc,sc.id limit 1)
  ) end,
  'participant',case when p.id is not null then jsonb_build_object('id',p.id,'role',p.role,'status',p.status,'consentVersion',p.consent_version,'consentDigest',p.consent_digest) end,
  'nextStep',case
   when code='workflow_ready' then jsonb_build_object('code','open_workflow',
    'href',case p.role when 'creator' then '/en/studio/guides' when 'merchant' then '/en/merchant' else '/en/trips' end,
    'messageKey','pilot.next.open_workflow')
   when code='consent_required' and p.consented_at is null
    and kinnso_internal.pilot_consent_identity(r) is not null then
    jsonb_build_object('code','accept_consent','href',null,'messageKey','pilot.next.accept_consent')
   end,
  'readiness',jsonb_build_object(
   'stage',case
    when code='workflow_ready' then 'executing'
    when code='completed' then 'completed'
    when code in ('invitation_required','consent_required','participant_not_active') then 'setup_incomplete'
    else 'blocked' end,
   'readyToBegin',code='workflow_ready',
   'executionComplete',code='completed',
   'blockers',case when code in ('workflow_ready','completed') then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('code',code,'category','participation','messageKey','pilot.readiness.'||code)) end))
 from state;
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
 allowed:=case kind when 'claimInvite' then array['type','requestId','code'] when 'acceptConsent' then array['type','requestId','noticeVersion','noticeDigest','privacyNoticeVersion','privacyNoticeDigest'] when 'submitContentIntake' then array['type','requestId','intake'] when 'updateOwnedContentIntake' then array['type','requestId','id','expectedRevision','intake'] when 'acknowledgeNotification' then array['type','requestId'] when 'acknowledgeSupportResponse' then array['type','requestId'] end;
 if allowed is null or p_request_id is null then raise exception 'INVALID';end if;
 if kind='acceptConsent' and (not p_command ? 'noticeDigest' or not p_command ? 'privacyNoticeDigest') then
  raise exception 'CONFLICT';
 end if;
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
  if kind='acceptConsent' and (p.consent_digest is null or
     p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r)) then raise exception 'CONFLICT';end if;
  return jsonb_build_object('snapshot',kinnso_internal.pilot_self_snapshot(r,p),'_pilotReplay',true);
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
  if kinnso_internal.pilot_consent_identity(r) is null
   or p_command->'noticeVersion' is distinct from to_jsonb(r.participation_notice_version)
   or p_command->'noticeDigest' is distinct from to_jsonb(r.participation_notice_digest)
   or p_command->'privacyNoticeVersion' is distinct from to_jsonb(r.privacy_notice_version)
   or p_command->'privacyNoticeDigest' is distinct from to_jsonb(r.privacy_notice_digest) then raise exception 'CONFLICT';end if;
  if p.consented_at is not null then raise exception 'CONFLICT';end if;
  update kinnso_internal.pilot_participants set consent_version=r.participation_notice_version,consent_digest=kinnso_internal.pilot_consent_identity(r),consented_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 when 'submitContentIntake','updateOwnedContentIntake' then
  if r.status<>'running' or p.role<>'creator' or p.status<>'active' or p.consented_at is null or p.consent_version is distinct from r.participation_notice_version or p.consent_digest is null or p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r)
  or not exists(select 1 from public.creators where id=a and status='active') then raise exception 'FORBIDDEN';end if;
  x:=p_command->'intake';
  perform kinnso_internal.pilot_keys(x,array['title','destination','authoredLocale','sourceSummary','sourceUrls','rightsBasis','rightsEvidenceReference','authorConsentVersion','authorConsentDigest','coverRightsConfirmed','coverRightsEvidenceReference']);
  if jsonb_typeof(x->'sourceUrls') is distinct from 'array' or jsonb_array_length(x->'sourceUrls')>20 or exists(select 1 from jsonb_array_elements(x->'sourceUrls') u where jsonb_typeof(u)<>'string')  or x->'coverRightsConfirmed' not in ('null'::jsonb,'true'::jsonb,'false'::jsonb) then raise exception 'INVALID';end if;
  if r.content_consent_digest is null or x->'authorConsentVersion' is distinct from to_jsonb(r.content_consent_version)
    or x->'authorConsentDigest' is distinct from to_jsonb(r.content_consent_digest) then raise exception 'CONFLICT';end if;
  select coalesce(array_agg(value),'{}') into urls from jsonb_array_elements_text(x->'sourceUrls');
  if kind='submitContentIntake' then
   if (select count(*) from kinnso_internal.pilot_content_intakes where run_id=r.id)>=100 then raise exception 'CONFLICT';end if;
   entity:=gen_random_uuid();
   insert into kinnso_internal.pilot_content_intakes(id,run_id,creator_participant_id,title,destination,authored_locale,source_summary,source_urls,rights_basis,rights_evidence_reference,author_consent_version,author_consent_digest,author_consented_at,consent_digest,cover_rights_confirmed,cover_rights_evidence_reference,status)
   values(entity,r.id,p.id,kinnso_internal.pilot_text(x,'title',1,160),kinnso_internal.pilot_text(x,'destination',1,160),kinnso_internal.pilot_text(x,'authoredLocale',2,20),kinnso_internal.pilot_text(x,'sourceSummary',1,4000),urls,kinnso_internal.pilot_text(x,'rightsBasis',1,20),kinnso_internal.pilot_text(x,'rightsEvidenceReference',1,500),kinnso_internal.pilot_text(x,'authorConsentVersion',1,120),r.content_consent_digest,clock_timestamp(),kinnso_internal.request_digest(jsonb_build_array(r.content_consent_version,x)::text),(x->>'coverRightsConfirmed')::boolean,kinnso_internal.pilot_text(x,'coverRightsEvidenceReference',1,500,true),'submitted');
  else
   entity:=(kinnso_internal.pilot_text(p_command,'id',36,36))::uuid;
   if jsonb_typeof(p_command->'expectedRevision')<>'number' or (p_command->>'expectedRevision')!~'^[1-9][0-9]{0,8}$' then raise exception 'INVALID';end if;
   select * into i from kinnso_internal.pilot_content_intakes where id=entity and creator_participant_id=p.id and run_id=r.id for update;
   if not found then raise exception 'NOT_FOUND';end if;
   if i.revision<>(p_command->>'expectedRevision')::int or i.status not in ('draft','rejected') then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_content_intakes set title=kinnso_internal.pilot_text(x,'title',1,160),destination=kinnso_internal.pilot_text(x,'destination',1,160),authored_locale=kinnso_internal.pilot_text(x,'authoredLocale',2,20),source_summary=kinnso_internal.pilot_text(x,'sourceSummary',1,4000),source_urls=urls,rights_basis=kinnso_internal.pilot_text(x,'rightsBasis',1,20),rights_evidence_reference=kinnso_internal.pilot_text(x,'rightsEvidenceReference',1,500),author_consent_version=kinnso_internal.pilot_text(x,'authorConsentVersion',1,120),author_consent_digest=r.content_consent_digest,author_consented_at=clock_timestamp(),consent_digest=kinnso_internal.request_digest(jsonb_build_array(r.content_consent_version,x)::text),cover_rights_confirmed=(x->>'coverRightsConfirmed')::boolean,cover_rights_evidence_reference=kinnso_internal.pilot_text(x,'coverRightsEvidenceReference',1,500,true),status='submitted',guide_draft_revision=null,content_digest=null,reviewed_guide_version=null,reviewed_at=null,reviewed_by_ops_member_id=null,review_reason=null,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
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
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,jsonb_build_object('snapshot',
  jsonb_build_object('run',jsonb_build_object('id',r.id),'participant',jsonb_build_object('id',p.id))));
 return result||jsonb_build_object('_pilotReplay',false);
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
 if found then if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;return prior.result||jsonb_build_object('_pilotReplay',true);end if;
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
 if not found or p.consented_at is null or p.consent_version is distinct from r.participation_notice_version or p.consent_digest is null or p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r) then raise exception 'FORBIDDEN';end if;
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
 return result||jsonb_build_object('_pilotReplay',false);
end $$;

-- Keep the existing ops function, grants and receipt shape. Add the marker only
-- to the return value, after its authorization and idempotency checks.
do $$
declare
 definition text:=replace(pg_get_functiondef('public.admin_apply_kinnso_pilot_command(uuid,jsonb)'::regprocedure),chr(13),'');
 replay_source text:='return prior.result;end if;';
 first_source text:='return case when raw_code is null then result else result||jsonb_build_object(''inviteCode'',raw_code) end;';
begin
 if cardinality(string_to_array(definition,replay_source))<>2 or
    cardinality(string_to_array(definition,first_source))<>2 then
  raise exception 'Unexpected ops pilot receipt source';
 end if;
 execute replace(
  replace(definition,replay_source,'return prior.result||jsonb_build_object(''_pilotReplay'',true);end if;'),
  first_source,'return (case when raw_code is null then result else result||jsonb_build_object(''inviteCode'',raw_code) end)||jsonb_build_object(''_pilotReplay'',false);'
 );
end $$;

-- Add the review preconditions inside the existing transaction and draft lock.
do $$
declare
 definition text:=replace(pg_get_functiondef('public.admin_apply_kinnso_pilot_command(uuid,jsonb)'::regprocedure),chr(13),'');
 fields_anchor text:=' if fields is null or p_request_id is null then';
 lock_anchor text:=$lock$    select * into d from kinnso_internal.guide_drafts where guide_id=i.guide_id for update;
    if not found then raise exception 'CONFLICT';end if;$lock$;
 role_anchor text:=$role$ select id into m from public.kinnso_ops_members where user_id=a and status='active' for share;$role$;
begin
 if cardinality(string_to_array(definition,fields_anchor))<>2 or
    cardinality(string_to_array(definition,lock_anchor))<>2 or
    cardinality(string_to_array(definition,role_anchor))<>2 then
  raise exception 'Unexpected ops pilot approval source';
 end if;
 definition:=replace(definition,role_anchor,$role$ select id into m from public.kinnso_ops_members where user_id=a and status='active' and role in ('admin','owner') for share;
 if not found then raise exception 'FORBIDDEN';end if;$role$);
 definition:=replace(definition,fields_anchor,$fields$ if kind='configureRun' then
  foreach k in array array['participationNoticeDigest','privacyNoticeDigest','contentConsentDigest'] loop
   if jsonb_typeof(p_command->k) is distinct from 'string' or length(p_command->>k)<>64
      or (p_command->>k) !~ '^[0-9a-f]{64}$' then raise exception 'INVALID';end if;
  end loop;
 end if;
 if kind='reviewContentIntake' and p_command->>'decision'='approve' then
  fields:=fields||array['expectedDraftRevision','expectedContentDigest'];
  if jsonb_typeof(p_command->'expectedDraftRevision') is distinct from 'number'
     or coalesce(p_command->>'expectedDraftRevision','') !~ '^[1-9][0-9]{0,8}$'
     or jsonb_typeof(p_command->'expectedContentDigest') is distinct from 'string'
     or coalesce(p_command->>'expectedContentDigest','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID';end if;
 end if;
$fields$||fields_anchor);
 definition:=replace(definition,$old$'contentConsentVersion','coordinatorReference'$old$,
  $new$'contentConsentVersion','participationNoticeDigest','privacyNoticeDigest','contentConsentDigest','coordinatorReference'$new$);
 definition:=replace(definition,'set participation_notice_version=',
  $new$set participation_notice_digest=p_command->>'participationNoticeDigest',
  privacy_notice_digest=p_command->>'privacyNoticeDigest',content_consent_digest=p_command->>'contentConsentDigest',participation_notice_version=$new$);
 definition:=replace(definition,$old$p.consent_version<>r.participation_notice_version$old$,
  $new$p.consent_version is distinct from r.participation_notice_version or p.consent_digest is null
  or p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r)$new$);
 execute replace(definition,lock_anchor,lock_anchor||$compare$
    if d.revision is distinct from (p_command->>'expectedDraftRevision')::integer
       or kinnso_internal.pilot_digest(d.payload) is distinct from p_command->>'expectedContentDigest' then
     raise exception 'CONFLICT';
    end if;$compare$);
end $$;

-- The ops snapshot may disclose invitation record metadata, never the code or hash.
do $$
declare
 definition text:=pg_get_functiondef('kinnso_internal.pilot_snapshot(uuid)'::regprocedure);
 anchor text:=$anchor$'revision',p.revision) order by p.id)$anchor$;
begin
 if cardinality(string_to_array(definition,anchor))<>2 then
  raise exception 'Unexpected ops pilot participant snapshot source';
 end if;
 execute replace(definition,anchor,$invite$'revision',p.revision,'activeInvite',(
  select jsonb_build_object('id',inv.id,'status',inv.status,'expiresAt',inv.expires_at)
  from kinnso_internal.pilot_invites inv
  where inv.participant_id=p.id and inv.status='active' and inv.expires_at>now()
  order by inv.created_at desc,inv.id limit 1)) order by p.id)$invite$);
end $$;
