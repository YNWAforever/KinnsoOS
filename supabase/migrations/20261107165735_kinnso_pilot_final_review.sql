alter table kinnso_internal.pilot_participant_audit drop constraint pilot_participant_audit_command_type_check, add constraint pilot_participant_audit_command_type_check check(command_type in ('claimInvite','acceptConsent','submitContentIntake','updateOwnedContentIntake','acknowledgeNotification','acknowledgeSupportResponse','publishGuide','withdrawParticipation'));
-- Exact review identity includes the authored draft, guide cover and consented rights.
create or replace function kinnso_internal.pilot_review_digest(payload jsonb, intake kinnso_internal.pilot_content_intakes)
returns text language sql stable set search_path='' as $$
 select kinnso_internal.request_digest(jsonb_build_array(kinnso_internal.pilot_digest(payload),
  (select g.cover_url from public.guides g where g.id=intake.guide_id),intake.authored_locale,
  intake.source_summary,intake.source_urls,intake.rights_basis,intake.rights_evidence_reference,
  intake.author_consent_version,intake.author_consent_digest,intake.cover_rights_confirmed,
  intake.cover_rights_evidence_reference)::text);
$$;
revoke all on function kinnso_internal.pilot_review_digest(jsonb,kinnso_internal.pilot_content_intakes) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION kinnso_internal.pilot_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=kinnso_internal.actor(); begin
 if not exists(select 1 from auth.users where id=a and email_confirmed_at is not null and nullif(btrim(email),'') is not null and deleted_at is null and (banned_until is null or banned_until<=now()))
 or exists(select 1 from public.creators where id=a and status in ('suspended','banned')) then raise exception 'FORBIDDEN'; end if;
 return a;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_ops_member_role(p_member_id uuid, p_role text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id uuid;
  v_current_role text;
  v_current_status text;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kinnso_ops_owner_invariant', 0)
  );
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select m.id into v_caller_id
    from public.kinnso_ops_members m
   where m.user_id = auth.uid()
     and m.status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;
  select m.role, m.status into v_current_role, v_current_status
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_role = p_role then return; end if;
  if p_role <> 'owner' and v_current_role = 'owner' and v_current_status = 'active' then
    select count(*) into v_owner_count
      from public.kinnso_ops_members m
     where m.role = 'owner'
       and m.status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members
     set role = p_role
   where id = p_member_id;
  perform public.ops_audit_log_append(
    'ops_member',
    p_member_id,
    'role.set',
    trim(p_reason),
    jsonb_build_object('from', v_current_role, 'to', p_role)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_suspend_ops_member(p_member_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id uuid;
  v_current_status text;
  v_current_role text;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long' using errcode = '22000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kinnso_ops_owner_invariant', 0)
  );
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select m.id into v_caller_id
    from public.kinnso_ops_members m
   where m.user_id = auth.uid()
     and m.status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_suspend' using errcode = '42501';
  end if;
  select m.status, m.role into v_current_status, v_current_role
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_status = 'suspended' then return; end if;
  if v_current_status <> 'active' then
    raise exception 'not_found_or_not_active' using errcode = '22000';
  end if;
  if v_current_role = 'owner' then
    select count(*) into v_owner_count
      from public.kinnso_ops_members m
     where m.role = 'owner'
       and m.status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members
     set status = 'suspended'
   where id = p_member_id;
  perform public.ops_audit_log_append(
    'ops_member',
    p_member_id,
    'status.suspended',
    trim(p_reason),
    '{}'::jsonb
  );
end
$function$;

CREATE OR REPLACE FUNCTION kinnso_internal.pilot_check_rows(rid uuid)
 RETURNS SETOF kinnso_internal.pilot_checks
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare r kinnso_internal.pilot_runs; k kinnso_internal.pilot_checks; cp kinnso_internal.pilot_participants; tp kinnso_internal.pilot_participants; mp kinnso_internal.pilot_participants; c kinnso_internal.pilot_collaborations; stamp timestamptz;
begin
 select * into r from kinnso_internal.pilot_runs where id=rid;
 select * into cp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_creator' and (status='active' or (status='completed' and r.status='completed'));
 select * into tp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_traveller' and (status='active' or (status='completed' and r.status='completed'));
 select * into mp from kinnso_internal.pilot_participants where run_id=rid and pilot_cohort_role='required_merchant' and (status='active' or (status='completed' and r.status='completed'));
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
  when 'creator_public' then select greatest(cr.updated_at,cp.consented_at) into stamp from public.creators cr where cr.id=cp.user_id and cr.status='active' and length(btrim(cr.handle))>0 and cr.public_profile is not null;
  when 'merchant_approved' then select greatest(p.updated_at,app.decided_at,mp.consented_at) into stamp from public.merchant_profiles p join public.merchant_applications app on app.user_id=p.user_id and app.status='approved' and app.created_at>r.acceptance_started_at where p.user_id=mp.user_id and p.status='active' order by app.decided_at desc limit 1;
  when 'mission_published' then select published_at into stamp from public.missions where id=c.mission_id and status='published';
  when 'application_active' then select greatest(approved_at,updated_at) into stamp from public.mission_participants where mission_id=c.mission_id and creator_id=cp.user_id and created_at>r.acceptance_started_at and (status='active' or (status='completed' and r.status='completed'));
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
end $function$;
CREATE OR REPLACE FUNCTION kinnso_internal.pilot_snapshot(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r kinnso_internal.pilot_runs; result jsonb; checks jsonb; facts jsonb; c kinnso_internal.pilot_collaborations;
begin
 select * into r from kinnso_internal.pilot_runs where id=p_run;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into c from kinnso_internal.pilot_collaborations where run_id=r.id and status='active';
 select coalesce(jsonb_agg(jsonb_build_object('code',k.code,'category',k.category,'status',k.status,'evidenceReference',k.evidence_reference,'observedSummary',k.observed_summary,'revision',k.revision,'derived',not kinnso_internal.pilot_manual(k.code)) order by k.code),'[]') into checks from kinnso_internal.pilot_check_rows(r.id) k;
 facts:=jsonb_build_object(
 'participants',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'entityId',p.id,'userId',p.user_id,'capturedAt',p.consented_at) order by p.id) from kinnso_internal.pilot_participants p join auth.users u on u.id=p.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) where p.run_id=r.id and p.status<>'withdrawn' and not exists(select 1 from public.creators cr where cr.id=p.user_id and cr.status in ('suspended','banned'))),'[]'),
 'publications',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',v.published_at,'entityId',g.id,'intakeId',i.id,'creatorUserId',g.creator_id,'status',case when v.withdrawn_at is not null then 'withdrawn' else g.status end,'publishedVersion',v.version,'publishedContentDigest',kinnso_internal.pilot_review_digest(jsonb_build_object('title',g.title,'city',g.city,'summary',g.summary,'content',v.content),i),'currentDraftRevision',d.revision,'currentContentDigest',kinnso_internal.pilot_review_digest(d.payload,i)) order by i.id)
 from kinnso_internal.pilot_content_intakes i join public.guides g on g.id=i.guide_id left join kinnso_internal.guide_drafts d on d.guide_id=g.id left join lateral(select * from public.guide_versions where guide_id=g.id order by version desc limit 1)v on true where i.run_id=r.id and i.status<>'withdrawn'),'[]'),
 'checks',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',k.updated_at,'entityId',k.id,'code',k.code,'status',k.status,'missionId',c.mission_id,'notificationId',(select a.entity_id from kinnso_internal.pilot_participant_audit a where a.run_id=r.id and a.command_type='acknowledgeNotification' order by a.created_at desc,a.id limit 1)) order by k.code) from kinnso_internal.pilot_check_rows(r.id) k),'[]'),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',s.created_at,'entityId',s.id,'missionId',mp.mission_id,'creatorUserId',mp.creator_id,'status',s.status) order by s.created_at,s.id)
 from public.mission_milestone_submissions s join public.mission_participants mp on mp.id=s.mission_participant_id join public.mission_milestones ms on ms.id=s.mission_milestone_id and ms.mission_id=mp.mission_id join kinnso_internal.pilot_participants p on p.id=c.creator_participant_id and p.user_id=mp.creator_id where mp.mission_id=c.mission_id),'[]'),
 'notifications',coalesce((select jsonb_agg(jsonb_build_object('runId',r.id,'dataClassification',r.data_classification,'capturedAt',n.created_at,'entityId',n.id,'missionId',n.entity_id,'submissionId',n.payload->>'submission_id','creatorUserId',n.creator_id,'entityType',n.entity_type,'notificationType',n.notification_type) order by n.created_at,n.id)
 from public.notifications n join kinnso_internal.pilot_participants p on p.id=c.creator_participant_id and p.user_id=n.creator_id where n.entity_type='mission' and n.entity_id=c.mission_id and n.notification_type='submission.approved' and exists(select 1 from public.mission_milestone_submissions s join public.mission_participants mp on mp.id=s.mission_participant_id where s.id::text=n.payload->>'submission_id' and mp.creator_id=p.user_id and mp.mission_id=c.mission_id)),'[]'));
 result:=jsonb_build_object('run',jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'revision',r.revision,'dataClassification',r.data_classification,'candidateReleaseSha',r.candidate_release_sha,'environmentOrigin',r.environment_origin,'acceptanceStartedAt',r.acceptance_started_at,'minimumPublishedGuides',r.minimum_published_guides,'participationNoticeVersion',r.participation_notice_version,'privacyNoticeVersion',r.privacy_notice_version,'contentConsentVersion',r.content_consent_version),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'cohortRole',p.pilot_cohort_role,'displayLabel',p.display_label,'status',p.status,'userLinked',p.user_id is not null,'consentAccepted',p.consent_version=r.participation_notice_version and p.consented_at is not null,'revision',p.revision,'activeInvite',(
  select jsonb_build_object('id',inv.id,'status',inv.status,'expiresAt',inv.expires_at)
  from kinnso_internal.pilot_invites inv
  where inv.participant_id=p.id and inv.status='active' and inv.expires_at>now()
  order by inv.created_at desc,inv.id limit 1)) order by p.id) from kinnso_internal.pilot_participants p where p.run_id=r.id and p.status<>'withdrawn'),'[]'),
 'contentIntakes',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'creatorParticipantId',i.creator_participant_id,'guideId',i.guide_id,'status',i.status,'guideDraftRevision',i.guide_draft_revision,'reviewedGuideVersion',i.reviewed_guide_version,'contentDigest',i.content_digest,'title',i.title,'destination',i.destination,'authoredLocale',i.authored_locale,'revision',i.revision,'review',jsonb_build_object(
   'sourceSummary',i.source_summary,'sourceUrls',i.source_urls,'rightsBasis',i.rights_basis,
   'rightsEvidenceReference',i.rights_evidence_reference,'coverRightsConfirmed',i.cover_rights_confirmed,
   'coverRightsEvidenceReference',i.cover_rights_evidence_reference,
   'coverUrl',(select cover_url from public.guides where id=i.guide_id),
   'draftPreview',(select payload from kinnso_internal.guide_drafts where guide_id=i.guide_id))) order by i.id) from kinnso_internal.pilot_content_intakes i where i.run_id=r.id and i.status<>'withdrawn'),'[]'),
 'collaboration',case when c.id is not null then jsonb_build_object('id',c.id,'merchantParticipantId',c.merchant_participant_id,'creatorParticipantId',c.creator_participant_id,'missionId',c.mission_id,'steps',(select coalesce(jsonb_agg(k),'[]') from jsonb_array_elements(checks) k where k->>'code' in ('merchant_approved','mission_published','application_active','notification_acknowledged'))) end,
 'checks',checks,'facts',facts,
 'beginFacts',jsonb_build_object('requiredRoles',(select coalesce(jsonb_agg(role),'[]'::jsonb) from kinnso_internal.pilot_participants where run_id=r.id and pilot_cohort_role='required_'||role and status<>'withdrawn'),'rpcAvailable',to_regprocedure('public.admin_apply_kinnso_pilot_command(uuid,jsonb)') is not null,'ownersConfigured',r.coordinator_reference is not null and r.support_owner_reference is not null and r.privacy_owner_reference is not null and r.alert_owner_reference is not null and r.private_channel_reference is not null,'noticesPinned',r.participation_notice_version is not null and r.privacy_notice_version is not null and r.content_consent_version is not null,'syntheticRehearsalPassed',exists(select 1 from kinnso_internal.pilot_runs s where s.id=r.synthetic_rehearsal_run_id and s.status='completed' and s.data_classification='synthetic' and s.candidate_release_sha=r.candidate_release_sha)),
 'readiness',jsonb_build_object('stage','setup_incomplete','readyToBegin',kinnso_internal.pilot_begin_ready(r) and r.status in ('draft','recruiting'),'executionComplete',false,'blockers',jsonb_build_array(jsonb_build_object('code','server_evaluation_required','category','execution','messageKey','pilot.readiness.server_evaluation_required'))));
 return result;
end $function$;
CREATE OR REPLACE FUNCTION kinnso_internal.pilot_execution_complete(rid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    and (p.status='active' or (p.status='completed' and r.status='completed'))
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
    and (p.status='active' or (p.status='completed' and r.status='completed'))
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
    and kinnso_internal.pilot_review_digest(d.payload,i)=i.content_digest
    and kinnso_internal.pilot_review_digest(jsonb_build_object('title',g.title,'city',g.city,'summary',g.summary,'content',v.content),i)=i.content_digest
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
    and (pp.status='active' or (pp.status='completed' and r.status='completed'))
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
end $function$;
CREATE OR REPLACE FUNCTION public.publish_kinnso_pilot_guide_draft(p_draft_id uuid, p_expected_revision integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if i.status<>'approved' or d.revision is distinct from i.guide_draft_revision or kinnso_internal.pilot_review_digest(d.payload,i) is distinct from i.content_digest or (select max(version) from public.guide_versions where guide_id=p_draft_id) is distinct from i.reviewed_guide_version then raise exception 'PILOT_REVIEW_REQUIRED';end if;
 -- This unexposed row also authenticates the table-level publishing guard.
 -- It rolls back with any publisher failure; client-settable GUCs are not used.
 perform kinnso_internal.pilot_audit(p.id,'publishGuide','guide',p_draft_id);
 result:=kinnso_internal.publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 select * into v from public.guide_versions where guide_id=p_draft_id order by version desc limit 1;
 if kinnso_internal.pilot_review_digest(jsonb_build_object('title',d.payload->'title','city',d.payload->'city','summary',d.payload->'summary','content',v.content),i) is distinct from i.content_digest then raise exception 'CONFLICT';end if;
 update kinnso_internal.pilot_content_intakes set status='published',reviewed_guide_version=v.version,revision=revision+1,updated_at=clock_timestamp() where id=i.id;
 result:=result||jsonb_build_object('runId',r.id,'contentIntakeId',i.id);
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(a,p_request_id,dg,result);
 return result||jsonb_build_object('_pilotReplay',false);
end $function$;
CREATE OR REPLACE FUNCTION public.admin_apply_kinnso_pilot_command(p_request_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=kinnso_internal.pilot_actor(); m uuid; kind text:=p_command->>'type'; fields text[]; k text; rid uuid; eid uuid;
 r kinnso_internal.pilot_runs; p kinnso_internal.pilot_participants; i kinnso_internal.pilot_content_intakes; d kinnso_internal.guide_drafts; ck kinnso_internal.pilot_checks;
 prior kinnso_internal.requests; dg text; result jsonb; raw_code text; reason text; v text; ref text; obs text; ev uuid;
begin
 if not public.is_active_ops_role('admin') then raise exception 'FORBIDDEN';end if;
 select id into m from public.kinnso_ops_members where user_id=a and status='active' and role in ('admin','owner') for share;
 if not found then raise exception 'FORBIDDEN';end if;
 fields:=case kind
 when 'createRun' then array['type','id','name','dataClassification','candidateReleaseSha','environmentOrigin']
 when 'configureRun' then array['type','id','expectedRevision','participationNoticeVersion','privacyNoticeVersion','contentConsentVersion','participationNoticeDigest','privacyNoticeDigest','contentConsentDigest','coordinatorReference','supportOwnerReference','privacyOwnerReference','alertOwnerReference','privateChannelReference','syntheticRehearsalRunId']
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
 if kind='configureRun' then
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
 if found then if prior.digest<>dg then raise exception 'REQUEST_ID_REUSED';end if;return prior.result||jsonb_build_object('_pilotReplay',true);end if;
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
   update kinnso_internal.pilot_runs set participation_notice_digest=p_command->>'participationNoticeDigest',
  privacy_notice_digest=p_command->>'privacyNoticeDigest',content_consent_digest=p_command->>'contentConsentDigest',participation_notice_version=kinnso_internal.pilot_text(p_command,'participationNoticeVersion',1,120),privacy_notice_version=kinnso_internal.pilot_text(p_command,'privacyNoticeVersion',1,120),content_consent_version=kinnso_internal.pilot_text(p_command,'contentConsentVersion',1,120),coordinator_reference=kinnso_internal.pilot_text(p_command,'coordinatorReference',1,200),support_owner_reference=kinnso_internal.pilot_text(p_command,'supportOwnerReference',1,200),privacy_owner_reference=kinnso_internal.pilot_text(p_command,'privacyOwnerReference',1,200),alert_owner_reference=kinnso_internal.pilot_text(p_command,'alertOwnerReference',1,200),private_channel_reference=kinnso_internal.pilot_text(p_command,'privateChannelReference',1,200),synthetic_rehearsal_run_id=(p_command->>'syntheticRehearsalRunId')::uuid,revision=revision+1,updated_at=clock_timestamp() where id=r.id;
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
    update kinnso_internal.pilot_participants set status='completed',revision=revision+1,updated_at=clock_timestamp() where run_id=r.id and pilot_cohort_role<>'observer' and status='active';
   end if;
   update kinnso_internal.pilot_runs set status=v,revision=revision+1,acceptance_started_at=case when v in ('recruiting','running') then coalesce(acceptance_started_at,clock_timestamp()) else acceptance_started_at end,updated_at=clock_timestamp() where id=r.id;
  when 'addParticipant' then
   if (select count(*) from kinnso_internal.pilot_participants where run_id=r.id)>=20 then raise exception 'CONFLICT';end if;
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
     or p.consent_version is distinct from r.participation_notice_version or p.consent_digest is null
  or p.consent_digest is distinct from kinnso_internal.pilot_consent_identity(r)))
     or (v='completed'
     and p.status<>'active') then raise exception 'CONFLICT';end if;
   if v='completed' then raise exception 'CONFLICT';end if;
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
    if exists(select 1 from public.guides where id=i.guide_id and nullif(btrim(cover_url),'') is not null) and (i.cover_rights_confirmed is distinct from true or nullif(btrim(i.cover_rights_evidence_reference),'') is null) then raise exception 'CONFLICT';end if;
    if d.revision is distinct from (p_command->>'expectedDraftRevision')::integer
       or kinnso_internal.pilot_review_digest(d.payload,i) is distinct from p_command->>'expectedContentDigest' then
     raise exception 'CONFLICT';
    end if;
   end if;
   update kinnso_internal.pilot_content_intakes set status=case v when 'approve' then 'approved' else 'rejected' end,guide_draft_revision=case when v='approve' then d.revision end,content_digest=case when v='approve' then kinnso_internal.pilot_review_digest(d.payload,i) end,reviewed_guide_version=(select max(version) from public.guide_versions where guide_id=i.guide_id),review_reason=reason,reviewed_by_ops_member_id=m,reviewed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=i.id;
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
 return (case when raw_code is null then result else result||jsonb_build_object('inviteCode',raw_code) end)||jsonb_build_object('_pilotReplay',false);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then raise exception 'INVALID';
 when unique_violation then raise exception 'CONFLICT';
end $function$;
create or replace function kinnso_internal.pilot_ack_targets(r kinnso_internal.pilot_runs,p kinnso_internal.pilot_participants)
returns jsonb language plpgsql stable set search_path='' as $$
declare a uuid:=p.user_id;n public.notifications;support kinnso_internal.support_cases;
begin
 if r.status<>'running' or p.status<>'active' or p.consented_at is null then return null;end if;
  select nn.* into n from public.notifications nn join kinnso_internal.pilot_collaborations c on c.run_id=r.id and c.status='active' and c.mission_id=nn.entity_id and c.creator_participant_id=p.id
  join public.mission_milestone_submissions s on s.id::text=nn.payload->>'submission_id' and s.status='approved' and s.created_at>r.acceptance_started_at
  join public.mission_participants mp on mp.id=s.mission_participant_id and mp.creator_id=a and mp.mission_id=c.mission_id
  where nn.creator_id=a and nn.entity_type='mission' and nn.notification_type='submission.approved' and nn.created_at>r.acceptance_started_at
  and not exists(select 1 from public.mission_milestone_submissions newer join public.mission_participants np on np.id=newer.mission_participant_id where np.mission_id=c.mission_id and np.creator_id=a and newer.id<>s.id and newer.created_at>=s.created_at)
  and not exists(select 1 from public.notifications tied where tied.id<>nn.id and tied.creator_id=a and tied.entity_id=c.mission_id and tied.entity_type='mission' and tied.notification_type='submission.approved' and tied.payload->>'submission_id'=s.id::text and tied.created_at=nn.created_at)
  order by nn.created_at desc,nn.id desc limit 1;
  select sc.* into support from kinnso_internal.support_cases sc join kinnso_internal.pilot_evidence e on e.entity_type='support_case' and e.entity_id=sc.id and e.run_id=r.id and e.check_code='support_resolved'
  where sc.recipient_id=a and sc.status='resolved' and sc.created_at>r.acceptance_started_at and kinnso_internal.pilot_reference_allowed(r.id,'support_resolved','support_case',sc.id)
  and exists(select 1 from kinnso_internal.support_messages sm where sm.case_id=sc.id and sm.actor_id<>a and sm.created_at>r.acceptance_started_at)
  order by sc.updated_at desc,sc.id limit 1;
return jsonb_build_object('notificationId',n.id,'supportCaseId',support.id);
end $$;
revoke all on function kinnso_internal.pilot_ack_targets(kinnso_internal.pilot_runs,kinnso_internal.pilot_participants) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_kinnso_pilot_participant_command(p_request_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=kinnso_internal.pilot_actor(); kind text:=p_command->>'type'; allowed text[]; prior kinnso_internal.requests; dg text; result jsonb;
 p kinnso_internal.pilot_participants; r kinnso_internal.pilot_runs; inv kinnso_internal.pilot_invites; i kinnso_internal.pilot_content_intakes;
 x jsonb; urls text[]; raw_code text; entity uuid; entity_type text:='participant'; rid uuid; k text; n public.notifications; support kinnso_internal.support_cases;
begin
 allowed:=case kind when 'withdrawParticipation' then array['type','requestId'] when 'claimInvite' then array['type','requestId','code'] when 'acceptConsent' then array['type','requestId','noticeVersion','noticeDigest','privacyNoticeVersion','privacyNoticeDigest'] when 'submitContentIntake' then array['type','requestId','intake'] when 'updateOwnedContentIntake' then array['type','requestId','id','expectedRevision','intake'] when 'acknowledgeNotification' then array['type','requestId','notificationId'] when 'acknowledgeSupportResponse' then array['type','requestId','supportCaseId'] end;
 if allowed is null or p_request_id is null then raise exception 'INVALID';end if;
 if kind='acceptConsent' and (not p_command ? 'noticeDigest' or not p_command ? 'privacyNoticeDigest') then
  raise exception 'CONFLICT';
 end if;
 if kind='acknowledgeNotification' and not p_command ? 'notificationId' then allowed:=array['type','requestId'];end if;
 if kind='acknowledgeSupportResponse' and not p_command ? 'supportCaseId' then allowed:=array['type','requestId'];end if;
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
 if not found or (r.status not in ('recruiting','running') and not(kind='withdrawParticipation' and r.status='paused')) then raise exception 'CONFLICT';end if;
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
  if not found or p.run_id is distinct from r.id or p.user_id is distinct from a or (p.status not in ('joined','active') and not(kind='withdrawParticipation' and p.status='paused')) then raise exception 'FORBIDDEN';end if;
 end if;
 entity:=p.id;
 case kind
 when 'withdrawParticipation' then
  update kinnso_internal.pilot_participants set status='withdrawn',revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
  update kinnso_internal.pilot_invites set status='revoked' where participant_id=p.id and status='active';
  update kinnso_internal.pilot_collaborations set status='retired',revision=revision+1,updated_at=clock_timestamp() where run_id=r.id and status='active' and (creator_participant_id=p.id or merchant_participant_id=p.id);
  update kinnso_internal.pilot_content_intakes set status='withdrawn',revision=revision+1,updated_at=clock_timestamp() where run_id=r.id and creator_participant_id=p.id and status<>'withdrawn';
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
  if p_command ? 'notificationId' and (p_command->>'notificationId')::uuid is distinct from n.id then raise exception 'CONFLICT';end if;
  entity:=n.id;entity_type:='notification';
 when 'acknowledgeSupportResponse' then
  if r.status<>'running' or p.status<>'active' or p.consented_at is null then raise exception 'CONFLICT';end if;
  select sc.* into support from kinnso_internal.support_cases sc join kinnso_internal.pilot_evidence e on e.entity_type='support_case' and e.entity_id=sc.id and e.run_id=r.id and e.check_code='support_resolved'
  where sc.recipient_id=a and sc.status='resolved' and sc.created_at>r.acceptance_started_at and kinnso_internal.pilot_reference_allowed(r.id,'support_resolved','support_case',sc.id)
  and exists(select 1 from kinnso_internal.support_messages sm where sm.case_id=sc.id and sm.actor_id<>a and sm.created_at>r.acceptance_started_at)
  order by sc.updated_at desc,sc.id limit 1;
  if not found then raise exception 'CONFLICT';end if;
  if p_command ? 'supportCaseId' and (p_command->>'supportCaseId')::uuid is distinct from support.id then raise exception 'CONFLICT';end if;
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
end $function$;
CREATE OR REPLACE FUNCTION kinnso_internal.pilot_self_snapshot(r kinnso_internal.pilot_runs, p kinnso_internal.pilot_participants)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  'intakes',case when p.role='creator' and p.status='active' then (
   select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'status',i.status,'revision',i.revision,'title',i.title,
    'destination',i.destination,'authoredLocale',i.authored_locale,'sourceSummary',i.source_summary,
    'sourceUrls',i.source_urls,'rightsBasis',i.rights_basis,'rightsEvidenceReference',i.rights_evidence_reference,
    'coverRightsConfirmed',i.cover_rights_confirmed,'coverRightsEvidenceReference',i.cover_rights_evidence_reference,
    'reviewReason',i.review_reason,'guideId',g.id,'currentDraftRevision',d.revision,
    'editorHref',case when d.guide_id is not null then '/en/studio/guides/'||g.id||'/edit' end) order by i.updated_at desc,i.id),'[]'::jsonb)
   from kinnso_internal.pilot_content_intakes i
   left join public.guides g on g.id=i.guide_id and g.creator_id=p.user_id
   left join kinnso_internal.guide_drafts d on d.guide_id=g.id
   where i.run_id=r.id and i.creator_participant_id=p.id and i.status<>'withdrawn'
  ) else '[]'::jsonb end,
  'acknowledgements',kinnso_internal.pilot_ack_targets(r,p),
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
   'supportMissionId',(select mission_id from kinnso_internal.pilot_collaborations where run_id=r.id and status='active' limit 1),
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
$function$;
create or replace function public.get_kinnso_pilot_publish_permission(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.pilot_actor(); i kinnso_internal.pilot_content_intakes; r kinnso_internal.pilot_runs; d kinnso_internal.guide_drafts; ver integer; begin
 if not exists(select 1 from public.guides where id=p_guide_id and creator_id=a) and not public.is_active_ops_role('moderator') then raise exception 'FORBIDDEN';end if;
 select * into i from kinnso_internal.pilot_content_intakes where guide_id=p_guide_id;
 if not found then return jsonb_build_object('pilotLinked',false,'allowed',true);end if;
 select * into r from kinnso_internal.pilot_runs where id=i.run_id;
 select * into d from kinnso_internal.guide_drafts where guide_id=p_guide_id;
 select max(version) into ver from public.guide_versions where guide_id=p_guide_id;
 return jsonb_build_object('pilotLinked',true,'runStatus',r.status,'intakeStatus',i.status,'approvedDraftRevision',i.guide_draft_revision,'approvedContentDigest',i.content_digest,'reviewedGuideVersion',i.reviewed_guide_version,'currentDraftRevision',d.revision,'currentContentDigest',kinnso_internal.pilot_review_digest(d.payload,i),'publishedVersion',ver,'creatorIsActive',exists(select 1 from public.guides g join public.creators cr on cr.id=g.creator_id and cr.status='active' join kinnso_internal.pilot_participants p on p.id=i.creator_participant_id and p.user_id=cr.id and p.status='active' where g.id=p_guide_id),'guideIsWithdrawn',exists(select 1 from public.guides where id=p_guide_id and status='withdrawn'));
end $$;
create or replace function kinnso_internal.pilot_guard_guide_publish() returns trigger language plpgsql security definer set search_path='' as $$
declare i kinnso_internal.pilot_content_intakes; d kinnso_internal.guide_drafts; a uuid; begin
 if new.status<>'published' or (new.status=old.status and new.title=old.title and new.city=old.city and new.summary=old.summary and new.cover_url=old.cover_url and new.published_at is not distinct from old.published_at) then return new;end if;
 select * into i from kinnso_internal.pilot_content_intakes where guide_id=new.id;
 if not found then return new;end if;
 a:=kinnso_internal.pilot_actor();
 select * into d from kinnso_internal.guide_drafts where guide_id=new.id;
 if not exists(select 1 from kinnso_internal.pilot_runs where id=i.run_id and status='running')
 or i.status<>'approved' or d.revision is distinct from i.guide_draft_revision or kinnso_internal.pilot_review_digest(d.payload,i) is distinct from i.content_digest
 or new.title is distinct from d.payload->>'title' or new.city is distinct from d.payload->>'city' or new.summary is distinct from d.payload->>'summary'
 or new.cover_url is distinct from old.cover_url
 or not exists(select 1 from kinnso_internal.pilot_participant_audit au where au.transaction_id=pg_current_xact_id_if_assigned() and au.actor_user_id=a and au.run_id=i.run_id and au.participant_id=i.creator_participant_id and au.command_type='publishGuide' and au.entity_type='guide' and au.entity_id=new.id) then raise exception 'CONFLICT';end if;
 return new;
end $$;
CREATE OR REPLACE FUNCTION kinnso_internal.pilot_reference_allowed(rid uuid, code text, kind text, eid uuid, p_participant_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 r kinnso_internal.pilot_runs;
 traveller kinnso_internal.pilot_participants;
 creator kinnso_internal.pilot_participants;
 mission uuid;
begin
 select * into r from kinnso_internal.pilot_runs where id=rid;
 select * into traveller from kinnso_internal.pilot_participants
 where run_id=rid and pilot_cohort_role='required_traveller' and (status='active' or (status='completed' and r.status='completed'));
 select * into creator from kinnso_internal.pilot_participants
 where run_id=rid and pilot_cohort_role='required_creator' and (status='active' or (status='completed' and r.status='completed'));
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
end $function$;