-- P5c: scheduled expiry sweep for payment windows.
--
-- P1 created kinnso_internal.expire_payment_windows() (7-day deadline: unpaid
-- requires_payment rows become expired, the booking becomes payment_expired and a
-- payment.expired ledger event is written), but nothing ever called it: there was no
-- cron endpoint, so an unpaid accepted trip would block indefinitely. This migration
-- publishes a narrow caller that the scheduler (service role) and an active operator
-- may invoke; the internal function stays locked down. It also fixes a P1 gap: the
-- sweep only expired `requires_payment`, so a traveller who opened and abandoned the
-- hosted checkout (status `processing`) could hold a trip past the deadline forever.
-- Both unpaid states now expire.
create or replace function kinnso_internal.expire_payment_windows() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.booking_payments
       set status = 'expired', updated_at = now()
     where status in ('requires_payment', 'processing') and deadline_at < now()
     returning id, booking_request_id
  ), moved as (
    update public.booking_requests r
       set status = 'payment_expired', updated_at = now()
      from expired e
     where r.id = e.booking_request_id and r.status = 'awaiting_payment'
     returning 1
  ), logged as (
    insert into public.payment_events (booking_payment_id, kind, payload)
    select id, 'payment.expired', '{}'::jsonb from expired
    returning 1
  )
  select count(*) into v_count from expired;
  return coalesce(v_count, 0);
end $$;
revoke all on function kinnso_internal.expire_payment_windows() from public, anon, authenticated;

create or replace function public.kinnso_payment_sweep_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text := coalesce(
    case when v_claims is not null then (v_claims::jsonb)->>'role' end,
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  v_count integer;
begin
  if v_role <> 'service_role' and not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_count := kinnso_internal.expire_payment_windows();
  return jsonb_build_object('expired', coalesce(v_count, 0), 'sweptAt', now());
end $$;
revoke all on function public.kinnso_payment_sweep_expired() from public, anon;
grant execute on function public.kinnso_payment_sweep_expired() to authenticated, service_role;
