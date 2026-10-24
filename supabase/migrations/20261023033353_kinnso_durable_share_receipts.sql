-- PD06: new writes have an owner-scoped durable encrypted receipt.
-- The BFF supplies a random-token hash and AES-GCM envelope; no raw token enters this API.
create schema kinnso_share_api;
revoke all on schema kinnso_share_api from public,anon,authenticated,service_role;
grant usage on schema kinnso_share_api to authenticated;
create table kinnso_internal.trip_share_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete cascade,
 share_id uuid not null unique references kinnso_internal.trip_shares(id) on delete cascade,
 intent jsonb not null,
 intent_hash text not null check(intent_hash ~ '^[0-9a-f]{64}$'),
 token_envelope jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
alter table kinnso_internal.trip_share_receipts enable row level security;
revoke all on kinnso_internal.trip_share_receipts from public,anon,authenticated,service_role;
create index kinnso_trip_share_receipts_trip_idx on kinnso_internal.trip_share_receipts(owner_id,trip_id,created_at desc,request_id desc);
create function kinnso_share_api.immutable_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_share_receipt'; end $$;
revoke all on function kinnso_share_api.immutable_receipt() from public,anon,authenticated,service_role;
create trigger kinnso_share_receipt_immutable before update on kinnso_internal.trip_share_receipts for each row execute function kinnso_share_api.immutable_receipt();

-- Called only after an authoritative actor/owner check in the three private entry functions.
create function kinnso_share_api.receipt(p_owner uuid,p_trip uuid,p_request uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'requestId',r.request_id,'createdAt',r.created_at,'expiresAt',s.expires_at,
  'state',case when s.revoked_at is not null then 'revoked' when s.expires_at<=now() then 'expired' else 'active' end,
  'intent',r.intent||jsonb_build_object('requestId',r.request_id),'projection',s.projection,
  'tokenHash',s.token_hash,'envelope',case when s.revoked_at is null and s.expires_at>now() then r.token_envelope else null end)
 from kinnso_internal.trip_share_receipts r join kinnso_internal.trip_shares s on s.id=r.share_id
 where r.owner_id=p_owner and r.trip_id=p_trip and r.request_id=p_request;
$$;
revoke all on function kinnso_share_api.receipt(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function kinnso_share_api.create_receipt(p_request_id uuid,p_trip_id uuid,p_stop_ids uuid[],p_media_ids uuid[],p_expires_at timestamptz,p_token_hash text,p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; prior kinnso_internal.trip_share_receipts; intent jsonb; digest text; projection jsonb; id uuid;
begin
 if p_request_id is null then raise exception 'invalid_request'; end if;
 -- Same actor lock is also taken by the legacy entry point below, before any trip lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kinnso:trip-share:'||actor::text,0));
 select * into t from public.trips where public.trips.id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 intent:=jsonb_build_object('tripId',p_trip_id,'stopIds',p_stop_ids,'mediaIds',p_media_ids,'expiresAt',p_expires_at);
 digest:=kinnso_internal.request_digest(intent::text);
 select * into prior from kinnso_internal.trip_share_receipts r where r.owner_id=actor and r.request_id=p_request_id;
 if found then
  if prior.intent_hash<>digest or prior.intent<>intent then raise exception 'idempotency_conflict'; end if;
  return kinnso_share_api.receipt(actor,p_trip_id,p_request_id);
 end if;
 if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days'
 or p_stop_ids is null or p_media_ids is null or cardinality(p_stop_ids)>200 or cardinality(p_media_ids)>20
 or (select count(*) from public.trip_stops s where s.trip_id=t.id and s.id=any(p_stop_ids))<>cardinality(p_stop_ids)
 or (select count(*) from public.kinnso_trip_media m where m.trip_id=t.id and m.owner_id=actor and m.state='ready' and m.attached and m.id=any(p_media_ids))<>cardinality(p_media_ids)
 then raise exception 'invalid_share'; end if;
 if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_envelope) is distinct from 'object' then raise exception 'invalid_share_envelope'; end if;
 if (select array_agg(k order by k) from jsonb_object_keys(p_envelope) k)<>array['ciphertext','iv','kid','tag','v']
 or p_envelope->'v'<>'1'::jsonb or coalesce(p_envelope->>'kid','')!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'
 or coalesce(p_envelope->>'iv','')!~'^[0-9a-f]{24}$' or coalesce(p_envelope->>'ciphertext','')!~'^[0-9a-f]{128}$'
 or coalesce(p_envelope->>'tag','')!~'^[0-9a-f]{32}$' then raise exception 'invalid_share_envelope'; end if;
 if (select count(*) from kinnso_internal.trip_shares where owner_id=actor and revoked_at is null and expires_at>now())>=10
 or (select count(*) from kinnso_internal.trip_shares where owner_id=actor and created_at>now()-interval '1 day')>=100
 then raise exception 'invalid_share_quota'; end if;
 projection:=jsonb_build_object('title',t.title,'approvedMediaIds',to_jsonb(p_media_ids),'days',coalesce((
 select jsonb_agg(jsonb_build_object('id',d.id,'offset',d.day_offset,'title',coalesce(d.title,''),'stops',(
  select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'placeId',s.place_id,'position',s.position,
  'startMinuteOfDay',s.start_minute_of_day,'durationMinutes',s.duration_minutes,'description','',
  'source',case when s.origin='adopted' then jsonb_build_object('guideId',s.source_guide_id,'guideVersion',s.source_guide_version,
  'creatorId',s.source_creator_id,'creatorName',coalesce(s.source_creator_name,'Creator'),'canonicalUrl',null,'withdrawn',s.source_withdrawn_at is not null) else null end)
  order by s.position) from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))) order by d.day_offset)
 from public.trip_days d where d.trip_id=t.id and exists(select 1 from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))),'[]'::jsonb));

 id:=gen_random_uuid();
 insert into kinnso_internal.trip_shares(id,owner_id,trip_id,token_hash,projection,media_ids,expires_at)
 values(id,actor,t.id,p_token_hash,projection,p_media_ids,p_expires_at);
 insert into kinnso_internal.trip_share_receipts(owner_id,request_id,trip_id,share_id,intent,intent_hash,token_envelope)
 values(actor,p_request_id,t.id,id,intent,digest,p_envelope);
 return kinnso_share_api.receipt(actor,t.id,p_request_id);
end $$;
revoke all on function kinnso_share_api.create_receipt(uuid,uuid,uuid[],uuid[],timestamptz,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function kinnso_share_api.create_receipt(uuid,uuid,uuid[],uuid[],timestamptz,text,jsonb) to authenticated;

create function kinnso_share_api.get_receipt(p_trip_id uuid,p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 if p_request_id is null then raise exception 'invalid_request'; end if;
 if not exists(select 1 from public.trips where id=p_trip_id and owner_user_id=actor) then raise exception 'trip_not_found'; end if;
 return kinnso_share_api.receipt(actor,p_trip_id,p_request_id);
end $$;
revoke all on function kinnso_share_api.get_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function kinnso_share_api.get_receipt(uuid,uuid) to authenticated;

create function kinnso_share_api.list_receipts(p_trip_id uuid,p_before timestamptz,p_before_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); rows jsonb;
begin
 if not exists(select 1 from public.trips where id=p_trip_id and owner_user_id=actor) then raise exception 'trip_not_found'; end if;
 if (p_before is null)<>(p_before_request is null) then raise exception 'invalid_cursor'; end if;
 select coalesce(jsonb_agg(item order by created_at desc,request_id desc),'[]'::jsonb) into rows from (
  select r.created_at,r.request_id,jsonb_build_object('requestId',r.request_id,'id',s.id,'createdAt',r.created_at,'expiresAt',s.expires_at,
   'state',case when s.revoked_at is not null then 'revoked' when s.expires_at<=now() then 'expired' else 'active' end) item
  from kinnso_internal.trip_share_receipts r join kinnso_internal.trip_shares s on s.id=r.share_id
  where r.owner_id=actor and r.trip_id=p_trip_id and (p_before is null or (r.created_at,r.request_id)<(p_before,p_before_request))
  order by r.created_at desc,r.request_id desc limit 21
 ) page;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(rows) with ordinality where ordinality<=20),
  'nextCursor',case when jsonb_array_length(rows)>20 then jsonb_build_object('createdAt',rows->19->'createdAt','requestId',rows->19->'requestId') else null end);
end $$;
revoke all on function kinnso_share_api.list_receipts(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function kinnso_share_api.list_receipts(uuid,timestamptz,uuid) to authenticated;

-- Public Data API surface is invoker-only; elevated code stays in the non-exposed schema.
create function public.create_trip_share_v2(p_request_id uuid,p_trip_id uuid,p_stop_ids uuid[],p_media_ids uuid[],p_expires_at timestamptz,p_token_hash text,p_envelope jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select kinnso_share_api.create_receipt(p_request_id,p_trip_id,p_stop_ids,p_media_ids,p_expires_at,p_token_hash,p_envelope);
$$;
create function public.get_trip_share_receipt(p_trip_id uuid,p_request_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select kinnso_share_api.get_receipt(p_trip_id,p_request_id);$$;
create function public.list_trip_share_receipts(p_trip_id uuid,p_before timestamptz default null,p_before_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$select kinnso_share_api.list_receipts(p_trip_id,p_before,p_before_request);$$;
revoke all on function public.create_trip_share_v2(uuid,uuid,uuid[],uuid[],timestamptz,text,jsonb),public.get_trip_share_receipt(uuid,uuid),public.list_trip_share_receipts(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_trip_share_v2(uuid,uuid,uuid[],uuid[],timestamptz,text,jsonb),public.get_trip_share_receipt(uuid,uuid),public.list_trip_share_receipts(uuid,timestamptz,uuid) to authenticated;

-- Retain legacy one-time tokens, now sharing the actor quota lock with the v2 writer.
create or replace function public.create_trip_share(p_trip_id uuid,p_stop_ids uuid[],p_media_ids uuid[],p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; token text; projection jsonb; id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kinnso:trip-share:'||actor::text,0));
 select * into t from public.trips where public.trips.id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days'
 or p_stop_ids is null or p_media_ids is null or cardinality(p_stop_ids)>200 or cardinality(p_media_ids)>20
 or (select count(*) from public.trip_stops s where s.trip_id=t.id and s.id=any(p_stop_ids))<>cardinality(p_stop_ids)
 or (select count(*) from public.kinnso_trip_media m where m.trip_id=t.id and m.owner_id=actor and m.state='ready' and m.attached and m.id=any(p_media_ids))<>cardinality(p_media_ids)
 then raise exception 'invalid_share'; end if;
 if (select count(*) from kinnso_internal.trip_shares where owner_id=actor and revoked_at is null and expires_at>now())>=10
 or (select count(*) from kinnso_internal.trip_shares where owner_id=actor and created_at>now()-interval '1 day')>=100
 then raise exception 'invalid_share_quota'; end if;
 projection:=jsonb_build_object('title',t.title,'approvedMediaIds',to_jsonb(p_media_ids),'days',coalesce((
 select jsonb_agg(jsonb_build_object('id',d.id,'offset',d.day_offset,'title',coalesce(d.title,''),'stops',(
  select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'placeId',s.place_id,'position',s.position,
  'startMinuteOfDay',s.start_minute_of_day,'durationMinutes',s.duration_minutes,'description','',
  'source',case when s.origin='adopted' then jsonb_build_object('guideId',s.source_guide_id,'guideVersion',s.source_guide_version,
  'creatorId',s.source_creator_id,'creatorName',coalesce(s.source_creator_name,'Creator'),'canonicalUrl',null,'withdrawn',s.source_withdrawn_at is not null) else null end)
  order by s.position) from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))) order by d.day_offset)
 from public.trip_days d where d.trip_id=t.id and exists(select 1 from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))),'[]'::jsonb));
 token:=encode(extensions.gen_random_bytes(32),'hex');id:=gen_random_uuid();
 insert into kinnso_internal.trip_shares(id,owner_id,trip_id,token_hash,projection,media_ids,expires_at)
 values(id,actor,t.id,kinnso_internal.request_digest(token),projection,p_media_ids,p_expires_at);
 -- Raw token is returned once and never stored in a request ledger.
 return jsonb_build_object('id',id,'token',token,'projection',projection,'expiresAt',p_expires_at);
end $$;
