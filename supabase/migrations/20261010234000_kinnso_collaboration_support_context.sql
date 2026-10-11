-- P12: context never grants access to an activity or another customer's case.
alter table kinnso_internal.support_cases add column mission_id uuid references public.missions(id)on delete set null;
create function public.get_kinnso_support_context(p_mission_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();m public.missions;detail jsonb;begin
 if not exists(select 1 from auth.users where id=a and deleted_at is null and(banned_until is null or banned_until<=now()))then raise exception 'forbidden';end if;
 select * into m from public.missions where id=p_mission_id;if not found then raise exception 'mission_not_found';end if;
 if exists(select 1 from public.creators where id=a and status='active')then
  begin detail:=public.get_kinnso_creator_mission(p_mission_id);return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','creator');
  exception when raise_exception then if sqlerrm not in('mission_not_found','creator_required')then raise;end if;end;
 end if;
 if m.merchant_profile_id is not null then perform kinnso_internal.merchant_role(m.merchant_profile_id,a,null,array['owner']);return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','merchant');end if;
 raise exception 'mission_not_found';
end $$;
revoke all on function public.get_kinnso_support_context(uuid)from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_support_context(uuid)to authenticated;

create or replace function public.get_kinnso_support(p_ops boolean default false,p_after uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();rows jsonb;cursor uuid;begin
 if p_ops and not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator'))then raise exception 'forbidden';end if;
 with bounded as(select *,row_number()over(order by id)rn from kinnso_internal.support_cases where (p_ops or recipient_id=a) and(p_after is null or id>p_after)order by id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'subject',subject,'status',status,'ownerId',owner_id,'revision',revision,'linkedEventId',linked_event_id,'context',case when mission_id is not null then jsonb_build_object('type','mission','id',mission_id)else null end,'updatedAt',updated_at,'messages',page->'items','messagesNextCursor',page->'nextCursor')order by id)filter(where rn<=50),'[]'),case when count(*)>50 then(array_agg(id order by id))[50]else null end into rows,cursor from bounded cross join lateral(select kinnso_internal.support_message_page(bounded.id,a,null)page)history;
 return jsonb_build_object('items',rows,'nextCursor',cursor);
end $$;
create or replace function public.apply_kinnso_support_command(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();digest text;prior kinnso_internal.requests;c kinnso_internal.support_cases;kind text:=p_command->>'type';v_id uuid:=(p_command->>'id')::uuid;owner uuid;context_mission uuid;result jsonb;begin
 perform kinnso_internal.keys(p_command,array['type','id','expectedRevision','subject','message','linkedEventId','ownerId','status','reason','context']);if p_request_id is null or v_id is null then raise exception 'invalid_command';end if;
 perform 1 from auth.users where id=a and deleted_at is null and(banned_until is null or banned_until<=now())for share;if not found then raise exception 'forbidden';end if;
 if p_command?'context'and kind<>'create'then raise exception 'invalid_command';end if;
 if kind='review' then perform 1 from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator')for share;if not found then raise exception 'forbidden';end if;end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));digest:=kinnso_internal.request_digest(jsonb_build_array('support',p_command)::text);select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;if kind<>'review'and not exists(select 1 from kinnso_internal.support_cases where id=v_id and recipient_id=a)then raise exception 'support_not_found';end if;return prior.result;end if;
 if kind='create' then
  if p_command?'context'and jsonb_typeof(p_command->'context')is distinct from 'null'then
   perform kinnso_internal.keys(p_command->'context',array['type','id']);if jsonb_typeof(p_command->'context')is distinct from 'object'or p_command->'context'->>'type'is distinct from 'mission'or p_command->'context'->>'id'is null then raise exception 'invalid_command';end if;
   context_mission:=(p_command->'context'->>'id')::uuid;perform 1 from public.creators where id=a for share;perform public.get_kinnso_support_context(context_mission);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('support_quota:'||a::text,0));
  if p_command->>'linkedEventId' is not null and not exists(select 1 from public.notifications where notifications.id=(p_command->>'linkedEventId')::uuid and creator_id=a) and not exists(select 1 from kinnso_internal.inbox_events where inbox_events.id=(p_command->>'linkedEventId')::uuid and recipient_id=a)then raise exception 'forbidden';end if;
  if(select count(*)from kinnso_internal.support_cases where recipient_id=a and created_at>now()-interval '1 day')>=10 then raise exception 'invalid_quota';end if;
  insert into kinnso_internal.support_cases(id,recipient_id,subject,linked_event_id,mission_id)values(v_id,a,p_command->>'subject',(p_command->>'linkedEventId')::uuid,context_mission)returning * into c;
 elsif kind in ('reply','review') then
  select * into c from kinnso_internal.support_cases where support_cases.id=v_id for update;if not found or(kind='reply'and c.recipient_id<>a)then raise exception 'support_not_found';end if;
  if c.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
  if kind='review' then
   owner:=(p_command->>'ownerId')::uuid;if owner is not null and not exists(select 1 from public.kinnso_ops_members where user_id=owner and status='active'and role in ('owner','admin','moderator'))then raise exception 'invalid_owner';end if;
   if p_command->>'status' is null or p_command->>'status' not in ('open','in_progress','waiting_customer','resolved')or coalesce(length(btrim(p_command->>'reason')),0)not between 10 and 2000 then raise exception 'invalid_review';end if;
   if p_command->>'status' in ('waiting_customer','resolved')and coalesce(length(btrim(p_command->>'message')),0)not between 1 and 4000 then raise exception 'invalid_response';end if;
   update kinnso_internal.support_cases set owner_id=owner,status=p_command->>'status',revision=revision+1,updated_at=now()where support_cases.id=v_id returning * into c;
   insert into kinnso_internal.support_audit(case_id,actor_id,action,reason)values(v_id,a,p_command->>'status',p_command->>'reason');insert into kinnso_internal.inbox_events(recipient_id,event_type,entity_type,entity_id)values(c.recipient_id,'support.updated','support_case',v_id);
  else if c.status='resolved' then raise exception 'invalid_resolved';end if;update kinnso_internal.support_cases set revision=revision+1,updated_at=now()where support_cases.id=v_id returning * into c;end if;
 else raise exception 'invalid_command';end if;
 if kind in ('create','reply')or p_command->>'message' is not null then insert into kinnso_internal.support_messages(case_id,actor_id,message)values(v_id,a,p_command->>'message');end if;
 result:=jsonb_build_object('id',v_id,'revision',c.revision,'status',c.status);insert into kinnso_internal.requests values(a,p_request_id,digest,result,now());return result;
end $$;

create function public.get_kinnso_support_request_receipt(p_request_id uuid,p_command jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();prior kinnso_internal.requests;kind text:=p_command->>'type';case_id uuid;digest text;begin
 if not exists(select 1 from auth.users where auth.users.id=a and deleted_at is null and(banned_until is null or banned_until<=now()))then raise exception 'forbidden';end if;
 perform kinnso_internal.keys(p_command,array['type','id','expectedRevision','subject','message','linkedEventId','ownerId','status','reason','context']);
 if p_request_id is null or kind not in('create','reply','review')or p_command->>'id'is null then raise exception 'invalid_command';end if;case_id:=(p_command->>'id')::uuid;
 if kind='review'and not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active'and role in('owner','admin','moderator'))then raise exception 'forbidden';end if;
 digest:=kinnso_internal.request_digest(jsonb_build_array('support',p_command)::text);select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;
 if found then
  if prior.digest<>digest then raise exception 'idempotency_conflict';end if;
  if not exists(select 1 from kinnso_internal.support_cases c where c.id=case_id and(kind='review'or c.recipient_id=a))then raise exception 'support_not_found';end if;return prior.result;
 end if;
 if kind in('reply','review')and not exists(select 1 from kinnso_internal.support_cases c where c.id=case_id and(kind='review'or c.recipient_id=a))then raise exception 'support_not_found';end if;
 if kind='create'and p_command?'context'and jsonb_typeof(p_command->'context')is distinct from 'null'then
  perform kinnso_internal.keys(p_command->'context',array['type','id']);if p_command->'context'->>'type'is distinct from 'mission'then raise exception 'invalid_command';end if;perform public.get_kinnso_support_context((p_command->'context'->>'id')::uuid);
 end if;
 return null;
end $$;
revoke all on function public.get_kinnso_support_request_receipt(uuid,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_support_request_receipt(uuid,jsonb)to authenticated;
