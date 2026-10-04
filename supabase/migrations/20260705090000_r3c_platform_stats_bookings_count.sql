-- supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql

-- R3C (§D-R3-8, master spec): platform_stats() gains a completed-bookings count.
-- bookings has NO anon SELECT policy (unlike creators/guides, which platform_stats()'s
-- existing three columns already read via anon's own row-level RLS access) — so the
-- count must go through a SECURITY DEFINER helper, never a direct count() inside the
-- still-SECURITY INVOKER platform_stats() itself (see plan D-R3C-2).

create or replace function app_private.count_completed_bookings()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.bookings where status = 'completed';
$$;

revoke all on function app_private.count_completed_bookings() from public;
grant execute on function app_private.count_completed_bookings() to anon, authenticated;

-- Postgres can't change RETURNS TABLE's column list via CREATE OR REPLACE, so the
-- live 3-column platform_stats() must be dropped before it can be redefined with 4.
drop function if exists public.platform_stats();

create or replace function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(distinct city) from public.guides
       where status = 'published' and city is not null and city <> ''),
    app_private.count_completed_bookings();
$$;

grant execute on function public.platform_stats() to anon, authenticated;
