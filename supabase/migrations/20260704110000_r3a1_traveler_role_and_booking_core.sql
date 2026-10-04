-- Phase R3A-1 — Traveler role support + booking-core data model.
-- (1) traveler_profiles: one row per auth user, bootstrapped by the same
--     handle_new_user() trigger that already bootstraps a blank `creators` row (every
--     sign-up gets both; role resolution — done in app code, not here — decides which
--     is "live" via creators.status, not row existence).
-- (2) experience_availability: per-date capacity rows for a bookable experience. Owner
--     (merchant) CRUD via the same ownership-chain pattern as `experiences`; public read
--     of open, future, bookable dates via a new app_private helper (no PII, but the
--     bookability check still needs to cross the merchant_profiles table, which anon
--     has no grant on — same reason merchant_is_active exists).
-- (3) bookings: the core booking record. Deliberately NO owner/anon UPDATE grant at all
--     in this migration — every status transition ships in a later phase (R3A-2's
--     webhook-driven RPC, R3B's ops/merchant RPCs). Rows are immutable to every client
--     once inserted. Exactly one of traveler_user_id/guest_email is set (CHECK).
-- (4) booking_events: audit trail, read-only to every role — all writes go through
--     SECURITY DEFINER RPCs added in a later phase (same shape as ops_audit_log).

-- ── 1. traveler_profiles ─────────────────────────────────────────────────────
create table public.traveler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.traveler_profiles enable row level security;

create policy traveler_profiles_owner_select on public.traveler_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy traveler_profiles_owner_update on public.traveler_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy traveler_profiles_ops_select on public.traveler_profiles
  for select to authenticated
  using (public.is_active_ops());

create trigger traveler_profiles_set_updated_at
  before update on public.traveler_profiles
  for each row execute procedure public.set_updated_at();

-- No owner-insert policy: rows are bootstrapped only by handle_new_user()
-- (SECURITY DEFINER), matching the creators-row precedent exactly.
revoke all on table public.traveler_profiles from anon;
grant select, update on table public.traveler_profiles to authenticated;

-- ── 2. Extend handle_new_user() to also bootstrap a traveler_profiles row ───────
-- CREATE OR REPLACE on the existing function; the trigger `on_auth_user_created`
-- (created in 20260614000014_creator_auth_trigger.sql) calls it by name and needs no
-- change. The shipped migration file is never edited.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.creators (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.traveler_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ── 3. experience_availability ───────────────────────────────────────────────
create table public.experience_availability (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  date date not null,
  capacity integer not null check (capacity >= 0),
  booked_count integer not null default 0
    check (booked_count >= 0 and booked_count <= capacity),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, date)
);

create index experience_availability_experience_idx
  on public.experience_availability(experience_id, date);

alter table public.experience_availability enable row level security;

create policy experience_availability_owner_all on public.experience_availability
  for all to authenticated
  using (experience_id in (
    select id from public.experiences where merchant_profile_id in (
      select id from public.merchant_profiles where user_id = (select auth.uid()))))
  with check (experience_id in (
    select id from public.experiences where merchant_profile_id in (
      select id from public.merchant_profiles where user_id = (select auth.uid()))));

create or replace function app_private.experience_is_bookable(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.experiences e
    where e.id = target_experience_id
      and e.status = 'published'
      and app_private.merchant_is_active(e.merchant_profile_id)
  );
$$;
revoke all on function app_private.experience_is_bookable(uuid) from public;
grant execute on function app_private.experience_is_bookable(uuid) to anon, authenticated;

create policy experience_availability_public_read on public.experience_availability
  for select to anon, authenticated
  using (
    status = 'open'
    and date >= current_date
    and app_private.experience_is_bookable(experience_id)
  );

create trigger experience_availability_set_updated_at
  before update on public.experience_availability
  for each row execute procedure public.set_updated_at();

revoke all on table public.experience_availability from anon, authenticated;
grant select on table public.experience_availability to anon;
grant select, insert, update, delete on table public.experience_availability to authenticated;

-- ── 4. bookings ──────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id),
  availability_id uuid not null references public.experience_availability(id),
  traveler_user_id uuid references auth.users(id),
  guest_email text,
  qty integer not null check (qty > 0),
  unit_amount numeric(10,2) not null check (unit_amount >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  currency text not null check (currency in ('HKD','USD','SGD','JPY','KRW','THB','TWD','CNY')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed','completed','cancelled','refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  creator_id uuid references public.creators(id),
  guide_id uuid references public.guides(id),
  source_surface text check (source_surface in ('guide','article','experience_page','direct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_traveler_xor_guest check (
    (traveler_user_id is not null and guest_email is null) or
    (traveler_user_id is null and guest_email is not null)
  )
);

create index bookings_experience_idx on public.bookings(experience_id);
create index bookings_availability_idx on public.bookings(availability_id);
create index bookings_traveler_idx on public.bookings(traveler_user_id);
create index bookings_status_idx on public.bookings(status, created_at desc);

alter table public.bookings enable row level security;

create policy bookings_owner_insert on public.bookings
  for insert to authenticated
  with check (traveler_user_id = (select auth.uid()) and status = 'pending_payment');

create policy bookings_guest_insert on public.bookings
  for insert to anon
  with check (traveler_user_id is null and guest_email is not null and status = 'pending_payment');

create policy bookings_owner_select on public.bookings
  for select to authenticated
  using (traveler_user_id = (select auth.uid()));

create policy bookings_ops_select on public.bookings
  for select to authenticated
  using (public.is_active_ops());

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

-- No UPDATE grant to anon or authenticated — every status transition (confirm, cancel,
-- complete, refund) ships as a SECURITY DEFINER RPC in a later phase. Rows are
-- immutable to every client once inserted.
revoke all on table public.bookings from anon, authenticated;
grant insert on table public.bookings to anon;
grant select, insert on table public.bookings to authenticated;

-- ── 5. booking_events ────────────────────────────────────────────────────────
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events(booking_id, created_at);

alter table public.booking_events enable row level security;

create policy booking_events_owner_select on public.booking_events
  for select to authenticated
  using (booking_id in (select id from public.bookings where traveler_user_id = (select auth.uid())));

create policy booking_events_ops_select on public.booking_events
  for select to authenticated
  using (public.is_active_ops());

-- No insert/update/delete policy for any role — all writes go through SECURITY
-- DEFINER RPCs added in a later phase (mirrors ops_audit_log's write-only-via-RPC shape).
revoke all on table public.booking_events from anon, authenticated;
grant select on table public.booking_events to authenticated;
