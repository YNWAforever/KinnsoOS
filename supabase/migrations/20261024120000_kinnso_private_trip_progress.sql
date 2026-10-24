-- Source only. Applying this migration requires separately authorized owned CI
-- or target validation; it does not change any release/readiness decision.
-- Progress is private traveller state, separate from itinerary revisions and
-- published guide versions. The RPCs alone may access these deny-by-default tables.
revoke all on schema kinnso_internal from public, anon, authenticated;

create table kinnso_internal.trip_progress_heads (
  trip_id uuid primary key,
  owner_id uuid not null,
  progress_revision integer not null check (progress_revision >= 0),
  foreign key (trip_id, owner_id) references public.trips (id, owner_user_id) on delete cascade
);

create table kinnso_internal.trip_stop_progress (
  trip_id uuid not null references kinnso_internal.trip_progress_heads (trip_id) on delete cascade,
  stop_id uuid not null references public.trip_stops (id) on delete cascade,
  state text not null check (state in ('pending', 'visited', 'skipped')),
  primary key (trip_id, stop_id)
);
create index trip_stop_progress_stop_idx on kinnso_internal.trip_stop_progress (stop_id);

-- Keep only the immutable command digest and its original applied revision.
-- Stop/trip deletion removes current state, but not the actor/request binding.
-- Match trip_requests: retain the historical trip ID until the actor is deleted.
create table kinnso_internal.trip_progress_requests (
  actor_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  trip_id uuid not null,
  digest text not null,
  applied_progress_revision integer not null check (applied_progress_revision >= 0),
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table kinnso_internal.trip_progress_heads enable row level security;
alter table kinnso_internal.trip_stop_progress enable row level security;
alter table kinnso_internal.trip_progress_requests enable row level security;
revoke all on kinnso_internal.trip_progress_heads, kinnso_internal.trip_stop_progress,
  kinnso_internal.trip_progress_requests from public, anon, authenticated, service_role;

-- Internal projection, invoked only by the owner-checked RPCs while the trip is
-- locked. Sparse entries default to pending in the existing API/UI contract.
-- Join current stop/day membership so removed stops never reappear on replay.
create function kinnso_internal.trip_progress_snapshot(p_trip_id uuid, p_actor_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ownerId', t.owner_user_id,
    'tripId', t.id,
    'tripRevision', t.head_revision_no,
    'progressRevision', coalesce(h.progress_revision, 0),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('stopId', s.id, 'state', e.state) order by s.id)
      from kinnso_internal.trip_stop_progress e
      join public.trip_stops s on s.id = e.stop_id and s.trip_id = e.trip_id
      join public.trip_days d on d.id = s.trip_day_id and d.trip_id = s.trip_id
      where e.trip_id = t.id
    ), '[]'::jsonb)
  )
  from public.trips t
  left join kinnso_internal.trip_progress_heads h on h.trip_id = t.id and h.owner_id = p_actor_id
  where t.id = p_trip_id and t.owner_user_id = p_actor_id;
$$;
revoke all on function kinnso_internal.trip_progress_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Definer access is limited to the private tables above; actor() verifies the
-- current auth.sessions row, and ownership is checked without any operator bypass.
create function public.get_trip_progress(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  -- A read never inserts a progress head, state or receipt. SHARE serializes it
  -- with progress and itinerary mutations, which all lock the trip first.
  perform 1 from public.trips t
    where t.id = p_trip_id and t.owner_user_id = v_actor for share;
  if not found then raise exception 'trip_not_found'; end if;
  return kinnso_internal.trip_progress_snapshot(p_trip_id, v_actor);
end $$;

create function public.apply_trip_progress(
  p_trip_id uuid,
  p_request_id uuid,
  p_stop_id uuid,
  p_state text,
  p_expected_trip_revision integer,
  p_expected_progress_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_trip public.trips;
  v_prior kinnso_internal.trip_progress_requests;
  v_digest text;
  v_progress integer;
  v_state text;
begin
  if p_trip_id is null or p_request_id is null or p_stop_id is null or
    p_state is null or p_state not in ('pending', 'visited', 'skipped') or
    p_expected_trip_revision is null or p_expected_trip_revision < 1 or
    p_expected_progress_revision is null or p_expected_progress_revision < 0
    then raise exception 'invalid_command'; end if;

  -- Follow the existing command lock order: actor/request, then owned trip.
  -- The trip lock serializes first writes, both CAS checks and stop removal
  -- without updating any itinerary row or incrementing its content revision.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text, 0));
  select * into v_trip from public.trips t
    where t.id = p_trip_id and t.owner_user_id = v_actor for update;
  if not found then raise exception 'trip_not_found'; end if;

  v_digest := kinnso_internal.request_digest(jsonb_build_object(
    'type', 'tripProgress', 'tripId', p_trip_id, 'stopId', p_stop_id, 'state', p_state,
    'expectedTripRevision', p_expected_trip_revision,
    'expectedProgressRevision', p_expected_progress_revision
  )::text);
  select * into v_prior from kinnso_internal.trip_progress_requests r
    where r.actor_id = v_actor and r.request_id = p_request_id;
  if found then
    if v_prior.digest <> v_digest then raise exception 'idempotency_conflict'; end if;
    -- A receipt proves the original update even after later edits/removal. Return
    -- current state, never a cached snapshot or a reapplication of the old state.
    return jsonb_build_object(
      'snapshot', kinnso_internal.trip_progress_snapshot(p_trip_id, v_actor),
      'requestId', p_request_id,
      'appliedProgressRevision', v_prior.applied_progress_revision,
      'replayed', true
    );
  end if;

  if v_trip.head_revision_no <> p_expected_trip_revision then raise exception 'trip_revision_conflict'; end if;
  select h.progress_revision into v_progress from kinnso_internal.trip_progress_heads h
    where h.trip_id = p_trip_id and h.owner_id = v_actor;
  if not found then v_progress := 0; end if;
  if v_progress <> p_expected_progress_revision then raise exception 'progress_revision_conflict'; end if;

  perform 1 from public.trip_stops s
    join public.trip_days d on d.id = s.trip_day_id and d.trip_id = s.trip_id
    where s.id = p_stop_id and s.trip_id = p_trip_id for share of s, d;
  if not found then raise exception 'trip_not_found'; end if;

  select e.state into v_state from kinnso_internal.trip_stop_progress e
    where e.trip_id = p_trip_id and e.stop_id = p_stop_id;
  if coalesce(v_state, 'pending') <> p_state then
    if v_progress = 2147483647 then raise exception 'invalid_progress_revision'; end if;
    v_progress := v_progress + 1;
    insert into kinnso_internal.trip_progress_heads (trip_id, owner_id, progress_revision)
      values (p_trip_id, v_actor, v_progress)
      on conflict (trip_id) do update set progress_revision = excluded.progress_revision;
    insert into kinnso_internal.trip_stop_progress (trip_id, stop_id, state)
      values (p_trip_id, p_stop_id, p_state)
      on conflict (trip_id, stop_id) do update set state = excluded.state;
  end if;

  -- No-op commands also receive immutable receipts, without advancing progress.
  insert into kinnso_internal.trip_progress_requests
    (actor_id, request_id, trip_id, digest, applied_progress_revision)
    values (v_actor, p_request_id, p_trip_id, v_digest, v_progress);
  return jsonb_build_object(
    'snapshot', kinnso_internal.trip_progress_snapshot(p_trip_id, v_actor),
    'requestId', p_request_id,
    'appliedProgressRevision', v_progress,
    'replayed', false
  );
end $$;

revoke all on function public.get_trip_progress(uuid),
  public.apply_trip_progress(uuid, uuid, uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_trip_progress(uuid),
  public.apply_trip_progress(uuid, uuid, uuid, text, integer, integer)
  to authenticated;
