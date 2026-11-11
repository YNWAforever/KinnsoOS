-- P3: signed provider webhooks, an idempotent payment ledger and paid notices.
--
-- Accepting a priced request creates an obligation and P2 hands the traveller to a
-- provider-hosted checkout. This migration ingests the provider's signed events:
-- `payment_events.provider_event_id` is the idempotency key and the only state change
-- a provider can cause is the paid transition. Confirming a payment now emits the
-- traveller/creator inbox notices and, when the email outbox flag is on, the existing
-- email outbox rows in the same transaction. The payments flag stays off and nothing
-- here charges anything by itself.
--
-- The public wrapper is service-role only: the app verifies the provider signature
-- first and then calls it with the server-only service key. The fake provider has no
-- real webhook; local acceptance signs the same payload shape with a test secret.

-- 1. Provider events stay unique per provider_event_id; make the ledger browsable.
create index if not exists payment_events_provider_idx
  on public.payment_events (kind, created_at desc) where provider_event_id is not null;

-- 2. Widen the in-app inbox vocabulary for paid notices.
alter table kinnso_internal.inbox_events drop constraint if exists inbox_events_event_type_check;
alter table kinnso_internal.inbox_events add constraint inbox_events_event_type_check check (
  event_type = any (array['place.report_revision','place.report_resolved','support.updated',
                           'booking.requested','booking.accepted','booking.declined','booking.withdrawn',
                           'booking.dates_blocked','booking.paid','booking.payment_received']));

-- 3. Widen the mute vocabulary: traveller paid notice and creator received notice.
alter table public.notification_mutes drop constraint if exists notification_mutes_event_type_check;
alter table public.notification_mutes add constraint notification_mutes_event_type_check
  check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined',
                        'booking.dates_blocked','booking.paid','booking.payment_received'));

-- 3b. The email outbox accepts the same two paid notices; otherwise the paid
-- transition would roll back while the outbox flag is on.
alter table public.email_outbox drop constraint if exists email_outbox_event_type_check;
alter table public.email_outbox add constraint email_outbox_event_type_check
  check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined',
                        'booking.dates_blocked','booking.paid','booking.payment_received'));

create or replace function public.kinnso_get_notification_mutes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'eventType', t.event_type,
      'muted', coalesce(m.muted, false)) order by t.position), '[]'::jsonb)
  from (values
    ('booking.requested', 1), ('booking.withdrawn', 2), ('booking.accepted', 3),
    ('booking.declined', 4), ('booking.dates_blocked', 5),
    ('booking.paid', 6), ('booking.payment_received', 7)) as t(event_type, position)
  left join public.notification_mutes m
    on m.user_id = kinnso_internal.actor() and m.event_type = t.event_type
  where kinnso_internal.actor() is not null;
$$;

create or replace function public.kinnso_set_notification_mute(p_event_type text, p_muted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_event_type is null or p_event_type not in ('booking.requested','booking.withdrawn','booking.accepted',
       'booking.declined','booking.dates_blocked','booking.paid','booking.payment_received') then
    raise exception 'invalid_event_type';
  end if;
  if p_muted is null then raise exception 'invalid_preference'; end if;
  insert into public.notification_mutes (user_id, event_type, muted)
    values (v_actor, p_event_type, p_muted)
    on conflict (user_id, event_type) do update set muted = excluded.muted, updated_at = now();
  return jsonb_build_object('eventType', p_event_type, 'muted', p_muted);
end $$;

-- 4. mark_payment_paid: replay-safe via provider_event_id, and it now emits the paid
-- notices in the same transaction. The optional provider event id keeps provider
-- retries from double-recording; a fake confirmation passes no id (no provider event).
drop function if exists kinnso_internal.mark_payment_paid(uuid, text);
create or replace function kinnso_internal.mark_payment_paid(
  p_payment_id uuid, p_provider_payment_intent_id text, p_provider_event_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.booking_payments;
  v_booking public.booking_requests;
  v_event uuid;
  v_title text;
  v_payload jsonb;
begin
  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_payable'; end if;
  if p_provider_event_id is not null
     and exists (select 1 from public.payment_events where provider_event_id = p_provider_event_id) then
    return jsonb_build_object('id', v_payment.id, 'status', v_payment.status,
                              'paidAt', v_payment.paid_at, 'replayed', true);
  end if;
  if v_payment.status not in ('requires_payment', 'processing') then
    -- A late provider event never flips an expired/refunded/already-paid row; keep it
    -- in the ledger so ops can investigate the money instead of losing the notice.
    if p_provider_event_id is not null then
      insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
        values (v_payment.id, p_provider_event_id, 'payment.paid',
                jsonb_build_object('provider', v_payment.provider, 'late', true, 'status', v_payment.status))
        on conflict (provider_event_id) do nothing;
    end if;
    return jsonb_build_object('id', v_payment.id, 'status', v_payment.status,
                              'paidAt', v_payment.paid_at, 'ignored', true);
  end if;
  insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
    values (v_payment.id, p_provider_event_id, 'payment.paid',
            jsonb_build_object('provider', v_payment.provider, 'amountMinor', v_payment.amount_minor,
                               'currency', btrim(v_payment.currency::text)))
    on conflict (provider_event_id) do nothing
    returning id into v_event;
  if v_event is null then
    return jsonb_build_object('id', v_payment.id, 'status', v_payment.status,
                              'paidAt', v_payment.paid_at, 'replayed', true);
  end if;
  update public.booking_payments
     set status = 'paid', paid_at = now(),
         provider_payment_intent_id = coalesce(
           nullif(btrim(coalesce(p_provider_payment_intent_id, '')), ''),
           provider_payment_intent_id),
         updated_at = now()
   where id = v_payment.id
   returning * into v_payment;
  select * into v_booking from public.booking_requests where id = v_payment.booking_request_id;
  update public.booking_requests set status = 'paid', updated_at = now()
   where id = v_payment.booking_request_id and status = 'awaiting_payment';
  select g.title into v_title from public.guides g where g.id = v_booking.guide_id;
  v_payload := jsonb_build_object(
    'guideTitle', v_title, 'startsOn', v_booking.starts_on, 'endsOn', v_booking.ends_on,
    'partySize', v_booking.party_size, 'status', 'paid',
    'amountMinor', v_payment.amount_minor, 'currency', btrim(v_payment.currency::text));
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_payment.traveler_user_id, 'booking.paid', 'booking_request', v_payment.booking_request_id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_payment.traveler_user_id and nm.event_type = 'booking.paid' and nm.muted);
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_payment.creator_id, 'booking.payment_received', 'booking_request_creator', v_payment.booking_request_id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_payment.creator_id and nm.event_type = 'booking.payment_received' and nm.muted);
  perform kinnso_internal.enqueue_booking_email(v_payment.traveler_user_id, 'booking.paid',
    'booking_request', v_payment.booking_request_id, v_payload);
  perform kinnso_internal.enqueue_booking_email(v_payment.creator_id, 'booking.payment_received',
    'booking_request', v_payment.booking_request_id, v_payload);
  return jsonb_build_object('id', v_payment.id, 'status', v_payment.status,
                            'paidAt', v_payment.paid_at, 'replayed', false);
end $$;
revoke all on function kinnso_internal.mark_payment_paid(uuid, text, text) from public, anon, authenticated;

-- 5. Webhook ingestion (service-role only). The app has already verified the provider
-- signature; this validates the reduced event, checks the amount when the provider
-- reports one, and applies at most one paid transition. Replays return the recorded
-- state without a second event or a second notice.
create or replace function public.kinnso_payment_webhook_ingest(
  p_provider text, p_event_id text, p_event_type text, p_payment_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_payment public.booking_payments;
  v_event uuid;
  v_amount bigint;
  v_currency text;
  v_result jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_provider is null or p_provider not in ('fake', 'stripe') then raise exception 'invalid_webhook'; end if;
  if p_event_id is null or btrim(p_event_id) = '' or char_length(p_event_id) > 200 then raise exception 'invalid_webhook'; end if;
  if p_event_type is null or char_length(p_event_type) > 100 then raise exception 'invalid_webhook'; end if;
  if octet_length(v_payload::text) > 20000 then raise exception 'invalid_webhook'; end if;
  v_kind := case p_event_type
    when 'checkout.session.completed' then 'payment.paid'
    when 'checkout.session.expired' then 'payment.expired'
    when 'payment_intent.payment_failed' then 'payment.failed'
    else null end;
  if v_kind is null then
    return jsonb_build_object('received', true, 'ignored', 'unsupported_event');
  end if;
  if p_payment_id is null then
    insert into public.payment_events (provider_event_id, kind, payload)
      values (p_event_id, v_kind, v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'payment_unmapped');
  end if;
  select * into v_payment from public.booking_payments where id = p_payment_id;
  if not found then
    insert into public.payment_events (provider_event_id, kind, payload)
      values (p_event_id, v_kind, v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type))
      on conflict (provider_event_id) do nothing
      returning id into v_event;
    return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'payment_not_found');
  end if;
  if exists (select 1 from public.payment_events where provider_event_id = p_event_id) then
    return jsonb_build_object('received', true, 'replayed', true);
  end if;
  if v_kind = 'payment.paid' then
    if jsonb_typeof(v_payload -> 'amountTotal') = 'number' then
      v_amount := (v_payload ->> 'amountTotal')::bigint;
      if v_amount is distinct from v_payment.amount_minor::bigint then
        insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
          values (v_payment.id, p_event_id, v_kind,
                  v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', 'amount_mismatch'))
          on conflict (provider_event_id) do nothing
          returning id into v_event;
        return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'amount_mismatch');
      end if;
    end if;
    v_currency := upper(nullif(btrim(coalesce(v_payload ->> 'currency', '')), ''));
    if v_currency is not null and v_currency <> btrim(v_payment.currency::text) then
      insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
        values (v_payment.id, p_event_id, v_kind,
                v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type, 'ignored', 'currency_mismatch'))
        on conflict (provider_event_id) do nothing
        returning id into v_event;
      return jsonb_build_object('received', true, 'replayed', v_event is null, 'ignored', 'currency_mismatch');
    end if;
    v_result := kinnso_internal.mark_payment_paid(
      v_payment.id, nullif(btrim(coalesce(v_payload ->> 'paymentIntentId', '')), ''), p_event_id);
    if coalesce((v_result ->> 'replayed')::boolean, false) then
      return jsonb_build_object('received', true, 'replayed', true);
    end if;
    if coalesce((v_result ->> 'ignored')::boolean, false) then
      return jsonb_build_object('received', true, 'replayed', false, 'ignored', 'not_payable');
    end if;
    return jsonb_build_object('received', true, 'replayed', false);
  end if;
  insert into public.payment_events (booking_payment_id, provider_event_id, kind, payload)
    values (v_payment.id, p_event_id, v_kind,
            v_payload || jsonb_build_object('provider', p_provider, 'eventType', p_event_type))
    on conflict (provider_event_id) do nothing
    returning id into v_event;
  -- Expired/failed provider events are recorded for audit; the payment window and its
  -- deadline sweep remain the authority so a late success can still be reconciled.
  return jsonb_build_object('received', true, 'replayed', v_event is null,
                            'ignored', v_kind, 'paymentStatus', v_payment.status);
end $$;
revoke all on function public.kinnso_payment_webhook_ingest(text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kinnso_payment_webhook_ingest(text, text, text, uuid, jsonb) to service_role;

-- 6. Ops status surfaces provider-event ingestion next to payment counts.
create or replace function public.kinnso_ops_payments_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'payments'), false),
    'pricedGuides', (select count(*) from public.guides where price_minor is not null),
    'requiresPayment', (select count(*) from public.booking_payments where status = 'requires_payment'),
    'processing', (select count(*) from public.booking_payments where status = 'processing'),
    'paid', (select count(*) from public.booking_payments where status = 'paid'),
    'refunded', (select count(*) from public.booking_payments where status = 'refunded'),
    'expired', (select count(*) from public.booking_payments where status = 'expired'),
    'providerEvents', (select count(*) from public.payment_events where provider_event_id is not null),
    'overdueCheckouts', (select count(*) from public.booking_payments where status = 'requires_payment' and deadline_at < now()));
end $$;
