-- Pilot RPCs. All state changes and their redacted audit/receipt commit together.
-- Participant attribution deliberately does not change the operations audit API.
alter table kinnso_internal.pilot_evidence
 add column participant_id uuid,
 add constraint pilot_evidence_participant_fk foreign key (run_id, participant_id)
   references kinnso_internal.pilot_participants(run_id, id),
 drop constraint pilot_evidence_entity_type_check,
 add constraint pilot_evidence_entity_type_check check (entity_type in (
   'guide', 'trip', 'mission', 'mission_participant', 'mission_submission',
   'notification', 'support_case', 'manual'
 ));
create index pilot_evidence_participant_idx
 on kinnso_internal.pilot_evidence (run_id, participant_id);

alter table kinnso_internal.pilot_collaborations
 add column status text not null default 'active' check (status in ('active', 'retired')),
 drop constraint pilot_collaborations_run_id_key;
create unique index pilot_collaborations_active_run_idx
 on kinnso_internal.pilot_collaborations (run_id) where status = 'active';

create table kinnso_internal.pilot_participant_audit (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid not null references auth.users(id),
 run_id uuid not null references kinnso_internal.pilot_runs(id),
 participant_id uuid not null,
 command_type text not null check(command_type in ('claimInvite','acceptConsent','submitContentIntake','updateOwnedContentIntake','acknowledgeNotification','acknowledgeSupportResponse','publishGuide')),
 entity_type text not null check(entity_type in ('participant','intake','notification','support_case','guide')),
 entity_id uuid not null,
 reason text check(char_length(btrim(reason)) between 1 and 1000),
 metadata jsonb not null default '{}' check(metadata='{}'::jsonb),
 transaction_id xid8 not null default pg_current_xact_id(),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(run_id,participant_id) references kinnso_internal.pilot_participants(run_id,id)
);
create index pilot_participant_audit_actor_idx on kinnso_internal.pilot_participant_audit(actor_user_id);
create index pilot_participant_audit_slot_idx on kinnso_internal.pilot_participant_audit(run_id,participant_id);
create index pilot_participant_audit_participant_idx on kinnso_internal.pilot_participant_audit(participant_id);
create index pilot_participant_audit_transaction_idx on kinnso_internal.pilot_participant_audit(transaction_id,entity_id);
alter table kinnso_internal.pilot_participant_audit enable row level security;
revoke all on kinnso_internal.pilot_participant_audit from public,anon,authenticated,service_role;

create function kinnso_internal.pilot_actor() returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor(); begin
 if not exists(select 1 from auth.users where id=a and deleted_at is null and (banned_until is null or banned_until<=now()))
 or exists(select 1 from public.creators where id=a and status in ('suspended','banned')) then raise exception 'FORBIDDEN'; end if;
 return a;
end $$;

-- Evidence is a reference to current authoritative scope, never a copied body.
create function kinnso_internal.pilot_reference_allowed(
 rid uuid, code text, kind text, eid uuid, p_participant_id uuid default null
) returns boolean language plpgsql stable set search_path='' as $$
declare
 r kinnso_internal.pilot_runs;
 traveller kinnso_internal.pilot_participants;
 creator kinnso_internal.pilot_participants;
 mission uuid;
begin
 select * into r from kinnso_internal.pilot_runs where id=rid;
 select * into traveller from kinnso_internal.pilot_participants
 where run_id=rid and pilot_cohort_role='required_traveller' and status='active';
 select * into creator from kinnso_internal.pilot_participants
 where run_id=rid and pilot_cohort_role='required_creator' and status='active';
 select mission_id into mission from kinnso_internal.pilot_collaborations
 where run_id=rid and status='active';

 if code in ('guide_discovered','trip_recovered') then
  if traveller.id is null or p_participant_id is distinct from traveller.id then return false;end if;
 elsif p_participant_id is not null then
  return false;
 end if;
 if kind='manual' then
  return eid=rid and code in (
   'privacy_support','alert_owner','physical_ios','physical_android','voiceover','nvda'
  );
 end if;
 if kind='guide' and code in ('guide_discovered','guide_saved') then
  return exists(
   select 1 from kinnso_internal.pilot_content_intakes i
   join public.guides g on g.id=i.guide_id
   join public.guide_versions v on v.guide_id=g.id and v.version=i.reviewed_guide_version
   where i.run_id=rid and i.guide_id=eid and i.status='published'
    and i.creator_participant_id=creator.id and g.creator_id=creator.user_id
    and g.status='published' and v.withdrawn_at is null
  );
 end if;
 if kind='trip' and code in ('trip_adopted','trip_revised','trip_recovered') then
  return exists(
   select 1 from public.trips t
   join public.trip_stops s on s.trip_id=t.id
   join kinnso_internal.pilot_content_intakes i
    on i.guide_id=s.source_guide_id and i.reviewed_guide_version=s.source_guide_version
   join public.guides g on g.id=i.guide_id
   join public.guide_versions v on v.guide_id=g.id and v.version=i.reviewed_guide_version
   where t.id=eid and t.owner_user_id=traveller.user_id
    and i.run_id=rid and i.status='published' and i.creator_participant_id=creator.id
    and g.creator_id=creator.user_id and g.status='published' and v.withdrawn_at is null
    and s.adopted_at>r.acceptance_started_at and s.source_withdrawn_at is null
  );
 end if;
 if kind='mission' and code in ('mission_published','application_active') then return eid=mission;end if;
 if kind='mission_participant' and code='application_active' then
  return exists(select 1 from public.mission_participants
   where id=eid and mission_id=mission and creator_id=creator.user_id);
 end if;
 if kind='mission_submission' and code='submission_approved' then
  return exists(
   select 1 from public.mission_milestone_submissions s
   join public.mission_participants p on p.id=s.mission_participant_id
   join public.mission_milestones ms on ms.id=s.mission_milestone_id and ms.mission_id=p.mission_id
   where s.id=eid and p.mission_id=mission and p.creator_id=creator.user_id
    and s.created_at>r.acceptance_started_at
  );
 end if;
 if kind='notification' and code='notification_acknowledged' then
  return exists(
   select 1 from public.notifications n
   where n.id=eid and n.creator_id=creator.user_id and n.entity_type='mission'
    and n.entity_id=mission and n.notification_type='submission.approved'
    and n.created_at>r.acceptance_started_at
    and exists(select 1 from public.mission_milestone_submissions s
     join public.mission_participants p on p.id=s.mission_participant_id
     where s.id::text=n.payload->>'submission_id'
      and p.mission_id=mission and p.creator_id=creator.user_id)
  );
 end if;
 if kind='support_case' and code in ('support_resolved','support_acknowledged') then
  return exists(select 1 from kinnso_internal.support_cases s
   where s.id=eid and s.recipient_id=traveller.user_id and s.mission_id=mission
    and s.created_at>r.acceptance_started_at);
 end if;
 return false;
end $$;

-- The same evidence predicate gates both mutation and readiness. A later piece
-- of evidence cannot silently inherit an earlier recorded pass.
create function kinnso_internal.pilot_manual_evidence(
 rid uuid, code text, reference text, as_of timestamptz
) returns boolean language sql stable set search_path='' as $$
 select exists(
  select 1 from kinnso_internal.pilot_evidence e
  join kinnso_internal.pilot_runs r on r.id=e.run_id
  join public.kinnso_ops_members m on m.id=e.captured_by_ops_member_id and m.status='active'
  where e.run_id=rid and e.check_code=code and e.evidence_reference=reference
   and e.captured_at>r.acceptance_started_at and e.captured_at<=as_of
   and kinnso_internal.pilot_reference_allowed(
    e.run_id,e.check_code,e.entity_type,e.entity_id,e.participant_id
   )
 );
$$;

create function kinnso_internal.pilot_check_rows(rid uuid) returns setof kinnso_internal.pilot_checks language plpgsql stable set search_path='' as $$
declare r kinnso_internal.pilot_runs; k kinnso_internal.pilot_checks; cp kinnso_internal.pilot_participants; tp kinnso_internal.pilot_participants; mp kinnso_internal.pilot_participants; c kinnso_internal.pilot_collaborations; stamp timestamptz;
begin
 select * into r from kinnso_internal.pilot_runs where id=rid;
 select * into cp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_creator' and status='active';
 select * into tp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_traveller' and status='active';
 select * into mp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_merchant' and status='active';
 select * into c from kinnso_internal.pilot_collaborations where run_id=rid and status='active' and creator_participant_id=cp.id and merchant_participant_id=mp.id;
 for k in select * from kinnso_internal.pilot_checks where run_id=rid order by code loop
  stamp:=null;
  if kinnso_internal.pilot_manual(k.code) then
   if k.updated_at<=r.acceptance_started_at or r.acceptance_started_at is null
    or (k.status='pass' and not kinnso_internal.pilot_manual_evidence(
     rid,k.code,k.evidence_reference,k.updated_at
    )) then
    k.status:='not_run';
   end if;
   return next k;continue;
  end if;
  case k.code
  when 'creator_public' then select greatest(cr.updated_at,cp.consented_at) into stamp from public.creators cr where cr.id=cp.user_id and cr.status='active' and length(btrim(cr.handle))>0;
  when 'merchant_approved' then select greatest(p.updated_at,app.decided_at,mp.consented_at) into stamp from public.merchant_profiles p join public.merchant_applications app on app.user_id=p.user_id and app.status='approved' where p.user_id=mp.user_id and p.status='active' order by app.decided_at desc limit 1;
  when 'mission_published' then select published_at into stamp from public.missions where id=c.mission_id and status='published';
  when 'application_active' then select greatest(approved_at,updated_at) into stamp from public.mission_participants where mission_id=c.mission_id and creator_id=cp.user_id and status='active';
  when 'submission_approved' then select s.created_at into stamp from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.mission_milestones ms on ms.id=s.mission_milestone_id and ms.mission_id=p.mission_id where p.mission_id=c.mission_id and p.creator_id=cp.user_id and s.status='approved' and s.id=(select ss.id from public.mission_milestone_submissions ss join public.mission_participants pp on pp.id=ss.mission_participant_id where pp.mission_id=c.mission_id and pp.creator_id=cp.user_id order by ss.created_at desc,ss.id desc limit 1) order by s.created_at desc limit 1;
  when 'notification_acknowledged' then select au.created_at into stamp from kinnso_internal.pilot_participant_audit au join public.notifications n on n.id=au.entity_id where au.run_id=rid and au.participant_id=cp.id and au.command_type='acknowledgeNotification' and kinnso_internal.pilot_reference_allowed(rid,k.code,'notification',n.id) order by au.created_at desc limit 1;
  when 'guide_saved' then select max(s.created_at) into stamp from public.guide_saves s join kinnso_internal.pilot_content_intakes i on i.guide_id=s.guide_id where i.run_id=rid and i.status='published' and s.traveler_user_id=tp.user_id;
  when 'trip_adopted' then select max(s.adopted_at) into stamp from public.trip_stops s join public.trips t on t.id=s.trip_id join kinnso_internal.pilot_content_intakes i on i.guide_id=s.source_guide_id and i.reviewed_guide_version=s.source_guide_version where i.run_id=rid and i.status='published' and t.owner_user_id=tp.user_id and s.source_withdrawn_at is null;
  when 'trip_revised' then select max(v.created_at) into stamp from public.trip_revisions v join public.trips t on t.id=v.trip_id where t.owner_user_id=tp.user_id and v.change_kind='edit' and exists(select 1 from public.trip_stops s join kinnso_internal.pilot_content_intakes i on i.guide_id=s.source_guide_id and i.reviewed_guide_version=s.source_guide_version where s.trip_id=t.id and i.run_id=rid and i.status='published' and s.source_withdrawn_at is null and s.adopted_at>r.acceptance_started_at and v.created_at>s.adopted_at);
  when 'support_resolved' then select max(s.updated_at) into stamp from kinnso_internal.support_cases s join kinnso_internal.pilot_evidence e on e.run_id=rid and e.entity_type='support_case' and e.entity_id=s.id and e.check_code='support_resolved' where s.status='resolved' and kinnso_internal.pilot_reference_allowed(rid,k.code,'support_case',s.id);
  when 'support_acknowledged' then select max(au.created_at) into stamp from kinnso_internal.pilot_participant_audit au join kinnso_internal.support_cases s on s.id=au.entity_id where au.run_id=rid and au.participant_id=tp.id and au.command_type='acknowledgeSupportResponse' and s.status='resolved' and kinnso_internal.pilot_reference_allowed(rid,k.code,'support_case',s.id);
  else null;
  end case;
  k.status:=case when stamp>r.acceptance_started_at then 'pass' else 'not_run' end;
  k.updated_at:=coalesce(stamp,k.updated_at);k.evidence_reference:=null;k.observed_summary:=null;
  return next k;
 end loop;
end $$;

create function kinnso_internal.pilot_execution_complete(rid uuid) returns boolean language plpgsql stable set search_path='' as $$
declare r kinnso_internal.pilot_runs; snap jsonb; latest jsonb; notif jsonb; begin
 select * into r from kinnso_internal.pilot_runs
   where id=rid;
 if r.status not in ('running','completed')
    or r.acceptance_started_at is null
    or not kinnso_internal.pilot_begin_ready(r) then
  return false;
 end if;
 if (select count(distinct p.user_id) from kinnso_internal.pilot_participants p
   join auth.users u on u.id=p.user_id
    and u.deleted_at is null
    and (u.banned_until is null
    or u.banned_until<=now())
   where p.run_id=rid
    and p.pilot_cohort_role<>'observer'
    and p.status='active'
    and p.consent_version=r.participation_notice_version
    and p.consented_at>r.acceptance_started_at
    and not exists(select 1 from public.creators cr
   where cr.id=p.user_id
    and cr.status in ('suspended','banned')))<>3 then
  return false;
 end if;
 if exists(select 1 from kinnso_internal.pilot_check_rows(rid)
   where status<>'pass') then
  return false;
 end if;
 if (select count(*) from kinnso_internal.pilot_content_intakes i
   join kinnso_internal.pilot_participants p on p.id=i.creator_participant_id
    and p.status='active'
    and p.pilot_cohort_role='required_creator'
   join public.guides g on g.id=i.guide_id
    and g.creator_id=p.user_id
    and g.status='published'
   join kinnso_internal.guide_drafts d on d.guide_id=g.id
   join public.guide_versions v on v.guide_id=g.id
    and v.version=i.reviewed_guide_version
    and v.withdrawn_at is null
   where i.run_id=rid
    and i.status='published'
    and v.published_at>r.acceptance_started_at
    and d.revision=i.guide_draft_revision
    and kinnso_internal.pilot_digest(d.payload)=i.content_digest
    and kinnso_internal.pilot_digest(jsonb_build_object('title',g.title,'city',g.city,'summary',g.summary,'content',v.content))=i.content_digest
    and v.version=(select max(version) from public.guide_versions
   where guide_id=g.id))<r.minimum_published_guides then
  return false;
 end if;
 snap:=kinnso_internal.pilot_snapshot(rid);
 -- A minimum count is not permission to conceal additional linked drift.
 if exists(select 1 from jsonb_array_elements(snap->'contentIntakes') x
 left join lateral(select f from jsonb_array_elements(snap->'facts'->'publications') f
   where f->>'intakeId'=x->>'id') pub on true
   where (x->>'guideId' is not null
    or x->>'status' in ('approved','published','withdrawn'))
    and (x->>'status' is distinct from 'published'
    or pub.f->>'status' is distinct from 'published'
    or pub.f->>'publishedVersion' is distinct from x->>'reviewedGuideVersion'
    or pub.f->>'currentDraftRevision' is distinct from x->>'guideDraftRevision'
    or pub.f->>'publishedContentDigest' is distinct from x->>'contentDigest'
    or pub.f->>'currentContentDigest' is distinct from x->>'contentDigest'
    or not exists(select 1 from kinnso_internal.pilot_participants pp
   where pp.id::text=x->>'creatorParticipantId'
    and pp.run_id=rid
    and pp.pilot_cohort_role='required_creator'
    and pp.status='active'
    and pp.user_id::text=pub.f->>'creatorUserId'))) then
  return false;
 end if;
 select s into latest from jsonb_array_elements(snap->'facts'->'submissions') s order by (s->>'capturedAt')::timestamptz desc limit 1;
 if latest is null
    or latest->>'status'<>'approved'
    or (select count(*) from jsonb_array_elements(snap->'facts'->'submissions') s
   where s->>'capturedAt'=latest->>'capturedAt')<>1 then
  return false;
 end if;
 if exists(select 1 from jsonb_array_elements(snap->'facts'->'submissions') s
   where (s->>'capturedAt')::timestamptz<=r.acceptance_started_at) then
  return false;
 end if;
 select n into notif from jsonb_array_elements(snap->'facts'->'notifications') n
   where n->>'submissionId'=latest->>'entityId'
    and (n->>'capturedAt')::timestamptz>r.acceptance_started_at order by (n->>'capturedAt')::timestamptz desc limit 1;
 if notif is null
    or (notif->>'capturedAt')::timestamptz<(latest->>'capturedAt')::timestamptz
    or (select count(*) from jsonb_array_elements(snap->'facts'->'notifications') n
   where n->>'submissionId'=latest->>'entityId'
    and n->>'capturedAt'=notif->>'capturedAt')<>1 then
  return false;
 end if;
 return notif is not null
    and exists(select 1 from kinnso_internal.pilot_participant_audit au
   join kinnso_internal.pilot_collaborations c on c.run_id=au.run_id
    and c.status='active'
    and c.creator_participant_id=au.participant_id
   where au.run_id=rid
    and au.command_type='acknowledgeNotification'
    and au.entity_id::text=notif->>'entityId'
    and au.created_at>=(notif->>'capturedAt')::timestamptz);
end $$;

create function public.apply_kinnso_pilot_participant_command(p_request_id uuid,p_command jsonb) returns jsonb
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
 if found then if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;return prior.result;end if;
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
 if r.status not in ('recruiting','running') then raise exception 'CONFLICT';end if;
 if kind='claimInvite' then
  select * into inv from kinnso_internal.pilot_invites where id=inv.id for update;
  select * into p from kinnso_internal.pilot_participants where id=inv.participant_id for update;
  if inv.status<>'active' or inv.expires_at<=clock_timestamp() or p.user_id is not null or p.status<>'invited'
  or exists(select 1 from kinnso_internal.pilot_participants where run_id=r.id and user_id=a)
  or (r.data_classification='real' and not kinnso_internal.pilot_begin_ready(r)) then raise exception 'CONFLICT';end if;
  update kinnso_internal.pilot_invites set status='claimed',claimed_at=clock_timestamp() where id=inv.id;
  update kinnso_internal.pilot_participants set user_id=a,status='joined',revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 else
  select * into p from kinnso_internal.pilot_participants where id=p.id for update;
  if p.status not in ('joined','active') then raise exception 'FORBIDDEN';end if;
 end if;
 entity:=p.id;
 case kind
 when 'claimInvite' then null;
 when 'acceptConsent' then
  if kinnso_internal.pilot_text(p_command,'noticeVersion',1,120) is distinct from r.participation_notice_version or r.privacy_notice_version is null then raise exception 'CONFLICT';end if;
  if p.consented_at is not null then raise exception 'CONFLICT';end if;
  update kinnso_internal.pilot_participants set consent_version=r.participation_notice_version,consented_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=p.id;
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
 result:=jsonb_build_object('snapshot',public.get_kinnso_pilot_self());
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then raise exception 'INVALID';
 when unique_violation then raise exception 'CONFLICT';
end $$;
create function kinnso_internal.pilot_audit(p_slot uuid,p_command text,p_entity_type text,p_entity uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); p kinnso_internal.pilot_participants; begin
 select * into p from kinnso_internal.pilot_participants where id=p_slot and user_id=a;
 if not found then raise exception 'FORBIDDEN'; end if;
 insert into kinnso_internal.pilot_participant_audit(actor_user_id,run_id,participant_id,command_type,entity_type,entity_id)
 values(a,p.run_id,p.id,p_command,p_entity_type,p_entity);
end $$;
create function kinnso_internal.pilot_keys(j jsonb,allowed text[]) returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(j) is distinct from 'object' or octet_length(j::text)>40000
 or exists(select 1 from jsonb_object_keys(j) k where not k=any(allowed))
 or exists(select 1 from unnest(allowed) k where not j ? k and k<>'requestId') then raise exception 'INVALID'; end if;
end $$;
create function kinnso_internal.pilot_text(j jsonb,k text,lo integer,hi integer,nullable boolean default false) returns text language plpgsql set search_path='' as $$
begin
 if nullable and j->k='null'::jsonb then return null; end if;
 if jsonb_typeof(j->k) is distinct from 'string' or length(btrim(j->>k))<lo or length(j->>k)>hi then raise exception 'INVALID';end if;
 return btrim(j->>k);
end $$;
create function kinnso_internal.pilot_manual(code text) returns boolean language sql immutable set search_path='' as $$
 select code=any(array['guide_discovered','trip_recovered','privacy_support','alert_owner','physical_ios','physical_android','voiceover','nvda']);
$$;
-- Strip generated day/stop identifiers when comparing authoritative publication
-- content with authored draft content; retain every authored field and ordering.
create function kinnso_internal.pilot_digest(payload jsonb) returns text language sql immutable set search_path='' as $$
 select kinnso_internal.request_digest(jsonb_build_object('title',payload->'title','city',payload->'city','summary',payload->'summary','content',jsonb_build_object('days',(
 select jsonb_agg(jsonb_build_object('offset',d->'offset','title',d->'title','stops',(
 select jsonb_agg(jsonb_build_object('title',s->'title','description',s->'description','placeId',s->'placeId','startMinuteOfDay',s->'startMinuteOfDay','durationMinutes',s->'durationMinutes') order by sn)
 from jsonb_array_elements(d->'stops') with ordinality st(s,sn))) order by dn)
 from jsonb_array_elements(payload->'content'->'days') with ordinality dy(d,dn))))::text);
$$;

create function kinnso_internal.pilot_begin_ready(r kinnso_internal.pilot_runs) returns boolean language sql stable set search_path='' as $$
 select r.participation_notice_version is not null and r.privacy_notice_version is not null and r.content_consent_version is not null
 and r.coordinator_reference is not null and r.support_owner_reference is not null and r.privacy_owner_reference is not null and r.alert_owner_reference is not null and r.private_channel_reference is not null
 and (select count(distinct role)=3 from kinnso_internal.pilot_participants where run_id=r.id and pilot_cohort_role<>'observer' and status<>'withdrawn')
 and (r.data_classification='synthetic' or exists(select 1 from kinnso_internal.pilot_runs s where s.id=r.synthetic_rehearsal_run_id and s.data_classification='synthetic' and s.status='completed' and s.candidate_release_sha=r.candidate_release_sha));
$$;

create function kinnso_internal.pilot_snapshot(p_run uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r kinnso_internal.pilot_runs; result jsonb; checks jsonb; facts jsonb; c kinnso_internal.pilot_collaborations;
begin
 select * into r from kinnso_internal.pilot_runs where id=p_run;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into c from kinnso_internal.pilot_collaborations where run_id=r.id and status='active';
 select coalesce(jsonb_agg(jsonb_build_object('code',k.code,'category',k.category,'status',k.status,'evidenceReference',k.evidence_reference,'observedSummary',k.observed_summary,'revision',k.revision,'derived',not kinnso_internal.pilot_manual(k.code)) order by k.code),'[]') into checks from kinnso_internal.pilot_check_rows(r.id) k;
 facts:=jsonb_build_object(
 'participants',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'entityId',p.id,'userId',p.user_id,'capturedAt',p.consented_at) order by p.id) from kinnso_internal.pilot_participants p join auth.users u on u.id=p.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) where p.run_id=r.id and p.status<>'withdrawn' and not exists(select 1 from public.creators cr where cr.id=p.user_id and cr.status in ('suspended','banned'))),'[]'),
 'publications',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',v.published_at,'entityId',g.id,'intakeId',i.id,'creatorUserId',g.creator_id,'status',case when v.withdrawn_at is not null then 'withdrawn' else g.status end,'publishedVersion',v.version,'publishedContentDigest',kinnso_internal.pilot_digest(jsonb_build_object('title',g.title,'city',g.city,'summary',g.summary,'content',v.content)),'currentDraftRevision',d.revision,'currentContentDigest',kinnso_internal.pilot_digest(d.payload)) order by i.id)
 from kinnso_internal.pilot_content_intakes i join public.guides g on g.id=i.guide_id left join kinnso_internal.guide_drafts d on d.guide_id=g.id left join lateral(select * from public.guide_versions where guide_id=g.id order by version desc limit 1)v on true where i.run_id=r.id and i.status<>'withdrawn'),'[]'),
 'checks',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',k.updated_at,'entityId',k.id,'code',k.code,'status',k.status,'missionId',c.mission_id,'notificationId',(select a.entity_id from kinnso_internal.pilot_participant_audit a where a.run_id=r.id and a.command_type='acknowledgeNotification' order by a.created_at desc,a.id limit 1)) order by k.code) from kinnso_internal.pilot_check_rows(r.id) k),'[]'),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',s.created_at,'entityId',s.id,'missionId',mp.mission_id,'creatorUserId',mp.creator_id,'status',s.status) order by s.created_at,s.id)
 from public.mission_milestone_submissions s join public.mission_participants mp on mp.id=s.mission_participant_id join public.mission_milestones ms on ms.id=s.mission_milestone_id and ms.mission_id=mp.mission_id join kinnso_internal.pilot_participants p on p.id=c.creator_participant_id and p.user_id=mp.creator_id where mp.mission_id=c.mission_id),'[]'),
 'notifications',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',n.created_at,'entityId',n.id,'missionId',n.entity_id,'submissionId',n.payload->>'submission_id','creatorUserId',n.creator_id,'entityType',n.entity_type,'notificationType',n.notification_type) order by n.created_at,n.id)
 from public.notifications n join kinnso_internal.pilot_participants p on p.id=c.creator_participant_id and p.user_id=n.creator_id where n.entity_type='mission' and n.entity_id=c.mission_id and n.notification_type='submission.approved' and exists(select 1 from public.mission_milestone_submissions s join public.mission_participants mp on mp.id=s.mission_participant_id where s.id::text=n.payload->>'submission_id' and mp.creator_id=p.user_id and mp.mission_id=c.mission_id)),'[]'));
 result:=jsonb_build_object('run',jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'revision',r.revision,'dataClassification',r.data_classification,'candidateReleaseSha',r.candidate_release_sha,'environmentOrigin',r.environment_origin,'acceptanceStartedAt',r.acceptance_started_at,'minimumPublishedGuides',r.minimum_published_guides,'participationNoticeVersion',r.participation_notice_version,'privacyNoticeVersion',r.privacy_notice_version,'contentConsentVersion',r.content_consent_version),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'cohortRole',p.pilot_cohort_role,'displayLabel',p.display_label,'status',p.status,'userLinked',p.user_id is not null,'consentAccepted',p.consent_version=r.participation_notice_version and p.consented_at is not null,'revision',p.revision) order by p.id) from kinnso_internal.pilot_participants p where p.run_id=r.id and p.status<>'withdrawn'),'[]'),
 'contentIntakes',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'creatorParticipantId',i.creator_participant_id,'guideId',i.guide_id,'status',i.status,'guideDraftRevision',i.guide_draft_revision,'reviewedGuideVersion',i.reviewed_guide_version,'contentDigest',i.content_digest,'title',i.title,'destination',i.destination,'authoredLocale',i.authored_locale,'revision',i.revision) order by i.id) from kinnso_internal.pilot_content_intakes i where i.run_id=r.id and i.status<>'withdrawn'),'[]'),
 'collaboration',case when c.id is not null then jsonb_build_object('id',c.id,'merchantParticipantId',c.merchant_participant_id,'creatorParticipantId',c.creator_participant_id,'missionId',c.mission_id,'steps',(select coalesce(jsonb_agg(k),'[]') from jsonb_array_elements(checks) k where k->>'code' in ('merchant_approved','mission_published','application_active','notification_acknowledged'))) end,
 'checks',checks,'facts',facts,
 'beginFacts',jsonb_build_object('rpcAvailable',to_regprocedure('public.admin_apply_kinnso_pilot_command(uuid,jsonb)') is not null,'ownersConfigured',r.coordinator_reference is not null and r.support_owner_reference is not null and r.privacy_owner_reference is not null and r.alert_owner_reference is not null and r.private_channel_reference is not null,'noticesPinned',r.participation_notice_version is not null and r.privacy_notice_version is not null and r.content_consent_version is not null,'syntheticRehearsalPassed',exists(select 1 from kinnso_internal.pilot_runs s where s.id=r.synthetic_rehearsal_run_id and s.status='completed' and s.data_classification='synthetic' and s.candidate_release_sha=r.candidate_release_sha)),
 'readiness',jsonb_build_object('stage','setup_incomplete','readyToBegin',kinnso_internal.pilot_begin_ready(r) and r.status in ('draft','recruiting'),'executionComplete',false,'blockers',jsonb_build_array(jsonb_build_object('code','server_evaluation_required','category','execution','messageKey','pilot.readiness.server_evaluation_required'))));
 return result;
end $$;

create function public.get_kinnso_ops_pilot(p_run_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); v_id uuid:=p_run_id; begin
 if not public.is_active_ops_role('moderator') then raise exception 'FORBIDDEN'; end if;
 if v_id is null then select id into v_id from kinnso_internal.pilot_runs order by (status in ('recruiting','running','paused')) desc,created_at desc,id limit 1;end if;
 if v_id is null then return jsonb_build_object('run',null,'participants','[]'::jsonb,'contentIntakes','[]'::jsonb,'collaboration',null,'checks','[]'::jsonb,'facts',jsonb_build_object('participants','[]'::jsonb,'publications','[]'::jsonb,'checks','[]'::jsonb,'submissions','[]'::jsonb,'notifications','[]'::jsonb)); end if;
 return kinnso_internal.pilot_snapshot(v_id);
end $$;

create function public.admin_apply_kinnso_pilot_command(p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); m uuid; kind text:=p_command->>'type'; fields text[]; k text; rid uuid; eid uuid;
 r kinnso_internal.pilot_runs; p kinnso_internal.pilot_participants; i kinnso_internal.pilot_content_intakes; d kinnso_internal.guide_drafts; ck kinnso_internal.pilot_checks;
 prior kinnso_internal.requests; dg text; result jsonb; raw_code text; reason text; v text; ref text; obs text; ev uuid;
begin
 if not public.is_active_ops_role('admin') then raise exception 'FORBIDDEN';end if;
 select id into m from public.kinnso_ops_members where user_id=a and status='active' for share;
 fields:=case kind
 when 'createRun' then array['type','id','name','dataClassification','candidateReleaseSha','environmentOrigin']
 when 'configureRun' then array['type','id','expectedRevision','participationNoticeVersion','privacyNoticeVersion','contentConsentVersion','coordinatorReference','supportOwnerReference','privacyOwnerReference','alertOwnerReference','privateChannelReference','syntheticRehearsalRunId']
 when 'setRunStatus' then array['type','id','expectedRevision','status','reason']
 when 'addParticipant' then array['type','id','runId','role','cohortRole','displayLabel']
 when 'setParticipantStatus' then array['type','id','expectedRevision','status','reason']
 when 'createInvite' then array['type','id','participantId','expectedRevision','expiresInHours']
 when 'revokeInvite' then array['type','id','participantId','expectedRevision','reason']
 when 'reviewContentIntake' then array['type','id','expectedRevision','decision','reason']
 when 'bindGuide' then array['type','intakeId','guideId','expectedRevision']
 when 'bindCollaboration' then array['type','id','runId','merchantParticipantId','creatorParticipantId','missionId']
 when 'setManualCheck' then array['type','id','expectedRevision','status','evidenceReference','observedSummary']
 when 'addEvidenceReference' then array['type','runId','checkCode','entityType','entityId','evidenceReference'] end;
 if kind='addEvidenceReference' and p_command ? 'participantId' then fields:=array_append(fields,'participantId');end if;
 if fields is null or p_request_id is null then raise exception 'INVALID';end if;
 perform kinnso_internal.pilot_keys(p_command,fields);
 foreach k in array fields loop
  if k='id' or k like '%Id' then
   if not(k in ('syntheticRehearsalRunId','participantId') and p_command->k='null'::jsonb and (k='syntheticRehearsalRunId' or kind='addEvidenceReference')) then perform (kinnso_internal.pilot_text(p_command,k,36,36))::uuid;end if;
  end if;
 end loop;
 if p_command ? 'expectedRevision' and (jsonb_typeof(p_command->'expectedRevision')<>'number' or (p_command->>'expectedRevision') !~ '^[1-9][0-9]{0,8}$') then raise exception 'INVALID';end if;
 if p_command ? 'reason' then reason:=kinnso_internal.pilot_text(p_command,'reason',1,1000);end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 dg:=kinnso_internal.request_digest(jsonb_build_array('pilot.ops',p_command)::text);
 select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;
 if found then if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;return prior.result;end if;
 eid:=coalesce((p_command->>'id')::uuid,(p_command->>'intakeId')::uuid,(p_command->>'entityId')::uuid);
 if kind='createRun' then
  v:=kinnso_internal.pilot_text(p_command,'environmentOrigin',1,2048);
  if v !~ '^https?://[^/@?#[:space:]]+$' then raise exception 'INVALID';end if;
  insert into kinnso_internal.pilot_runs(id,name,data_classification,candidate_release_sha,environment_origin,created_by_ops_member_id)
  values(eid,kinnso_internal.pilot_text(p_command,'name',1,200),kinnso_internal.pilot_text(p_command,'dataClassification',1,20),kinnso_internal.pilot_text(p_command,'candidateReleaseSha',1,80),v,m) returning * into r;
  insert into kinnso_internal.pilot_checks(run_id,code,category)
  select r.id,code,case when kinnso_internal.pilot_manual(code) then 'manual' else 'derived' end from unnest(array['creator_public','merchant_approved','mission_published','application_active','submission_approved','notification_acknowledged','guide_discovered','guide_saved','trip_adopted','trip_revised','trip_recovered','support_resolved','support_acknowledged','privacy_support','alert_owner','physical_ios','physical_android','voiceover','nvda']) code;
 else
  rid:=case when kind in ('configureRun','setRunStatus') then eid else (p_command->>'runId')::uuid end;
  if kind in ('createInvite','revokeInvite','setParticipantStatus') then select run_id into rid from kinnso_internal.pilot_participants where id=case when kind='setParticipantStatus' then eid else (p_command->>'participantId')::uuid end;end if;
  if kind in ('reviewContentIntake','bindGuide') then select run_id into rid from kinnso_internal.pilot_content_intakes where id=eid;end if;
  if kind='setManualCheck' then select run_id into rid from kinnso_internal.pilot_checks where id=eid;end if;
  select * into r from kinnso_internal.pilot_runs where id=rid for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if r.status in ('completed','cancelled') then raise exception 'CONFLICT';end if;
  if r.status='paused' and kind not in ('setRunStatus','revokeInvite','setParticipantStatus') then raise exception 'CONFLICT';end if;
  if kind in ('configureRun','setRunStatus') and r.revision<>(p_command->>'expectedRevision')::integer then raise exception 'CONFLICT';end if;
  case kind
  when 'configureRun' then
   if r.status<>'draft' or exists(select 1 from kinnso_internal.pilot_participants where run_id=r.id and user_id is not null) then raise exception 'CONFLICT';end if;
   if p_command->>'syntheticRehearsalRunId' is not null and not exists(select 1 from kinnso_internal.pilot_runs s where s.id=(p_command->>'syntheticRehearsalRunId')::uuid and s.status='completed' and s.data_classification='synthetic' and s.candidate_release_sha=r.candidate_release_sha) then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_runs set participation_notice_version=kinnso_internal.pilot_text(p_command,'participationNoticeVersion',1,120),privacy_notice_version=kinnso_internal.pilot_text(p_command,'privacyNoticeVersion',1,120),content_consent_version=kinnso_internal.pilot_text(p_command,'contentConsentVersion',1,120),coordinator_reference=kinnso_internal.pilot_text(p_command,'coordinatorReference',1,200),support_owner_reference=kinnso_internal.pilot_text(p_command,'supportOwnerReference',1,200),privacy_owner_reference=kinnso_internal.pilot_text(p_command,'privacyOwnerReference',1,200),alert_owner_reference=kinnso_internal.pilot_text(p_command,'alertOwnerReference',1,200),private_channel_reference=kinnso_internal.pilot_text(p_command,'privateChannelReference',1,200),synthetic_rehearsal_run_id=(p_command->>'syntheticRehearsalRunId')::uuid,revision=revision+1,updated_at=clock_timestamp() where id=r.id;
  when 'setRunStatus' then
   v:=kinnso_internal.pilot_text(p_command,'status',1,20);
   if not ((r.status='draft' and v in ('recruiting','cancelled')) or (r.status='recruiting' and v in ('running','paused','cancelled')) or (r.status='running' and v in ('paused','completed','cancelled')) or (r.status='paused' and v in ('recruiting','running','cancelled'))) then raise exception 'CONFLICT';end if;
   if v in ('recruiting','running') and not kinnso_internal.pilot_begin_ready(r) then raise exception 'CONFLICT';end if;
   if v='completed' then
    -- Hold the authoritative aggregates while evaluating the final transition.
    -- Existing draft/campaign commands lock these same aggregate rows.
    perform 1 from public.guides g join kinnso_internal.pilot_content_intakes pi on pi.guide_id=g.id where pi.run_id=r.id and pi.status<>'withdrawn' order by g.id for share of g;
    perform 1 from kinnso_internal.guide_drafts gd join kinnso_internal.pilot_content_intakes pi on pi.guide_id=gd.guide_id where pi.run_id=r.id and pi.status<>'withdrawn' order by gd.guide_id for share of gd;
    perform 1 from auth.users u join kinnso_internal.pilot_participants pp on pp.user_id=u.id where pp.run_id=r.id order by u.id for share of u;
    perform 1 from public.creators cr join kinnso_internal.pilot_participants pp on pp.user_id=cr.id where pp.run_id=r.id order by cr.id for share of cr;
    perform 1 from public.missions mission join kinnso_internal.pilot_collaborations pc on pc.mission_id=mission.id where pc.run_id=r.id and pc.status='active' for share of mission;
    perform 1 from public.mission_participants mp join kinnso_internal.pilot_collaborations pc on pc.mission_id=mp.mission_id where pc.run_id=r.id and pc.status='active' order by mp.id for share of mp;
    perform 1 from public.mission_milestone_submissions sub join public.mission_participants mp on mp.id=sub.mission_participant_id join kinnso_internal.pilot_collaborations pc on pc.mission_id=mp.mission_id where pc.run_id=r.id and pc.status='active' order by sub.id for share of sub;
    if not kinnso_internal.pilot_execution_complete(r.id) then raise exception 'CONFLICT';end if;
   end if;
   update kinnso_internal.pilot_runs set status=v,revision=revision+1,acceptance_started_at=case when v in ('recruiting','running') then coalesce(acceptance_started_at,clock_timestamp()) else acceptance_started_at end,updated_at=clock_timestamp() where id=r.id;
  when 'addParticipant' then
   if (select count(*) from kinnso_internal.pilot_participants where run_id=r.id)>=100 then raise exception 'CONFLICT';end if;
   insert into kinnso_internal.pilot_participants(id,run_id,role,pilot_cohort_role,display_label) values(eid,r.id,kinnso_internal.pilot_text(p_command,'role',1,20),kinnso_internal.pilot_text(p_command,'cohortRole',1,30),kinnso_internal.pilot_text(p_command,'displayLabel',1,80));
  when 'setParticipantStatus' then
   select * into p from kinnso_internal.pilot_participants
    where id=eid for update;
   v:=kinnso_internal.pilot_text(p_command,'status',1,20);
   if p.revision<>(p_command->>'expectedRevision')::integer
     or p.status in ('withdrawn','completed')
     or v not in ('active','paused','withdrawn','completed')
     or v=p.status
     or (v='active'
     and (p.user_id is null
     or p.consented_at is null
     or p.consent_version<>r.participation_notice_version))
     or (v='completed'
     and p.status<>'active') then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_participants set status=v,revision=revision+1,updated_at=clock_timestamp() where id=p.id;
   if v='withdrawn' then
    update kinnso_internal.pilot_invites set status='revoked'
    where participant_id=p.id and status='active';
    if p.role in ('creator','merchant') then
     update kinnso_internal.pilot_collaborations
     set status='retired',revision=revision+1,updated_at=clock_timestamp()
     where run_id=r.id and status='active'
      and (creator_participant_id=p.id or merchant_participant_id=p.id);
    end if;
    if p.role='creator' then
     update kinnso_internal.pilot_content_intakes
     set status='withdrawn',revision=revision+1,updated_at=clock_timestamp()
     where run_id=r.id and creator_participant_id=p.id and status<>'withdrawn';
    end if;
   end if;
  when 'createInvite' then
   select * into p from kinnso_internal.pilot_participants where id=(p_command->>'participantId')::uuid for update;
   if p.revision is distinct from (p_command->>'expectedRevision')::integer
    or p.status<>'invited' or p.user_id is not null then raise exception 'CONFLICT';end if;
   if r.data_classification='real' and not kinnso_internal.pilot_begin_ready(r) then raise exception 'CONFLICT';end if;
   if jsonb_typeof(p_command->'expiresInHours')<>'number' or (p_command->>'expiresInHours')!~'^[0-9]{1,3}$' or (p_command->>'expiresInHours')::int not between 1 and 168 then raise exception 'INVALID';end if;
   update kinnso_internal.pilot_invites set status='revoked' where participant_id=p.id and status='active';
   update kinnso_internal.pilot_participants
   set revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
   raw_code:=encode(extensions.gen_random_bytes(32),'hex');
   insert into kinnso_internal.pilot_invites(id,participant_id,code_hash,expires_at,created_by_ops_member_id) values(eid,p.id,extensions.digest(raw_code,'sha256'),clock_timestamp()+make_interval(hours=>(p_command->>'expiresInHours')::int),m);
  when 'revokeInvite' then
   select * into p from kinnso_internal.pilot_participants
   where id=(p_command->>'participantId')::uuid for update;
   if p.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_invites set status='revoked' where id=eid and participant_id=(p_command->>'participantId')::uuid and status='active';
   if not found then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_participants
   set revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
  when 'bindGuide' then
   select * into i from kinnso_internal.pilot_content_intakes where id=eid for update;
   if i.revision<>(p_command->>'expectedRevision')::int or i.status in ('published','withdrawn') then raise exception 'CONFLICT';end if;
   perform 1 from public.guides g join kinnso_internal.pilot_participants pp on pp.id=i.creator_participant_id and pp.user_id=g.creator_id and pp.status='active' where g.id=(p_command->>'guideId')::uuid and g.status<>'withdrawn' for update of g;
   if not found then raise exception 'FORBIDDEN';end if;
   if exists(select 1 from kinnso_internal.pilot_content_intakes where guide_id=(p_command->>'guideId')::uuid and id<>i.id) then raise exception 'CONFLICT';end if;
   update kinnso_internal.pilot_content_intakes set guide_id=(p_command->>'guideId')::uuid,status='submitted',guide_draft_revision=null,content_digest=null,reviewed_guide_version=null,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
  when 'reviewContentIntake' then
   select * into i from kinnso_internal.pilot_content_intakes where id=eid for update;
   if i.revision<>(p_command->>'expectedRevision')::int or i.status not in ('submitted','rejected','approved','published') then raise exception 'CONFLICT';end if;
   v:=kinnso_internal.pilot_text(p_command,'decision',1,20);
   if v not in ('approve','reject') then raise exception 'INVALID';end if;
   if v='approve' then
    perform 1 from public.guides g join kinnso_internal.pilot_participants pp on pp.id=i.creator_participant_id and pp.user_id=g.creator_id and pp.status='active' join public.creators cr on cr.id=pp.user_id and cr.status='active' where g.id=i.guide_id and g.status<>'withdrawn' for update of g;
    if not found or i.author_consent_version<>r.content_consent_version then raise exception 'CONFLICT';end if;
    select * into d from kinnso_internal.guide_drafts where guide_id=i.guide_id for update;
    if not found then raise exception 'CONFLICT';end if;
   end if;
   update kinnso_internal.pilot_content_intakes set status=case v when 'approve' then 'approved' else 'rejected' end,guide_draft_revision=case when v='approve' then d.revision end,content_digest=case when v='approve' then kinnso_internal.pilot_digest(d.payload) end,reviewed_guide_version=(select max(version) from public.guide_versions where guide_id=i.guide_id),review_reason=reason,reviewed_by_ops_member_id=m,reviewed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=i.id;
  when 'bindCollaboration' then
   if (p_command->>'merchantParticipantId')::uuid=(p_command->>'creatorParticipantId')::uuid then raise exception 'INVALID';end if;
   if not exists(select 1 from kinnso_internal.pilot_participants cp
    join kinnso_internal.pilot_participants mp on mp.run_id=cp.run_id
    join public.merchant_profiles merchant on merchant.user_id=mp.user_id
     and merchant.status='active'
    join public.missions mission on mission.merchant_profile_id=merchant.id
    where cp.id=(p_command->>'creatorParticipantId')::uuid
     and mp.id=(p_command->>'merchantParticipantId')::uuid
     and cp.run_id=r.id
     and cp.role='creator'
     and mp.role='merchant'
     and cp.status='active'
     and mp.status='active'
     and mission.id=(p_command->>'missionId')::uuid)

     or exists(select 1 from kinnso_internal.pilot_collaborations
    where mission_id=(p_command->>'missionId')::uuid
     and (status='active'
     or run_id<>r.id)) then raise exception 'CONFLICT';end if;
   insert into kinnso_internal.pilot_collaborations(id,run_id,merchant_participant_id,creator_participant_id,mission_id) values(eid,r.id,(p_command->>'merchantParticipantId')::uuid,(p_command->>'creatorParticipantId')::uuid,(p_command->>'missionId')::uuid);
  when 'setManualCheck' then
   select * into ck from kinnso_internal.pilot_checks where id=eid for update;
   if not kinnso_internal.pilot_manual(ck.code) then raise exception 'INVALID';end if;
   if r.status<>'running' or r.acceptance_started_at is null or clock_timestamp()<=r.acceptance_started_at or ck.revision<>(p_command->>'expectedRevision')::int then raise exception 'CONFLICT';end if;
   v:=kinnso_internal.pilot_text(p_command,'status',1,20);ref:=kinnso_internal.pilot_text(p_command,'evidenceReference',1,500,true);obs:=kinnso_internal.pilot_text(p_command,'observedSummary',1,1000,true);
   if v not in ('not_run','pass','fail','blocked') or (v='pass' and (ref is null or obs is null)) then raise exception 'INVALID';end if;
   if v='pass' and not kinnso_internal.pilot_manual_evidence(r.id,ck.code,ref,clock_timestamp()) then
    raise exception 'CONFLICT';
   end if;
   update kinnso_internal.pilot_checks set status=v,evidence_reference=ref,observed_summary=obs,revision=revision+1,updated_by_ops_member_id=m,updated_at=clock_timestamp() where id=eid;
  when 'addEvidenceReference' then
   if r.status<>'running' or r.acceptance_started_at is null or clock_timestamp()<=r.acceptance_started_at then raise exception 'CONFLICT';end if;
   k:=kinnso_internal.pilot_text(p_command,'checkCode',1,100);v:=kinnso_internal.pilot_text(p_command,'entityType',1,40);ref:=kinnso_internal.pilot_text(p_command,'evidenceReference',1,500,true);
   if not exists(select 1 from kinnso_internal.pilot_checks where run_id=r.id and code=k) or not coalesce(kinnso_internal.pilot_reference_allowed(r.id,k,v,eid,(p_command->>'participantId')::uuid),false) or (kinnso_internal.pilot_manual(k) and ref is null) then raise exception 'INVALID';end if;
   insert into kinnso_internal.pilot_evidence(run_id,check_code,entity_type,entity_id,participant_id,evidence_reference,captured_by_ops_member_id,captured_at) values(r.id,k,v,eid,(p_command->>'participantId')::uuid,ref,m,clock_timestamp()) returning id into ev;
  else raise exception 'INVALID';
  end case;
 end if;
 perform public.ops_audit_log_append('pilot',coalesce(eid,r.id),'pilot.'||kind,reason,jsonb_build_object('runId',r.id));
 result:=jsonb_build_object('snapshot',kinnso_internal.pilot_snapshot(r.id));
 if kind='createInvite' then result:=result||jsonb_build_object('invite',jsonb_build_object('id',eid,'participantId',p.id,'expiresAt',(select expires_at from kinnso_internal.pilot_invites where id=eid)));end if;
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return case when raw_code is null then result else result||jsonb_build_object('inviteCode',raw_code) end;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then raise exception 'INVALID';
 when unique_violation then raise exception 'CONFLICT';
end $$;
create function public.get_kinnso_pilot_self() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); p kinnso_internal.pilot_participants; r kinnso_internal.pilot_runs; begin
 select s.* into p from kinnso_internal.pilot_participants s join kinnso_internal.pilot_runs x on x.id=s.run_id where s.user_id=a order by (x.status in ('recruiting','running','paused')) desc,s.created_at desc,s.id limit 1;
 if p.id is not null then select * into r from kinnso_internal.pilot_runs where id=p.run_id; end if;
 return jsonb_build_object('run',case when r.id is not null then jsonb_build_object('id',r.id,'name',r.name,'status',r.status) end,'participant',case when p.id is not null then jsonb_build_object('id',p.id,'role',p.role,'status',p.status,'consentVersion',p.consent_version) end,
 'nextStep',case when p.id is not null and p.status not in ('withdrawn','completed') then jsonb_build_object('code',case when p.consented_at is null then 'accept_consent' else 'open_workflow' end,'href',case p.role when 'creator' then '/en/studio/guides' when 'merchant' then '/en/merchant' else '/en/trips' end,'messageKey','pilot.next.open_workflow') end,
 'readiness',jsonb_build_object('stage',case when r.status='running' and p.status='active' then 'executing' else 'blocked' end,'readyToBegin',false,'executionComplete',false,'blockers','[]'::jsonb));
end $$;

-- Keep the mature publishers as unexposed delegates. Existing public callers
-- enter the pilot guard too, so an old client cannot bypass the new boundary.
alter function public.publish_kinnso_guide_draft(uuid,integer,uuid) set schema kinnso_internal;
alter function public.publish_guide_version(uuid,integer,uuid,jsonb) set schema kinnso_internal;
do $$
declare definition text; begin
 definition:=pg_get_functiondef('kinnso_internal.publish_kinnso_guide_draft(uuid,integer,uuid)'::regprocedure);
 if position('snapshot:=public.publish_guide_version' in definition)=0 or position('set revision=revision+1,base_version=ver+1' in definition)=0 then raise exception 'Unexpected publisher source';end if;
 definition:=replace(definition,'snapshot:=public.publish_guide_version','snapshot:=kinnso_internal.publish_guide_version');
 -- Publishing identical reviewed content must not manufacture a content edit.
 definition:=replace(definition,'set revision=revision+1,base_version=ver+1','set revision=revision+case when exists(select 1 from kinnso_internal.pilot_content_intakes where guide_id=p_draft_id) then 0 else 1 end,base_version=ver+1');
 execute definition;
 -- Preserve the established notification trigger and its failure isolation,
 -- adding only the exact source identifier needed for auditable acknowledgement.
 definition:=pg_get_functiondef('public.notify_submission_status_change()'::regprocedure);
 if position('jsonb_build_object(''mission_title'', v_mission_title)' in definition)=0 then raise exception 'Unexpected notification source';end if;
 execute replace(definition,'jsonb_build_object(''mission_title'', v_mission_title)','jsonb_build_object(''mission_title'', v_mission_title, ''submission_id'', new.id)');
end $$;
revoke all on function kinnso_internal.publish_kinnso_guide_draft(uuid,integer,uuid),kinnso_internal.publish_guide_version(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.get_kinnso_pilot_publish_permission(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); i kinnso_internal.pilot_content_intakes; r kinnso_internal.pilot_runs; d kinnso_internal.guide_drafts; ver integer; begin
 if not exists(select 1 from public.guides where id=p_guide_id and creator_id=a) and not public.is_active_ops_role('moderator') then raise exception 'FORBIDDEN';end if;
 select * into i from kinnso_internal.pilot_content_intakes where guide_id=p_guide_id;
 if not found then return jsonb_build_object('pilotLinked',false,'allowed',true);end if;
 select * into r from kinnso_internal.pilot_runs where id=i.run_id;
 select * into d from kinnso_internal.guide_drafts where guide_id=p_guide_id;
 select max(version) into ver from public.guide_versions where guide_id=p_guide_id;
 return jsonb_build_object('pilotLinked',true,'runStatus',r.status,'intakeStatus',i.status,'approvedDraftRevision',i.guide_draft_revision,'approvedContentDigest',i.content_digest,'reviewedGuideVersion',i.reviewed_guide_version,'currentDraftRevision',d.revision,'currentContentDigest',kinnso_internal.pilot_digest(d.payload),'publishedVersion',ver,'creatorIsActive',exists(select 1 from public.guides g join public.creators cr on cr.id=g.creator_id and cr.status='active' join kinnso_internal.pilot_participants p on p.id=i.creator_participant_id and p.user_id=cr.id and p.status='active' where g.id=p_guide_id),'guideIsWithdrawn',exists(select 1 from public.guides where id=p_guide_id and status='withdrawn'));
end $$;

create function public.publish_kinnso_pilot_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb
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
 if r.status<>'running' or i.status<>'approved' or d.revision is distinct from p_expected_revision or d.revision is distinct from i.guide_draft_revision or kinnso_internal.pilot_digest(d.payload) is distinct from i.content_digest or (select max(version) from public.guide_versions where guide_id=p_draft_id) is distinct from i.reviewed_guide_version then raise exception 'CONFLICT';end if;
 -- This unexposed row also authenticates the table-level publishing guard.
 -- It rolls back with any publisher failure; client-settable GUCs are not used.
 perform kinnso_internal.pilot_audit(p.id,'publishGuide','guide',p_draft_id);
 result:=kinnso_internal.publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 select * into v from public.guide_versions where guide_id=p_draft_id order by version desc limit 1;
 if kinnso_internal.pilot_digest(jsonb_build_object('title',d.payload->'title','city',d.payload->'city','summary',d.payload->'summary','content',v.content)) is distinct from i.content_digest then raise exception 'CONFLICT';end if;
 update kinnso_internal.pilot_content_intakes set status='published',reviewed_guide_version=v.version,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return result;
end $$;
create function public.publish_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kinnso_internal.actor();return public.publish_kinnso_pilot_guide_draft(p_draft_id,p_expected_revision,p_request_id);end $$;
create function public.publish_guide_version(p_guide_id uuid,p_expected_version integer,p_request_id uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform kinnso_internal.actor();
 perform 1 from public.guides where id=p_guide_id for update;
 if exists(select 1 from kinnso_internal.pilot_content_intakes where guide_id=p_guide_id) then raise exception 'CONFLICT';end if;
 return kinnso_internal.publish_guide_version(p_guide_id,p_expected_version,p_request_id,p_content);
end $$;

create function kinnso_internal.pilot_guard_guide_publish() returns trigger language plpgsql security definer set search_path='' as $$
declare i kinnso_internal.pilot_content_intakes; d kinnso_internal.guide_drafts; a uuid; begin
 if new.status<>'published' or (new.status=old.status and new.title=old.title and new.city=old.city and new.summary=old.summary and new.cover_url=old.cover_url and new.published_at is not distinct from old.published_at) then return new;end if;
 select * into i from kinnso_internal.pilot_content_intakes where guide_id=new.id;
 if not found then return new;end if;
 a:=kinnso_internal.pilot_actor();
 select * into d from kinnso_internal.guide_drafts where guide_id=new.id;
 if not exists(select 1 from kinnso_internal.pilot_runs where id=i.run_id and status='running')
 or i.status<>'approved' or d.revision is distinct from i.guide_draft_revision or kinnso_internal.pilot_digest(d.payload) is distinct from i.content_digest
 or new.title is distinct from d.payload->>'title' or new.city is distinct from d.payload->>'city' or new.summary is distinct from d.payload->>'summary'
 or new.cover_url is distinct from old.cover_url
 or not exists(select 1 from kinnso_internal.pilot_participant_audit au where au.transaction_id=pg_current_xact_id_if_assigned() and au.actor_user_id=a and au.run_id=i.run_id and au.participant_id=i.creator_participant_id and au.command_type='publishGuide' and au.entity_type='guide' and au.entity_id=new.id) then raise exception 'CONFLICT';end if;
 return new;
end $$;
create trigger pilot_guard_guide_publish before update of status,title,city,summary,cover_url,published_at on public.guides for each row execute function kinnso_internal.pilot_guard_guide_publish();

-- Explicit grants are applied last, including revocation of Supabase defaults.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kinnso_internal' and p.proname like 'pilot_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on function public.get_kinnso_ops_pilot(uuid),public.admin_apply_kinnso_pilot_command(uuid,jsonb),public.get_kinnso_pilot_self(),public.apply_kinnso_pilot_participant_command(uuid,jsonb),public.get_kinnso_pilot_publish_permission(uuid),public.publish_kinnso_pilot_guide_draft(uuid,integer,uuid),public.publish_kinnso_guide_draft(uuid,integer,uuid),public.publish_guide_version(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_ops_pilot(uuid),public.admin_apply_kinnso_pilot_command(uuid,jsonb),public.get_kinnso_pilot_self(),public.apply_kinnso_pilot_participant_command(uuid,jsonb),public.get_kinnso_pilot_publish_permission(uuid),public.publish_kinnso_pilot_guide_draft(uuid,integer,uuid),public.publish_kinnso_guide_draft(uuid,integer,uuid),public.publish_guide_version(uuid,integer,uuid,jsonb) to authenticated;
