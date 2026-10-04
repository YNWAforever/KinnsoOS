-- Seed: curated Travelpayouts affiliate offers (programs + published offers).
-- Mirrors apps/web/lib/missions/offer-catalog.ts (kept in sync by a parity test).
-- Idempotent: safe to re-run. Runs as postgres (bypasses RLS).
-- PREREQUISITE: an auth user 'ops-system@kinnso.internal' must exist (create it
-- once in Supabase Studio → Authentication → Add user). It never logs in; it only
-- provides created_by_ops_member_id for travelpayouts offers.

-- 1. Ensure the system ops member exists and is active.
insert into public.kinnso_ops_members (user_id, display_name, status)
select id, 'Kinnso Offers System', 'active'
from auth.users
where email = 'ops-system@kinnso.internal'
on conflict (user_id) do update set status = 'active', updated_at = now();

-- CI-safe: a fresh local/CI DB (supabase start) has no ops-system auth user. Do NOT
-- `raise exception` here — that would fail every `supabase start`/CI run. Programs are
-- always seeded; the offers insert below is guarded to run only when an active ops
-- member exists. Emit a notice so a forgotten PROD ops user is visible in the logs;
-- the Task 5 verification (offers = 8) is the real safety net.
do $$
begin
  if not exists (select 1 from public.kinnso_ops_members where status = 'active') then
    raise notice 'No active kinnso_ops_members row — offers were NOT seeded. Create ops-system@kinnso.internal in Supabase Studio and re-run to populate offers.';
  end if;
end $$;

-- 2. One published travelpayouts offer per program (enables idempotent offer upsert).
create unique index if not exists missions_tp_program_uniq
  on public.missions (affiliate_network_program_id)
  where mission_source = 'travelpayouts';

-- 3. Upsert programs (idempotent via unique(network, external_program_id)).
insert into public.affiliate_network_programs
  (network, external_program_id, program_name, program_url, category,
   default_currency, default_commission_description, status)
values
  ('travelpayouts','tp-booking-com','Booking.com','https://www.booking.com','Hotels & stays','USD','Up to 4% per stay','active'),
  ('travelpayouts','tp-agoda','Agoda','https://www.agoda.com','Hotels & stays','USD','Up to 5% per booking','active'),
  ('travelpayouts','tp-trip-com','Trip.com','https://www.trip.com','Flights & hotels','USD','Up to 4% per booking','active'),
  ('travelpayouts','tp-klook','Klook','https://www.klook.com','Tours & activities','USD','Up to 5% per activity','active'),
  ('travelpayouts','tp-kkday','KKday','https://www.kkday.com','Tours & activities','USD','Up to 5% per activity','active'),
  ('travelpayouts','tp-getyourguide','GetYourGuide','https://www.getyourguide.com','Tours & activities','USD','Up to 8% per activity','active'),
  ('travelpayouts','tp-airalo','Airalo','https://www.airalo.com','Travel eSIM','USD','Up to 10% per eSIM','active'),
  ('travelpayouts','tp-aviasales','Aviasales','https://www.aviasales.com','Flights','USD','Approx. 1.6% per ticket','active')
on conflict (network, external_program_id) do update set
  program_name = excluded.program_name,
  program_url = excluded.program_url,
  category = excluded.category,
  default_currency = excluded.default_currency,
  default_commission_description = excluded.default_commission_description,
  status = excluded.status,
  updated_at = now();

-- 4. Upsert offers (missions) referencing the active ops member + each program.
insert into public.missions
  (mission_source, mission_type, visibility, status, published_at,
   title, summary, affiliate_network_program_id, created_by_ops_member_id,
   affiliate_commission_rate, creator_commission_rate, kinnso_commission_rate)
select
  'travelpayouts', 'coupon_affiliate', 'open', 'published', now(),
  v.title, v.summary, p.id,
  (select id from public.kinnso_ops_members where status = 'active' order by created_at limit 1),
  v.affiliate_rate, 70, 30
from (values
  ('tp-booking-com','Booking.com stays','Earn commission when your audience books hotels and stays through Booking.com.', 4.0),
  ('tp-agoda','Agoda hotels','Strong in Asia — earn on hotel bookings across the region via Agoda.', 5.0),
  ('tp-trip-com','Trip.com flights & hotels','Flights, hotels and trains across Asia — earn on Trip.com bookings.', 4.0),
  ('tp-klook','Klook activities','Tours, attractions and experiences — huge in HK and across Asia.', 5.0),
  ('tp-kkday','KKday experiences','Taiwan-born activities platform — earn on tours and experiences in Asia.', 5.0),
  ('tp-getyourguide','GetYourGuide tours','Global tours and activities — earn on bookings worldwide.', 8.0),
  ('tp-airalo','Airalo travel eSIM','Creator-favourite travel eSIM — earn when followers buy data abroad.', 10.0),
  ('tp-aviasales','Aviasales flights','Flight search and booking — earn on ticket sales via Aviasales.', 1.6)
) as v(external_program_id, title, summary, affiliate_rate)
join public.affiliate_network_programs p
  on p.network = 'travelpayouts' and p.external_program_id = v.external_program_id
-- Seed offers only when an active ops member exists. On a fresh local/CI DB this
-- yields zero rows (no created_by_ops_member_id CHECK violation); programs above are
-- still seeded. On prod (after the Studio ops user is created) all 8 offers insert.
where exists (select 1 from public.kinnso_ops_members where status = 'active')
on conflict (affiliate_network_program_id) where mission_source = 'travelpayouts'
do update set
  title = excluded.title,
  summary = excluded.summary,
  status = 'published',
  published_at = coalesce(public.missions.published_at, excluded.published_at),
  affiliate_commission_rate = excluded.affiliate_commission_rate,
  creator_commission_rate = excluded.creator_commission_rate,
  kinnso_commission_rate = excluded.kinnso_commission_rate,
  updated_at = now();
