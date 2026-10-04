create table kinnso_internal.imports (
 actor_id uuid not null references auth.users(id) on delete cascade,
 source_id text not null, digest text not null,
 trip_id uuid not null references public.trips(id) on delete cascade,
 pending_photos jsonb not null default '[]',
 created_at timestamptz not null default now(), primary key(actor_id,source_id)
);
alter table kinnso_internal.imports enable row level security;
revoke all on kinnso_internal.imports from public,anon,authenticated;
create function public.import_local_trip(p_request_id uuid,p_source_id text,p_payload jsonb) returns jsonb
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
  if not exists(select 1 from public.trips where id=prior_request.trip_id and owner_user_id=actor) then raise exception 'trip_not_found'; end if;
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
  or photo->>'mime' not in ('image/jpeg','image/png','image/webp') or (photo->>'size')!~'^[0-9]+$'
  or (photo->>'size')::bigint not between 1 and 10485760 then raise exception 'invalid_import'; end if;
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
 return result;
end $$;
revoke all on function public.import_local_trip(uuid,text,jsonb) from public,anon;
grant execute on function public.import_local_trip(uuid,text,jsonb) to authenticated;
