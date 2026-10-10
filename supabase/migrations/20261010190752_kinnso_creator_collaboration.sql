-- Creator collaboration uses the mature mission, participation, evidence and settlement
-- records. No payment, booking, verification-provider or payout write is added here.
-- Existing coupon offers keep immediate participation. Newly authored content
-- collaborations opt in to application review in the following merchant migration.
alter table public.missions add column kinnso_requires_application boolean not null default false;
create function kinnso_internal.guard_content_campaign_participant() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();requires_review boolean;mission public.missions;
begin
 select * into mission from public.missions where id=new.mission_id;requires_review:=mission.kinnso_requires_application;
 if tg_op='UPDATE' then
  if old.mission_id is distinct from new.mission_id or old.creator_id is distinct from new.creator_id then
   if requires_review or exists(select 1 from public.missions where id=old.mission_id and kinnso_requires_application) then raise exception 'invalid_participant_identity';end if;
  end if;
 end if;
 if requires_review and actor=new.creator_id then
  perform kinnso_internal.actor();
  if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required';end if;
  if tg_op='INSERT' then
   if new.status<>'applied' or new.source<>'application' or new.approved_at is not null or new.merchant_review_note is not null then raise exception 'forbidden';end if;
  else
   if new.source is distinct from old.source or new.merchant_review_note is distinct from old.merchant_review_note then raise exception 'forbidden';end if;
   if new.status is distinct from old.status and not (
    old.status='invited' and old.source='merchant_invite' and new.status='active'
    or old.status in ('applied','invited') and new.status='cancelled'
   ) then raise exception 'forbidden';end if;
   if new.approved_at is distinct from old.approved_at and not(old.status='invited' and old.source='merchant_invite' and new.status='active') then raise exception 'forbidden';end if;
   if old.status='invited' and new.status='active' and (mission.status<>'published' or mission.starts_at>now() or mission.ends_at<=now()
    or not exists(select 1 from public.merchant_profiles where id=mission.merchant_profile_id and status='active')) then raise exception 'invalid_mission_unavailable';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function kinnso_internal.guard_content_campaign_participant() from public,anon,authenticated,service_role;
create trigger kinnso_content_campaign_participant before insert or update on public.mission_participants for each row execute function kinnso_internal.guard_content_campaign_participant();

-- Native collaboration decisions appear in the creator's existing in-app inbox.
-- These event types are absent from the external-delivery allowlist by design.
create function kinnso_internal.notify_content_campaign_participant() returns trigger
language plpgsql security definer set search_path='' as $$
declare mission public.missions;event_type text;
begin
 select * into mission from public.missions where id=new.mission_id;
 if not mission.kinnso_requires_application then return new;end if;
 if tg_op='INSERT' then
  if new.status='invited' and new.source='merchant_invite' then event_type:='collaboration.invited';end if;
 elsif old.status='applied' and new.status in ('active','rejected') then
  event_type:=case when new.status='active' then 'collaboration.application_approved' else 'collaboration.application_rejected' end;
 end if;
 if event_type is null then return new;end if;
 begin
  insert into public.notifications(creator_id,notification_type,entity_type,entity_id,payload)
  values(new.creator_id,event_type,'mission',new.mission_id,jsonb_build_object('mission_title',mission.title));
 exception when others then null;
 end;
 return new;
end $$;
revoke all on function kinnso_internal.notify_content_campaign_participant() from public,anon,authenticated,service_role;
create trigger kinnso_content_campaign_participant_notification after insert or update on public.mission_participants for each row execute function kinnso_internal.notify_content_campaign_participant();

create function kinnso_internal.creator_mission_card(p_mission_id uuid,p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',m.id,'title',m.title,'summary',m.summary,'merchantName',merchant.company_name,
  'missionType',m.mission_type,'missionSource',m.mission_source,'status',m.status,'requiresApplication',m.kinnso_requires_application,
  'visibility',m.visibility,'minTier',m.min_tier,'eligible',app_private.creator_meets_mission_tier(m.id),
  'joinAvailable',p.id is null and m.status='published' and m.visibility='open'
   and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())
   and (m.mission_source='travelpayouts' and exists(select 1 from public.affiliate_network_programs a where a.id=m.affiliate_network_program_id and a.status='active') or merchant.status='active')
   and not exists(select 1 from public.merchant_profiles owned where owned.id=m.merchant_profile_id and owned.user_id=p_actor)
   and not exists(select 1 from kinnso_internal.merchant_members member where member.merchant_id=m.merchant_profile_id and member.user_id=p_actor and member.active),
  'acceptAvailable',p.status='invited' and m.status='published' and merchant.status='active'
   and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now()),
  'evidenceAvailable',p.status='active' and m.status in ('published','paused')
   and (m.mission_source='travelpayouts' or merchant.status='active'),
  'paidFeeAmount',m.paid_fee_amount::text,'paidFeeCurrency',m.paid_fee_currency,
  'creatorRate',m.creator_commission_rate::text,'startsAt',m.starts_at,'endsAt',m.ends_at,
  'participant',case when p.id is null then null else jsonb_build_object('id',p.id,'status',p.status,
    'source',p.source,'applicationNote',p.application_note,'merchantReviewNote',p.merchant_review_note,'updatedAt',p.updated_at) end)
 from public.missions m left join public.merchant_profiles merchant on merchant.id=m.merchant_profile_id
 left join public.mission_participants p on p.mission_id=m.id and p.creator_id=p_actor
 where m.id=p_mission_id;
$$;

create function public.list_kinnso_creator_missions(p_scope text default 'available',p_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();items jsonb;cursor uuid;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required';end if;
 if p_scope is null or p_scope not in ('available','mine') then raise exception 'invalid_scope';end if;
 with bounded as (
  select m.id,row_number()over(order by m.id)n from public.missions m
  where (p_after is null or m.id>p_after) and (
   p_scope='mine' and exists(select 1 from public.mission_participants p where p.mission_id=m.id and p.creator_id=actor)
   or p_scope='available' and m.status='published' and m.visibility='open'
    and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())
    and (m.mission_source='merchant' and exists(select 1 from public.merchant_profiles merchant where merchant.id=m.merchant_profile_id and merchant.status='active')
      or m.mission_source='travelpayouts' and exists(select 1 from public.affiliate_network_programs a where a.id=m.affiliate_network_program_id and a.status='active'))
  ) order by m.id limit 21
 ) select coalesce(jsonb_agg(kinnso_internal.creator_mission_card(id,actor) order by id)filter(where n<=20),'[]'),
  case when count(*)>20 then (array_agg(id order by id))[20] else null end into items,cursor from bounded;
 return jsonb_build_object('items',items,'nextCursor',cursor);
end $$;

create function public.get_kinnso_creator_mission(p_mission_id uuid,p_submission_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();m public.missions;p public.mission_participants;
 items jsonb;cursor uuid;cursor_time timestamptz;milestones jsonb;result jsonb;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required';end if;
 select * into m from public.missions where id=p_mission_id;
 select * into p from public.mission_participants where mission_id=p_mission_id and creator_id=actor;
 if m.id is null or (p.id is null and not (m.status='published' and m.visibility='open'
   and (m.mission_source='merchant' and exists(select 1 from public.merchant_profiles merchant where merchant.id=m.merchant_profile_id and merchant.status='active')
    or m.mission_source='travelpayouts' and exists(select 1 from public.affiliate_network_programs a where a.id=m.affiliate_network_program_id and a.status='active')))) then raise exception 'mission_not_found';end if;
 if p_submission_after is not null then
  select created_at into cursor_time from public.mission_milestone_submissions where id=p_submission_after and mission_participant_id=p.id;
  if not found then raise exception 'invalid_cursor';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'dueAt',due_at,'repeatable',repeatable) order by sort_order,id),'[]')
 into milestones from(select * from public.mission_milestones where mission_id=m.id order by sort_order,id limit 50)x;
 with bounded as (
  select s.*,row_number()over(order by created_at desc,id desc)n from public.mission_milestone_submissions s
  where mission_participant_id=p.id and (p_submission_after is null or (created_at,id)<(cursor_time,p_submission_after))
  order by created_at desc,id desc limit 51
 ) select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'milestoneId',s.mission_milestone_id,'status',s.status,
   'proofUrls',s.proof_urls,'notes',s.notes,'merchantFeedback',s.merchant_feedback,'submittedAt',s.submitted_at,'updatedAt',s.updated_at,
   'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'action',r.action,'reason',r.reason_text,'createdAt',r.created_at) order by r.created_at desc,r.id desc)
    from(select id,action,reason_text,created_at from public.mission_review_events where submission_id=s.id order by created_at desc,id desc limit 10)r),'[]')) order by s.created_at desc,s.id desc)filter(where n<=50),'[]'),
   case when count(*)>50 then (array_agg(s.id order by s.created_at desc,s.id desc))[50] else null end into items,cursor from bounded s;
 result:=kinnso_internal.creator_mission_card(m.id,actor);
 return result||jsonb_build_object('requirements',m.requirements,'deliverables',m.deliverables,
  'couponCode',m.coupon_code,'couponUrl',m.coupon_url,'milestones',milestones,
  'milestonesTruncated',exists(select 1 from public.mission_milestones where mission_id=m.id offset 50 limit 1),
  'submissions',items,'submissionsNextCursor',cursor,'maxReceipts',m.max_receipts_per_creator,
  'partnerLinks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'url',partner_url)order by id)
   from(select id,partner_url from public.affiliate_partner_links where mission_participant_id=p.id order by id limit 20)x),'[]'));
end $$;

create function public.apply_kinnso_creator_mission_command(p_mission_id uuid,p_request_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();m public.missions;p public.mission_participants;
 milestone public.mission_milestones;s public.mission_milestone_submissions;
 prior kinnso_internal.creator_requests;digest text;kind text:=p_command->>'type';result jsonb;
 proof jsonb;proofs text[];sub_id uuid;expected timestamptz;receipt jsonb;active_receipts integer;
begin
 -- Hold the current creator status while executing, including on a replay.
 perform 1 from public.creators where id=actor and status='active' for share;
 if not found then raise exception 'creator_required';end if;
 if p_request_id is null or p_mission_id is null or p_command is null or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>16384 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_array('creatorMission',p_mission_id,p_command)::text);
 select * into prior from kinnso_internal.creator_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 -- Shared lock order is mission, participant, submission. The mission lock also
 -- serializes receipt caps and simultaneous first submissions from old entry points.
 select * into m from public.missions where id=p_mission_id for update;
 if not found then raise exception 'mission_not_found';end if;
 select * into p from public.mission_participants where mission_id=m.id and creator_id=actor for update;
 if kind in ('join','acceptInvite','submitEvidence') then
  if m.mission_source='merchant' then
   perform 1 from public.merchant_profiles where id=m.merchant_profile_id and status='active' for share;
   if not found then raise exception 'invalid_mission_unavailable';end if;
   if exists(select 1 from public.merchant_profiles where id=m.merchant_profile_id and user_id=actor)
    or exists(select 1 from kinnso_internal.merchant_members where merchant_id=m.merchant_profile_id and user_id=actor and active) then raise exception 'forbidden';end if;
  elsif kind in ('join','acceptInvite') and not exists(select 1 from public.affiliate_network_programs where id=m.affiliate_network_program_id and status='active') then raise exception 'invalid_mission_unavailable';end if;
 end if;
 if kind='join' then
  perform kinnso_internal.keys(p_command,array['type','applicationNote']);
  if p_command?'applicationNote' and (jsonb_typeof(p_command->'applicationNote') is distinct from 'string' or length(p_command->>'applicationNote')>2000) then raise exception 'invalid_application';end if;
  if p.id is not null then raise exception 'revision_conflict';end if;
  if m.visibility<>'open' then raise exception 'mission_not_found';end if;
  if m.status<>'published' or m.starts_at>now() or m.ends_at<=now() then raise exception 'invalid_mission_unavailable';end if;
  if not app_private.creator_meets_mission_tier(m.id) then raise exception 'invalid_creator_tier';end if;
  insert into public.mission_participants(mission_id,creator_id,status,source,application_note,approved_at)
  values(m.id,actor,case when m.mission_type='coupon_affiliate' and not m.kinnso_requires_application then 'active' else 'applied' end,
   case when m.mission_type='coupon_affiliate' and not m.kinnso_requires_application then case when m.mission_source='travelpayouts' then 'affiliate_network_join' else 'open_join' end else 'application' end,
   p_command->>'applicationNote',case when m.mission_type='coupon_affiliate' and not m.kinnso_requires_application then now() else null end) returning * into p;
  result:=jsonb_build_object('id',p.id,'status',p.status,'updatedAt',p.updated_at);
 elsif kind in ('acceptInvite','withdrawApplication') then
  perform kinnso_internal.keys(p_command,array['type','expectedUpdatedAt']);
  if jsonb_typeof(p_command->'expectedUpdatedAt') is distinct from 'string' then raise exception 'invalid_command';end if;
  expected:=(p_command->>'expectedUpdatedAt')::timestamptz;
  if p.id is null then raise exception 'mission_not_found';end if;
  if expected is distinct from p.updated_at then raise exception 'revision_conflict';end if;
  if kind='acceptInvite' then
   if p.status<>'invited' or p.source<>'merchant_invite' then raise exception 'revision_conflict';end if;
   if m.status<>'published' or m.starts_at>now() or m.ends_at<=now() then raise exception 'invalid_mission_unavailable';end if;
   update public.mission_participants set status='active',approved_at=now(),updated_at=clock_timestamp() where id=p.id returning * into p;
  else
   if p.status not in ('applied','invited') then raise exception 'revision_conflict';end if;
   update public.mission_participants set status='cancelled',updated_at=clock_timestamp() where id=p.id returning * into p;
  end if;
  result:=jsonb_build_object('id',p.id,'status',p.status,'updatedAt',p.updated_at);
 elsif kind='submitEvidence' then
  perform kinnso_internal.keys(p_command,array['type','milestoneId','submissionId','expectedUpdatedAt','proofUrls','notes']);
  if p.id is null or p.status<>'active' then raise exception 'forbidden';end if;
  if m.status not in ('published','paused') then raise exception 'invalid_mission_unavailable';end if;
  if jsonb_typeof(p_command->'milestoneId') is distinct from 'string' or not (p_command?'submissionId') or jsonb_typeof(p_command->'submissionId') not in ('null','string')
   or jsonb_typeof(p_command->'proofUrls') is distinct from 'array' or jsonb_array_length(p_command->'proofUrls') not between 1 and 5
   or jsonb_typeof(p_command->'notes') is distinct from 'string' or length(p_command->>'notes')>4000 then raise exception 'invalid_evidence';end if;
  for proof in select value from jsonb_array_elements(p_command->'proofUrls') loop
   if jsonb_typeof(proof) is distinct from 'string' or length(proof#>>'{}')>2048
    or (proof#>>'{}')!~'^https://[^/@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$' then raise exception 'invalid_evidence';end if;
  end loop;
  select array_agg(value) into proofs from jsonb_array_elements_text(p_command->'proofUrls');
  if cardinality(proofs)<>(select count(distinct value)from unnest(proofs)value) then raise exception 'invalid_evidence';end if;
  select * into milestone from public.mission_milestones where id=(p_command->>'milestoneId')::uuid and mission_id=m.id for share;
  if not found then raise exception 'invalid_milestone';end if;
  sub_id:=(p_command->>'submissionId')::uuid;
  if sub_id is null then
   if jsonb_typeof(p_command->'expectedUpdatedAt') is distinct from 'null' then raise exception 'invalid_evidence';end if;
   if milestone.repeatable then
    if m.mission_type<>'receipt_cashback' then raise exception 'invalid_milestone';end if;
    if m.max_receipts_per_creator is not null then
     select count(*) into active_receipts from public.mission_milestone_submissions where mission_participant_id=p.id and mission_milestone_id=milestone.id and status in ('submitted','approved');
     if active_receipts>=m.max_receipts_per_creator then raise exception 'invalid_receipt_cap';end if;
    end if;
    -- The mature receipt command owns its repeatable cap and insertion semantics.
    receipt:=public.submit_receipt(m.id,proofs);sub_id:=(receipt->>'submission_id')::uuid;
    update public.mission_milestone_submissions set notes=p_command->>'notes',updated_at=clock_timestamp() where id=sub_id returning * into s;
   else
    if exists(select 1 from public.mission_milestone_submissions where mission_participant_id=p.id and mission_milestone_id=milestone.id) then raise exception 'revision_conflict';end if;
    insert into public.mission_milestone_submissions(mission_milestone_id,mission_participant_id,status,proof_urls,notes,submitted_at)
    values(milestone.id,p.id,'submitted',proofs,p_command->>'notes',now())returning * into s;
   end if;
  else
   if jsonb_typeof(p_command->'expectedUpdatedAt') is distinct from 'string' then raise exception 'invalid_evidence';end if;
   expected:=(p_command->>'expectedUpdatedAt')::timestamptz;
   select * into s from public.mission_milestone_submissions where id=sub_id and mission_participant_id=p.id and mission_milestone_id=milestone.id for update;
   if not found then raise exception 'submission_not_found';end if;
   if expected is distinct from s.updated_at or s.status not in ('pending','submitted','revision_requested') then raise exception 'revision_conflict';end if;
   if milestone.repeatable and m.max_receipts_per_creator is not null then
    select count(*) into active_receipts from public.mission_milestone_submissions where mission_participant_id=p.id and mission_milestone_id=milestone.id and id<>s.id and status in ('submitted','approved');
    if active_receipts>=m.max_receipts_per_creator then raise exception 'invalid_receipt_cap';end if;
   end if;
   -- Review metadata stays immutable for creator writes. Its history is shown to the
   -- creator and a fresh reviewed decision requires the merchant/ops review command.
   update public.mission_milestone_submissions set status='submitted',proof_urls=proofs,notes=p_command->>'notes',submitted_at=now(),updated_at=clock_timestamp() where id=s.id returning * into s;
  end if;
  result:=jsonb_build_object('id',s.id,'status',s.status,'updatedAt',s.updated_at);
 else raise exception 'invalid_command';end if;
 insert into kinnso_internal.creator_requests values(actor,p_request_id,digest,result,now());return result;
end $$;

-- Match the mature creator_earnings_summary ownership and payable semantics. Amounts
-- cross the JSON boundary as decimal strings, and every record page is bounded.
create function public.get_kinnso_creator_earnings(p_section text default 'settled',p_after text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();totals jsonb;items jsonb;cursor text;after_id uuid;after_kind text;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required';end if;
 if p_section is null or p_section not in ('settled','tracked','payouts') then raise exception 'invalid_section';end if;
 if p_after is not null then
  if p_after!~'^(mission|booking|affiliate|payout_batch):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_cursor';end if;
  after_kind:=split_part(p_after,':',1);after_id:=split_part(p_after,':',2)::uuid;
  if p_section='settled' and after_kind not in ('mission','booking') or p_section='tracked' and after_kind<>'affiliate' or p_section='payouts' and after_kind<>'payout_batch' then raise exception 'invalid_cursor';end if;
 end if;
 with payable as (
  select upper(s.amount_currency)currency,coalesce(s.creator_commission_amount,0)+coalesce(s.paid_fee_amount,0)amount,s.creator_payout_status='paid' paid
  from public.mission_settlements s join public.mission_participants p on p.id=s.mission_participant_id where p.creator_id=actor
  union all select upper(s.currency),s.creator_commission_amount,s.creator_commission_status='paid'
  from public.booking_settlements s join public.bookings b on b.id=s.booking_id where b.creator_id=actor and s.creator_commission_amount is not null
 ), grouped as(select currency,coalesce(sum(amount)filter(where paid),0)::text paid,coalesce(sum(amount)filter(where not coalesce(paid,false)),0)::text pending from payable group by currency)
 select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'paid',paid,'pending',pending)order by currency),'[]')into totals from grouped;
 with records as (
  select s.id,'mission'::text kind,m.title,m.id mission_id,(coalesce(s.creator_commission_amount,0)+coalesce(s.paid_fee_amount,0))::text amount,upper(s.amount_currency)currency,
   coalesce(s.creator_payout_status,'pending')status,s.updated_at,null::timestamptz target_at
  from public.mission_settlements s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=s.mission_id where p.creator_id=actor and p_section='settled'
  union all
  select s.id,'booking',e.title,null,s.creator_commission_amount::text,upper(s.currency),coalesce(s.creator_commission_status,'pending'),s.updated_at,null
  from public.booking_settlements s join public.bookings b on b.id=s.booking_id join public.experiences e on e.id=b.experience_id where b.creator_id=actor and s.creator_commission_amount is not null and p_section='settled'
  union all
  select e.id,'affiliate',coalesce(m.title,''),m.id,coalesce(e.profit_amount,0)::text,upper(e.currency),e.event_state,e.external_updated_at,null
  from public.affiliate_network_events e left join public.missions m on m.id=e.mission_id where e.creator_id=actor and e.event_state in ('processing','paid') and p_section='tracked'
   and not exists(select 1 from public.mission_settlements s where s.affiliate_network_event_id=e.id)
  union all
  select b.id,'payout_batch','Recorded payout batch',null,b.amount::text,upper(b.currency),b.status,b.created_at,b.target_at
  from public.creator_payout_batches b where b.creator_id=actor and p_section='payouts'
 ), bounded as(select *,row_number()over(order by id,kind)n from records where p_after is null or (id,kind)>(after_id,after_kind) order by id,kind limit 31)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'missionId',mission_id,'amount',amount,'currency',currency,'status',status,'updatedAt',updated_at,'targetAt',target_at)order by id,kind)filter(where n<=30),'[]'),
  case when count(*)>30 then (array_agg(kind||':'||id::text order by id,kind))[30] else null end into items,cursor from bounded;
 return jsonb_build_object('section',p_section,'totals',totals,'items',items,'nextCursor',cursor);
end $$;

revoke all on function kinnso_internal.creator_mission_card(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_kinnso_creator_missions(text,uuid),public.get_kinnso_creator_mission(uuid,uuid),public.apply_kinnso_creator_mission_command(uuid,uuid,jsonb),public.get_kinnso_creator_earnings(text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_kinnso_creator_missions(text,uuid),public.get_kinnso_creator_mission(uuid,uuid),public.apply_kinnso_creator_mission_command(uuid,uuid,jsonb),public.get_kinnso_creator_earnings(text,text) to authenticated;
