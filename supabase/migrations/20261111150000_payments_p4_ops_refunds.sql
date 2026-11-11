-- P4: operations payments dashboard (money states, audited refunds, webhook visibility).
--
-- P1a-P3 built the payment state machine, the hosted checkout, provider webhook
-- ingestion and the paid notices, but ops could only read four aggregate counters and
-- refund through an API without a surface. This migration adds the read models the
-- dashboard needs and makes refunds record when they happened:
--   * booking_payments.refunded_at is set by the existing audited refund RPC;
--   * kinnso_ops_payments_list lists recent payments with their money state, guide,
--     provider, deadline, paid/refunded timestamps and the latest ledger event;
--   * kinnso_ops_payment_detail returns one payment, its booking context and its
--     event timeline (the audit trail, including the refund reason and actor);
--   * kinnso_ops_webhook_events lists ingested provider events with the ignored
--     reason (amount/currency mismatch, late event, unmapped payment) and counts, so
--     a failed or misconfigured webhook is visible instead of silent.
-- Every read model re-checks is_active_ops(); gestures stay server-side. Live provider
-- refunds remain unavailable until P5 (the RPC still requires the fake provider).
alter table public.booking_payments add column if not exists refunded_at timestamptz;

-- Refund: same audited contract as P1a, now with the refund timestamp recorded.
create or replace function public.kinnso_ops_refund_payment(p_payment_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payment public.booking_payments;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 or char_length(v_reason) > 500 then raise exception 'invalid_reason'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.status <> 'paid' then raise exception 'payment_not_refundable'; end if;
  if v_payment.provider <> 'fake' then raise exception 'provider_refund_not_implemented'; end if;
  update public.booking_payments
     set status = 'refunded', refunded_at = now(), updated_at = now()
   where id = v_payment.id;
  insert into public.payment_events (booking_payment_id, kind, payload)
    values (v_payment.id, 'payment.refunded',
            jsonb_build_object('reason', v_reason, 'actorId', v_actor, 'amountMinor', v_payment.amount_minor,
                               'currency', btrim(v_payment.currency::text)));
  update public.booking_requests set status = 'refunded', updated_at = now()
   where id = v_payment.booking_request_id and status in ('awaiting_payment', 'paid');
  return jsonb_build_object('id', v_payment.id, 'status', 'refunded',
                            'refundedAt', now(), 'refundedAmountMinor', v_payment.amount_minor);
end $$;
revoke all on function public.kinnso_ops_refund_payment(uuid, text) from public, anon;
grant execute on function public.kinnso_ops_refund_payment(uuid, text) to authenticated;

-- Read model: recent payments with the state an operator needs to reconcile.
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

-- Read model: one payment with its audit trail (bounded, whitelisted payload keys).
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

-- Read model: provider webhook ledger, including ignored/failed reasons.
create or replace function public.kinnso_ops_webhook_events(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_counts jsonb;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'eventId', e.provider_event_id,
      'kind', e.kind,
      'eventType', e.payload ->> 'eventType',
      'provider', e.payload ->> 'provider',
      'ignored', e.payload ->> 'ignored',
      'late', e.payload ->> 'late',
      'amountTotal', e.payload ->> 'amountTotal',
      'currency', e.payload ->> 'currency',
      'paymentId', e.booking_payment_id,
      'bookingRequestId', bp.booking_request_id,
      'paymentStatus', bp.status,
      'createdAt', e.created_at)
      order by e.created_at desc, e.id desc), '[]'::jsonb)
    into v_items
    from (select * from public.payment_events
           where provider_event_id is not null
           order by created_at desc, id desc limit v_limit) e
    left join public.booking_payments bp on bp.id = e.booking_payment_id;
  select coalesce(jsonb_object_agg(reason, total order by reason), '{}'::jsonb)
    into v_counts
    from (
      select coalesce(payload ->> 'ignored', 'processed') as reason, count(*) as total
        from public.payment_events
       where provider_event_id is not null
       group by 1
    ) counted;
  return jsonb_build_object(
    'items', v_items,
    'counts', v_counts,
    'total', (select count(*) from public.payment_events where provider_event_id is not null));
end $$;
revoke all on function public.kinnso_ops_webhook_events(integer) from public, anon;
grant execute on function public.kinnso_ops_webhook_events(integer) to authenticated;
