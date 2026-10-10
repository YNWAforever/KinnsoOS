-- P09: mature creator/private CRM models; owner, receipt and quota boundaries.
alter table public.merchant_saved_creators add column if not exists updated_at timestamptz not null default now();
create function kinnso_internal.saved_creator_version() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');return new;end $$;
revoke all on function kinnso_internal.saved_creator_version() from public,anon,authenticated,service_role;
create trigger kinnso_saved_creator_version before update on public.merchant_saved_creators for each row execute function kinnso_internal.saved_creator_version();
drop policy merchant_saved_creators_owner on public.merchant_saved_creators;
create policy merchant_saved_creators_owner on public.merchant_saved_creators for all
 using ((select (public.kinnso_actor()->>'id')::uuid)=auth.uid() and exists(select 1 from public.merchant_profiles m where m.id=merchant_id and m.user_id=auth.uid() and m.status='active'))
 with check ((select (public.kinnso_actor()->>'id')::uuid)=auth.uid() and exists(select 1 from public.merchant_profiles m where m.id=merchant_id and m.user_id=auth.uid() and m.status='active'));

create function kinnso_internal.invite_quota(p_merchant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tier_name text;cap integer;used integer;period_start timestamptz:=date_trunc('month',clock_timestamp());begin
 select tier into tier_name from public.merchant_profiles where id=p_merchant;
 cap:=case tier_name when 'growth' then 30 else 3 end;
 select count(*) into used from public.mission_participants p join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant and p.source='merchant_invite' and p.created_at>=period_start;
 return jsonb_build_object('limit',cap,'used',used,'remaining',greatest(0,cap-used),'periodStart',period_start);
end $$;
revoke all on function kinnso_internal.invite_quota(uuid) from public,anon,authenticated,service_role;
create function kinnso_internal.guard_invite_quota() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;merchant uuid;quota jsonb;begin
 if auth.uid() is null then return new;end if;
 actor:=kinnso_internal.actor();
 if tg_op='UPDATE' then
  if new.source is distinct from old.source or new.created_at is distinct from old.created_at then if actor=new.creator_id then raise exception 'forbidden';end if;raise exception 'invalid_invite_attribution';end if;return new;
 end if;
 select merchant_profile_id into merchant from public.missions where id=new.mission_id;
 if new.status='invited' and new.source<>'merchant_invite' then raise exception 'invalid_invite_attribution';end if;
 if merchant is not null and actor<>new.creator_id and not public.is_active_ops() and new.source<>'merchant_invite' then raise exception 'invalid_invite_attribution';end if;
 if new.source<>'merchant_invite' then return new;end if;
 if new.status<>'invited' or merchant is null or new.creator_id=actor then raise exception 'invalid_invite_attribution';end if;
 perform kinnso_internal.merchant_role(merchant,actor,null,array['owner']);
 -- Runs before campaign admission's mission lock: quota -> mission -> participant.
 perform pg_advisory_xact_lock(hashtextextended(merchant::text,0));
 quota:=kinnso_internal.invite_quota(merchant);
 if (quota->>'remaining')::integer<=0 then raise exception 'invite_quota_exceeded';end if;
 if not exists(select 1 from public.creators where id=new.creator_id and status='active') then raise exception 'creator_not_found';end if;
 if exists(select 1 from public.mission_participants where mission_id=new.mission_id and creator_id=new.creator_id) then raise exception 'already_participant';end if;
 new.created_at:=clock_timestamp();return new;
end $$;
revoke all on function kinnso_internal.guard_invite_quota() from public,anon,authenticated,service_role;
create trigger kinnso_00_invite_quota before insert or update on public.mission_participants for each row execute function kinnso_internal.guard_invite_quota();

create or replace function public.merchant_invite_creator(p_mission_id uuid,p_creator_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();merchant uuid;participant uuid;quota jsonb;begin
 select merchant_profile_id into merchant from public.missions where id=p_mission_id and mission_source='merchant';
 if merchant is null then raise exception 'not_authorized';end if;
 perform kinnso_internal.merchant_role(merchant,actor,null,array['owner']);
 perform pg_advisory_xact_lock(hashtextextended(merchant::text,0));
 perform 1 from public.missions where id=p_mission_id and status='published' for share;
 if not found then raise exception 'not_authorized';end if;
 quota:=kinnso_internal.invite_quota(merchant);
 if (quota->>'remaining')::integer<=0 then raise exception 'invite_quota_exceeded';end if;
 if not exists(select 1 from public.creators where id=p_creator_id and status='active') then raise exception 'creator_not_found';end if;
 if exists(select 1 from public.mission_participants where mission_id=p_mission_id and creator_id=p_creator_id) then raise exception 'already_participant';end if;
 insert into public.mission_participants(mission_id,creator_id,status,source)values(p_mission_id,p_creator_id,'invited','merchant_invite')returning id into participant;
 return participant;
end $$;

create function kinnso_internal.public_profile_strings(value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]' end)with ordinality a(v,n) where jsonb_typeof(v)='string'
$$;
revoke all on function kinnso_internal.public_profile_strings(jsonb) from public,anon,authenticated,service_role;
create function public.get_kinnso_merchant_creators(p_merchant_id uuid,p_query jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();q text:=btrim(coalesce(p_query->>'q',''));saved_only boolean:=false;tier_name text;page_size integer;binding text;after_id uuid;anchor jsonb;items jsonb;next_cursor text;campaign_after uuid;campaigns jsonb;campaign_cursor text;begin
 perform kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner']);
 perform kinnso_internal.keys(p_query,array['q','savedOnly','after','campaignsAfter']);
 if p_query is null or jsonb_typeof(p_query) is distinct from 'object' or (p_query?'q' and jsonb_typeof(p_query->'q') is distinct from 'string') or length(q)>100 or (p_query?'savedOnly' and jsonb_typeof(p_query->'savedOnly') is distinct from 'boolean') then raise exception 'invalid_query';end if;
 saved_only:=coalesce((p_query->>'savedOnly')::boolean,false);
 select tier into tier_name from public.merchant_profiles where id=p_merchant_id;
 page_size:=case when tier_name='free' and not saved_only then 3 else 20 end;
 binding:=kinnso_internal.request_digest(jsonb_build_array('discovery-v1',actor,p_merchant_id,q,saved_only,tier_name,'guideRecency-count-handle-id')::text);
 if p_query?'after' then
  if length(p_query->>'after') not between 1 and 1500 then raise exception 'invalid_cursor';end if;
  begin anchor:=convert_from(decode(translate(p_query->>'after','-_','+/')||repeat('=',(4-length(p_query->>'after')%4)%4),'base64'),'UTF8')::jsonb;after_id:=(anchor->>'id')::uuid;
  exception when others then raise exception 'invalid_cursor';end;
  if anchor->>'v'<>'1' or anchor->>'binding' is distinct from binding or after_id is null or (tier_name='free' and not saved_only) then raise exception 'invalid_cursor';end if;
 end if;
 with candidates as(
  select c.id,c.handle,coalesce(c.display_name,c.handle)name,coalesce(c.bio,'')bio,
   kinnso_internal.public_profile_strings(c.public_profile->'niches')niches,kinnso_internal.public_profile_strings(c.public_profile->'languages')languages,kinnso_internal.public_profile_strings(c.public_profile->'audience_geos')geos,
   coalesce((select jsonb_agg(p->'platform' order by n) from jsonb_array_elements(case when jsonb_typeof(c.public_profile->'platforms')='array' then c.public_profile->'platforms' else '[]' end)with ordinality a(p,n) where jsonb_typeof(p->'platform')='string'),'[]')platforms,
   g.guide_count,g.last_guide_at,s.creator_id is not null saved,s.note,s.updated_at saved_updated_at
  from public.creators c left join public.merchant_saved_creators s on s.creator_id=c.id and s.merchant_id=p_merchant_id
  cross join lateral(select count(*)guide_count,max(published_at)last_guide_at from public.guides where creator_id=c.id and status='published')g
  where c.status='active' and c.handle is not null and c.public_profile is not null and (not saved_only or s.creator_id is not null)
 ),filtered as(select * from candidates where q='' or position(lower(q)in lower(concat_ws(' ',handle,name,bio,niches::text,languages::text,geos::text,platforms::text)))>0),
 ordered as(select *,row_number()over(order by last_guide_at desc nulls last,guide_count desc,handle,id)n from filtered),
 bounded as(select * from ordered where n>coalesce((select n from ordered where id=after_id),0)order by n limit page_size+1)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'handle',handle,'name',name,'bio',bio,'niches',niches,'languages',languages,'audienceGeos',geos,'platforms',platforms,'guideCount',guide_count,'lastGuideAt',last_guide_at,'saved',saved,'note',note,'savedUpdatedAt',saved_updated_at)order by n)filter(where n<=(coalesce((select n from ordered where id=after_id),0)+page_size)),'[]'),
  case when count(*)>page_size and not(tier_name='free' and not saved_only) then rtrim(translate(replace(encode(convert_to((select jsonb_build_object('v',1,'binding',binding,'id',id,'last',last_guide_at,'count',guide_count,'handle',handle)::text from bounded order by n limit 1 offset page_size-1),'UTF8'),'base64'),E'\n',''),'+/','-_'),'=') else null end,
  case when after_id is null then null else(select jsonb_build_object('id',id,'last',last_guide_at,'count',guide_count,'handle',handle)from ordered where id=after_id)end
 into items,next_cursor,anchor from bounded;
 -- A cursor must still anchor a row in the same current authorized/filter order.
 if after_id is not null then
  if anchor is null then raise exception 'invalid_cursor';end if;
  if (convert_from(decode(translate(p_query->>'after','-_','+/')||repeat('=',(4-length(p_query->>'after')%4)%4),'base64'),'UTF8')::jsonb-'v'-'binding') is distinct from anchor then raise exception 'invalid_cursor';end if;
 end if;
 if p_query?'campaignsAfter' then
  begin campaign_after:=(p_query->>'campaignsAfter')::uuid;exception when others then raise exception 'invalid_cursor';end;
  if not exists(select 1 from public.missions where id=campaign_after and merchant_profile_id=p_merchant_id) then raise exception 'invalid_cursor';end if;
 end if;
 with bounded as(select m.*,row_number()over(order by id)n from public.missions m where merchant_profile_id=p_merchant_id and mission_source='merchant' and mission_type='coupon_affiliate' and coalesce(paid_fee_amount,0)=0 and status='published' and(starts_at is null or starts_at<=clock_timestamp())and(ends_at is null or ends_at>clock_timestamp())and(campaign_after is null or id>campaign_after)order by id limit 21)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'updatedAt',updated_at)order by id)filter(where n<=20),'[]'),case when count(*)>20 then(array_agg(id order by id))[20]::text else null end into campaigns,campaign_cursor from bounded;
 return jsonb_build_object('items',items,'nextCursor',next_cursor,'quota',kinnso_internal.invite_quota(p_merchant_id),'campaigns',campaigns,'campaignsNextCursor',campaign_cursor);
end $$;
create function public.get_kinnso_merchant_creator_receipt(p_merchant_id uuid,p_request_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();result jsonb;begin
 perform kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner']);
 select r.result into result from kinnso_internal.workspace_requests r where actor_id=actor and request_id=p_request_id and r.result->>'merchantId'=p_merchant_id::text and r.result->>'operation' in ('saveCreator','unsaveCreator','setSavedNote','inviteCreator');
 return jsonb_build_object('result',result);
end $$;
revoke all on function public.get_kinnso_merchant_creators(uuid,jsonb),public.get_kinnso_merchant_creator_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_merchant_creators(uuid,jsonb),public.get_kinnso_merchant_creator_receipt(uuid,uuid) to authenticated;

-- A successful invitation includes its one inbox event in the same transaction.
-- Keep the mature application decision notification contract in its existing branch.
create or replace function kinnso_internal.notify_content_campaign_participant() returns trigger
language plpgsql security definer set search_path='' as $$
declare mission public.missions;event_type text;begin
 select * into mission from public.missions where id=new.mission_id;
 if tg_op='INSERT' and new.status='invited' and new.source='merchant_invite' then
  insert into public.notifications(creator_id,notification_type,entity_type,entity_id,payload)
   values(new.creator_id,'collaboration.invited','mission',new.mission_id,jsonb_build_object('mission_title',mission.title));
  return new;
 end if;
 if not mission.kinnso_requires_application then return new;end if;
 if tg_op='UPDATE' and old.status='applied' and new.status in ('active','rejected') then
  event_type:=case when new.status='active' then 'collaboration.application_approved' else 'collaboration.application_rejected' end;
 end if;
 if event_type is null then return new;end if;
 begin
  insert into public.notifications(creator_id,notification_type,entity_type,entity_id,payload)
   values(new.creator_id,event_type,'mission',new.mission_id,jsonb_build_object('mission_title',mission.title));
 exception when others then null;end;
 return new;
end $$;

create or replace function public.apply_kinnso_merchant_campaign_command(p_merchant_id uuid,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();role_name text;kind text:=p_command->>'type';entity uuid;digest text;prior kinnso_internal.workspace_requests;result jsonb;
 mission public.missions;participant public.mission_participants;submission public.mission_milestone_submissions;branch kinnso_internal.merchant_branches;
 body jsonb;milestone jsonb;publish_now boolean;next_status text;target_mission_id uuid;expected timestamptz;index_no integer:=0;saved_row public.merchant_saved_creators;invited_id uuid;
begin
 role_name:=kinnso_internal.merchant_role(p_merchant_id,actor,null,case when kind in ('setBranch','reviewSubmission','saveCreator','unsaveCreator','setSavedNote','inviteCreator') then array['owner'] else array['owner','marketing'] end);
 if p_request_id is null or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>65536 or jsonb_typeof(p_command->'reason') is distinct from 'string' or length(btrim(p_command->>'reason')) not between 1 and 2000 then raise exception 'invalid_command';end if;
 entity:=(p_command->>'id')::uuid;if entity is null then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_array('merchantCampaign',p_merchant_id,p_command)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;

 if kind in ('saveCreator','unsaveCreator','setSavedNote') then
  perform kinnso_internal.keys(p_command,case when kind='setSavedNote' then array['type','id','note','expectedUpdatedAt','reason'] else array['type','id','reason'] end);
  if kind='saveCreator' then
   if not exists(select 1 from public.creators where id=entity and status='active' and handle is not null and public_profile is not null) then raise exception 'creator_not_found';end if;
   insert into public.merchant_saved_creators(merchant_id,creator_id)values(p_merchant_id,entity)on conflict do nothing;
   select * into saved_row from public.merchant_saved_creators where merchant_id=p_merchant_id and creator_id=entity;
  elsif kind='unsaveCreator' then
   delete from public.merchant_saved_creators where merchant_id=p_merchant_id and creator_id=entity;
  else
   if jsonb_typeof(p_command->'note') is distinct from 'string' or length(p_command->>'note')>2000 then raise exception 'invalid_command';end if;
   select * into saved_row from public.merchant_saved_creators where merchant_id=p_merchant_id and creator_id=entity for update;
   if not found then raise exception 'creator_not_found';end if;
   expected:=(p_command->>'expectedUpdatedAt')::timestamptz;
   if expected is null or expected is distinct from saved_row.updated_at then raise exception 'revision_conflict';end if;
   update public.merchant_saved_creators set note=btrim(p_command->>'note') where merchant_id=p_merchant_id and creator_id=entity returning * into saved_row;
  end if;
  result:=jsonb_build_object('id',entity,'updatedAt',saved_row.updated_at);
 elsif kind='inviteCreator' then
  perform kinnso_internal.keys(p_command,array['type','id','creatorId','expectedUpdatedAt','reason']);
  if (p_command->>'creatorId')::uuid is null then raise exception 'invalid_command';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_merchant_id::text,0));
  select * into mission from public.missions where id=entity and merchant_profile_id=p_merchant_id for update;
  if not found then raise exception 'forbidden';end if;
  expected:=(p_command->>'expectedUpdatedAt')::timestamptz;
  if expected is null or mission.updated_at is distinct from expected then raise exception 'revision_conflict';end if;
  if mission.mission_source<>'merchant' or mission.mission_type<>'coupon_affiliate' or coalesce(mission.paid_fee_amount,0)<>0 then raise exception 'invalid_campaign_type';end if;
  invited_id:=public.merchant_invite_creator(entity,(p_command->>'creatorId')::uuid);
  result:=jsonb_build_object('id',entity,'participantId',invited_id,'status','invited');
 elsif kind='setBranch' then
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
    if mission.status<>'draft' or mission.kinnso_terms_locked or exists(select 1 from public.mission_participants where mission_id=entity) then raise exception 'revision_conflict';end if;
    if kind='updateDraft' then body:=p_command->'input';perform kinnso_internal.validate_campaign_input(body,false);
    else
     body:=jsonb_build_object('title',mission.title,'summary',mission.summary,'couponCode',coalesce(mission.coupon_code,''),'couponUrl',coalesce(mission.coupon_url,''),'affiliateRate',mission.affiliate_commission_rate,'kinnsoRate',mission.kinnso_commission_rate,'creatorRate',mission.creator_commission_rate,'requirements',mission.requirements,'deliverables',mission.deliverables,
      'applicationOpensAt',mission.starts_at,'applicationClosesAt',mission.ends_at,'scheduleTimeZone',mission.kinnso_schedule_time_zone,
      'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'dueAt',due_at)order by sort_order,id) from public.mission_milestones where mission_id=entity),'[]'));
     perform kinnso_internal.validate_campaign_input(body,true);publish_now:=true;
    end if;
   end if;
  end if;
  if kind in ('createDraft','updateDraft') then
   update public.missions set title=btrim(body->>'title'),summary=body->>'summary',coupon_code=nullif(body->>'couponCode',''),coupon_url=nullif(body->>'couponUrl',''),affiliate_commission_rate=(body->>'affiliateRate')::numeric,kinnso_commission_rate=(body->>'kinnsoRate')::numeric,creator_commission_rate=(body->>'creatorRate')::numeric,requirements=array(select jsonb_array_elements_text(body->'requirements')),deliverables=array(select jsonb_array_elements_text(body->'deliverables')),starts_at=case when body?'applicationOpensAt' then (body->>'applicationOpensAt')::timestamptz else mission.starts_at end,ends_at=case when body?'applicationClosesAt' then (body->>'applicationClosesAt')::timestamptz else mission.ends_at end,kinnso_schedule_time_zone=coalesce(body->>'scheduleTimeZone',mission.kinnso_schedule_time_zone,'UTC') where id=entity;
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
 if kind in ('saveCreator','unsaveCreator','setSavedNote','inviteCreator') then result:=result||jsonb_build_object('merchantId',p_merchant_id,'operation',kind);end if;
 insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,actor,kind,entity,btrim(p_command->>'reason'));
 insert into kinnso_internal.workspace_requests(actor_id,request_id,digest,result) values(actor,p_request_id,digest,result);
 return result;
end $$;
