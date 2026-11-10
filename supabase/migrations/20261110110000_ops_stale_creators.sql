-- Per-creator stale booking queues in the ops summary.
--
-- The previous version reported only global pending/stale counts, so an operator
-- could not tell whose inbox was ageing. This replacement adds staleCreators: up
-- to ten creators with requests older than 72 hours, each with a count and the
-- oldest age. Ops-gated like the rest of the RPC.
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
  v_stale_creators jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object(
      'creatorId', s.creator_id,
      'creatorName', s.display_name,
      'pending', s.pending,
      'oldestPendingHours', s.oldest_hours) order by s.oldest_hours desc, s.creator_id), '[]'::jsonb)
    into v_stale_creators
    from (
      select r.creator_id, coalesce(nullif(c.display_name, ''), nullif(c.handle, ''), 'creator ' || left(r.creator_id::text, 8)) as display_name,
             count(*) as pending,
             floor(extract(epoch from now() - min(r.created_at)) / 3600)::bigint as oldest_hours
        from public.booking_requests r
        join public.creators c on c.id = r.creator_id
       where r.status = 'requested' and r.created_at < now() - interval '72 hours'
       group by r.creator_id, c.display_name, c.handle
       order by oldest_hours desc
       limit 10
    ) s;
  return jsonb_build_object(
    'pending', v_pending,
    'stalePending', v_stale,
    'oldestPendingHours', v_oldest_hours,
    'acceptedLast7d', v_accepted,
    'declinedLast7d', v_declined,
    'withdrawnLast7d', v_withdrawn,
    'blockedRanges', v_blocked,
    'mutedAccounts', v_muted,
    'staleCreators', v_stale_creators
  );
end $$;

revoke all on function public.kinnso_ops_booking_health() from public, anon;
grant execute on function public.kinnso_ops_booking_health() to authenticated;
