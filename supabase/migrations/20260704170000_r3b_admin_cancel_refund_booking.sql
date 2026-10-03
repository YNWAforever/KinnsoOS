-- supabase/migrations/20260704170000_r3b_admin_cancel_refund_booking.sql

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

  update public.bookings
    set status = 'refunded', updated_at = now()
    where id = p_booking_id;

  update public.booking_settlements
    set status = 'disputed',
        ops_note = p_reason,
        updated_by_ops_member_id = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
        updated_at = now()
    where booking_id = p_booking_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (p_booking_id, 'ops_cancelled_refunded', jsonb_build_object(
    'stripe_refund_id', p_stripe_refund_id, 'reason', p_reason
  ));

  perform public.ops_audit_log_append('booking', p_booking_id, 'booking.refund', p_reason,
    jsonb_build_object('stripe_refund_id', p_stripe_refund_id));
end;
$$;

revoke all on function public.admin_cancel_and_refund_booking from public, anon, authenticated;
grant execute on function public.admin_cancel_and_refund_booking to authenticated;
