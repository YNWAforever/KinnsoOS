-- P2: hosted-checkout handoff and the traveller pay surface (still inert off-flag).
--
-- Accepting a request for a priced guide already creates a payment obligation. This
-- migration adds the handoff to a provider-hosted checkout page (fake locally, Stripe
-- in P3/P5) and the owner-only RPCs that create/record/confirm that handoff. Nothing
-- here charges money: the fake provider confirms a test checkout locally, live
-- confirmation arrives with the P3 webhook. Every RPC re-checks the actor, the booking
-- status and the payments flag server-side; the browser never supplies an amount.
alter table public.booking_payments add column if not exists checkout_url text;
alter table public.booking_payments add column if not exists checkout_started_at timestamptz;
alter table public.booking_payments drop constraint if exists booking_payments_checkout_url_check;
alter table public.booking_payments add constraint booking_payments_checkout_url_check
  check (checkout_url is null or char_length(checkout_url) <= 2000);

-- Owner read: one payment by request id, or by payment id for the checkout page.
create or replace function public.kinnso_traveller_payment(
  p_booking_request_id uuid default null,
  p_payment_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_payment public.booking_payments;
  v_booking public.booking_requests;
  v_title text;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if (p_booking_request_id is null) = (p_payment_id is null) then raise exception 'invalid_request'; end if;
  if p_payment_id is not null then
    select * into v_payment from public.booking_payments where id = p_payment_id;
  else
    select * into v_payment from public.booking_payments where booking_request_id = p_booking_request_id;
  end if;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.traveler_user_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_booking from public.booking_requests where id = v_payment.booking_request_id;
  select g.title into v_title from public.guides g where g.id = v_booking.guide_id;
  return jsonb_build_object(
    'bookingRequestId', v_payment.booking_request_id,
    'paymentId', v_payment.id,
    'bookingStatus', v_booking.status,
    'paymentStatus', v_payment.status,
    'amountMinor', v_payment.amount_minor,
    'currency', btrim(v_payment.currency::text),
    'provider', v_payment.provider,
    'deadlineAt', v_payment.deadline_at,
    'paidAt', v_payment.paid_at,
    'checkoutUrl', v_payment.checkout_url,
    'guideTitle', v_title,
    'enabled', kinnso_internal.payments_enabled());
end $$;

-- Start (or retry) a checkout handoff: locks the payment, checks the window and moves
-- it to processing. The app then creates the provider session and records it here.
create or replace function public.kinnso_traveller_start_checkout(p_booking_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_booking public.booking_requests;
  v_payment public.booking_payments;
  v_title text;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not kinnso_internal.payments_enabled() then raise exception 'payments_disabled'; end if;
  select * into v_booking from public.booking_requests where id = p_booking_request_id;
  if not found or v_booking.traveler_user_id <> v_actor then raise exception 'booking_not_found'; end if;
  select * into v_payment from public.booking_payments where booking_request_id = v_booking.id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.status = 'paid' then raise exception 'payment_already_paid'; end if;
  if v_payment.status not in ('requires_payment', 'processing') then raise exception 'booking_not_payable'; end if;
  if v_payment.deadline_at < now() then
    update public.booking_payments set status = 'expired', updated_at = now() where id = v_payment.id;
    update public.booking_requests set status = 'payment_expired', updated_at = now()
     where id = v_booking.id and status = 'awaiting_payment';
    insert into public.payment_events (booking_payment_id, kind, payload)
      values (v_payment.id, 'payment.expired', '{}'::jsonb);
    -- Return a soft result: raising here would roll the expiry updates back.
    return jsonb_build_object('paymentId', v_payment.id, 'status', 'expired', 'expired', true);
  end if;
  update public.booking_payments set status = 'processing', updated_at = now()
   where id = v_payment.id returning * into v_payment;
  select g.title into v_title from public.guides g where g.id = v_booking.guide_id;
  return jsonb_build_object(
    'bookingRequestId', v_booking.id,
    'paymentId', v_payment.id,
    'amountMinor', v_payment.amount_minor,
    'currency', btrim(v_payment.currency::text),
    'deadlineAt', v_payment.deadline_at,
    'provider', v_payment.provider,
    'guideTitle', v_title);
end $$;

-- Record the provider session the app just created: provider name, session id, URL.
create or replace function public.kinnso_traveller_record_checkout(
  p_payment_id uuid, p_provider text, p_session_id text, p_url text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_payment public.booking_payments;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_provider is null or p_provider not in ('fake', 'stripe') then raise exception 'invalid_checkout'; end if;
  if p_url is null or char_length(p_url) > 2000
     or (p_url not like '/%' and p_url not like 'https://%' and p_url not like 'http://%') then
    raise exception 'invalid_checkout';
  end if;
  if p_session_id is null or char_length(p_session_id) > 200 then raise exception 'invalid_checkout'; end if;
  select * into v_payment from public.booking_payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_payment.traveler_user_id <> v_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_payment.status <> 'processing' then raise exception 'checkout_not_pending'; end if;
  update public.booking_payments
     set provider = p_provider, provider_checkout_session_id = p_session_id,
         checkout_url = p_url, checkout_started_at = now(), updated_at = now()
   where id = v_payment.id returning * into v_payment;
  return jsonb_build_object('paymentId', v_payment.id, 'status', v_payment.status,
                            'checkoutUrl', v_payment.checkout_url, 'deadlineAt', v_payment.deadline_at);
end $$;

-- Fake-provider confirmation (local/staging only; the row's provider must be fake).
-- One-way and replay-safe: a second confirmation returns the paid state without a
-- second payment event, so a double-click cannot double-pay.
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
    update public.booking_payments set status = 'expired', updated_at = now() where id = v_payment.id;
    update public.booking_requests set status = 'payment_expired', updated_at = now()
     where id = v_payment.booking_request_id and status = 'awaiting_payment';
    insert into public.payment_events (booking_payment_id, kind, payload)
      values (v_payment.id, 'payment.expired', '{}'::jsonb);
    -- Soft result so the caller can say "expired" while the expiry itself persists.
    return jsonb_build_object('paymentId', v_payment.id, 'status', 'expired', 'paidAt', null, 'expired', true);
  end if;
  perform kinnso_internal.mark_payment_paid(v_payment.id, 'fake_' || replace(gen_random_uuid()::text, '-', ''));
  select * into v_payment from public.booking_payments where id = p_payment_id;
  return jsonb_build_object('paymentId', v_payment.id, 'status', v_payment.status,
                            'paidAt', v_payment.paid_at, 'replayed', false);
end $$;

-- The traveller list now carries its payment (one row per request at most).
create or replace function public.kinnso_my_booking_requests(
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_has_more boolean;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then raise exception 'invalid_cursor'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'guideId', r.guide_id, 'guideTitle', g.title, 'creatorName', g.creator_name,
      'startsOn', r.starts_on, 'endsOn', r.ends_on, 'partySize', r.party_size,
      'message', r.message, 'status', r.status, 'responseNote', r.response_note,
      'createdAt', r.created_at, 'updatedAt', r.updated_at,
      'paymentId', bp.id, 'paymentStatus', bp.status, 'amountMinor', bp.amount_minor,
      'currency', btrim(bp.currency::text), 'deadlineAt', bp.deadline_at,
      'paymentsEnabled', kinnso_internal.payments_enabled())
      order by r.created_at desc, r.id), '[]'::jsonb)
    into v_items
    from (
      select * from public.booking_requests
       where traveler_user_id = v_actor
         and (p_cursor_created_at is null
              or created_at < p_cursor_created_at
              or (created_at = p_cursor_created_at and id < p_cursor_id))
       order by created_at desc, id
       limit v_limit + 1
    ) r
    join public.guides g on g.id = r.guide_id
    left join public.booking_payments bp on bp.booking_request_id = r.id;
  v_has_more := coalesce(jsonb_array_length(v_items), 0) > v_limit;
  if v_has_more then
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord <= v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'hasMore', v_has_more);
end $$;

-- The creator list carries the payment amount/status so an accepted paid trip is legible.
create or replace function public.kinnso_creator_booking_requests(
  p_limit integer default 50,
  p_cursor_pending integer default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_has_more boolean;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then raise exception 'invalid_cursor'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'guideId', p.guide_id, 'guideTitle', p.guide_title,
      'startsOn', p.starts_on, 'endsOn', p.ends_on, 'partySize', p.party_size,
      'message', p.message, 'status', p.status, 'responseNote', p.response_note, 'createdAt', p.created_at,
      'paymentId', p.payment_id, 'paymentStatus', p.payment_status,
      'amountMinor', p.amount_minor, 'currency', btrim(p.currency::text), 'deadlineAt', p.deadline_at)
      order by p.pending_first, p.created_at desc, p.id), '[]'::jsonb)
    into v_items
  from (
    select r.id, r.guide_id, g.title as guide_title, r.starts_on, r.ends_on, r.party_size,
           r.message, r.status, r.response_note, r.created_at,
           bp.id as payment_id, bp.status as payment_status, bp.amount_minor,
           bp.currency, bp.deadline_at,
           case when r.status = 'requested' then 0 else 1 end as pending_first
      from public.booking_requests r
      join public.guides g on g.id = r.guide_id
      left join public.booking_payments bp on bp.booking_request_id = r.id
     where r.creator_id = v_actor
       and (p_cursor_created_at is null
            or (case when r.status = 'requested' then 0 else 1 end) > coalesce(p_cursor_pending, 0)
            or ((case when r.status = 'requested' then 0 else 1 end) = coalesce(p_cursor_pending, 0)
                and (r.created_at < p_cursor_created_at
                     or (r.created_at = p_cursor_created_at and r.id < p_cursor_id))))
     order by case when r.status = 'requested' then 0 else 1 end, r.created_at desc, r.id
     limit v_limit + 1
  ) p;
  v_has_more := coalesce(jsonb_array_length(v_items), 0) > v_limit;
  if v_has_more then
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord <= v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'hasMore', v_has_more);
end $$;

-- A paid trip is confirmed and belongs in the starting-soon lists.
create or replace function public.kinnso_upcoming_bookings(p_days integer default 3) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_days integer := least(greatest(coalesce(p_days, 3), 0), 14);
  v_traveller jsonb;
  v_creator jsonb;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'guideTitle', g.title, 'startsOn', r.starts_on, 'endsOn', r.ends_on,
           'partySize', r.party_size, 'daysUntil', r.starts_on - current_date) order by r.starts_on, r.id), '[]'::jsonb)
    into v_traveller
    from public.booking_requests r
    join public.guides g on g.id = r.guide_id
   where r.traveler_user_id = v_actor and r.status in ('accepted', 'paid')
     and r.starts_on between current_date and current_date + v_days;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'guideTitle', g.title, 'startsOn', r.starts_on, 'endsOn', r.ends_on,
           'partySize', r.party_size, 'daysUntil', r.starts_on - current_date) order by r.starts_on, r.id), '[]'::jsonb)
    into v_creator
    from public.booking_requests r
    join public.guides g on g.id = r.guide_id
   where r.creator_id = v_actor and r.status in ('accepted', 'paid')
     and r.starts_on between current_date and current_date + v_days;
  return jsonb_build_object('days', v_days, 'traveller', v_traveller, 'creator', v_creator);
end $$;

-- Ops status keeps the P1b priced-guide audit and adds in-flight checkouts.
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
    'overdueCheckouts', (select count(*) from public.booking_payments where status = 'requires_payment' and deadline_at < now()));
end $$;

revoke all on function public.kinnso_traveller_payment(uuid, uuid) from public, anon;
revoke all on function public.kinnso_traveller_start_checkout(uuid) from public, anon;
revoke all on function public.kinnso_traveller_record_checkout(uuid, text, text, text) from public, anon;
revoke all on function public.kinnso_traveller_confirm_fake_payment(uuid) from public, anon;
revoke all on function public.kinnso_my_booking_requests(integer, timestamptz, uuid) from public, anon;
revoke all on function public.kinnso_creator_booking_requests(integer, integer, timestamptz, uuid) from public, anon;
revoke all on function public.kinnso_upcoming_bookings(integer) from public, anon;
revoke all on function public.kinnso_ops_payments_status() from public, anon;
grant execute on function public.kinnso_traveller_payment(uuid, uuid) to authenticated;
grant execute on function public.kinnso_traveller_start_checkout(uuid) to authenticated;
grant execute on function public.kinnso_traveller_record_checkout(uuid, text, text, text) to authenticated;
grant execute on function public.kinnso_traveller_confirm_fake_payment(uuid) to authenticated;
grant execute on function public.kinnso_my_booking_requests(integer, timestamptz, uuid) to authenticated;
grant execute on function public.kinnso_creator_booking_requests(integer, integer, timestamptz, uuid) to authenticated;
grant execute on function public.kinnso_upcoming_bookings(integer) to authenticated;
grant execute on function public.kinnso_ops_payments_status() to authenticated;
