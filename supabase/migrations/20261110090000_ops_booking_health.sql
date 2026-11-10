-- Ops booking-queue health.
--
-- The ops health page reported content, cost and model state but nothing about the
-- booking queue, so a pile of requests waiting for a creator could go unnoticed.
-- This ops-gated read-only RPC summarises pending decisions, their age, recent
-- outcomes and active availability blocks.
create or replace function public.kinnso_ops_booking_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pending bigint;
  v_stale bigint;
  v_oldest_hours bigint;
  v_accepted bigint;
  v_declined bigint;
  v_withdrawn bigint;
  v_blocked bigint;
  v_muted bigint;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*), count(*) filter (where r.created_at < now() - interval '72 hours'),
         coalesce(floor(extract(epoch from now() - min(r.created_at)) / 3600), 0)
    into v_pending, v_stale, v_oldest_hours
    from public.booking_requests r where r.status = 'requested';
  select count(*) filter (where r.status = 'accepted'),
         count(*) filter (where r.status = 'declined'),
         count(*) filter (where r.status = 'withdrawn')
    into v_accepted, v_declined, v_withdrawn
    from public.booking_requests r where r.updated_at >= now() - interval '7 days';
  select count(*) into v_blocked from public.guide_unavailable_dates;
  select count(distinct nm.user_id) into v_muted from public.notification_mutes nm where nm.muted;
  return jsonb_build_object(
    'pending', v_pending,
    'stalePending', v_stale,
    'oldestPendingHours', v_oldest_hours,
    'acceptedLast7d', v_accepted,
    'declinedLast7d', v_declined,
    'withdrawnLast7d', v_withdrawn,
    'blockedRanges', v_blocked,
    'mutedAccounts', v_muted
  );
end $$;

revoke all on function public.kinnso_ops_booking_health() from public, anon;
grant execute on function public.kinnso_ops_booking_health() to authenticated;
