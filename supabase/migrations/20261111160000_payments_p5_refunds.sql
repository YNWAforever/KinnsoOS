-- P5a: live-mode refunds for the Stripe adapter and the live-readiness surface.
--
-- P4 refunds never leave our database: the audited RPC flips the fake payment to
-- refunded and records why. Live money needs the provider call first. This migration
-- adds the provider refund id, an ops-only refund context read (provider, intent,
-- amount, status) and an ops-only recorder that stores a refund after the provider
-- accepted it. The old fake-only RPC stays for local tooling but the app route now
-- goes through the provider adapter and records the provider refund id, so a Stripe
-- refund is auditable and replay-safe (the recorder refuses a second refund).
alter table public.booking_payments add column if not exists provider_refund_id text;

-- Ops-only context needed before a provider refund call. No secret, no card data.
create or replace function public.kinnso_ops_refund_context(p_payment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payment public.booking_payments;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_payment_id is null then raise exception 'payment_not_found'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  return jsonb_build_object(
    'paymentId', v_payment.id,
    'bookingRequestId', v_payment.booking_request_id,
    'status', v_payment.status,
    'provider', v_payment.provider,
    'providerPaymentIntentId', v_payment.provider_payment_intent_id,
    'amountMinor', v_payment.amount_minor,
    'currency', btrim(v_payment.currency::text),
    'paidAt', v_payment.paid_at,
    'refundedAt', v_payment.refunded_at);
end $$;
revoke all on function public.kinnso_ops_refund_context(uuid) from public, anon;
grant execute on function public.kinnso_ops_refund_context(uuid) to authenticated;

-- Record a refund the provider accepted. The provider call happens in the API route;
-- this RPC is the authoritative, audited, one-way transition. A second record for the
-- same payment is refused, so a retried provider refund cannot double-record.
create or replace function public.kinnso_ops_record_refund(
  p_payment_id uuid,
  p_provider_refund_id text,
  p_reason text,
  p_amount_minor integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider_refund text := nullif(btrim(coalesce(p_provider_refund_id, '')), '');
  v_payment public.booking_payments;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then raise exception 'invalid_reason'; end if;
  if v_provider_refund is null or char_length(v_provider_refund) > 200 then raise exception 'invalid_provider_refund'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.status <> 'paid' then raise exception 'payment_not_refundable'; end if;
  if v_payment.provider_refund_id is not null then raise exception 'payment_not_refundable'; end if;
  if p_amount_minor is not null and p_amount_minor <> v_payment.amount_minor then raise exception 'invalid_refund_amount'; end if;
  update public.booking_payments
     set status = 'refunded', refunded_at = now(), provider_refund_id = v_provider_refund,
         updated_at = now()
   where id = v_payment.id;
  insert into public.payment_events (booking_payment_id, kind, payload)
    values (v_payment.id, 'payment.refunded',
            jsonb_build_object('reason', v_reason, 'actorId', v_actor,
                               'provider', v_payment.provider,
                               'providerRefundId', v_provider_refund,
                               'amountMinor', v_payment.amount_minor,
                               'currency', btrim(v_payment.currency::text)));
  update public.booking_requests set status = 'refunded', updated_at = now()
   where id = v_payment.booking_request_id and status in ('awaiting_payment', 'paid');
  return jsonb_build_object('id', v_payment.id, 'status', 'refunded',
                            'providerRefundId', v_provider_refund,
                            'refundedAt', now(), 'refundedAmountMinor', v_payment.amount_minor);
end $$;
revoke all on function public.kinnso_ops_record_refund(uuid, text, text, integer) from public, anon;
grant execute on function public.kinnso_ops_record_refund(uuid, text, text, integer) to authenticated;

-- Surface the provider refund id in the dashboard read models (same signatures).
create or replace function public.kinnso_ops_payments_list(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_items jsonb;
  v_has_more boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'paymentId', p.id,
      'bookingRequestId', p.booking_request_id,
      'status', p.status,
      'amountMinor', p.amount_minor,
      'currency', btrim(p.currency::text),
      'provider', p.provider,
      'providerRefundId', p.provider_refund_id,
      'guideTitle', g.title,
      'startsOn', r.starts_on,
      'endsOn', r.ends_on,
      'partySize', r.party_size,
      'travelerUserId', p.traveler_user_id,
      'createdAt', p.created_at,
      'deadlineAt', p.deadline_at,
      'processingAt', p.checkout_started_at,
      'paidAt', p.paid_at,
      'refundedAt', p.refunded_at,
      'providerEventCount', (select count(*) from public.payment_events e
                              where e.booking_payment_id = p.id and e.provider_event_id is not null),
      'lastEventKind', (select e.kind from public.payment_events e
                         where e.booking_payment_id = p.id order by e.created_at desc, e.id desc limit 1),
      'lastIgnoredReason', (select e.payload ->> 'ignored' from public.payment_events e
                             where e.booking_payment_id = p.id and e.payload ? 'ignored'
                             order by e.created_at desc, e.id desc limit 1),
      'lastEventAt', (select max(e.created_at) from public.payment_events e
                       where e.booking_payment_id = p.id))
      order by p.created_at desc, p.id), '[]'::jsonb)
    into v_items
    from (
      select * from public.booking_payments order by created_at desc, id limit v_limit + 1
    ) p
    join public.booking_requests r on r.id = p.booking_request_id
    join public.guides g on g.id = r.guide_id;
  v_has_more := coalesce(jsonb_array_length(v_items), 0) > v_limit;
  if v_has_more then
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord <= v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'hasMore', v_has_more);
end $$;
revoke all on function public.kinnso_ops_payments_list(integer) from public, anon;
grant execute on function public.kinnso_ops_payments_list(integer) to authenticated;

create or replace function public.kinnso_ops_payment_detail(p_payment_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payment public.booking_payments;
  v_booking public.booking_requests;
  v_title text;
  v_events jsonb;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_payment_id is null then raise exception 'payment_not_found'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  select * into v_booking from public.booking_requests where id = v_payment.booking_request_id;
  select g.title into v_title from public.guides g where g.id = v_booking.guide_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', e.kind,
      'providerEventId', e.provider_event_id,
      'createdAt', e.created_at,
      'provider', e.payload ->> 'provider',
      'providerRefundId', e.payload ->> 'providerRefundId',
      'amountMinor', e.payload ->> 'amountMinor',
      'currency', e.payload ->> 'currency',
      'ignored', e.payload ->> 'ignored',
      'late', e.payload ->> 'late',
      'reason', e.payload ->> 'reason',
      'actorId', e.payload ->> 'actorId',
      'eventType', e.payload ->> 'eventType')
      order by e.created_at, e.id), '[]'::jsonb)
    into v_events
    from (select * from public.payment_events
           where booking_payment_id = v_payment.id
           order by created_at desc, id desc limit 50) e;
  return jsonb_build_object(
    'payment', jsonb_build_object(
      'paymentId', v_payment.id, 'bookingRequestId', v_payment.booking_request_id,
      'status', v_payment.status, 'amountMinor', v_payment.amount_minor,
      'currency', btrim(v_payment.currency::text), 'provider', v_payment.provider,
      'providerPaymentIntentId', v_payment.provider_payment_intent_id,
      'providerRefundId', v_payment.provider_refund_id,
      'createdAt', v_payment.created_at, 'deadlineAt', v_payment.deadline_at,
      'paidAt', v_payment.paid_at, 'refundedAt', v_payment.refunded_at),
    'booking', jsonb_build_object(
      'bookingRequestId', v_booking.id, 'guideTitle', v_title,
      'startsOn', v_booking.starts_on, 'endsOn', v_booking.ends_on,
      'partySize', v_booking.party_size, 'status', v_booking.status),
    'events', v_events);
end $$;
revoke all on function public.kinnso_ops_payment_detail(uuid) from public, anon;
grant execute on function public.kinnso_ops_payment_detail(uuid) to authenticated;
