-- Coupon collaboration authoring. Existing fee, settlement, budget and payment
-- functions are deliberately not replaced or invoked by these commands.
create function kinnso_internal.bump_collaboration_updated_at() returns trigger
language plpgsql set search_path='' as $$ begin
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');return new;
end $$;
revoke all on function kinnso_internal.bump_collaboration_updated_at() from public,anon,authenticated,service_role;
create trigger kinnso_mission_updated_at before update on public.missions for each row execute function kinnso_internal.bump_collaboration_updated_at();
create trigger kinnso_participant_updated_at before update on public.mission_participants for each row execute function kinnso_internal.bump_collaboration_updated_at();
create trigger kinnso_submission_updated_at before update on public.mission_milestone_submissions for each row execute function kinnso_internal.bump_collaboration_updated_at();

-- A legacy milestone editor must also invalidate a draft's compare-and-swap token.
create function kinnso_internal.touch_campaign_milestones() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op<>'INSERT' then update public.missions set updated_at=clock_timestamp() where id=old.mission_id;end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' or new.mission_id is distinct from old.mission_id) then update public.missions set updated_at=clock_timestamp() where id=new.mission_id;end if;
 return null;
end $$;
revoke all on function kinnso_internal.touch_campaign_milestones() from public,anon,authenticated,service_role;
create trigger kinnso_milestones_touch_campaign after insert or update or delete on public.mission_milestones for each row execute function kinnso_internal.touch_campaign_milestones();
create index kinnso_campaign_company_page on public.missions(merchant_profile_id,id);
create index kinnso_campaign_participant_page on public.mission_participants(mission_id,id);

create function kinnso_internal.validate_campaign_input(p_input jsonb,p_publish boolean) returns void
language plpgsql set search_path='' as $$
declare field text;value jsonb;rate numeric;ids uuid[]:='{}';mid uuid;begin
 perform kinnso_internal.keys(p_input,array['title','summary','couponCode','couponUrl','affiliateRate','kinnsoRate','creatorRate','requirements','deliverables','milestones']);
 if jsonb_typeof(p_input->'title') is distinct from 'string' or length(btrim(p_input->>'title')) not between 1 and 120
 or jsonb_typeof(p_input->'summary') is distinct from 'string' or length(p_input->>'summary')>5000
 or jsonb_typeof(p_input->'couponCode') is distinct from 'string' or length(p_input->>'couponCode')>200
 or jsonb_typeof(p_input->'couponUrl') is distinct from 'string' or length(p_input->>'couponUrl')>2048 then raise exception 'invalid_brief';end if;
 if p_input->>'couponUrl'<>'' and (p_input->>'couponUrl' !~ '^https?://[^[:space:]/@?#]+([/?#][^[:space:]]*)?$' or p_input->>'couponUrl' ~ '[[:cntrl:]]') then raise exception 'invalid_brief';end if;
 if p_publish and (btrim(p_input->>'summary')='' or btrim(p_input->>'couponCode')='' or btrim(p_input->>'couponUrl')='') then raise exception 'invalid_brief';end if;
 foreach field in array array['affiliateRate','kinnsoRate','creatorRate'] loop
  if p_input->field='null'::jsonb and not p_publish then continue;end if;
  if jsonb_typeof(p_input->field) is distinct from 'number' then raise exception 'invalid_brief';end if;
  rate:=(p_input->>field)::numeric;if rate<0 or rate>999999.99 or rate<>round(rate,2) then raise exception 'invalid_brief';end if;
 end loop;
 foreach field in array array['requirements','deliverables'] loop
  if jsonb_typeof(p_input->field) is distinct from 'array' then raise exception 'invalid_brief';end if;
  if jsonb_array_length(p_input->field)>20 then raise exception 'invalid_brief';end if;
  for value in select x from jsonb_array_elements(p_input->field)x loop
   if jsonb_typeof(value) is distinct from 'string' or length(btrim(value#>>'{}')) not between 1 and 1000 then raise exception 'invalid_brief';end if;
  end loop;
 end loop;
 if jsonb_typeof(p_input->'milestones') is distinct from 'array' then raise exception 'invalid_brief';end if;
 if jsonb_array_length(p_input->'milestones')>20 or (p_publish and jsonb_array_length(p_input->'milestones')=0) then raise exception 'invalid_brief';end if;
 for value in select x from jsonb_array_elements(p_input->'milestones')x loop
  perform kinnso_internal.keys(value,array['id','title','description','dueAt']);mid:=(value->>'id')::uuid;
  if mid is null or mid=any(ids) or jsonb_typeof(value->'title') is distinct from 'string' or length(value->>'title')>120 or (p_publish and btrim(value->>'title')='') or jsonb_typeof(value->'description') is distinct from 'string' or length(value->>'description')>2000 or (p_publish and btrim(value->>'description')='') then raise exception 'invalid_brief';end if;
  if value->'dueAt' is distinct from 'null'::jsonb then
   if jsonb_typeof(value->'dueAt') is distinct from 'string' or value->>'dueAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'invalid_brief';end if;
   perform (value->>'dueAt')::timestamptz;
  end if;ids:=array_append(ids,mid);
 end loop;
end $$;
revoke all on function kinnso_internal.validate_campaign_input(jsonb,boolean) from public,anon,authenticated,service_role;

create function public.apply_kinnso_merchant_campaign_command(p_merchant_id uuid,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();role_name text;kind text:=p_command->>'type';entity uuid;digest text;prior kinnso_internal.workspace_requests;result jsonb;
 mission public.missions;participant public.mission_participants;submission public.mission_milestone_submissions;branch kinnso_internal.merchant_branches;
 body jsonb;milestone jsonb;publish_now boolean;next_status text;target_mission_id uuid;expected timestamptz;index_no integer:=0;
begin
 role_name:=kinnso_internal.merchant_role(p_merchant_id,actor,null,case when kind in ('setBranch','reviewSubmission') then array['owner'] else array['owner','marketing'] end);
 if p_request_id is null or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>65536 or jsonb_typeof(p_command->'reason') is distinct from 'string' or length(btrim(p_command->>'reason')) not between 1 and 2000 then raise exception 'invalid_command';end if;
 entity:=(p_command->>'id')::uuid;if entity is null then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_array('merchantCampaign',p_merchant_id,p_command)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;

 if kind='setBranch' then
  perform kinnso_internal.keys(p_command,array['type','id','expectedActive','expectedName','name','active','reason']);
  select * into branch from kinnso_internal.merchant_branches where id=entity and merchant_id=p_merchant_id for update;
  if not found then raise exception 'forbidden';end if;
  if jsonb_typeof(p_command->'active') is distinct from 'boolean' or jsonb_typeof(p_command->'expectedActive') is distinct from 'boolean' or jsonb_typeof(p_command->'expectedName') is distinct from 'string' or jsonb_typeof(p_command->'name') is distinct from 'string' or length(btrim(p_command->>'name')) not between 1 and 120 then raise exception 'invalid_command';end if;
  if branch.active is distinct from (p_command->>'expectedActive')::boolean or branch.name is distinct from p_command->>'expectedName' then raise exception 'revision_conflict';end if;
  update kinnso_internal.merchant_branches set name=btrim(p_command->>'name'),active=(p_command->>'active')::boolean where id=entity;
  -- Assignments remain visible as unavailable; restoration is an explicit owner action.
  result:=jsonb_build_object('id',entity,'active',p_command->'active');
 elsif kind in ('createDraft','updateDraft','publish','close') then
  if kind='createDraft' then
   perform kinnso_internal.keys(p_command,array['type','id','input','publish','reason']);
   if jsonb_typeof(p_command->'publish') is distinct from 'boolean' then raise exception 'invalid_command';end if;
   publish_now:=(p_command->>'publish')::boolean;body:=p_command->'input';perform kinnso_internal.validate_campaign_input(body,publish_now);
   insert into public.missions(id,merchant_profile_id,title,summary,mission_type,mission_source,visibility,status,kinnso_requires_application)
    values(entity,p_merchant_id,btrim(body->>'title'),body->>'summary','coupon_affiliate','merchant','open','draft',true) returning * into mission;
  else
   perform kinnso_internal.keys(p_command,case when kind='updateDraft' then array['type','id','input','expectedUpdatedAt','reason'] else array['type','id','expectedUpdatedAt','reason'] end);
   select * into mission from public.missions where id=entity and merchant_profile_id=p_merchant_id for update;
   if not found then raise exception 'forbidden';end if;
   if mission.mission_source<>'merchant' or mission.mission_type<>'coupon_affiliate' or coalesce(mission.paid_fee_amount,0)<>0 then raise exception 'invalid_campaign_type';end if;
   expected:=(p_command->>'expectedUpdatedAt')::timestamptz;
   if expected is null or mission.updated_at is distinct from expected then raise exception 'revision_conflict';end if;
   if kind='close' then
    if mission.status<>'published' then raise exception 'revision_conflict';end if;
    update public.missions set status='paused' where id=entity returning * into mission;
   else
    if mission.status<>'draft' or exists(select 1 from public.mission_participants where mission_id=entity) then raise exception 'revision_conflict';end if;
    if kind='updateDraft' then body:=p_command->'input';perform kinnso_internal.validate_campaign_input(body,false);
    else
     body:=jsonb_build_object('title',mission.title,'summary',mission.summary,'couponCode',coalesce(mission.coupon_code,''),'couponUrl',coalesce(mission.coupon_url,''),'affiliateRate',mission.affiliate_commission_rate,'kinnsoRate',mission.kinnso_commission_rate,'creatorRate',mission.creator_commission_rate,'requirements',mission.requirements,'deliverables',mission.deliverables,
      'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'dueAt',due_at)order by sort_order,id) from public.mission_milestones where mission_id=entity),'[]'));
     perform kinnso_internal.validate_campaign_input(body,true);publish_now:=true;
    end if;
   end if;
  end if;
  if kind in ('createDraft','updateDraft') then
   update public.missions set title=btrim(body->>'title'),summary=body->>'summary',coupon_code=nullif(body->>'couponCode',''),coupon_url=nullif(body->>'couponUrl',''),affiliate_commission_rate=(body->>'affiliateRate')::numeric,kinnso_commission_rate=(body->>'kinnsoRate')::numeric,creator_commission_rate=(body->>'creatorRate')::numeric,requirements=array(select jsonb_array_elements_text(body->'requirements')),deliverables=array(select jsonb_array_elements_text(body->'deliverables')) where id=entity;
   -- Only unused drafts may replace milestones; no accepted work is deleted.
   delete from public.mission_milestones where mission_id=entity;
   for milestone in select value from jsonb_array_elements(body->'milestones') loop
    insert into public.mission_milestones(id,mission_id,title,description,due_at,sort_order,repeatable) values((milestone->>'id')::uuid,entity,btrim(milestone->>'title'),milestone->>'description',(milestone->>'dueAt')::timestamptz,index_no,false);index_no:=index_no+1;
   end loop;
  end if;
  if publish_now then update public.missions set status='published',published_at=now() where id=entity;end if;
  select * into mission from public.missions where id=entity;
  result:=jsonb_build_object('id',entity,'status',mission.status,'updatedAt',mission.updated_at);
 elsif kind in ('reviewApplication','reviewSubmission') then
  perform kinnso_internal.keys(p_command,case when kind='reviewApplication' then array['type','id','expectedUpdatedAt','action','note','reason'] else array['type','id','expectedUpdatedAt','action','feedback','reason'] end);
  if kind='reviewApplication' then
   select p.mission_id into target_mission_id from public.mission_participants p where p.id=entity;
  else
   select p.mission_id into target_mission_id from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id where s.id=entity;
  end if;
  -- Common lock order is merchant role -> mission -> participant -> submission.
  select * into mission from public.missions where id=target_mission_id and merchant_profile_id=p_merchant_id for update;
  if not found then raise exception 'forbidden';end if;
  if kind='reviewApplication' then
   select * into participant from public.mission_participants where id=entity and mission_id=mission.id for update;
   if not found or participant.creator_id=actor then raise exception 'forbidden';end if;
   if participant.updated_at is distinct from (p_command->>'expectedUpdatedAt')::timestamptz or participant.status<>'applied' then raise exception 'revision_conflict';end if;
   if p_command->>'action' is null or p_command->>'action' not in ('approve','reject') or jsonb_typeof(p_command->'note') is distinct from 'string' or length(btrim(p_command->>'note')) not between 1 and 2000 then raise exception 'invalid_command';end if;
   if p_command->>'action'='approve' and mission.status<>'published' then raise exception 'invalid_campaign_closed';end if;
   next_status:=case p_command->>'action' when 'approve' then 'active' else 'rejected' end;
   update public.mission_participants set status=next_status,merchant_review_note=btrim(p_command->>'note'),approved_at=case when next_status='active' then now() else null end where id=entity returning * into participant;
   result:=jsonb_build_object('id',entity,'status',next_status,'updatedAt',participant.updated_at);
  else
   if mission.mission_source<>'merchant' or mission.mission_type<>'coupon_affiliate' or coalesce(mission.paid_fee_amount,0)<>0 then raise exception 'invalid_campaign_type';end if;
   select p.* into participant from public.mission_participants p join public.mission_milestone_submissions s on s.mission_participant_id=p.id where s.id=entity and p.mission_id=mission.id for update of p;
   if not found or participant.creator_id=actor then raise exception 'forbidden';end if;
   select * into submission from public.mission_milestone_submissions where id=entity and mission_participant_id=participant.id for update;
   if submission.updated_at is distinct from (p_command->>'expectedUpdatedAt')::timestamptz or submission.status<>'submitted' then raise exception 'revision_conflict';end if;
   if p_command->>'action' is null or p_command->>'action' not in ('approve','reject','request_revision') or jsonb_typeof(p_command->'feedback') is distinct from 'string' or length(btrim(p_command->>'feedback')) not between 1 and 2000 then raise exception 'invalid_command';end if;
   next_status:=case p_command->>'action' when 'approve' then 'approved' when 'reject' then 'rejected' else 'revision_requested' end;
   update public.mission_milestone_submissions set status=next_status,merchant_feedback=btrim(p_command->>'feedback'),reviewed_at=now(),reviewed_by=actor where id=entity returning * into submission;
   insert into public.mission_review_events(submission_id,actor_type,actor_id,action,reason_category,reason_text) values(entity,'merchant',actor,p_command->>'action',case when next_status='approved' then null else 'other' end,btrim(p_command->>'feedback'));
   result:=jsonb_build_object('id',entity,'status',next_status,'updatedAt',submission.updated_at);
  end if;
 else raise exception 'invalid_command';end if;
 insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,actor,kind,entity,btrim(p_command->>'reason'));
 insert into kinnso_internal.workspace_requests(actor_id,request_id,digest,result) values(actor,p_request_id,digest,result);
 return result;
end $$;

create function public.get_kinnso_merchant_campaigns(p_merchant_id uuid,p_after uuid default null,p_campaign_id uuid default null,p_participant_after uuid default null,p_submission_after uuid default null,p_branch_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();role_name text;items jsonb;cursor uuid;detail jsonb;mission public.missions;participants jsonb;participant_cursor uuid;submissions jsonb;submission_cursor uuid;company_summary jsonb;branches jsonb;branch_cursor uuid;
begin
 role_name:=kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner','marketing']);
 if p_after is not null and not exists(select 1 from public.missions where id=p_after and merchant_profile_id=p_merchant_id) then raise exception 'invalid_cursor';end if;
 if p_campaign_id is null and (p_participant_after is not null or p_submission_after is not null) then raise exception 'invalid_cursor';end if;
 if role_name<>'owner' and p_submission_after is not null then raise exception 'forbidden';end if;
 if p_branch_after is not null then
  if role_name<>'owner' then raise exception 'forbidden';end if;
  if not exists(select 1 from kinnso_internal.merchant_branches where id=p_branch_after and merchant_id=p_merchant_id) then raise exception 'invalid_cursor';end if;
 end if;
 with bounded as(select b.*,row_number()over(order by id)n from kinnso_internal.merchant_branches b where merchant_id=p_merchant_id and role_name='owner' and (p_branch_after is null or id>p_branch_after)order by id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)order by id)filter(where n<=50),'[]'),case when count(*)>50 then (array_agg(id order by id))[50] else null end into branches,branch_cursor from bounded;
 with bounded as(select m.*,row_number()over(order by m.id)n from public.missions m where m.merchant_profile_id=p_merchant_id and (p_after is null or m.id>p_after) order by m.id limit 21)
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'summary',b.summary,'status',b.status,'missionType',b.mission_type,'updatedAt',b.updated_at)order by b.id)filter(where b.n<=20),'[]'),case when count(*)>20 then (array_agg(b.id order by b.id))[20] else null end into items,cursor from bounded b;
 if p_campaign_id is not null then
  select * into mission from public.missions where id=p_campaign_id and merchant_profile_id=p_merchant_id;
  if not found then raise exception 'forbidden';end if;
  if p_participant_after is not null and not exists(select 1 from public.mission_participants where id=p_participant_after and mission_id=mission.id) then raise exception 'invalid_cursor';end if;
  if p_submission_after is not null and not exists(select 1 from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id where s.id=p_submission_after and p.mission_id=mission.id) then raise exception 'invalid_cursor';end if;
  with bounded as(select p.*,c.display_name,c.handle,row_number()over(order by p.id)n from public.mission_participants p join public.creators c on c.id=p.creator_id where p.mission_id=mission.id and (p_participant_after is null or p.id>p_participant_after) order by p.id limit 51)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'creatorId',creator_id,'creatorName',display_name,'creatorHandle',handle,'status',status,'note',application_note,'reviewNote',merchant_review_note,'updatedAt',updated_at)order by id)filter(where n<=50),'[]'),case when count(*)>50 then (array_agg(id order by id))[50] else null end into participants,participant_cursor from bounded;
  with bounded as(select s.*,p.creator_id,c.display_name,l.title,row_number()over(order by s.id)n from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.creators c on c.id=p.creator_id join public.mission_milestones l on l.id=s.mission_milestone_id where role_name='owner' and p.mission_id=mission.id and l.mission_id=mission.id and (p_submission_after is null or s.id>p_submission_after) order by s.id limit 51)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'participantId',mission_participant_id,'creatorId',creator_id,'creatorName',display_name,'milestoneTitle',title,'status',status,'notes',notes,'proofUrls',proof_urls,'feedback',merchant_feedback,'submittedAt',submitted_at,'reviewedAt',reviewed_at,'updatedAt',updated_at)order by id)filter(where n<=50),'[]'),case when count(*)>50 then (array_agg(id order by id))[50] else null end into submissions,submission_cursor from bounded;
  detail:=jsonb_build_object('id',mission.id,'title',mission.title,'summary',mission.summary,'status',mission.status,'missionType',mission.mission_type,'requiresApplication',mission.kinnso_requires_application,'updatedAt',mission.updated_at,'couponCode',coalesce(mission.coupon_code,''),'couponUrl',coalesce(mission.coupon_url,''),'affiliateRate',mission.affiliate_commission_rate,'kinnsoRate',mission.kinnso_commission_rate,'creatorRate',mission.creator_commission_rate,'requirements',mission.requirements,'deliverables',mission.deliverables,
   'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'dueAt',due_at)order by sort_order,id)from public.mission_milestones where mission_id=mission.id),'[]'),
   'participants',participants,'participantsNextCursor',participant_cursor,'submissions',submissions,'submissionsNextCursor',submission_cursor,'canEdit',mission.status='draft' and mission.mission_source='merchant' and mission.mission_type='coupon_affiliate' and coalesce(mission.paid_fee_amount,0)=0 and not exists(select 1 from public.mission_participants where mission_id=mission.id),'canClose',mission.status='published' and mission.mission_source='merchant' and mission.mission_type='coupon_affiliate' and coalesce(mission.paid_fee_amount,0)=0,'canReviewSubmissions',role_name='owner' and mission.mission_source='merchant' and mission.mission_type='coupon_affiliate' and coalesce(mission.paid_fee_amount,0)=0);
 end if;
 select jsonb_build_object('draft',count(*)filter(where status='draft'),'published',count(*)filter(where status='published'),'closed',count(*)filter(where status in ('paused','completed','cancelled')),
  'applications',(select count(*) from public.mission_participants p join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant_id and p.status='applied'),
  'activeCreators',(select count(distinct p.creator_id) from public.mission_participants p join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant_id and p.status='active'),
  'submitted',(select count(*) from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant_id and s.status='submitted'),
  'approved',(select count(*) from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant_id and s.status='approved')) into company_summary from public.missions where merchant_profile_id=p_merchant_id;
 return jsonb_build_object('merchantId',p_merchant_id,'role',role_name,'items',items,'nextCursor',cursor,'detail',detail,'summary',company_summary,
  'branches',branches,'branchesNextCursor',branch_cursor);
end $$;
revoke all on function public.apply_kinnso_merchant_campaign_command(uuid,uuid,jsonb),public.get_kinnso_merchant_campaigns(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_kinnso_merchant_campaign_command(uuid,uuid,jsonb),public.get_kinnso_merchant_campaigns(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
