-- Aggregate launch digest for the scheduler (no identities, no notes, no content).
--
-- The scheduler has no ops session, so it cannot read sign-offs. This exposes
-- counts only — enough for a daily reminder that waivers are expiring or have
-- expired, which is exactly how "no stale waivers" gets noticed before the gate
-- flips back to hold.
create function public.kinnso_public_launch_digest()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_accepted integer;
  v_waived integer;
  v_active integer;
  v_expiring integer;
  v_expired integer;
  v_rejected integer;
begin
  with latest as (
    select distinct on (gate) status, expires_at
      from kinnso_internal.launch_signoffs
     order by gate, created_at desc
  )
  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'waived'),
         count(*) filter (where status = 'waived' and expires_at is not null and expires_at > now()),
         count(*) filter (where status = 'waived' and expires_at is not null and expires_at > now() and expires_at <= now() + interval '14 days'),
         count(*) filter (where status = 'waived' and (expires_at is null or expires_at <= now())),
         count(*) filter (where status = 'rejected')
    into v_accepted, v_waived, v_active, v_expiring, v_expired, v_rejected
    from latest;

  return jsonb_build_object(
    'snapshotAt', now(),
    'signoffsAccepted', v_accepted,
    'waiversActive', v_active,
    'waiversExpiringSoon', v_expiring,
    'waiversExpired', v_expired,
    'rejectedGates', v_rejected,
    'signoffsPending', greatest(0, 6 - v_accepted - v_waived - v_rejected));
end $$;

revoke all on function public.kinnso_public_launch_digest() from public, anon;
grant execute on function public.kinnso_public_launch_digest() to anon, authenticated;

comment on function public.kinnso_public_launch_digest() is
  'Aggregate launch/waiver counts for scheduled reminders; no identities, notes or content.';
