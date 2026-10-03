-- Phase R1B — homepage social proof: platform_stats RPC + curated testimonials.
-- Reuses public.is_active_ops() (6A, 20260626130000) — do NOT redefine here.

-- 1. Honest aggregate counts for the homepage social-proof bar.
--    SECURITY INVOKER: anon's RLS (creators_public_read, guides_public_read_published)
--    already permits exactly these rows, so the counts run under caller rights and
--    automatically track any future policy tightening. The WHERE predicates mirror
--    those policies for explicitness/defense-in-depth. "Active creator" = active
--    status + claimed handle + published public profile. Destinations = distinct
--    cities across published guides. Deliberately NO bookings count until R3 ships
--    direct booking (master spec §5, threshold-gated display).
create or replace function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(distinct city) from public.guides
       where status = 'published' and city is not null and city <> '');
$$;
-- Public homepage read: unlike the ops RPCs, anon MUST be able to execute this.
revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to anon, authenticated;

-- 2. Curated testimonials — ops-managed; surfaced on the homepage now and the
--    R1C landing pages later. locale null = show in every locale.
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  author_name text not null,
  author_role text not null check (author_role in ('creator','traveller','merchant')),
  locale text check (locale is null or locale in ('en','zh-hk','zh-tw','zh-cn','ja','ko','th')),
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
revoke all on public.testimonials from anon, authenticated;

-- anon (and any signed-in non-ops user) sees published rows only.
drop policy if exists testimonials_public_read on public.testimonials;
create policy testimonials_public_read on public.testimonials
  for select to anon, authenticated using (status = 'published');

-- ops manage everything, drafts included.
drop policy if exists testimonials_ops_all on public.testimonials;
create policy testimonials_ops_all on public.testimonials
  for all to authenticated using (public.is_active_ops()) with check (public.is_active_ops());

grant select on public.testimonials to anon;
grant select, insert, update, delete on public.testimonials to authenticated; -- gated by the policies above
