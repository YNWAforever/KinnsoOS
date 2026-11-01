-- GENERATED SOURCE CANDIDATE ONLY. No SQL executed.
-- Generator: scripts/prepare-discovery-native-guards.py

-- Source: 20261017145002_kinnso_adoption_nonblocking_source_locks.sql; function sha256 34d3b48b10c9c145b0e570039fce6c46769119304b47b2c924dc2dc643097f00
create or replace function public.adopt_guide_to_trip(p_guide_id uuid,p_version integer,p_trip_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; g public.guides; v public.guide_versions;
 prior kinnso_internal.trip_requests; digest text; result jsonb; d jsonb; s jsonb; day_id uuid; base integer; n integer;
begin
 if p_request_id is null or p_expected_revision is null or p_expected_revision<1 or p_version is null or p_version<1 then raise exception 'invalid_command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into t from public.trips where id=p_trip_id and owner_user_id=actor;
 if not found then raise exception 'trip_not_found'; end if;
 digest:=kinnso_internal.request_digest(jsonb_build_object('adopt',p_guide_id,'version',p_version,'trip',t.id,'expected',p_expected_revision)::text);
 select * into prior from kinnso_internal.trip_requests where actor_id=actor and request_id=p_request_id;
 if found then
  select * into t from public.trips where id=p_trip_id and owner_user_id=actor for update;
  if not found then raise exception 'trip_not_found'; end if;
  if prior.digest<>digest then raise exception 'idempotency_conflict'; end if;
  return kinnso_internal.discovery_project_trip(prior.result);
 end if;
 if t.head_revision_no<>p_expected_revision then raise exception 'trip_revision_conflict'; end if;
 select * into g from public.guides where id=p_guide_id and status='published' for share nowait;
 if not found then raise exception 'source_unavailable'; end if;
 select * into v from public.guide_versions where guide_id=g.id and version=p_version and withdrawn_at is null for share nowait;
 if not found then raise exception 'source_unavailable'; end if;
 select * into t from public.trips where id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 if t.head_revision_no<>p_expected_revision then raise exception 'trip_revision_conflict'; end if;
 select coalesce(max(day_offset)+1,0) into base from public.trip_days where trip_id=t.id;
 for d in select value from jsonb_array_elements(v.content->'days') loop
  day_id:=gen_random_uuid();
  insert into public.trip_days(id,trip_id,day_offset,title,source_guide_id,source_guide_version,source_guide_day_id) values(day_id,t.id,base+(d->>'offset')::integer,nullif(d->>'title',''),g.id,v.version,(d->>'id')::uuid);
  n:=0;
  for s in select value from jsonb_array_elements(d->'stops') loop
   insert into public.trip_stops(trip_id,trip_day_id,position,title,place_id,start_minute_of_day,duration_minutes,origin,
   source_guide_id,source_guide_version,source_guide_slug,source_creator_id,source_creator_name,source_creator_handle,copied_title,copied_note,adopted_at,source_guide_stop_id)
   values(t.id,day_id,n,s->>'title',(s->>'placeId')::uuid,(s->>'startMinuteOfDay')::integer,(s->>'durationMinutes')::integer,'adopted',
   g.id,v.version,g.slug,g.creator_id,g.creator_name,g.creator_handle,s->>'title',s->>'description',now(),(s->>'id')::uuid);n:=n+1;
  end loop;
 end loop;
 update public.trips set head_revision_no=head_revision_no+1 where id=t.id;
 insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'adopt',jsonb_build_object('action','adopt'));
 result:=kinnso_internal.snapshot(t.id);
 insert into kinnso_internal.trip_requests values(actor,p_request_id,t.id,digest,result,now()); return result;
end $$;

-- Source: 20261002141801_kinnso_place_review_overrides.sql; function sha256 9d2ca6beecfab42fc8c8fb1a85961c8627cc56cfd95116ea828f097a6e11d73b
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
    return kinnso_internal.discovery_project_trip(v_prior.result);
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
  elsif v_type='overrideWarning' then
    perform kinnso_internal.keys(p_command,array['type','id','code','reason']);
    if not exists(select 1 from public.trip_stops where id=v_id and trip_id=p_trip_id) then raise exception 'trip_not_found'; end if;
    if jsonb_typeof(p_command->'code') is distinct from 'string' or jsonb_typeof(p_command->'reason') is distinct from 'string'
      or p_command->>'code' not in ('UNKNOWN_TRAVEL','UNVERIFIED_HOURS','PLACE_STALE','MISSING_TIME','OVERLAP','CROSS_DAY','DST_GAP','DST_FOLD','OUTSIDE_HOURS','TIMEZONE_MISMATCH')
      or length(btrim(p_command->>'reason')) not between 10 and 2000 then raise exception 'invalid_override'; end if;
    insert into kinnso_internal.trip_overrides(trip_id,stop_id,code,reason) values(p_trip_id,v_id,p_command->>'code',btrim(p_command->>'reason'))
    on conflict(trip_id,stop_id,code) do update set reason=excluded.reason,updated_at=now();
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

-- Source: 20260821120400_r12_1_creator_visits_driven.sql; function sha256 d0d41c412c2f11c270044b8d0f963a1e84e0edf6e13e265c558a8036ce182377
create or replace function public.creator_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_window_start timestamptz := date_trunc('week', now()) - interval '11 weeks';
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'points_total',
      coalesce((select sum(points) from public.creator_contribution_events where creator_id = v_uid), 0),
    'points_before_window',
      coalesce((select sum(points) from public.creator_contribution_events
                where creator_id = v_uid and created_at < v_window_start), 0),
    'points_by_type', coalesce((
      select jsonb_object_agg(event_type, pts) from (
        select event_type, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid group by event_type) s
    ), '{}'::jsonb),
    'points_trajectory', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', wk, 'points', pts) order by wk) from (
        select date_trunc('week', created_at)::date as wk, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid and created_at >= v_window_start
        group by 1) t
    ), '[]'::jsonb),
    'guides_published',
      (select count(*) from (select * from public.guides where kinnso_internal.discovery_guide_visible(id)) where creator_id = v_uid and status = 'published'),
    'guide_saves_total',
      coalesce((select sum(saves_count) from (select * from public.guides where kinnso_internal.discovery_guide_visible(id))
                where creator_id = v_uid and status = 'published'), 0),
    'missions_by_status', coalesce((
      select jsonb_object_agg(status, c) from (
        select status, count(*) as c from public.mission_participants
        where creator_id = v_uid group by status) m
    ), '{}'::jsonb),
    'submissions_approved', (
      select count(*) from public.mission_milestone_submissions s
      join public.mission_participants mp on mp.id = s.mission_participant_id
      where mp.creator_id = v_uid and s.status = 'approved'),
    'visits_driven', coalesce((
      select count(*)
      from public.offer_redemptions orr
      join public.offer_claims oc on oc.id = orr.offer_claim_id
      where oc.creator_id = v_uid
    ), 0)
  );
end $$;

-- Source: 20260821120300_r12_1_merchant_visits_driven.sql; function sha256 48f8bdaab9b083b1e80e599fa76378cc2df9a998acab87128f7805f049482ddf
create or replace function public.merchant_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles
    where user_id = v_uid and status = 'active';
  if v_merchant is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'missions_published', (
      select count(*) from public.missions
      where merchant_profile_id = v_merchant and status = 'published'),
    'per_mission', coalesce((
      select jsonb_agg(m order by m->>'title') from (
        select jsonb_build_object(
          'mission_id', mi.id,
          'title', mi.title,
          'status', mi.status,
          'invited',  count(mp.id) filter (where mp.status = 'invited'),
          'applied',  count(mp.id) filter (where mp.status = 'applied'),
          'active',   count(mp.id) filter (where mp.status = 'active'),
          'rejected', count(mp.id) filter (where mp.status = 'rejected'),
          'approved_submissions', (
            select count(*) from public.mission_milestone_submissions s
            join public.mission_participants mp2 on mp2.id = s.mission_participant_id
            where mp2.mission_id = mi.id and s.status = 'approved')
        ) as m
        from public.missions mi
        left join public.mission_participants mp on mp.mission_id = mi.id
        where mi.merchant_profile_id = v_merchant
        group by mi.id, mi.title, mi.status
      ) rows
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'participants', count(mp.id),
        'invited',  count(mp.id) filter (where mp.source = 'merchant_invite'),
        'accepted', count(mp.id) filter (where mp.source = 'merchant_invite' and mp.status = 'active'),
        'approved_submissions', (
          select count(*) from public.mission_milestone_submissions s
          join public.mission_participants mp3 on mp3.id = s.mission_participant_id
          join public.missions mi3 on mi3.id = mp3.mission_id
          where mi3.merchant_profile_id = v_merchant and s.status = 'approved')
      )
      from public.mission_participants mp
      join public.missions mi2 on mi2.id = mp.mission_id
      where mi2.merchant_profile_id = v_merchant
    ),
    'visits_driven', coalesce((
      with redemption_counts as (
        -- redemptions: offer commission channel. A redemption only counts once its
        -- offer_redemptions row is scoped to THIS merchant -- merchant_profile_id is
        -- independently stored on offer_redemptions (set at redemption time), so this
        -- does not need a join through merchant_offers to be correctly scoped (see the
        -- removed mo join, above).
        select oc.creator_id, oc.guide_id, count(distinct orr.id) as redemptions
        from public.offer_claims oc
        join public.offer_redemptions orr
          on orr.offer_claim_id = oc.id and orr.merchant_profile_id = v_merchant
        group by oc.creator_id, oc.guide_id
      ),
      booking_counts as (
        -- attributed_bookings: booking commission channel, independent of offer_claims.
        -- Uses bookings.creator_id/guide_id directly -- the same signal
        -- create_booking_settlement_on_confirm() uses to trigger a creator commission --
        -- scoped to this merchant via experiences.merchant_profile_id.
        select b.creator_id, b.guide_id, count(distinct b.id) as attributed_bookings
        from public.bookings b
        join public.experiences e
          on e.id = b.experience_id and e.merchant_profile_id = v_merchant
        where b.status in ('confirmed', 'completed')
          and b.creator_id is not null
        group by b.creator_id, b.guide_id
      ),
      combined as (
        -- FULL OUTER JOIN, not a plain join: a creator/guide pairing may appear in only
        -- one of the two channels, and each channel's count must survive even when the
        -- other channel has zero rows for that pairing. Matching on (creator_id,
        -- guide_id) keeps the two counts as independent scalars per pairing -- no
        -- fan-out, no cross-multiplication between redemptions and attributed_bookings.
        -- guide_id is matched with IS NOT DISTINCT FROM so two NULL-guide pairings for
        -- the same creator (e.g. a profile-surface claim and a guide-less booking) merge
        -- into one combined row instead of splitting spuriously on NULL <> NULL.
        select
          coalesce(rc.creator_id, bc.creator_id) as creator_id,
          coalesce(rc.guide_id, bc.guide_id) as guide_id,
          coalesce(rc.redemptions, 0) as redemptions,
          coalesce(bc.attributed_bookings, 0) as attributed_bookings
        from redemption_counts rc
        full outer join booking_counts bc
          on bc.creator_id = rc.creator_id and bc.guide_id is not distinct from rc.guide_id
      )
      select jsonb_agg(jsonb_build_object(
        'creator_id', c.id, 'creator_name', c.display_name,
        'guide_id', g.id, 'guide_title', g.title,
        'redemptions', top50.redemptions, 'attributed_bookings', top50.attributed_bookings
      ) order by (top50.redemptions + top50.attributed_bookings) desc)
      from (
        select * from combined
        order by (redemptions + attributed_bookings) desc
        limit 50
      ) top50
      join public.creators c on c.id = top50.creator_id
      left join (select * from public.guides where kinnso_internal.discovery_guide_visible(id)) g on g.id = top50.guide_id
    ), '[]'::jsonb)
  );
end $$;

-- Source: 20260717124836_r7_3_production_honesty.sql; function sha256 b9a552cc05618c95fa37e9ee08d8ccf1d2d5f86f16da8c648522462e9902ba46
create or replace function public.admin_creator_detail(p_creator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_exists boolean;
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.creators where id = p_creator_id;
  if v_exists is null then
    return null;
  end if;

  return jsonb_build_object(
    'creator', (
      select jsonb_build_object(
        'id', c.id, 'display_name', c.display_name, 'handle', c.handle,
        'status', c.status, 'verified', c.verified, 'bio', c.bio,
        'is_listed', c.is_listed,
        'created_at', c.created_at, 'updated_at', c.updated_at)
      from public.creators c where c.id = p_creator_id
    ),
    'contribution', (
      select jsonb_build_object(
        'points', cc.contribution_points, 'tier', cc.tier, 'tier_updated_at', cc.tier_updated_at)
      from public.creator_contribution cc where cc.creator_id = p_creator_id
    ),
    'dna', (
      select jsonb_build_object(
        'id', d.id, 'status', d.status, 'model', d.model,
        'draft_ready_at', d.draft_ready_at, 'updated_at', d.updated_at)
      from public.creator_dna d where d.creator_id = p_creator_id
      order by d.updated_at desc limit 1
    ),
    'scan', (
      select jsonb_build_object(
        'id', j.id, 'status', j.status, 'error', j.error,
        'started_at', j.started_at, 'completed_at', j.completed_at, 'created_at', j.created_at)
      from public.creator_scan_jobs j where j.creator_id = p_creator_id
      order by j.created_at desc limit 1
    ),
    'socials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', s.platform, 'handle', s.handle, 'url', s.url) order by s.platform)
      from public.creator_social_handles s where s.creator_id = p_creator_id
    ), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', mp.id, 'mission_id', mp.mission_id, 'title', m.title,
        'status', mp.status, 'source', mp.source,
        'approved_at', mp.approved_at, 'created_at', mp.created_at,
        'submissions_total', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id),
        'submissions_approved', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id and s.status = 'approved'),
        'submissions_pending', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id
            and s.status in ('pending', 'submitted', 'revision_requested')))
        order by mp.created_at desc)
      from public.mission_participants mp
      join public.missions m on m.id = mp.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'mission_title', m.title, 'status', st.status,
        'creator_payout_status', st.creator_payout_status,
        'creator_commission_amount', st.creator_commission_amount,
        'amount_currency', st.amount_currency, 'created_at', st.created_at)
        order by st.created_at desc)
      from public.mission_settlements st
      join public.mission_participants mp on mp.id = st.mission_participant_id
      join public.missions m on m.id = st.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'points_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'points', e.points, 'created_at', e.created_at)
        order by e.created_at desc)
      from (
        select id, event_type, points, created_at
        from public.creator_contribution_events
        where creator_id = p_creator_id
        order by created_at desc limit 50
      ) e
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'slug', g.slug, 'status', g.status,
        'saves_count', g.saves_count, 'published_at', g.published_at, 'created_at', g.created_at)
        order by g.created_at desc)
      from (select * from public.guides where kinnso_internal.discovery_guide_visible(id)) g where g.creator_id = p_creator_id
    ), '[]'::jsonb)
  );
end $function$;

-- Source: 20260726090000_r7_7_profile_enquiries.sql; function sha256 0f0823aff25efba3348b790e849012d44b79c06accf83d87913da6ec4559b5e6
create or replace function public.get_attributed_guides_for_merchant(
  p_merchant_id uuid, p_limit integer default 9
) returns table (
  slug text, title text, cover_url text, city text, saves_count integer, creator_handle text
)
language sql stable security definer set search_path = public as $$
  select attributed.slug, attributed.title, attributed.cover_url, attributed.city, attributed.saves_count, attributed.creator_handle
  from (
    select distinct on (g.id)
      g.id, g.slug, g.title, g.cover_url, g.city, g.saves_count, g.creator_handle, g.published_at
    from public.bookings b
    join public.experiences e on e.id = b.experience_id
    join public.merchant_profiles m on m.id = e.merchant_profile_id
    join (select * from public.guides where kinnso_internal.discovery_guide_visible(id)) g on g.id = b.guide_id
    where m.id = p_merchant_id
      and m.status = 'active'
      and m.slug is not null
      and b.status in ('confirmed','completed')
      and g.status = 'published'
    order by g.id, g.published_at desc nulls last, g.created_at desc
  ) attributed
  order by attributed.published_at desc nulls last, attributed.id desc
  limit least(greatest(coalesce(p_limit, 9), 1), 20);
$$;

-- Source: 20261002133152_kinnso_content_facts_and_authoring.sql; function sha256 965c52cb2cce036e6c18c53b30d334a288c762cdb9c59d483bdbfd89145098ea
create or replace function public.kinnso_guide_authoring(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); result jsonb;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required'; end if;
 if not exists(select 1 from (select * from public.guides where kinnso_internal.discovery_guide_visible(id)) where id=p_guide_id and creator_id=actor) then raise exception 'guide_not_found'; end if;
 select jsonb_build_object('version',version,'content',content) into result from public.guide_versions where guide_id=p_guide_id order by version desc limit 1;
 return coalesce(result,jsonb_build_object('version',0,'content',null));
end $$;
