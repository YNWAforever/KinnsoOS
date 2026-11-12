-- P5e: reconcile refunds created outside KinnsoOS (Stripe Dashboard / API) from the
-- signed provider webhook, and keep the single-payment expiry path consistent.
--
-- Refunds initiated in the ops dashboard are provider-first and audited (P5a). A refund
-- created directly in Stripe previously left our payment at `paid` until someone
-- noticed: the provider's `charge.refunded` event was recorded as an unsupported or
-- bare ledger row. This migration adds a service-role-only ingestion path that resolves
-- the payment from the stored payment intent, records exactly one audited provider
-- refund, and only flips state for a full refund of the expected amount. Partial
-- refunds, unknown intents and races are recorded as audit rows for manual
-- reconciliation instead of guessing.
--
-- It also extracts the P5d per-payment expiry into kinnso_internal.expire_payment() so
-- the fake-confirm "deadline already passed" path emits the same notices as the sweep.

create index if not exists booking_payments_provider_intent_idx
  on public.booking_payments (provider, provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create or replace function kinnso_internal.expire_payment(p_payment_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_title text;
  v_starts date;
  v_ends date;
  v_party integer;
  v_payload jsonb;
begin
  update public.booking_payments
     set status = 'expired', updated_at = now()
   where id = p_payment_id and status in ('requires_payment', 'processing') and deadline_at < now()
   returning id, booking_request_id, traveler_user_id, creator_id, amount_minor, currency into v_row;
  if not found then return false; end if;
  update public.booking_requests r
     set status = 'payment_expired', updated_at = now()
   where r.id = v_row.booking_request_id and r.status = 'awaiting_payment';
  insert into public.payment_events (booking_payment_id, kind, payload)
    values (v_row.id, 'payment.expired', '{}'::jsonb);
  select b.starts_on, b.ends_on, b.party_size, g.title
    into v_starts, v_ends, v_party, v_title
    from public.booking_requests b
    left join public.guides g on g.id = b.guide_id
   where b.id = v_row.booking_request_id;
  v_payload := jsonb_build_object(
    'guideTitle', v_title, 'startsOn', v_starts, 'endsOn', v_ends,
    'partySize', v_party, 'status', 'payment_expired',
    'amountMinor', v_row.amount_minor, 'currency', btrim(v_row.currency::text));
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_row.traveler_user_id, 'booking.payment_expired', 'booking_request', v_row.booking_request_id
    where v_row.traveler_user_id is not null
      and not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.traveler_user_id
                         and nm.event_type = 'booking.payment_expired' and nm.muted);
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_row.creator_id, 'booking.payment_window_expired', 'booking_request_creator', v_row.booking_request_id
    where v_row.creator_id is not null
      and not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.creator_id
                         and nm.event_type = 'booking.payment_window_expired' and nm.muted);
  perform kinnso_internal.enqueue_booking_email(v_row.traveler_user_id, 'booking.payment_expired',
    'booking_request', v_row.booking_request_id, v_payload);
  perform kinnso_internal.enqueue_booking_email(v_row.creator_id, 'booking.payment_window_expired',
    'booking_request', v_row.booking_request_id, v_payload);
  return true;
end $$;
revoke all on function kinnso_internal.expire_payment(uuid) from public, anon, authenticated;

create or replace function kinnso_internal.expire_payment_windows() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.booking_payments
     where status in ('requires_payment', 'processing') and deadline_at < now()
  loop
    if kinnso_internal.expire_payment(v_id) then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;
revoke all on function kinnso_internal.expire_payment_windows() from public, anon, authenticated;

create or replace function public.kinnso_traveller_confirm_fake_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_payment public.booking_payments;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not kinnso_internal.payments_enabled() then raise exception 'payments_disabled'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.traveler_user_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_payment.provider <> 'fake' then raise exception 'fake_provider_required'; end if;
  if v_payment.status = 'paid' then
    return jsonb_build_object('paymentId', v_payment.id, 'status', v_payment.status,
                              'paidAt', v_payment.paid_at, 'replayed', true);
  end if;
  if v_payment.status not in ('requires_payment', 'processing') then raise exception 'payment_not_payable'; end if;
  if v_payment.deadline_at < now() then
    -- One rule: the per-payment expiry emits the ledger event and both notices.
    perform kinnso_internal.expire_payment(v_payment.id);
    select * into v_payment from public.booking_payments where id = p_payment_id;
    -- Soft result so the caller can say "expired" while the expiry itself persists.
    return jsonb_build_object('paymentId', v_payment.id, 'status', v_payment.status, 'paidAt', null, 'expired', true);
  end if;
  perform kinnso_internal.mark_payment_paid(v_payment.id, 'fake_' || replace(gen_random_uuid()::text, '-', ''));
  select * into v_payment from public.booking_payments where id = p_payment_id;
  return jsonb_build_object('paymentId', v_payment.id, 'status', v_payment.status,
                            'paidAt', v_payment.paid_at, 'replayed', false);
end $$;

create or replace function public.kinnso_payment_refund_ingest(
  p_provider text, p_event_id text, p_event_type text, p_payment_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payment public.booking_payments;
  v_event uuid;
  v_intent text;
  v_refund_id text;
  v_amount bigint;
  v_currency text;
  v_ignored text;
begin
  if p_provider is null or p_provider not in ('fake', 'stripe') then raise exception 'invalid_webhook'; end if;
  if p_event_id is null or btrim(p_event_id) = '' or char_length(p_event_id) > 200 then raise exception 'invalid_webhook'; end if;
  if p_event_type is null or char_length(p_event_type) > 100 then raise exception 'invalid_webhook'; end if;
  if octet_length(v_payload::text) > 20000 then raise exception 'invalid_webhook'; end if;
  if exists (select 1 from public.payment_events where provider_event_id = p_event_id) then
    return jsonb_build_object('received', true, 'replayed', true);
  end if;
  v_intent := nullif(btrim(coalesce(v_payload ->> 'paymentIntentId', '')), '');
  if p_payment_id is not null then
    select * into v_payment from public.booking_payments where id = p_payment_id;
  elsif v_intent is not null then
    select * into v_payment from public.booking_payments
     where provider = p_provider and provider_payment_intent_id = v_intent
     order by created_at desc limit 1;
  end if;
  if v_payment.id is null then
    insert into public.payment_events (provider_event_id, kind, payload)
      values (p_event_id, 'payment.refunded',
              v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', 'payment_not_found'))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'payment_not_found');
  end if;
  v_refund_id := nullif(btrim(coalesce(v_payload ->> 'refundId', '')), '');
  if jsonb_typeof(v_payload -> 'amountRefunded') = 'number' then
    v_amount := (v_payload ->> 'amountRefunded')::bigint;
  end if;
  if v_refund_id is null or char_length(v_refund_id) > 200 or v_amount is null then
    insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
      values (v_payment.id, p_event_id, 'payment.refunded',
              v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', 'refund_fields_missing'))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'refund_fields_missing');
  end if;
  v_currency := upper(nullif(btrim(coalesce(v_payload ->> 'currency', '')), ''));
  if v_payment.provider <> p_provider then
    v_ignored := 'provider_mismatch';
  elsif v_payment.status = 'refunded' then
    v_ignored := 'already_refunded';
  elsif v_payment.status <> 'paid' then
    v_ignored := 'not_refundable';
  elsif v_amount <> v_payment.amount_minor::bigint then
    v_ignored := case when v_amount < v_payment.amount_minor::bigint then 'partial_refund' else 'amount_mismatch' end;
  elsif v_currency is not null and v_currency <> btrim(v_payment.currency::text) then
    v_ignored := 'currency_mismatch';
  end if;
  if v_ignored is not null then
    insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
      values (v_payment.id, p_event_id, 'payment.refunded',
              v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', v_ignored))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', v_ignored);
  end if;
  update public.booking_payments
     set status = 'refunded', refunded_at = now(), provider_refund_id = v_refund_id, updated_at = now()
   where id = v_payment.id and status = 'paid'
   returning * into v_payment;
  if not found then
    insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
      values (v_payment.id, p_event_id, 'payment.refunded',
              v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', 'already_refunded'))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'already_refunded');
  end if;
  update public.booking_requests
     set status = 'refunded', updated_at = now()
   where id = v_payment.booking_request_id and status = 'paid';
  insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
    values (v_payment.id, p_event_id, 'payment.refunded',
            v_payload || jsonb_build_object(
              'provider', p_provider, 'eventType', p_event_type, 'reason', 'provider_refund',
              'source', 'webhook', 'providerRefundId', v_refund_id,
              'amountMinor', v_payment.amount_minor, 'currency', btrim(v_payment.currency::text)))
    on conflict (provider_event_id) do nothing
    returning id into v_event;
  return jsonb_build_object(
    'received', true, 'replayed', v_event is null, 'refunded', true,
    'paymentId', v_payment.id, 'providerRefundId', v_refund_id,
    'bookingRequestId', v_payment.booking_request_id);
end $$;
revoke all on function public.kinnso_payment_refund_ingest(text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kinnso_payment_refund_ingest(text, text, text, uuid, jsonb) to service_role;
