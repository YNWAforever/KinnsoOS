-- Keep mature in-app triggers unchanged. External delivery is queued by a post-commit worker.
create table kinnso_internal.inbox_events(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references auth.users(id) on delete cascade,event_type text not null check(event_type in ('place.report_revision','place.report_resolved','support.updated')),entity_type text not null check(entity_type in ('place_report','support_case')),entity_id uuid not null,read_at timestamptz,created_at timestamptz not null default now());
create index inbox_recipient_keyset on kinnso_internal.inbox_events(recipient_id,created_at desc,id desc);
create table kinnso_internal.notification_preferences(actor_id uuid not null references auth.users(id) on delete cascade,channel text not null check(channel='email'),enabled boolean not null default false,primary key(actor_id,channel));
create table kinnso_internal.delivery_channels(channel text primary key check(channel='email'),provider text not null,template_version text not null,approved boolean not null default false);
create table kinnso_internal.notification_outbox(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.notifications(id) on delete cascade,recipient_id uuid not null references auth.users(id) on delete cascade,channel text not null references kinnso_internal.delivery_channels(channel),state text not null check(state in ('queued','retry','sending','delivered','dead_letter','suppressed')),attempts integer not null default 0,revision integer not null default 1,next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,provider_receipt text,updated_at timestamptz not null default now(),unique(event_id,channel));
create table kinnso_internal.delivery_completions(delivery_id uuid not null references kinnso_internal.notification_outbox(id) on delete cascade,lease_token uuid not null,digest text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(delivery_id,lease_token));
create table kinnso_internal.delivery_retry_audit(id uuid primary key default gen_random_uuid(),delivery_id uuid not null references kinnso_internal.notification_outbox(id) on delete cascade,actor_id uuid not null,request_id uuid not null,reason text not null check(length(btrim(reason)) between 10 and 2000),prior_revision integer not null,new_revision integer not null,created_at timestamptz not null default now(),unique(actor_id,request_id));
alter table kinnso_internal.delivery_completions enable row level security;alter table kinnso_internal.delivery_retry_audit enable row level security;
revoke all on kinnso_internal.delivery_completions,kinnso_internal.delivery_retry_audit from public,anon,authenticated,service_role;
-- Immutable while the parent exists; account/event deletion may cascade for privacy.
create function kinnso_internal.immutable_delivery_record() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' and not exists(select 1 from kinnso_internal.notification_outbox where id=old.delivery_id)then return old;end if;
 raise exception 'immutable_audit';
end $$;
revoke all on function kinnso_internal.immutable_delivery_record() from public,anon,authenticated,service_role;
create trigger delivery_completion_immutable before update or delete on kinnso_internal.delivery_completions for each row execute function kinnso_internal.immutable_delivery_record();
create trigger delivery_retry_audit_immutable before update or delete on kinnso_internal.delivery_retry_audit for each row execute function kinnso_internal.immutable_delivery_record();
create table kinnso_internal.support_cases(id uuid primary key,recipient_id uuid not null references auth.users(id) on delete cascade,linked_event_id uuid,owner_id uuid references auth.users(id) on delete set null,status text not null default 'open' check(status in ('open','in_progress','waiting_customer','resolved')),subject text not null check(length(btrim(subject)) between 1 and 200),revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table kinnso_internal.support_messages(id uuid primary key default gen_random_uuid(),case_id uuid not null references kinnso_internal.support_cases(id) on delete cascade,actor_id uuid references auth.users(id) on delete set null,message text not null check(length(btrim(message)) between 1 and 4000),created_at timestamptz not null default now());
create index support_messages_keyset on kinnso_internal.support_messages(case_id,created_at desc,id desc);
create table kinnso_internal.support_audit(id uuid primary key default gen_random_uuid(),case_id uuid not null references kinnso_internal.support_cases(id) on delete cascade,actor_id uuid not null,action text not null,reason text not null,created_at timestamptz not null default now());
alter table kinnso_internal.inbox_events enable row level security;alter table kinnso_internal.notification_preferences enable row level security;alter table kinnso_internal.delivery_channels enable row level security;alter table kinnso_internal.notification_outbox enable row level security;alter table kinnso_internal.support_cases enable row level security;alter table kinnso_internal.support_messages enable row level security;alter table kinnso_internal.support_audit enable row level security;
revoke all on kinnso_internal.inbox_events,kinnso_internal.notification_preferences,kinnso_internal.delivery_channels,kinnso_internal.notification_outbox,kinnso_internal.support_cases,kinnso_internal.support_messages,kinnso_internal.support_audit from public,anon,authenticated,service_role;

create function public.get_kinnso_inbox(p_cursor jsonb default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();rows jsonb;cursor jsonb;n integer;begin
 if p_cursor is not null then perform kinnso_internal.keys(p_cursor,array['createdAt','id']);end if;
 with mine as (
 select n.id,n.notification_type event_type,n.entity_type,n.entity_id,n.read_at,n.created_at,jsonb_strip_nulls(jsonb_build_object('missionTitle',n.payload->>'mission_title','currency',n.payload->>'currency')) payload from public.notifications n where creator_id=a and exists(select 1 from public.creators where id=a and status='active')
 union all select id,event_type,entity_type,entity_id,read_at,created_at,'{}'::jsonb from kinnso_internal.inbox_events where recipient_id=a
 ),bounded as(select *,row_number()over(order by created_at desc,id desc)rn from mine where p_cursor is null or (created_at,id)<((p_cursor->>'createdAt')::timestamptz,(p_cursor->>'id')::uuid) order by created_at desc,id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'entityType',entity_type,'entityId',entity_id,'readAt',read_at,'createdAt',created_at,'payload',payload) order by created_at desc,id desc)filter(where rn<=50),'[]'),case when count(*)>50 then (jsonb_agg(jsonb_build_object('createdAt',created_at,'id',id)order by created_at desc,id desc))->49 else null end into rows,cursor from bounded;
 select (select count(*)from public.notifications where creator_id=a and read_at is null and exists(select 1 from public.creators where id=a and status='active'))+(select count(*)from kinnso_internal.inbox_events where recipient_id=a and read_at is null) into n;
 return jsonb_build_object('items',rows,'nextCursor',cursor,'unreadCount',n,'externalDelivery','unconfigured');
end $$;
create function public.apply_kinnso_inbox_command(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();digest text;prior kinnso_internal.requests;v_id uuid;result jsonb;kind text:=p_command->>'type';begin
 perform kinnso_internal.keys(p_command,array['type','id','channel','enabled']);if p_request_id is null then raise exception 'invalid_command';end if;
 -- Replays still require current event ownership and creator authority.
 if kind='markRead' then
  v_id:=(p_command->>'id')::uuid;
  perform 1 from kinnso_internal.inbox_events where id=v_id and recipient_id=a for update;
  if not found then
   perform 1 from public.creators where id=a and status='active' for share;if not found then raise exception 'notification_not_found';end if;
   perform 1 from public.notifications where id=v_id and creator_id=a for update;if not found then raise exception 'notification_not_found';end if;
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));digest:=kinnso_internal.request_digest(jsonb_build_array('inbox',p_command)::text);
 select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if kind='markRead' then
  v_id:=(p_command->>'id')::uuid;update kinnso_internal.inbox_events set read_at=coalesce(read_at,now()) where inbox_events.id=v_id and recipient_id=a;
  if not found then update public.notifications set read_at=coalesce(read_at,now()) where notifications.id=v_id and creator_id=a and exists(select 1 from public.creators where creators.id=a and status='active');if not found then raise exception 'notification_not_found';end if;end if;
  result:=jsonb_build_object('id',v_id,'read',true);
 elsif kind='setPreference' then
  if p_command->>'channel' is distinct from 'email' or jsonb_typeof(p_command->'enabled') is distinct from 'boolean' then raise exception 'invalid_preference';end if;
  insert into kinnso_internal.notification_preferences values(a,'email',(p_command->>'enabled')::boolean) on conflict(actor_id,channel)do update set enabled=excluded.enabled;
  if not(p_command->>'enabled')::boolean then update kinnso_internal.notification_outbox set state='suppressed',lease_token=null,lease_until=null,updated_at=now() where recipient_id=a and state in ('queued','retry');end if;
  result:=jsonb_build_object('channel','email','enabled',(p_command->>'enabled')::boolean,'delivery','unconfigured');
 else raise exception 'invalid_command';end if;
 insert into kinnso_internal.requests values(a,p_request_id,digest,result,now());return result;
end $$;

-- No trigger writes to the external outbox; this service-only pull runs after business commit.
create function public.queue_kinnso_notification_delivery() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into kinnso_internal.notification_outbox(event_id,recipient_id,channel,state)
 select n.id,n.creator_id,c.channel,'queued' from public.notifications n join public.creators creator on creator.id=n.creator_id and creator.status='active' join kinnso_internal.notification_preferences pref on pref.actor_id=n.creator_id and pref.channel='email' and pref.enabled join kinnso_internal.delivery_channels c on c.channel='email' and c.approved
 where n.notification_type in ('submission.approved','submission.rejected','submission.revision_requested','settlement.created','payout_batch.created','payout_batch.paid','payout_batch.cancelled') and not exists(select 1 from kinnso_internal.notification_outbox o where o.event_id=n.id and o.channel=c.channel) order by n.created_at,n.id limit 100 on conflict(event_id,channel)do nothing;
 get diagnostics n=row_count;return n;
end $$;
create function public.claim_kinnso_notification_delivery() returns jsonb language plpgsql security definer set search_path='' as $$
declare o kinnso_internal.notification_outbox;token uuid:=gen_random_uuid();begin
 update kinnso_internal.notification_outbox outbox set state='suppressed',lease_token=null,lease_until=null where state in ('queued','retry') and not exists(select 1 from kinnso_internal.notification_preferences p join kinnso_internal.delivery_channels c on c.channel=p.channel and c.approved where p.actor_id=outbox.recipient_id and p.channel=outbox.channel and p.enabled);
 update kinnso_internal.notification_outbox set state='dead_letter',revision=revision+1,lease_token=null,lease_until=null where state in ('queued','retry','sending') and attempts>=5 and (lease_until is null or lease_until<now());
 select * into o from kinnso_internal.notification_outbox outbox where state in ('queued','retry','sending') and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and exists(select 1 from public.creators where id=outbox.recipient_id and status='active') order by next_attempt_at,id for update skip locked limit 1;if not found then return null;end if;
 update kinnso_internal.notification_outbox set state='retry',lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1,revision=revision+1,updated_at=now() where id=o.id;
 return (select jsonb_build_object('id',o.id,'eventId',o.event_id,'recipientId',o.recipient_id,'channel',o.channel,'type',n.notification_type,'entityType',n.entity_type,'entityId',n.entity_id,'templateVersion',c.template_version,'provider',c.provider,'attempts',o.attempts+1,'leaseToken',token) from public.notifications n join kinnso_internal.delivery_channels c on c.channel=o.channel where n.id=o.event_id);
end $$;
-- This transaction is the send-start boundary. Revocations committed before it
-- suppress delivery; a provider request already started cannot be recalled.
create function public.authorize_kinnso_notification_send(p_id uuid,p_lease_token uuid,p_provider text,p_template_version text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot kinnso_internal.notification_outbox;o kinnso_internal.notification_outbox;allowed boolean:=true;begin
 if p_id is null or p_lease_token is null or p_provider is null or p_template_version is null then return jsonb_build_object('authorized',false,'state','stale');end if;
 select * into snapshot from kinnso_internal.notification_outbox where id=p_id;if not found then return jsonb_build_object('authorized',false,'state','stale');end if;
 -- Match the preference writer's lock order before taking the delivery lock.
 perform 1 from kinnso_internal.notification_preferences where actor_id=snapshot.recipient_id and channel=snapshot.channel and enabled for share;allowed:=allowed and found;
 perform 1 from public.creators where id=snapshot.recipient_id and status='active' for share;allowed:=allowed and found;
 perform 1 from kinnso_internal.delivery_channels where channel=snapshot.channel and approved and provider=p_provider and template_version=p_template_version for share;allowed:=allowed and found;
 select * into o from kinnso_internal.notification_outbox where id=p_id for update;
 if not found or o.lease_token is distinct from p_lease_token or o.lease_until is null or o.lease_until<=now() or o.state not in ('queued','retry')then return jsonb_build_object('authorized',false,'state',case when o.state='suppressed' then 'suppressed' else 'stale' end);end if;
 if not allowed then update kinnso_internal.notification_outbox set state='suppressed',lease_token=null,lease_until=null,revision=revision+1,updated_at=now()where id=p_id;return jsonb_build_object('authorized',false,'state','suppressed');end if;
 update kinnso_internal.notification_outbox set state='sending',revision=revision+1,updated_at=now()where id=p_id;return jsonb_build_object('authorized',true,'state','sending');
end $$;
create function public.finish_kinnso_notification_delivery(p_id uuid,p_lease_token uuid,p_delivered boolean,p_receipt text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o kinnso_internal.notification_outbox;v_state text;v_digest text;prior kinnso_internal.delivery_completions;result jsonb;begin
 if p_id is null or p_lease_token is null or p_delivered is null or (p_delivered and (p_receipt is null or length(p_receipt)not between 1 and 200))or(not p_delivered and p_receipt is not null)then raise exception 'invalid_delivery';end if;
 v_digest:=kinnso_internal.request_digest(jsonb_build_array(p_id,p_lease_token,p_delivered,p_receipt)::text);
 perform pg_advisory_xact_lock(hashtextextended('delivery_completion:'||p_id::text||p_lease_token::text,0));
 select * into prior from kinnso_internal.delivery_completions where delivery_id=p_id and lease_token=p_lease_token;
 if found then if prior.digest<>v_digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 select * into o from kinnso_internal.notification_outbox where id=p_id and lease_token=p_lease_token and lease_until>now() for update;if not found then raise exception 'invalid_lease';end if;
 if o.state not in ('queued','retry','sending')or(p_delivered and o.state<>'sending')then raise exception 'invalid_lease';end if;
 v_state:=case when p_delivered then 'delivered' when o.attempts>=5 then 'dead_letter' else 'retry' end;
 update kinnso_internal.notification_outbox set state=v_state,revision=revision+1,provider_receipt=case when p_delivered then p_receipt else null end,lease_token=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,o.attempts))::integer)),updated_at=now() where id=p_id;
 result:=jsonb_build_object('id',p_id,'state',v_state,'attempts',o.attempts);
 insert into kinnso_internal.delivery_completions(delivery_id,lease_token,digest,result)values(p_id,p_lease_token,v_digest,result);return result;
end $$;

create function kinnso_internal.support_message_page(p_case_id uuid,p_actor uuid,p_cursor jsonb) returns jsonb language sql stable set search_path='' as $$
 with bounded as(select *,row_number()over(order by created_at desc,id desc)rn from kinnso_internal.support_messages where case_id=p_case_id and(p_cursor is null or(created_at,id)<((p_cursor->>'createdAt')::timestamptz,(p_cursor->>'id')::uuid))order by created_at desc,id desc limit 21)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'message',message,'createdAt',created_at,'mine',actor_id=p_actor)order by created_at,id)filter(where rn<=20),'[]'),'nextCursor',case when count(*)>20 then(jsonb_agg(jsonb_build_object('createdAt',created_at,'id',id)order by created_at desc,id desc))->19 else null end)from bounded;
$$;
revoke all on function kinnso_internal.support_message_page(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.get_kinnso_support_messages(p_case_id uuid,p_cursor jsonb default null,p_ops boolean default false)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();begin
 if p_ops and not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active'and role in ('owner','admin','moderator'))then raise exception 'forbidden';end if;
 if not exists(select 1 from kinnso_internal.support_cases where id=p_case_id and(p_ops or recipient_id=a))then raise exception 'support_not_found';end if;
 if p_cursor is not null then perform kinnso_internal.keys(p_cursor,array['createdAt','id']);if p_cursor->>'createdAt' is null or p_cursor->>'id' is null then raise exception 'invalid_cursor';end if;end if;
 return kinnso_internal.support_message_page(p_case_id,a,p_cursor);
end $$;
create function public.get_kinnso_support(p_ops boolean default false,p_after uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();rows jsonb;cursor uuid;begin
 if p_ops and not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator'))then raise exception 'forbidden';end if;
 with bounded as(select *,row_number()over(order by id)rn from kinnso_internal.support_cases where (p_ops or recipient_id=a) and(p_after is null or id>p_after)order by id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'subject',subject,'status',status,'ownerId',owner_id,'revision',revision,'linkedEventId',linked_event_id,'updatedAt',updated_at,'messages',page->'items','messagesNextCursor',page->'nextCursor')order by id)filter(where rn<=50),'[]'),case when count(*)>50 then(array_agg(id order by id))[50]else null end into rows,cursor from bounded cross join lateral(select kinnso_internal.support_message_page(bounded.id,a,null)page)history;
 return jsonb_build_object('items',rows,'nextCursor',cursor);
end $$;
create function public.apply_kinnso_support_command(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();digest text;prior kinnso_internal.requests;c kinnso_internal.support_cases;kind text:=p_command->>'type';v_id uuid:=(p_command->>'id')::uuid;owner uuid;result jsonb;begin
 perform kinnso_internal.keys(p_command,array['type','id','expectedRevision','subject','message','linkedEventId','ownerId','status','reason']);if p_request_id is null or v_id is null then raise exception 'invalid_command';end if;
 if kind='review' then perform 1 from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator')for share;if not found then raise exception 'forbidden';end if;end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));digest:=kinnso_internal.request_digest(jsonb_build_array('support',p_command)::text);select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if kind='create' then
  perform pg_advisory_xact_lock(hashtextextended('support_quota:'||a::text,0));
  if p_command->>'linkedEventId' is not null and not exists(select 1 from public.notifications where notifications.id=(p_command->>'linkedEventId')::uuid and creator_id=a) and not exists(select 1 from kinnso_internal.inbox_events where inbox_events.id=(p_command->>'linkedEventId')::uuid and recipient_id=a)then raise exception 'forbidden';end if;
  if(select count(*)from kinnso_internal.support_cases where recipient_id=a and created_at>now()-interval '1 day')>=10 then raise exception 'invalid_quota';end if;
  insert into kinnso_internal.support_cases(id,recipient_id,subject,linked_event_id)values(v_id,a,p_command->>'subject',(p_command->>'linkedEventId')::uuid)returning * into c;
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
create function public.get_kinnso_delivery_failures(p_after uuid default null)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();result jsonb;begin
 if not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active'and role in ('owner','admin','moderator'))then raise exception 'forbidden';end if;
 with bounded as(select *,row_number()over(order by id)rn from kinnso_internal.notification_outbox where state='dead_letter'and(p_after is null or id>p_after)order by id limit 51)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'eventId',event_id,'channel',channel,'attempts',attempts,'revision',revision,'updatedAt',updated_at)order by id)filter(where rn<=50),'[]'),'nextCursor',case when count(*)>50 then(array_agg(id order by id))[50]else null end)into result from bounded;return result;
end $$;
create function public.retry_kinnso_notification_delivery(p_request_id uuid,p_id uuid,p_expected_revision integer,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();o kinnso_internal.notification_outbox;snapshot kinnso_internal.notification_outbox;prior kinnso_internal.requests;digest text;result jsonb;allowed boolean:=true;begin
 perform 1 from public.kinnso_ops_members where user_id=a and status='active'and role in ('owner','admin','moderator')for share;if not found then raise exception 'forbidden';end if;
 if p_request_id is null or p_id is null or p_expected_revision is null or coalesce(length(btrim(p_reason)),0)not between 10 and 2000 then raise exception 'invalid_retry';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));digest:=kinnso_internal.request_digest(jsonb_build_array('delivery_retry',p_id,p_expected_revision,p_reason)::text);
 select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 select * into snapshot from kinnso_internal.notification_outbox where id=p_id;if not found then raise exception 'delivery_not_found';end if;
 perform 1 from kinnso_internal.notification_preferences where actor_id=snapshot.recipient_id and channel=snapshot.channel and enabled for share;allowed:=allowed and found;
 perform 1 from public.creators where id=snapshot.recipient_id and status='active'for share;allowed:=allowed and found;
 perform 1 from kinnso_internal.delivery_channels where channel=snapshot.channel and approved for share;allowed:=allowed and found;
 select * into o from kinnso_internal.notification_outbox where id=p_id for update;if not found then raise exception 'delivery_not_found';end if;
 if o.revision<>p_expected_revision or o.state<>'dead_letter'then raise exception 'revision_conflict';end if;
 if not allowed then raise exception 'invalid_delivery_unavailable';end if;
 update kinnso_internal.notification_outbox set state='retry',attempts=0,revision=revision+1,next_attempt_at=now(),lease_token=null,lease_until=null,provider_receipt=null,updated_at=now()where id=p_id;
 insert into kinnso_internal.delivery_retry_audit(delivery_id,actor_id,request_id,reason,prior_revision,new_revision)values(p_id,a,p_request_id,p_reason,o.revision,o.revision+1);
 result:=jsonb_build_object('id',p_id,'state','retry','revision',o.revision+1);insert into kinnso_internal.requests values(a,p_request_id,digest,result,now());return result;
end $$;
revoke all on function public.get_kinnso_support_messages(uuid,jsonb,boolean),public.get_kinnso_delivery_failures(uuid),public.retry_kinnso_notification_delivery(uuid,uuid,integer,text),public.authorize_kinnso_notification_send(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_support_messages(uuid,jsonb,boolean),public.get_kinnso_delivery_failures(uuid),public.retry_kinnso_notification_delivery(uuid,uuid,integer,text)to authenticated;
grant execute on function public.authorize_kinnso_notification_send(uuid,uuid,text,text)to service_role;
revoke all on function public.get_kinnso_inbox(jsonb),public.apply_kinnso_inbox_command(uuid,jsonb),public.get_kinnso_support(boolean,uuid),public.apply_kinnso_support_command(uuid,jsonb),public.queue_kinnso_notification_delivery(),public.claim_kinnso_notification_delivery(),public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_inbox(jsonb),public.apply_kinnso_inbox_command(uuid,jsonb),public.get_kinnso_support(boolean,uuid),public.apply_kinnso_support_command(uuid,jsonb)to authenticated;
grant execute on function public.queue_kinnso_notification_delivery(),public.claim_kinnso_notification_delivery(),public.finish_kinnso_notification_delivery(uuid,uuid,boolean,text)to service_role;
