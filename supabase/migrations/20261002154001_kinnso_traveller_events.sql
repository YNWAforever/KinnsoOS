-- First-party measurement contains no titles, notes, source payloads, URLs or tokens.
create table kinnso_internal.traveller_events (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id) on delete cascade,
 event_name text not null check(event_name in('trip_created','trip_imported','return_visit')),
 related_trip_id uuid references public.trips(id) on delete set null,
 event_key text not null check(length(event_key) between 1 and 50),
 app_mode text not null default 'connected' check(app_mode='connected'),
 actor_context text not null check(actor_context in('traveller','ops')),
 created_at timestamptz not null default now(),unique(actor_id,event_name,event_key)
);
alter table kinnso_internal.traveller_events enable row level security;
revoke all on kinnso_internal.traveller_events from public,anon,authenticated;
create function kinnso_internal.record_traveller_event(p_actor uuid,p_name text,p_trip uuid,p_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into kinnso_internal.traveller_events(actor_id,event_name,related_trip_id,event_key,actor_context)
 values(p_actor,p_name,p_trip,p_key,case when exists(select 1 from public.kinnso_ops_members where user_id=p_actor and status='active') then 'ops' else 'traveller' end)
 on conflict(actor_id,event_name,event_key) do nothing;
end $$;
revoke all on function kinnso_internal.record_traveller_event(uuid,text,uuid,text) from public,anon,authenticated;
create function public.record_kinnso_return_visit() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 perform kinnso_internal.record_traveller_event(actor,'return_visit',null,to_char(now() at time zone 'UTC','YYYY-MM-DD'));
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.record_kinnso_return_visit() from public,anon,authenticated;
grant execute on function public.record_kinnso_return_visit() to authenticated;

create or replace function public.create_trip_v2(p_request_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kinnso_internal.actor(); v_id uuid; v_digest text;
  v_prior kinnso_internal.trip_requests; v_result jsonb;
begin
  if p_request_id is null then raise exception 'invalid_command'; end if;
  perform kinnso_internal.keys(p_payload,array['title','timezone','startDate','destinationId']);
  if jsonb_typeof(p_payload->'title') is distinct from 'string' or
    (p_payload ? 'timezone' and jsonb_typeof(p_payload->'timezone') <> 'string') or
    (p_payload->>'startDate' is not null and (p_payload->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$')
    then raise exception 'invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0));
  v_digest := kinnso_internal.request_digest(jsonb_build_object('type','create','payload',p_payload)::text);
  select * into v_prior from kinnso_internal.trip_requests where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_prior.digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    if not exists (select 1 from public.trips where id=v_prior.trip_id and owner_user_id=v_actor)
      then raise exception 'trip_not_found'; end if;
    return v_prior.result;
  end if;
  v_id := public.create_trip(p_payload->>'title',coalesce(p_payload->>'timezone','UTC'),
    (p_payload->>'startDate')::date,(p_payload->>'destinationId')::uuid);
  v_result := kinnso_internal.snapshot(v_id);
  insert into kinnso_internal.trip_requests values(v_actor,p_request_id,v_id,v_digest,v_result,now());
  perform kinnso_internal.record_traveller_event(v_actor,'trip_created',v_id,v_id::text);
  return v_result;
end $$;

create or replace function public.import_local_trip(p_request_id uuid,p_source_id text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); previous kinnso_internal.imports;
 digest text; id uuid; d jsonb; s jsonb; photo jsonb; day_id uuid; offsets integer[]:='{}'; off integer; pos integer; count integer:=0; result jsonb;
 prior_request kinnso_internal.trip_requests;
begin
 if p_request_id is null or p_source_id is null or p_source_id!~'^[A-Za-z0-9:_-]{1,160}$'
 or p_payload is null or octet_length(p_payload::text)>262144 then raise exception 'invalid_import'; end if;
 perform kinnso_internal.keys(p_payload,array['title','timezone','startDate','days','pendingPhotos']);
 if jsonb_typeof(p_payload->'title') is distinct from 'string' or jsonb_typeof(p_payload->'timezone') is distinct from 'string'
 or jsonb_typeof(p_payload->'days') is distinct from 'array' or jsonb_array_length(p_payload->'days') not between 1 and 30
 or jsonb_typeof(p_payload->'pendingPhotos') is distinct from 'array' or jsonb_array_length(p_payload->'pendingPhotos')>20
 then raise exception 'invalid_import'; end if;
 digest:=kinnso_internal.request_digest(p_payload::text);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_source_id,0));
 select * into prior_request from kinnso_internal.trip_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior_request.digest<>kinnso_internal.request_digest(jsonb_build_object('import',p_source_id,'payload',p_payload)::text)
   then raise exception 'idempotency_conflict'; end if;
  if not exists(select 1 from public.trips where public.trips.id=prior_request.trip_id and owner_user_id=actor) then raise exception 'trip_not_found'; end if;
  return prior_request.result;
 end if;
 select * into previous from kinnso_internal.imports where actor_id=actor and source_id=p_source_id;
 if found then
  if previous.digest<>digest then raise exception 'idempotency_conflict'; end if;
  perform 1 from public.trips where public.trips.id=previous.trip_id and owner_user_id=actor for update;
  if not found then raise exception 'trip_not_found'; end if;
  return kinnso_internal.snapshot(previous.trip_id)||jsonb_build_object('pendingPhotos',previous.pending_photos);
 end if;
 for photo in select value from jsonb_array_elements(p_payload->'pendingPhotos') loop
  perform kinnso_internal.keys(photo,array['name','mime','size']);
  if jsonb_typeof(photo->'name') is distinct from 'string' or length(photo->>'name') not between 1 and 255
  then raise exception 'invalid_import'; end if;
  -- Unknown legacy metadata is explicitly pending, never fabricated as uploaded.
  if photo->'mime' = 'null'::jsonb and photo->'size' = 'null'::jsonb then
    null;
  elsif jsonb_typeof(photo->'mime') is distinct from 'string'
     or photo->>'mime' not in ('image/jpeg','image/png','image/webp')
     or jsonb_typeof(photo->'size') is distinct from 'number'
     or (photo->>'size')!~'^[0-9]+$' then raise exception 'invalid_import';
  elsif (photo->>'size')::bigint not between 1 and 10485760 then raise exception 'invalid_import';
  end if;
 end loop;
 id:=public.create_trip(p_payload->>'title',p_payload->>'timezone',(p_payload->>'startDate')::date,null);
 for d in select value from jsonb_array_elements(p_payload->'days') loop
  perform kinnso_internal.keys(d,array['offset','title','stops']);
  if jsonb_typeof(d->'offset') is distinct from 'number' or (d->>'offset')!~'^[0-9]+$'
  or jsonb_typeof(d->'title') is distinct from 'string' or length(d->>'title')>200
  or jsonb_typeof(d->'stops') is distinct from 'array' or jsonb_array_length(d->'stops')>50 then raise exception 'invalid_import'; end if;
  off:=(d->>'offset')::integer; if off>364 or off=any(offsets) then raise exception 'invalid_import'; end if;
  offsets:=array_append(offsets,off);day_id:=gen_random_uuid();pos:=0;
  insert into public.trip_days(id,trip_id,day_offset,title) values(day_id,id,off,nullif(d->>'title',''));
  for s in select value from jsonb_array_elements(d->'stops') loop
   perform kinnso_internal.keys(s,array['title','travellerNote','startMinuteOfDay','durationMinutes']);
   perform kinnso_internal.stop_input(s);
   insert into public.trip_stops(trip_id,trip_day_id,position,title,traveller_note,start_minute_of_day,duration_minutes)
   values(id,day_id,pos,s->>'title',s->>'travellerNote',(s->>'startMinuteOfDay')::integer,(s->>'durationMinutes')::integer);
   count:=count+1;pos:=pos+1;if count>200 then raise exception 'invalid_import'; end if;
  end loop;
 end loop;
 -- create + all initial days/stops are one atomic initial revision, not later unlogged writes.
 insert into kinnso_internal.imports(actor_id,source_id,digest,trip_id,pending_photos) values(actor,p_source_id,digest,id,p_payload->'pendingPhotos');
 result:=kinnso_internal.snapshot(id)||jsonb_build_object('pendingPhotos',p_payload->'pendingPhotos');
 insert into kinnso_internal.trip_requests values(actor,p_request_id,id,kinnso_internal.request_digest(jsonb_build_object('import',p_source_id,'payload',p_payload)::text),result,now());
 perform kinnso_internal.record_traveller_event(actor,'trip_imported',id,id::text);
  return result;
end $$;
