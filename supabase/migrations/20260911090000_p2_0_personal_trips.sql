-- supabase/migrations/20260911090000_p2_0_personal_trips.sql
--
-- Phase 2 slice 0 -- personal trips, AUTHORED ONLY.
-- See docs/implementation/ADRs/0001-phase-2-trips-and-versions.md.
--
-- This migration deliberately touches NO existing object. No column is added to
-- public.guides, no check constraint is widened, no grant is revoked, and the
-- publish path in apps/web/lib/guides/actions.ts is untouched. Everything here
-- is new, so the rollback is a drop and existing behaviour cannot regress.
--
-- Why authored-only first: every guide in the database today is summary-only
-- (public.guides is flat -- no days, no stops, no version rows), so structured
-- adoption has nothing to adopt. The plan (section 7.2.5) says as much: a
-- summary-only guide stays readable, savable and linkable, and only "create a
-- blank trip with this guide attached" is available until real stop data
-- exists. The credit columns on trip_stops are therefore present and
-- constrained from the start -- so adoption lands as data, not as a migration
-- that rewrites this table -- but in this slice every one of them is NULL and
-- origin is always 'authored'.
--
-- A personal trip is INDEPENDENT. There is deliberately no foreign key from
-- trips to guides anywhere in this file: the absence of that pointer is what
-- makes "saving is not cloning" structural rather than a convention.

-- ---------------------------------------------------------------------------
-- Time zone validation
-- ---------------------------------------------------------------------------
-- A CHECK cannot call pg_timezone_names (not IMMUTABLE), and an invalid zone
-- must fail at write time rather than at read time, when it would break a page
-- rather than a form. Hence a BEFORE trigger.
create or replace function public.assert_valid_time_zone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone text;
begin
  v_zone := case tg_argv[0] when 'timezone' then new.timezone else null end;
  if v_zone is null then
    raise exception 'time_zone_required';
  end if;
  -- `now() AT TIME ZONE <zone>` raises for an unknown zone; cheaper and more
  -- authoritative than scanning pg_timezone_names.
  begin
    perform now() at time zone v_zone;
  exception when others then
    raise exception 'invalid_time_zone' using detail = v_zone;
  end;
  return new;
end;
$$;

revoke execute on function public.assert_valid_time_zone() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- places -- shared, creator-neutral venue registry
-- ---------------------------------------------------------------------------
-- Not public.destinations (a curated city/region marketing surface with a hero
-- image and match terms) and not public.experiences (a merchant product with a
-- price and an owner). A venue referenced by a traveller's private trip must
-- drag neither marketing nor merchant ownership behind it.
--
-- The timezone lives here and nowhere else. Copying it onto each stop would let
-- it drift per copy, and the plan requires changing a destination timezone to
-- be an explicit, single act.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.destinations(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  formatted_address text check (formatted_address is null or char_length(btrim(formatted_address)) <= 500),
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  timezone text not null,
  provider text not null default 'manual' check (provider in ('manual', 'google', 'osm')),
  provider_place_id text,
  status text not null default 'active' check (status in ('active', 'merged', 'hidden')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coordinates arrive as a pair or not at all; a lone latitude is a bug, and
  -- the plan requires unknown coordinates to stay unknown rather than be
  -- half-guessed.
  constraint places_coords_paired check ((lat is null) = (lng is null))
);

create unique index places_provider_identity_uniq
  on public.places (provider, provider_place_id)
  where provider_place_id is not null;
create index places_destination_idx on public.places (destination_id) where destination_id is not null;

create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

create trigger places_validate_timezone
  before insert or update of timezone on public.places
  for each row execute function public.assert_valid_time_zone('timezone');

alter table public.places enable row level security;
revoke all on public.places from public, anon, authenticated;

create policy places_public_read on public.places
  for select
  to anon, authenticated
  using (status = 'active');

-- SELECT only. Rows are minted by upsert_place() so the provider identity and
-- timezone are validated in one place; a traveller cannot insert a venue with a
-- bogus zone that would then break every trip referencing it.
grant select on public.places to anon, authenticated;

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  destination_id uuid references public.destinations(id) on delete set null,
  -- The zone the traveller is planning in. Stop times are wall-clock intent and
  -- are resolved against this, so changing it re-resolves every stop without
  -- rewriting a single stop row.
  timezone text not null default 'UTC',
  -- NULL is first-class: an undated trip is a real state ("Day 1, Day 2"), not
  -- a sentinel date. The plan requires supporting it directly.
  start_date date,
  status text not null default 'planning' check (status in ('planning', 'active', 'archived')),
  head_revision_no integer not null default 0 check (head_revision_no >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables carry a composite FK on (id, trip_id), which makes a
  -- cross-trip parent physically impossible rather than merely checked.
  constraint trips_id_owner_uniq unique (id, owner_user_id)
);

create index trips_owner_idx on public.trips (owner_user_id, updated_at desc);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

create trigger trips_validate_timezone
  before insert or update of timezone on public.trips
  for each row execute function public.assert_valid_time_zone('timezone');

alter table public.trips enable row level security;
revoke all on public.trips from public, anon, authenticated;

-- Private by construction: no anon policy AND no anon grant. The privilege
-- layer refuses before RLS is ever consulted, which is the belt-and-braces the
-- plan asks for around private traveller content.
create policy trips_owner_all on public.trips
  for all
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

grant select, insert, delete on public.trips to authenticated;
-- head_revision_no is NOT grantable: it advances only inside the definer RPCs,
-- so a client cannot fake a revision and defeat optimistic concurrency.
grant update (title, destination_id, timezone, start_date, status, updated_at)
  on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- trip_days
-- ---------------------------------------------------------------------------
create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  -- Offset, never a date. Dates are derived; see trip_stop_starts_at.
  day_offset integer not null check (day_offset between 0 and 364),
  title text check (title is null or char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- DEFERRABLE so a reorder can swap two offsets inside one statement without
  -- needing a temporary sentinel value.
  constraint trip_days_trip_offset_uniq unique (trip_id, day_offset) deferrable initially deferred,
  constraint trip_days_id_trip_uniq unique (id, trip_id)
);

create index trip_days_trip_idx on public.trip_days (trip_id, day_offset);

create trigger trip_days_set_updated_at
  before update on public.trip_days
  for each row execute function public.set_updated_at();

alter table public.trip_days enable row level security;
revoke all on public.trip_days from public, anon, authenticated;

create policy trip_days_owner_all on public.trip_days
  for all
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_days.trip_id
        and t.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_days.trip_id
        and t.owner_user_id = (select auth.uid())
    )
  );

grant select, insert, delete on public.trip_days to authenticated;
grant update (day_offset, title, updated_at) on public.trip_days to authenticated;

-- ---------------------------------------------------------------------------
-- trip_stops
-- ---------------------------------------------------------------------------
-- The credit columns are present from the start even though this slice writes
-- none of them, so adoption arrives as data rather than as a migration that
-- rewrites a table travellers already depend on.
--
-- They are a SNAPSHOT, not a join. public.guides.creator_id is ON DELETE
-- CASCADE to creators, so a departing creator takes their guides with them; a
-- live FK would silently orphan or delete a traveller's stop. Copying the
-- credit keeps attribution readable after the source is gone, which is exactly
-- the "non-sensitive provenance tombstone" the plan calls for, and it is why
-- traveller notes survive a withdrawal.
create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_day_id uuid not null,
  position integer not null check (position >= 0),
  origin text not null default 'authored' check (origin in ('authored', 'adopted')),

  place_id uuid references public.places(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  -- The traveller's own words. Never overwritten by a source update.
  traveller_note text check (traveller_note is null or char_length(traveller_note) <= 4000),

  -- Wall-clock intent, resolved against trips.timezone at read time.
  start_minute_of_day integer check (start_minute_of_day is null or start_minute_of_day between 0 and 1439),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),

  -- Credit snapshot. All NULL in this slice.
  source_guide_id uuid,
  source_guide_slug text,
  source_creator_id uuid,
  source_creator_handle text,
  source_creator_name text,
  copied_title text,
  copied_note text,
  adopted_at timestamptz,
  source_withdrawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A day always belongs to the same trip as its stop.
  constraint trip_stops_day_same_trip
    foreign key (trip_day_id, trip_id) references public.trip_days (id, trip_id) on delete cascade,
  constraint trip_stops_trip_day_position_uniq
    unique (trip_day_id, position) deferrable initially deferred,
  -- An authored stop carries no credit; an adopted stop must name its source.
  -- This is what stops "saving" from quietly becoming "cloning".
  constraint trip_stops_origin_credit_consistent check (
    (origin = 'authored' and source_guide_id is null and source_creator_id is null and adopted_at is null)
    or
    (origin = 'adopted' and source_guide_id is not null and adopted_at is not null)
  )
);

create index trip_stops_trip_idx on public.trip_stops (trip_id);
create index trip_stops_day_idx on public.trip_stops (trip_day_id, position);
create index trip_stops_source_guide_idx on public.trip_stops (source_guide_id) where source_guide_id is not null;

create trigger trip_stops_set_updated_at
  before update on public.trip_stops
  for each row execute function public.set_updated_at();

alter table public.trip_stops enable row level security;
revoke all on public.trip_stops from public, anon, authenticated;

create policy trip_stops_owner_all on public.trip_stops
  for all
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_stops.trip_id
        and t.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_stops.trip_id
        and t.owner_user_id = (select auth.uid())
    )
  );

grant select, insert, delete on public.trip_stops to authenticated;
-- The credit snapshot and `origin` are NOT grantable. A traveller can edit
-- their own note, time and ordering; they cannot rewrite who a stop came from,
-- and they cannot promote an authored stop into a credited one.
grant update (trip_day_id, position, place_id, title, traveller_note, start_minute_of_day, duration_minutes, updated_at)
  on public.trip_stops to authenticated;

-- ---------------------------------------------------------------------------
-- trip_revisions -- metadata-only change log
-- ---------------------------------------------------------------------------
-- Deliberately NOT a jsonb content snapshot. A snapshot would duplicate the
-- live rows and, once adoption exists, would become a second place where
-- withdrawn creator text hides from redaction.
create table public.trip_revisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  parent_revision_no integer check (parent_revision_no is null or parent_revision_no >= 0),
  author_user_id uuid references auth.users(id) on delete set null,
  change_kind text not null check (change_kind in ('create', 'edit', 'set_dates', 'adopt', 'accept_source_update', 'source_withdrawn')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- The compare-and-set that makes two concurrent editors a conflict rather
  -- than a silent last-write-wins.
  constraint trip_revisions_trip_no_uniq unique (trip_id, revision_no)
);

create index trip_revisions_trip_idx on public.trip_revisions (trip_id, revision_no desc);

-- Append-only: a change log that can be edited is not a change log.
create or replace function public.trip_revisions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'trip_revisions_append_only';
end;
$$;

create trigger trip_revisions_no_mutate
  before update or delete on public.trip_revisions
  for each row execute function public.trip_revisions_append_only();

alter table public.trip_revisions enable row level security;
revoke all on public.trip_revisions from public, anon, authenticated;

create policy trip_revisions_owner_select on public.trip_revisions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = trip_revisions.trip_id
        and t.owner_user_id = (select auth.uid())
    )
  );

-- SELECT only: revisions are minted by the definer trip RPCs.
grant select on public.trip_revisions to authenticated;

-- ---------------------------------------------------------------------------
-- Date resolution
-- ---------------------------------------------------------------------------
-- One resolver, used by the view and by the app, so "what time is this stop?"
-- has exactly one answer. IMMUTABLE so it can be indexed later if needed.
--
-- Returns NULL for an undated trip or a stop with no time -- unknown stays
-- unknown rather than defaulting to midnight.
create or replace function public.trip_stop_starts_at(
  p_start_date date,
  p_day_offset integer,
  p_start_minute integer,
  p_timezone text
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_start_date is null or p_start_minute is null then null
    else ((p_start_date + p_day_offset)::timestamp + make_interval(mins => p_start_minute)) at time zone p_timezone
  end;
$$;

-- security_invoker so the view is filtered by the caller's own RLS on
-- trip_stops rather than by the view owner's privileges.
create view public.trip_stops_resolved
with (security_invoker = true)
as
select
  s.id,
  s.trip_id,
  s.trip_day_id,
  d.day_offset,
  s.position,
  s.origin,
  s.place_id,
  s.title,
  s.traveller_note,
  s.start_minute_of_day,
  s.duration_minutes,
  s.source_guide_id,
  s.source_guide_slug,
  s.source_creator_handle,
  s.source_creator_name,
  s.source_withdrawn_at,
  t.timezone,
  t.start_date,
  public.trip_stop_starts_at(t.start_date, d.day_offset, s.start_minute_of_day, t.timezone) as starts_at,
  case
    when public.trip_stop_starts_at(t.start_date, d.day_offset, s.start_minute_of_day, t.timezone) is null
      or s.duration_minutes is null
    then null
    else public.trip_stop_starts_at(t.start_date, d.day_offset, s.start_minute_of_day, t.timezone)
         + make_interval(mins => s.duration_minutes)
  end as ends_at,
  -- True when the requested wall-clock time does not exist in this zone (a
  -- spring-forward gap). Surfacing it beats silently shifting the traveller's
  -- stated intent by an hour.
  (
    public.trip_stop_starts_at(t.start_date, d.day_offset, s.start_minute_of_day, t.timezone) is not null
    and (public.trip_stop_starts_at(t.start_date, d.day_offset, s.start_minute_of_day, t.timezone) at time zone t.timezone)
        is distinct from ((t.start_date + d.day_offset)::timestamp + make_interval(mins => s.start_minute_of_day))
  ) as dst_anomaly
from public.trip_stops s
join public.trip_days d on d.id = s.trip_day_id
join public.trips t on t.id = s.trip_id;

revoke all on public.trip_stops_resolved from public, anon, authenticated;
grant select on public.trip_stops_resolved to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_place
-- ---------------------------------------------------------------------------
-- Definer because public.places has no INSERT grant: one validated path in,
-- so a bad timezone cannot enter the registry and break every trip using it.
create or replace function public.upsert_place(
  p_name text,
  p_timezone text,
  p_formatted_address text default null,
  p_country_code char(2) default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_destination_id uuid default null,
  p_provider text default 'manual',
  p_provider_place_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated';
  end if;

  if p_provider_place_id is not null then
    select id into v_id
    from public.places
    where provider = p_provider and provider_place_id = p_provider_place_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.places (
    name, timezone, formatted_address, country_code, lat, lng,
    destination_id, provider, provider_place_id, created_by_user_id
  )
  values (
    p_name, p_timezone, p_formatted_address, p_country_code, p_lat, p_lng,
    p_destination_id, p_provider, p_provider_place_id, v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.upsert_place(text, text, text, char(2), numeric, numeric, uuid, text, text)
  from public, anon;
grant execute on function public.upsert_place(text, text, text, char(2), numeric, numeric, uuid, text, text)
  to authenticated;

grant execute on function public.trip_stop_starts_at(date, integer, integer, text) to anon, authenticated;
