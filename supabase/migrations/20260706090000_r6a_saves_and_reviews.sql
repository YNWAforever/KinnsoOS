-- R6A (design doc D-R6A-1..8): traveller-facing saves on guides/experiences, and
-- post-booking star+text reviews feeding aggregateRating JSON-LD. Two parallel save
-- tables (not one polymorphic table) mirror the agent_rate_limits/checkout_rate_limits
-- "one table per feature" convention. reviews (added in a later section of this same
-- file) denormalizes experience_id/guide_id from the booking at insert time -- see
-- that section's own comment for why.

-- ── 1. guide_saves ────────────────────────────────────────────────────────────
create table public.guide_saves (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, traveler_user_id)
);

create index guide_saves_traveler_idx on public.guide_saves(traveler_user_id, created_at desc);

alter table public.guide_saves enable row level security;

create policy guide_saves_owner_all on public.guide_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.guide_saves from anon, authenticated;
grant select, insert, delete on public.guide_saves to authenticated;

create or replace function public.guide_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.guides set saves_count = saves_count + 1 where id = new.guide_id;
  elsif (TG_OP = 'DELETE') then
    update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id;
  end if;
  return null;
end;
$$;

create trigger guide_saves_sync_count_trigger
  after insert or delete on public.guide_saves
  for each row execute procedure public.guide_saves_sync_count();

revoke all on function public.guide_saves_sync_count() from public, anon, authenticated, service_role;

-- ── 2. experience_saves ──────────────────────────────────────────────────────
alter table public.experiences add column saves_count integer not null default 0;

create table public.experience_saves (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (experience_id, traveler_user_id)
);

create index experience_saves_traveler_idx on public.experience_saves(traveler_user_id, created_at desc);

alter table public.experience_saves enable row level security;

create policy experience_saves_owner_all on public.experience_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.experience_saves from anon, authenticated;
grant select, insert, delete on public.experience_saves to authenticated;

create or replace function public.experience_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.experiences set saves_count = saves_count + 1 where id = new.experience_id;
  elsif (TG_OP = 'DELETE') then
    update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id;
  end if;
  return null;
end;
$$;

create trigger experience_saves_sync_count_trigger
  after insert or delete on public.experience_saves
  for each row execute procedure public.experience_saves_sync_count();

revoke all on function public.experience_saves_sync_count() from public, anon, authenticated, service_role;

-- ── 3. reviews ────────────────────────────────────────────────────────────────
-- D-R6A-1: only a completed booking (merchant called mark_booking_completed) is
-- reviewable, never merely confirmed. D-R6A-4: only bookings with a real
-- traveler_user_id (not a guest checkout) are reviewable. experience_id/guide_id are
-- denormalized from the booking at insert time: bookings RLS restricts SELECT to a
-- booking's own traveller (or ops), so a public read that joined reviews to bookings
-- to resolve "which experience/guide is this for" would return zero rows for every
-- visitor except the reviewer. Copying the two id columns onto reviews means every
-- public read is scoped entirely by reviews' own RLS and never touches bookings.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  guide_id uuid references public.guides(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create index reviews_experience_idx on public.reviews(experience_id) where status = 'published';
create index reviews_guide_idx on public.reviews(guide_id) where status = 'published';

alter table public.reviews enable row level security;

-- Unqualified column references inside the correlated subquery below would bind to
-- `bookings b`'s own columns (shadowing), not the candidate reviews row -- the
-- `reviews.` qualifier is required here, not decorative, to compare the NEW row's
-- experience_id/guide_id against the real booking rather than comparing b's columns
-- to themselves.
create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    traveler_user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.traveler_user_id = auth.uid()
        and b.status = 'completed'
        and b.experience_id = reviews.experience_id
        and b.guide_id is not distinct from reviews.guide_id
    )
  );

create policy reviews_owner_select on public.reviews
  for select to authenticated
  using (traveler_user_id = auth.uid());

create policy reviews_public_select on public.reviews
  for select to anon, authenticated
  using (status = 'published');

create policy reviews_ops_update on public.reviews
  for update to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant update on public.reviews to authenticated;

-- Extend get_booking_by_checkout_session (20260704120000) with traveler_user_id,
-- experience_id, and guide_id so the "booked" confirmation page's completed branch can
-- (a) tell whether the signed-in viewer is the real traveler on the booking, never a
-- guest (D-R6A-4), and (b) submit a review whose experience_id/guide_id will actually
-- pass reviews_insert's check above. None of these are PII; safe for this anon-callable RPC.
--
-- Postgres can't change RETURNS TABLE's column list via CREATE OR REPLACE, so the
-- live 7-column get_booking_by_checkout_session() must be dropped before it can be
-- redefined with 10 (see 20260705090000_r3c_platform_stats_bookings_count.sql for the
-- same gotcha with platform_stats()).
drop function if exists public.get_booking_by_checkout_session(text);

create or replace function public.get_booking_by_checkout_session(p_session_id text)
returns table (
  booking_id uuid, status text, qty integer, total_amount numeric,
  currency text, experience_title text, experience_slug text,
  traveler_user_id uuid, experience_id uuid, guide_id uuid
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.status, b.qty, b.total_amount, b.currency, e.title, e.slug,
         b.traveler_user_id, b.experience_id, b.guide_id
  from public.bookings b
  join public.experiences e on e.id = b.experience_id
  where b.stripe_checkout_session_id = p_session_id;
$$;

revoke all on function public.get_booking_by_checkout_session(text) from public;
grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated;
