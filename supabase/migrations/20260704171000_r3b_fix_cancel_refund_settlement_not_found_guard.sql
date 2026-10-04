-- Code-quality review for Task 4 found that admin_cancel_and_refund_booking()'s
-- UPDATE on booking_settlements had no `not found` guard, unlike
-- admin_set_booking_settlement_status()'s (Task 2) own `for update` + `not found`
-- pattern against the same table. Currently unreachable (Task 1's trigger creates a
-- settlement row for every confirmed booking, on conflict do nothing), but this RPC
-- shouldn't rely entirely on a different migration's invariant holding forever --
-- a missing settlement row should surface as a loud error, not a silent zero-row
-- update that still logs success via booking_events/ops_audit_log_append.
create or replace function public.admin_cancel_and_refund_booking(
  p_booking_id uuid,
  p_stripe_refund_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_settlement_id uuid;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if coalesce(btrim(p_stripe_refund_id), '') = '' then raise exception 'refund_id_required'; end if;

  select status into v_status from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status not in ('confirmed', 'completed') then raise exception 'bad_transition'; end if;

  select id into v_settlement_id from public.booking_settlements where booking_id = p_booking_id for update;
  if not found then raise exception 'settlement_not_found'; end if;

  update public.bookings
    set status = 'refunded', updated_at = now()
    where id = p_booking_id;

  update public.booking_settlements
    set status = 'disputed',
        ops_note = p_reason,
        updated_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
        updated_at = now()
    where id = v_settlement_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'ops_cancelled_refunded', jsonb_build_object(
    'stripe_refund_id', p_stripe_refund_id, 'reason', p_reason
  ));

  perform public.ops_audit_log_append('booking', p_booking_id, 'booking.refund', p_reason,
    jsonb_build_object('stripe_refund_id', p_stripe_refund_id));
end;
$$;
