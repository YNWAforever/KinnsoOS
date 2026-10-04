-- Phase R2B — (1) merchant public identity: slug/tagline/city/logo_url on
-- merchant_profiles; slug is trigger-generated on INSERT (so R2A's approve RPC needs no
-- change) and backfilled for existing rows; slug is NOT in the owner UPDATE column grant
-- (immutable in R2 — no rename/redirect management yet).
-- (2) merchant_public_profiles VIEW: the PII-safe anon read surface. The base table keeps
-- NO anon policy (RLS filters rows, not columns — an anon row policy would expose
-- contact_email to hand-crafted PostgREST queries). The view runs owner-executed
-- (security_invoker OFF — Postgres default), bypassing base RLS by design, and projects
-- only public columns of active, slugged merchants. The Supabase advisor flags
-- definer-style views — DELIBERATE, documented in the R2 design spec §D-R2-3.
-- (3) experiences: merchant-owned listings. Owner CRUD via RLS subquery; public read of
-- published rows belonging to active merchants (no PII columns, so a plain row policy is
-- safe here, unlike merchant_profiles).

-- ── 1. Public profile columns ────────────────────────────────────────────────
alter table public.merchant_profiles
  add column if not exists slug text unique,
  add column if not exists tagline text,
  add column if not exists city text,
  add column if not exists logo_url text;

create or replace function public.merchant_slugify(p_text text)
returns text language sql immutable as $$
  select coalesce(
    nullif(btrim(regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    'merchant')
$$;

create or replace function public.merchant_profiles_set_slug()
returns trigger language plpgsql as $$
declare v_base text;
begin
  if new.slug is not null then return new; end if;
  v_base := public.merchant_slugify(new.company_name);
  if exists (select 1 from public.merchant_profiles where slug = v_base) then
    v_base := v_base || '-' || left(new.id::text, 6);
  end if;
  new.slug := v_base;
  return new;
end $$;

drop trigger if exists merchant_profiles_set_slug on public.merchant_profiles;
create trigger merchant_profiles_set_slug
  before insert on public.merchant_profiles
  for each row execute procedure public.merchant_profiles_set_slug();

-- Backfill existing rows (oldest first so the earliest merchant wins the bare slug).
do $$
declare r record; v_base text;
begin
  for r in select id, company_name from public.merchant_profiles
           where slug is null order by created_at, id loop
    v_base := public.merchant_slugify(r.company_name);
    if exists (select 1 from public.merchant_profiles where slug = v_base) then
      v_base := v_base || '-' || left(r.id::text, 6);
    end if;
    update public.merchant_profiles set slug = v_base where id = r.id;
  end loop;
end $$;

-- Owner may now edit the new public fields — but never slug/status/tier.
grant update (tagline, city, logo_url) on public.merchant_profiles to authenticated;

-- ── 2. PII-safe public view ──────────────────────────────────────────────────
create or replace view public.merchant_public_profiles as
  select id, slug, company_name, tagline, city, logo_url, website_url, created_at
  from public.merchant_profiles
  where status = 'active' and slug is not null;

revoke all on public.merchant_public_profiles from anon, authenticated;
grant select on public.merchant_public_profiles to anon, authenticated;

-- ── 3. experiences ───────────────────────────────────────────────────────────
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null references public.merchant_profiles(id) on delete cascade,
  slug text not null unique,
  title text not null,
  summary text,
  description text,
  city text not null,
  price_amount numeric(10,2) not null check (price_amount >= 0),
  currency text not null default 'HKD'
    check (currency in ('HKD','USD','SGD','JPY','KRW','THB','TWD','CNY')),
  duration_minutes integer check (duration_minutes > 0),
  cover_url text,
  status text not null default 'draft' check (status in ('draft','published','paused')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experiences_merchant_idx on public.experiences(merchant_profile_id);
create index experiences_public_idx on public.experiences(status, published_at desc);

alter table public.experiences enable row level security;

create policy experiences_owner_all on public.experiences
  for all to authenticated
  using (merchant_profile_id in
    (select id from public.merchant_profiles where user_id = (select auth.uid())))
  with check (merchant_profile_id in
    (select id from public.merchant_profiles where user_id = (select auth.uid())));

create policy experiences_public_read on public.experiences
  for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.merchant_profiles m
    where m.id = merchant_profile_id and m.status = 'active'));

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute procedure public.set_updated_at();

revoke all on table public.experiences from anon, authenticated;
grant select on table public.experiences to anon;
grant select, insert, update, delete on table public.experiences to authenticated;
