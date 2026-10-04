-- supabase/migrations/20260708100000_r5_fix_rsvp_cancelled_session_check.sql

-- Fix: session_rsvps_insert's original WITH CHECK only verified NULL-safe identity
-- ownership (user_id is null or user_id = auth.uid()), not whether the target
-- session was still open for RSVPs. Neither this policy nor the app-layer
-- rsvpToSessionAction checked session status, so a visitor could RSVP to an
-- already-cancelled session and receive a false "you're on the list" confirmation.
-- This tightens the RLS policy itself (the real enforcement boundary) in addition
-- to a matching app-layer check in rsvpToSessionAction, which gives a clean error
-- message instead of a raw RLS-insert failure.

drop policy if exists session_rsvps_insert on public.session_rsvps;

create policy session_rsvps_insert on public.session_rsvps
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and exists (
      select 1 from public.community_sessions cs
      where cs.id = session_rsvps.session_id and cs.status <> 'cancelled'
    )
  );
