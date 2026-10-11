-- P10: preserve legacy RPCs; expose bounded native list filters and versioned cursors.
create function kinnso_internal.guard_collaboration_created_at()returns trigger language plpgsql set search_path='' as $$begin
 if auth.uid() is not null and new.created_at is distinct from old.created_at then raise exception 'immutable_campaign_terms';end if;return new;
end $$;
revoke all on function kinnso_internal.guard_collaboration_created_at() from public,anon,authenticated,service_role;
create trigger kinnso_collaboration_created_at before update on public.missions for each row execute function kinnso_internal.guard_collaboration_created_at();

create function kinnso_internal.collaboration_list_rows(p_scope text,p_actor uuid,p_merchant uuid)
returns table(id uuid,created_at timestamptz,due_at timestamptz,list_state text)
language sql stable security definer set search_path='' as $$
 select m.id,m.created_at,
  (select min(l.due_at) from public.mission_milestones l where l.mission_id=m.id and l.due_at is not null and m.status in ('published','paused') and
   (p_scope='merchant' and not exists(select 1 from public.mission_participants a where a.mission_id=m.id)
    or exists(select 1 from public.mission_participants a where a.mission_id=m.id and a.status='active' and (p_scope='merchant' or a.creator_id=p_actor)
     and (l.repeatable and (m.max_receipts_per_creator is null or (select count(*) from public.mission_milestone_submissions s where s.mission_participant_id=a.id and s.mission_milestone_id=l.id and s.status='approved')<m.max_receipts_per_creator) or not l.repeatable and not exists(select 1 from public.mission_milestone_submissions s where s.mission_participant_id=a.id and s.mission_milestone_id=l.id and s.status='approved')))
    or p_scope='available')),
  case when (p_scope='merchant' and m.status in ('published','paused') or p_scope='mine' and p.status='active' and m.status in ('published','paused')) and exists
   (select 1 from public.mission_milestone_submissions s join public.mission_participants a on a.id=s.mission_participant_id where a.mission_id=m.id and (p_scope='merchant' or a.creator_id=p_actor) and s.status='revision_requested') then 'revision_requested'
   when (p_scope='merchant' and m.status in ('published','paused') or p_scope='mine' and p.status='active' and m.status in ('published','paused')) and exists
   (select 1 from public.mission_milestone_submissions s join public.mission_participants a on a.id=s.mission_participant_id where a.mission_id=m.id and (p_scope='merchant' or a.creator_id=p_actor) and s.status='submitted') then 'submitted'
   when p_scope='merchant' and m.status in ('published','paused') and exists(select 1 from public.mission_participants a where a.mission_id=m.id and a.status='applied') then 'applied'
   else case when p_scope='mine' then p.status else m.status end end
 from public.missions m left join public.mission_participants p on p.mission_id=m.id and p.creator_id=p_actor
 where p_scope='merchant' and m.merchant_profile_id=p_merchant or p_scope='mine' and p.id is not null or p_scope='available'
  and m.status='published' and m.visibility='open' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())
  and (m.mission_source='merchant' and exists(select 1 from public.merchant_profiles a where a.id=m.merchant_profile_id and a.status='active')
   or m.mission_source='travelpayouts' and exists(select 1 from public.affiliate_network_programs a where a.id=m.affiliate_network_program_id and a.status='active'));
$$;
revoke all on function kinnso_internal.collaboration_list_rows(text,uuid,uuid) from public,anon,authenticated,service_role;

create function kinnso_internal.collaboration_matches_status(p_scope text,p_actor uuid,p_mission uuid,p_status text)returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_status in ('submitted','revision_requested') then m.status in ('published','paused') and exists(
  select 1 from public.mission_milestone_submissions s join public.mission_participants a on a.id=s.mission_participant_id
  where a.mission_id=m.id and a.status='active' and (p_scope='merchant' or a.creator_id=p_actor) and s.status=p_status)
 when p_scope='merchant' and p_status='applied' then m.status in ('published','paused') and exists(select 1 from public.mission_participants a where a.mission_id=m.id and a.status='applied')
 else case when p_scope='mine' then exists(select 1 from public.mission_participants a where a.mission_id=m.id and a.creator_id=p_actor and a.status=p_status)else m.status=p_status end end
 from public.missions m where m.id=p_mission;
$$;
revoke all on function kinnso_internal.collaboration_matches_status(text,uuid,uuid,text)from public,anon,authenticated,service_role;

create function kinnso_internal.collaboration_list_page(p_scope text,p_actor uuid,p_merchant uuid,p_query jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p_query->>'q',''));state text:=coalesce(p_query->>'status','');ordering text:=coalesce(p_query->>'sort','recent');after_text text:=p_query->>'after';binding text;anchor jsonb;anchor_id uuid;anchor_created timestamptz;anchor_due timestamptz;anchor_state text;items jsonb;cursor text;last_row jsonb;begin
 perform kinnso_internal.keys(p_query,array['q','status','sort','after']);
 if jsonb_typeof(p_query) is distinct from 'object' or length(q)>100 or ordering not in ('recent','deadline') or
  (p_query?'q' and jsonb_typeof(p_query->'q') is distinct from 'string') or
  (state<>'' and not(state=any(case p_scope when 'merchant' then array['draft','published','paused','completed','cancelled','applied','submitted','revision_requested'] when 'mine' then array['invited','applied','active','completed','cancelled','rejected','submitted','revision_requested'] else array['published'] end))) then raise exception 'invalid_query';end if;
 if (p_query?'status' and (jsonb_typeof(p_query->'status') is distinct from 'string' or state='')) or (p_query?'sort' and jsonb_typeof(p_query->'sort') is distinct from 'string') then raise exception 'invalid_query';end if;
 binding:=kinnso_internal.request_digest(jsonb_build_array(p_scope,p_actor,p_merchant,q,state,ordering)::text);
 if after_text is not null then
  if length(after_text)>1500 or after_text!~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'invalid_cursor';end if;
  begin anchor:=convert_from(decode(translate(substr(after_text,4),'-_','+/')||repeat('=',(4-length(substr(after_text,4))%4)%4),'base64'),'UTF8')::jsonb;anchor_id:=(anchor->>'id')::uuid;
  exception when others then raise exception 'invalid_cursor';end;
  if anchor->>'binding' is distinct from binding or anchor->>'v' is distinct from '1' then raise exception 'invalid_cursor';end if;
  select r.created_at,r.due_at,r.list_state into anchor_created,anchor_due,anchor_state from kinnso_internal.collaboration_list_rows(p_scope,p_actor,p_merchant)r join public.missions m on m.id=r.id
   where r.id=anchor_id and (state='' or kinnso_internal.collaboration_matches_status(p_scope,p_actor,r.id,state)) and (q='' or position(lower(q) in lower(m.title||' '||coalesce(m.summary,'')))>0);
  if not found or anchor->>'createdAt' is distinct from to_jsonb(anchor_created)#>>'{}' or anchor->>'dueAt' is distinct from to_jsonb(anchor_due)#>>'{}' or anchor->>'state' is distinct from anchor_state then raise exception 'invalid_cursor';end if;
 end if;
 with rows as materialized(select r.* from kinnso_internal.collaboration_list_rows(p_scope,p_actor,p_merchant)r join public.missions m on m.id=r.id
  where (state='' or kinnso_internal.collaboration_matches_status(p_scope,p_actor,r.id,state)) and (q='' or position(lower(q) in lower(m.title||' '||coalesce(m.summary,'')))>0)), bounded as (
  select *,row_number()over(order by case when ordering='recent' then created_at end desc,case when ordering='deadline' then due_at end asc nulls last,case when ordering='recent' then id end desc,case when ordering='deadline' then id end asc)n from rows
  where anchor_id is null or ordering='recent' and (created_at,id)<(anchor_created,anchor_id)
   or ordering='deadline' and (anchor_due is not null and (due_at>anchor_due or due_at is null or due_at=anchor_due and id>anchor_id) or anchor_due is null and due_at is null and id>anchor_id)
  order by case when ordering='recent' then created_at end desc,case when ordering='deadline' then due_at end asc nulls last,case when ordering='recent' then id end desc,case when ordering='deadline' then id end asc limit 21
 )select coalesce(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'dueAt',due_at,'state',list_state)order by n)filter(where n<=20),'[]'),
  case when count(*)>20 then (jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'dueAt',due_at,'state',list_state)order by n)->19) else null end into items,last_row from bounded;
 if last_row is not null then cursor:='v1.'||rtrim(translate(replace(encode(convert_to((last_row||jsonb_build_object('v',1,'binding',binding))::text,'UTF8'),'base64'),E'\n',''),'+/','-_'),'=');end if;
 return jsonb_build_object('items',items,'nextCursor',cursor);
end $$;
revoke all on function kinnso_internal.collaboration_list_page(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.query_kinnso_creator_missions(p_scope text default 'available',p_query jsonb default '{}')returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();page jsonb;items jsonb;begin
 if not exists(select 1 from public.creators where id=actor and status='active')then raise exception 'creator_required';end if;
 if p_scope is null or p_scope not in ('mine','available')then raise exception 'invalid_scope';end if;
 page:=kinnso_internal.collaboration_list_page(p_scope,actor,null,p_query);
 select coalesce(jsonb_agg(kinnso_internal.creator_mission_card((i->>'id')::uuid,actor)||jsonb_build_object('createdAt',i->'createdAt','nextDueAt',i->'dueAt','listState',i->'state')order by n),'[]')into items from jsonb_array_elements(page->'items')with ordinality a(i,n);
 return page||jsonb_build_object('items',items);
end $$;

create function public.query_kinnso_merchant_campaigns(p_merchant_id uuid,p_query jsonb default '{}',p_campaign_id uuid default null,p_participant_after uuid default null,p_submission_after uuid default null,p_branch_after uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();role_name text;page jsonb;legacy jsonb;items jsonb;begin
 role_name:=kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner','marketing']);
 page:=kinnso_internal.collaboration_list_page('merchant',actor,p_merchant_id,p_query);
 legacy:=public.get_kinnso_merchant_campaigns(p_merchant_id,null,p_campaign_id,p_participant_after,p_submission_after,p_branch_after);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'summary',m.summary,'status',m.status,'missionType',m.mission_type,'updatedAt',m.updated_at,'createdAt',i->'createdAt','nextDueAt',i->'dueAt','listState',i->'state')order by n),'[]')into items from jsonb_array_elements(page->'items')with ordinality a(i,n)join public.missions m on m.id=(i->>'id')::uuid;
 return legacy||page||jsonb_build_object('items',items);
end $$;
revoke all on function public.query_kinnso_creator_missions(text,jsonb),public.query_kinnso_merchant_campaigns(uuid,jsonb,uuid,uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.query_kinnso_creator_missions(text,jsonb),public.query_kinnso_merchant_campaigns(uuid,jsonb,uuid,uuid,uuid,uuid)to authenticated;
