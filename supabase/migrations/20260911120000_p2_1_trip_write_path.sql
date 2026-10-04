-- supabase/migrations/20260911120000_p2_1_trip_write_path.sql
--
-- Phase 2 slice 1 -- the trip write path.
-- See docs/implementation/ADRs/0001-phase-2-trips-and-versions.md.
--
-- Slice 0 shipped the schema and proved its isolation, but nothing could
-- create a trip: `trips.head_revision_no` is deliberately absent from the
-- column-level UPDATE grant, so a revision can only be minted by a definer
-- function. This migration adds those functions.
--
-- Like slice 0, this touches NO existing object: it adds functions only. No
-- table is altered, no grant on an existing table is changed, and no policy is
-- rewritten. Rollback is `drop function` in reverse order.
--
-- SCOPE NOTE, deliberate and worth reading before extending:
-- `trip_stops` and `trip_days` keep their direct INSERT/UPDATE/DELETE grants
-- from slice 0, so editing a note, a time or an ordering does NOT mint a
-- revision. `trip_revisions` is therefore a log of *trip-level* change, not a
-- keystroke audit. That follows from slice 0's grants, which the isolation
-- suite already pins; narrowing them to force every edit through an RPC is a
-- product decision (ADR section 5.3, "trip history depth"), not one to invent
-- here. It is called out so the gap is visible rather than discovered later.

-- ---------------------------------------------------------------------------
-- FIX (slice 0 defect): append-only must not block referential actions
-- ---------------------------------------------------------------------------
-- Found by `delete_trip`'s test, which could not delete a trip at all.
--
-- `trip_revisions_append_only()` raised on EVERY update and delete, including
-- the ones Postgres itself issues to maintain referential integrity. Two
-- distinct operations were blocked:
--
--   1. DELETE. `trip_revisions.trip_id` is ON DELETE CASCADE, so deleting a
--      trip cascades into the log -- and the trigger refused. Since create_trip
--      mints revision 1, every trip has a revision, so NO trip could ever be
--      deleted.
--   2. UPDATE. `trip_revisions.author_user_id` is ON DELETE SET NULL, so
--      deleting an account makes Postgres issue
--      `UPDATE trip_revisions SET author_user_id = NULL` -- and the trigger
--      refused that too. Verified directly: deleting a user failed with
--      `trip_revisions_append_only` raised from that statement. An account
--      could not be deleted once its owner had created a trip, which is a
--      data-deletion problem rather than only a broken feature.
--
-- The guard is narrowed rather than removed. A revision still cannot be
-- rewritten or hand-deleted; the only permitted mutations are the two the
-- database performs itself, each recognised by its exact shape.
create or replace function public.trip_revisions_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- The single legitimate update: redacting authorship when the account is
    -- deleted. Every other column must be byte-identical, so this cannot be
    -- used as a hole through which to edit history.
    if old.author_user_id is not null
       and new.author_user_id is null
       and new.id is not distinct from old.id
       and new.trip_id is not distinct from old.trip_id
       and new.revision_no is not distinct from old.revision_no
       and new.parent_revision_no is not distinct from old.parent_revision_no
       and new.change_kind is not distinct from old.change_kind
       and new.summary is not distinct from old.summary
       and new.created_at is not distinct from old.created_at
    then
      return new;
    end if;
    raise exception 'trip_revisions_append_only';
  end if;

  -- DELETE is permitted only as the cascade from an already-deleted trip.
  -- Referential actions run after the parent row is gone, so a surviving
  -- parent means this is a direct delete, which stays refused.
  if exists (select 1 from public.trips where id = old.trip_id) then
    raise exception 'trip_revisions_append_only';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_trip
-- ---------------------------------------------------------------------------
-- Definer because it must write head_revision_no and trip_revisions, neither of
-- which `authenticated` can reach. It therefore bypasses RLS, so ownership is
-- established explicitly from auth.uid() rather than trusted from an argument:
-- the caller cannot name the owner, so it cannot create a trip in someone
-- else's account.
create or replace function public.create_trip(
  p_title text,
  p_timezone text default 'UTC',
  p_start_date date default null,
  p_destination_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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
$$;

revoke execute on function public.create_trip(text, text, date, uuid) from public, anon;
grant execute on function public.create_trip(text, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- update_trip -- compare-and-set
-- ---------------------------------------------------------------------------
-- Returns the new revision number.
--
-- p_expected_revision is what makes two concurrent editors a *conflict* rather
-- than a silent last-write-wins. `select ... for update` takes the row lock
-- before the comparison, so two callers racing on the same trip serialise and
-- the loser sees trip_revision_conflict instead of overwriting.
--
-- NULL means "leave alone" for every optional field, which leaves no way to
-- clear a nullable one. p_clear_start_date exists for exactly that: an undated
-- trip is a real state (ADR section 3), not a sentinel, so returning a trip to
-- undated has to be expressible.
create or replace function public.update_trip(
  p_trip_id uuid,
  p_expected_revision integer,
  p_title text default null,
  p_timezone text default null,
  p_start_date date default null,
  p_clear_start_date boolean default false,
  p_status text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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
$$;

revoke execute on function public.update_trip(uuid, integer, text, text, date, boolean, text) from public, anon;
grant execute on function public.update_trip(uuid, integer, text, text, date, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_trip
-- ---------------------------------------------------------------------------
-- `authenticated` already holds a DELETE grant on trips guarded by RLS, so this
-- is not a new capability. It exists so a deletion is refused on a stale
-- revision like every other trip-level write, rather than being the one
-- destructive operation that ignores concurrency.
create or replace function public.delete_trip(
  p_trip_id uuid,
  p_expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
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
$$;

revoke execute on function public.delete_trip(uuid, integer) from public, anon;
grant execute on function public.delete_trip(uuid, integer) to authenticated;
