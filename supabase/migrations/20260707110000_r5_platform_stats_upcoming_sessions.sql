-- supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql

-- R5: platform_stats() gains upcoming_sessions for the homepage social-proof bar.
-- Postgres rejects CREATE OR REPLACE FUNCTION when the RETURNS TABLE column list
-- changes (the same wall R3C's Task 1 hit adding completed_bookings) — DROP first.
-- SECURITY INVOKER, same as the original function: community_sessions_public_read
-- already lets anon see every non-cancelled row, so a plain count() here runs under
-- exactly the visibility anon already has. No app_private helper needed (unlike
-- completed_bookings, which has to bypass a table anon has zero SELECT on).

drop function public.platform_stats();

create function public.platform_stats()
returns table (active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint)
language sql stable security invoker set search_path = public as $$
  select
    (select count(*) from public.creators
       where status = 'active' and handle is not null and public_profile is not null),
    (select count(*) from public.guides where status = 'published'),
    (select count(distinct city) from public.guides
       where status = 'published' and city is not null and city <> ''),
    app_private.count_completed_bookings(),
    (select count(*) from public.community_sessions where status in ('scheduled','live'));
$$;

revoke all on function public.platform_stats() from public, anon;
grant execute on function public.platform_stats() to anon, authenticated;
