-- Fresh authority is looked up for every caller. Client metadata does not grant roles.
create function public.kinnso_actor() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kinnso_internal.actor(); v_roles text[] := array['traveller'];
begin
  if exists(select 1 from public.creators where id=v_actor and status='active') then
    v_roles := array_append(v_roles,'creator'); end if;
  if exists(select 1 from public.kinnso_ops_members where user_id=v_actor and status='active') then
    v_roles := array_append(v_roles,'ops'); end if;
  if exists(select 1 from public.merchant_profiles where user_id=v_actor) then
    v_roles := array_append(v_roles,'merchant'); end if;
  return jsonb_build_object('id',v_actor,'roles',v_roles,'merchantMemberships',coalesce((
    select jsonb_agg(id order by id) from public.merchant_profiles where user_id=v_actor
  ),'[]'::jsonb));
end $$;
revoke execute on function public.kinnso_actor() from public,anon;
grant execute on function public.kinnso_actor() to authenticated;

create function kinnso_internal.request_digest(p_value text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex');
$$;
revoke execute on function kinnso_internal.request_digest(text) from public,anon,authenticated;
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
  return v_result;
end $$;
create or replace function public.apply_trip_command(p_trip_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kinnso_internal.actor(); v_trip public.trips; v_prior kinnso_internal.trip_requests;
  v_digest text; v_before jsonb; v_result jsonb; v_type text; v_patch jsonb;
  v_id uuid; v_day uuid; v_position integer; v_old_day uuid; v_old_position integer; v_count integer;
begin
  if p_request_id is null or p_expected_revision is null or p_expected_revision < 1 or
    p_command is null or octet_length(p_command::text)>1048576 then raise exception 'invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0));
  select * into v_trip from public.trips where id=p_trip_id and owner_user_id=v_actor for update;
  if not found then raise exception 'trip_not_found'; end if;
  v_digest := kinnso_internal.request_digest(jsonb_build_object('type','apply','tripId',p_trip_id,'revision',p_expected_revision,'command',p_command)::text);
  select * into v_prior from kinnso_internal.trip_requests where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_prior.digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    return v_prior.result;
  end if;
  if v_trip.head_revision_no <> p_expected_revision then raise exception 'trip_revision_conflict'; end if;
  v_before := kinnso_internal.snapshot(p_trip_id);
  v_type := p_command->>'type';
  v_id := (p_command->>'id')::uuid;
  if v_type='patchTrip' then
    perform kinnso_internal.keys(p_command,array['type','patch']);
    v_patch := p_command->'patch';
    perform kinnso_internal.keys(v_patch,array['title','destinationId','timezone','startDate','status']);
    if (v_patch ? 'title' and jsonb_typeof(v_patch->'title') <> 'string') or
       (v_patch ? 'timezone' and jsonb_typeof(v_patch->'timezone') <> 'string') or
       (v_patch ? 'status' and jsonb_typeof(v_patch->'status') <> 'string') or
       (v_patch->>'startDate' is not null and (v_patch->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$')
       then raise exception 'invalid_command'; end if;
    update public.trips set title=case when v_patch ? 'title' then v_patch->>'title' else title end,
      destination_id=case when v_patch ? 'destinationId' then (v_patch->>'destinationId')::uuid else destination_id end,
      timezone=case when v_patch ? 'timezone' then v_patch->>'timezone' else timezone end,
      start_date=case when v_patch ? 'startDate' then (v_patch->>'startDate')::date else start_date end,
      status=case when v_patch ? 'status' then v_patch->>'status' else status end where id=p_trip_id;
  elsif v_type='addDay' then
    perform kinnso_internal.keys(p_command,array['type','id','offset','title']);
    if jsonb_typeof(p_command->'offset') is distinct from 'number' or
       jsonb_typeof(p_command->'title') is distinct from 'string' then raise exception 'invalid_command'; end if;
    insert into public.trip_days(id,trip_id,day_offset,title)
      values(v_id,p_trip_id,(p_command->>'offset')::integer,p_command->>'title');
  elsif v_type='updateDay' then
    perform kinnso_internal.keys(p_command,array['type','id','patch']);
    v_patch := p_command->'patch'; perform kinnso_internal.keys(v_patch,array['offset','title']);
    if (v_patch ? 'offset' and jsonb_typeof(v_patch->'offset') <> 'number') or
       (v_patch ? 'title' and jsonb_typeof(v_patch->'title') <> 'string') then raise exception 'invalid_command'; end if;
    update public.trip_days set day_offset=case when v_patch ? 'offset' then (v_patch->>'offset')::integer else day_offset end,
      title=case when v_patch ? 'title' then v_patch->>'title' else title end where id=v_id and trip_id=p_trip_id;
    if not found then raise exception 'trip_not_found'; end if;
  elsif v_type='removeDay' then
    perform kinnso_internal.keys(p_command,array['type','id']);
    delete from public.trip_days where id=v_id and trip_id=p_trip_id;
    if not found then raise exception 'trip_not_found'; end if;
  elsif v_type='addStop' then
    perform kinnso_internal.keys(p_command,array['type','id','dayId','position','input']);
    v_day := (p_command->>'dayId')::uuid; v_position := (p_command->>'position')::integer;
    if not exists(select 1 from public.trip_days where id=v_day and trip_id=p_trip_id)
      then raise exception 'trip_not_found'; end if;
    select count(*) into v_count from public.trip_stops where trip_day_id=v_day;
    if jsonb_typeof(p_command->'position') is distinct from 'number' or v_position<0 or v_position>v_count
      then raise exception 'invalid_command'; end if;
    v_patch := p_command->'input'; perform kinnso_internal.stop_input(v_patch);
    if jsonb_typeof(v_patch->'title') is distinct from 'string' then raise exception 'invalid_command'; end if;
    update public.trip_stops set position=position+1 where trip_day_id=v_day and position>=v_position;
    insert into public.trip_stops(id,trip_id,trip_day_id,position,place_id,title,traveller_note,start_minute_of_day,duration_minutes)
    values(v_id,p_trip_id,v_day,v_position,(v_patch->>'placeId')::uuid,v_patch->>'title',
      coalesce(v_patch->>'travellerNote',''),(v_patch->>'startMinuteOfDay')::integer,(v_patch->>'durationMinutes')::integer);
  elsif v_type='updateStop' then
    perform kinnso_internal.keys(p_command,array['type','id','patch']);
    v_patch := p_command->'patch'; perform kinnso_internal.stop_input(v_patch);
    update public.trip_stops set title=case when v_patch ? 'title' then v_patch->>'title' else title end,
      place_id=case when v_patch ? 'placeId' then (v_patch->>'placeId')::uuid else place_id end,
      traveller_note=case when v_patch ? 'travellerNote' then v_patch->>'travellerNote' else traveller_note end,
      start_minute_of_day=case when v_patch ? 'startMinuteOfDay' then (v_patch->>'startMinuteOfDay')::integer else start_minute_of_day end,
      duration_minutes=case when v_patch ? 'durationMinutes' then (v_patch->>'durationMinutes')::integer else duration_minutes end
      where id=v_id and trip_id=p_trip_id;
    if not found then raise exception 'trip_not_found'; end if;
  elsif v_type in ('moveStop','removeStop') then
    perform kinnso_internal.keys(p_command,case when v_type='moveStop' then array['type','id','dayId','position'] else array['type','id'] end);
    select trip_day_id,position into v_old_day,v_old_position from public.trip_stops where id=v_id and trip_id=p_trip_id;
    if not found then raise exception 'trip_not_found'; end if;
    if v_type='removeStop' then
      delete from public.trip_stops where id=v_id;
      update public.trip_stops set position=position-1 where trip_day_id=v_old_day and position>v_old_position;
    else
      v_day := (p_command->>'dayId')::uuid; v_position := (p_command->>'position')::integer;
      if not exists(select 1 from public.trip_days where id=v_day and trip_id=p_trip_id) then raise exception 'trip_not_found'; end if;
      select count(*) into v_count from public.trip_stops where trip_day_id=v_day and id<>v_id;
      if jsonb_typeof(p_command->'position') is distinct from 'number' or v_position<0 or v_position>v_count then raise exception 'invalid_command'; end if;
      update public.trip_stops set position=position-1 where trip_day_id=v_old_day and position>v_old_position and id<>v_id;
      update public.trip_stops set position=position+1 where trip_day_id=v_day and position>=v_position and id<>v_id;
      update public.trip_stops set trip_day_id=v_day,position=v_position where id=v_id;
    end if;
  elsif v_type in ('attachMedia','detachMedia') then
    perform kinnso_internal.keys(p_command,case when v_type='attachMedia' then array['type','mediaId','stopId'] else array['type','mediaId'] end);
    if v_type='attachMedia' and p_command->>'stopId' is not null and
      not exists(select 1 from public.trip_stops where id=(p_command->>'stopId')::uuid and trip_id=p_trip_id)
      then raise exception 'trip_not_found'; end if;
    update public.kinnso_trip_media set attached=(v_type='attachMedia'),stop_id=(p_command->>'stopId')::uuid
      where id=(p_command->>'mediaId')::uuid and trip_id=p_trip_id and owner_id=v_actor and state='ready';
    if not found then raise exception 'trip_not_found'; end if;
  else raise exception 'invalid_command'; end if;
  v_result := kinnso_internal.snapshot(p_trip_id);
  if v_result is distinct from v_before then
    update public.trips set head_revision_no=head_revision_no+1 where id=p_trip_id;
    insert into public.trip_revisions(trip_id,revision_no,parent_revision_no,author_user_id,change_kind,summary)
      values(p_trip_id,p_expected_revision+1,p_expected_revision,v_actor,'edit',jsonb_build_object('command',v_type));
    v_result := kinnso_internal.snapshot(p_trip_id);
  end if;
  insert into kinnso_internal.trip_requests values(v_actor,p_request_id,p_trip_id,v_digest,v_result,now());
  return v_result;
end $$;
create or replace function public.delete_trip_v2(p_trip_id uuid,p_expected_revision integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := kinnso_internal.actor(); v_trip public.trips; v_prior kinnso_internal.trip_requests;
  v_digest text; v_result jsonb;
begin
  if p_request_id is null or p_expected_revision is null then raise exception 'invalid_command'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0));
  select * into v_trip from public.trips where id=p_trip_id and owner_user_id=v_actor for update;
  v_digest := kinnso_internal.request_digest(jsonb_build_object('type','delete','tripId',p_trip_id,'revision',p_expected_revision)::text);
  select * into v_prior from kinnso_internal.trip_requests where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_prior.digest<>v_digest then raise exception 'idempotency_conflict'; end if;
    if exists(select 1 from public.trips where id=p_trip_id and owner_user_id<>v_actor) then raise exception 'trip_not_found'; end if;
    return v_prior.result;
  end if;
  if v_trip.id is null then raise exception 'trip_not_found'; end if;
  if v_trip.head_revision_no<>p_expected_revision then raise exception 'trip_revision_conflict'; end if;
  perform public.delete_trip(p_trip_id,p_expected_revision);
  v_result := jsonb_build_object('id',p_trip_id,'deleted',true);
  insert into kinnso_internal.trip_requests values(v_actor,p_request_id,p_trip_id,v_digest,v_result,now());
  return v_result;
end $$;
