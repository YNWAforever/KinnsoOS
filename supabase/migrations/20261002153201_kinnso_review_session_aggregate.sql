-- Reviewed session and aggregate fixes. No historical migration is rewritten.
create function public.kinnso_session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from auth.users u where u.id=auth.uid())
 and exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.kinnso_session_valid() from public,anon,authenticated;
grant execute on function public.kinnso_session_valid() to authenticated;
create or replace function kinnso_internal.actor() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.kinnso_session_valid() then raise exception 'unauthenticated'; end if;
 return auth.uid();
end $$;

CREATE OR REPLACE FUNCTION public.create_trip(p_title text, p_timezone text DEFAULT 'UTC'::text, p_start_date date DEFAULT NULL::date, p_destination_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := kinnso_internal.actor();
  v_trip_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated';
  end if;

  -- The timezone BEFORE trigger validates p_timezone on this insert, so a bad
  -- zone fails here rather than at read time on a page.
  insert into public.trips (owner_user_id, title, timezone, start_date, destination_id, head_revision_no)
  values (v_actor, p_title, coalesce(p_timezone, 'UTC'), p_start_date, p_destination_id, 1)
  returning id into v_trip_id;

  insert into public.trip_revisions (trip_id, revision_no, parent_revision_no, author_user_id, change_kind, summary)
  values (
    v_trip_id, 1, null, v_actor, 'create',
    jsonb_build_object('title', p_title, 'dated', p_start_date is not null)
  );

  return v_trip_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_trip(p_trip_id uuid, p_expected_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := kinnso_internal.actor();
  v_owner uuid;
  v_head integer;
begin
  if v_actor is null then
    raise exception 'unauthenticated';
  end if;

  select owner_user_id, head_revision_no into v_owner, v_head
  from public.trips where id = p_trip_id for update;

  if v_owner is null or v_owner <> v_actor then
    raise exception 'trip_not_found';
  end if;

  if v_head is distinct from p_expected_revision then
    raise exception 'trip_revision_conflict'
      using detail = format('head=%s expected=%s', v_head, p_expected_revision);
  end if;

  -- trip_revisions.trip_id is ON DELETE CASCADE, so the log goes with the trip.
  -- That is correct here: this is the traveller's own private content, and
  -- keeping an orphaned change log of deleted private data would be a
  -- retention problem, not an audit feature.
  delete from public.trips where id = p_trip_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_trip(p_trip_id uuid, p_expected_revision integer, p_title text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_clear_start_date boolean DEFAULT false, p_status text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := kinnso_internal.actor();
  v_owner uuid;
  v_head integer;
  v_old_start date;
  v_new_start date;
  v_next integer;
  v_kind text;
begin
  if v_actor is null then
    raise exception 'unauthenticated';
  end if;

  if p_start_date is not null and p_clear_start_date then
    raise exception 'start_date_ambiguous';
  end if;

  select owner_user_id, head_revision_no, start_date
    into v_owner, v_head, v_old_start
  from public.trips
  where id = p_trip_id
  for update;

  -- One error for "no such trip" and "not yours" on purpose: distinguishing
  -- them would let a caller probe which trip ids exist.
  if v_owner is null or v_owner <> v_actor then
    raise exception 'trip_not_found';
  end if;

  if v_head is distinct from p_expected_revision then
    raise exception 'trip_revision_conflict'
      using detail = format('head=%s expected=%s', v_head, p_expected_revision);
  end if;

  v_new_start := case when p_clear_start_date then null
                      when p_start_date is not null then p_start_date
                      else v_old_start end;
  v_next := v_head + 1;

  -- A date change is reported as its own kind: it re-resolves every stop's
  -- wall-clock time, which is a different kind of event from a rename.
  v_kind := case when v_new_start is distinct from v_old_start then 'set_dates' else 'edit' end;

  update public.trips
  set title = coalesce(p_title, title),
      timezone = coalesce(p_timezone, timezone),
      start_date = v_new_start,
      status = coalesce(p_status, status),
      head_revision_no = v_next
  where id = p_trip_id;

  insert into public.trip_revisions (trip_id, revision_no, parent_revision_no, author_user_id, change_kind, summary)
  values (
    p_trip_id, v_next, v_head, v_actor, v_kind,
    jsonb_strip_nulls(jsonb_build_object(
      'title', p_title,
      'timezone', p_timezone,
      'status', p_status,
      'start_date', v_new_start
    ))
  );

  return v_next;
end;
$function$;


create or replace function kinnso_internal.snapshot(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',t.id,'title',t.title,'destinationId',t.destination_id,
    'timezone',t.timezone,'startDate',t.start_date,'status',t.status,'revision',t.head_revision_no,
    'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'offset',d.day_offset,
      'title',coalesce(d.title,''),'stops',coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'placeId',s.place_id,'title',s.title,'position',s.position,
        'sourceDescription',case when s.origin='adopted' then coalesce(s.copied_note,'') else '' end,
        'travellerNote',coalesce(s.traveller_note,''),'startMinuteOfDay',s.start_minute_of_day,
        'durationMinutes',s.duration_minutes,'source',case when s.origin = 'adopted' then
          jsonb_build_object('guideId',s.source_guide_id,'guideVersion',s.source_guide_version,'creatorId',s.source_creator_id,
            'creatorName',coalesce(s.source_creator_name,'Creator'),'canonicalUrl',null,
            'withdrawn',s.source_withdrawn_at is not null) else null end
      ) order by s.position) from public.trip_stops s where s.trip_day_id = d.id),'[]'::jsonb))
      order by d.day_offset) from public.trip_days d where d.trip_id = t.id),'[]'::jsonb),
    'overrides',coalesce((select jsonb_agg(jsonb_build_object('stopId',o.stop_id,'code',o.code,'reason',o.reason) order by o.stop_id,o.code) from kinnso_internal.trip_overrides o where o.trip_id=t.id),'[]'::jsonb),
    'pendingPhotos',coalesce((select i.pending_photos from kinnso_internal.imports i where i.trip_id=t.id and i.actor_id=t.owner_user_id),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'ownerId',m.owner_id,
      'visibility','private','state',m.state,'stopId',m.stop_id) order by m.created_at,m.id)
      from public.kinnso_trip_media m where m.trip_id = t.id and m.attached),'[]'::jsonb))
  from public.trips t where t.id = p_id;
$$;
create or replace function public.adopt_guide_to_trip(p_guide_id uuid,p_version integer,p_trip_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; g public.guides; v public.guide_versions;
 prior kinnso_internal.trip_requests; digest text; result jsonb; d jsonb; s jsonb; day_id uuid; base integer; n integer;
begin
 if p_request_id is null or p_expected_revision is null or p_expected_revision<1 or p_version is null or p_version<1 then raise exception 'invalid_command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into t from public.trips where id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 digest:=kinnso_internal.request_digest(jsonb_build_object('adopt',p_guide_id,'version',p_version,'trip',t.id,'expected',p_expected_revision)::text);
 select * into prior from kinnso_internal.trip_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 if t.head_revision_no<>p_expected_revision then raise exception 'trip_revision_conflict'; end if;
 select * into g from public.guides where id=p_guide_id and status='published' for share;
 if not found then raise exception 'source_unavailable'; end if;
 select * into v from public.guide_versions where guide_id=g.id and version=p_version and withdrawn_at is null for share;
 if not found then raise exception 'source_unavailable'; end if;
 select coalesce(max(day_offset)+1,0) into base from public.trip_days where trip_id=t.id;
 for d in select value from jsonb_array_elements(v.content->'days') loop
  day_id:=gen_random_uuid();
  insert into public.trip_days(id,trip_id,day_offset,title) values(day_id,t.id,base+(d->>'offset')::integer,nullif(d->>'title',''));
  n:=0;
  for s in select value from jsonb_array_elements(d->'stops') loop
   insert into public.trip_stops(trip_id,trip_day_id,position,title,place_id,start_minute_of_day,duration_minutes,origin,
   source_guide_id,source_guide_version,source_guide_slug,source_creator_id,source_creator_name,source_creator_handle,copied_title,copied_note,adopted_at)
   values(t.id,day_id,n,s->>'title',(s->>'placeId')::uuid,(s->>'startMinuteOfDay')::integer,(s->>'durationMinutes')::integer,'adopted',
   g.id,v.version,g.slug,g.creator_id,g.creator_name,g.creator_handle,s->>'title',s->>'description',now());n:=n+1;
  end loop;
 end loop;
 update public.trips set head_revision_no=head_revision_no+1 where id=t.id;
 insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'adopt',jsonb_build_object('action','adopt'));
 result:=kinnso_internal.snapshot(t.id);
 insert into kinnso_internal.trip_requests values(actor,p_request_id,t.id,digest,result,now()); return result;
end $$;
create or replace function public.withdraw_guide_versions(p_guide_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required'; end if;
 perform 1 from public.guides where id=p_guide_id and creator_id=actor for update;
 if not found then raise exception 'guide_not_found'; end if;
 update public.guide_versions set withdrawn_at=coalesce(withdrawn_at,now()) where guide_id=p_guide_id;
 perform kinnso_internal.withdraw_source(p_guide_id); return jsonb_build_object('withdrawn',true);
end $$;

-- Restrictive policy complements existing ownership policies, including direct REST reads.
create policy kinnso_session_required on public.trips as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_session_required on public.trip_days as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_session_required on public.trip_stops as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_session_required on public.trip_revisions as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_session_required on public.kinnso_trip_media as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_session_required on public.guide_saves as restrictive for all to authenticated using((select public.kinnso_session_valid())) with check((select public.kinnso_session_valid()));
create policy kinnso_private_storage_session on storage.objects as restrictive for all to authenticated using(bucket_id<>'kinnso-trip-private' or (select public.kinnso_session_valid())) with check(bucket_id<>'kinnso-trip-private' or (select public.kinnso_session_valid()));
