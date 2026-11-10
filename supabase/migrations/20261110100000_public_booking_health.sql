-- Booking queue fields on the public health snapshot.
--
-- The scheduled health alert can only call anonymous RPCs (no service key), so the
-- booking-queue summary is added to the existing aggregate-only public snapshot.
-- These are counts and an age only: no traveller, creator or guide identity is
-- exposed. Scheduled alerting uses stalePendingBookingRequests to warn at most once
-- a day while requests wait longer than 72 hours.
create or replace function public.kinnso_public_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published integer;
  v_synthetic integer;
  v_attested integer;
  v_verified integer;
  v_turns integer;
  v_pending integer;
  v_stale integer;
  v_oldest_hours integer;
begin
  select count(*) filter (where status = 'published'),
         count(*) filter (where status = 'published' and synthetic),
         count(*) filter (where status = 'published' and not synthetic and exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)),
         count(*) filter (where status = 'published' and not synthetic and exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)
           and jsonb_array_length(g.source_refs) > 0 and g.place_verified_at is not null)
    into v_published, v_synthetic, v_attested, v_verified
    from public.guides g;

  select coalesce(sum(used), 0)::integer into v_turns
    from kinnso_internal.chat_turn_budget
   where window_start = date_trunc('hour', now());

  select count(*) filter (where status = 'requested'),
         count(*) filter (where status = 'requested' and created_at < now() - interval '72 hours')
    into v_pending, v_stale
    from public.booking_requests;

  select coalesce(floor(extract(epoch from now() - min(created_at)) / 3600), 0)::integer
    into v_oldest_hours
    from public.booking_requests
   where status = 'requested';

  return jsonb_build_object(
    'snapshotAt', now(),
    'publishedGuides', v_published,
    'syntheticGuides', v_synthetic,
    'attestedGuides', v_attested,
    'verifiedGuides', v_verified,
    'chatTurnsUsedThisHour', v_turns,
    'pendingBookingRequests', v_pending,
    'stalePendingBookingRequests', v_stale,
    'oldestPendingBookingHours', v_oldest_hours);
end $$;

revoke all on function public.kinnso_public_health() from public;
grant execute on function public.kinnso_public_health() to anon, authenticated;
