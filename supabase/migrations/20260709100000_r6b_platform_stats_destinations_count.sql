-- supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql
-- D-R6B-5: switch platform_stats()'s `destinations` column from a raw distinct-city count
-- over `guides` to a count of the new curated `destinations` table. The RETURNS TABLE
-- column list is unchanged (still 5 columns, same names/types) so a plain CREATE OR
-- REPLACE is correct here — DROP FUNCTION is only required when the column list itself
-- changes (see the R3C/R5 precedent in this same function's history), not when only one
-- column's body expression changes.

create or replace function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(*) from public.destinations where status = 'published'),
    app_private.count_completed_bookings(),
    (select count(*) from public.community_sessions where status in ('scheduled','live'));
$$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to anon, authenticated;
