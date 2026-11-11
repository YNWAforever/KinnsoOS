-- P1a: paid-surface schema and state machine (inert while the payments flag is off).
--
-- Model B (pay after the creator accepts): accepting an accepted request for a
-- priced guide creates a payment obligation instead of a confirmed trip. Nothing in
-- this migration charges anything or talks to a provider; the flag defaults off and a
-- separate ops toggle enables the branch. The provider seam (fake/Stripe) arrives in
-- P2/P3, and confirmation emails/notifications reuse the existing outbox.
alter table public.guides add column if not exists price_minor integer;
alter table public.guides drop constraint if exists guides_price_minor_check;
alter table public.guides add constraint guides_price_minor_check
  check (price_minor is null or (price_minor between 100 and 10000000));

insert into kinnso_internal.runtime_flags (flag, enabled) values ('payments', false)
  on conflict (flag) do nothing;
create or replace function kinnso_internal.payments_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'payments'), false);
$$;
revoke all on function kinnso_internal.payments_enabled() from public, anon, authenticated;

alter table public.booking_requests drop constraint if exists booking_requests_status_check;
alter table public.booking_requests add constraint booking_requests_status_check
  check (status in ('requested','accepted','declined','withdrawn','completed','awaiting_payment','paid','payment_expired','refunded'));

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references public.booking_requests(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null default 'HKD',
  commission_minor integer not null default 0 check (commission_minor >= 0),
  status text not null default 'requires_payment'
    check (status in ('requires_payment','processing','paid','refunded','expired','failed')),
  provider text not null default 'fake',
  provider_payment_intent_id text,
  provider_checkout_session_id text,
  paid_at timestamptz,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.booking_payments enable row level security;
revoke all on public.booking_payments from public, anon, authenticated;
create index if not exists booking_payments_status_idx on public.booking_payments (status, deadline_at);
create index if not exists booking_payments_creator_idx on public.booking_payments (creator_id, created_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_payment_id uuid references public.booking_payments(id) on delete cascade,
  provider_event_id text unique,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from public, anon, authenticated;

create table if not exists public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_minor integer not null,
  commission_minor integer not null,
  net_minor integer not null,
  status text not null default 'accruing' check (status in ('accruing','scheduled','paid','adjusted')),
  provider_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.creator_payouts enable row level security;
revoke all on public.creator_payouts from public, anon, authenticated;

grant select, insert, update on public.booking_payments, public.payment_events, public.creator_payouts to service_role;

create or replace function public.kinnso_creator_set_guide_price(p_guide_id uuid, p_price_minor integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_guide public.guides;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_price_minor is not null and (p_price_minor < 100 or p_price_minor > 10000000) then
    raise exception 'invalid_price';
  end if;
  update public.guides set price_minor = p_price_minor
   where id = p_guide_id and creator_id = v_actor
   returning * into v_guide;
  if not found then raise exception 'guide_not_found'; end if;
  return jsonb_build_object('guideId', v_guide.id, 'priceMinor', v_guide.price_minor, 'currency', 'HKD');
end $$;
revoke all on function public.kinnso_creator_set_guide_price(uuid, integer) from public, anon;
grant execute on function public.kinnso_creator_set_guide_price(uuid, integer) to authenticated;

create or replace function public.kinnso_ops_set_payments_enabled(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'invalid_preference'; end if;
  insert into kinnso_internal.runtime_flags (flag, enabled) values ('payments', p_enabled)
    on conflict (flag) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('flag', 'payments', 'enabled', p_enabled);
end $$;
revoke all on function public.kinnso_ops_set_payments_enabled(boolean) from public, anon;
grant execute on function public.kinnso_ops_set_payments_enabled(boolean) to authenticated;

create or replace function public.kinnso_ops_payments_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'payments'), false),
    'requiresPayment', (select count(*) from public.booking_payments where status = 'requires_payment'),
    'paid', (select count(*) from public.booking_payments where status = 'paid'),
    'refunded', (select count(*) from public.booking_payments where status = 'refunded'),
    'expired', (select count(*) from public.booking_payments where status = 'expired'),
    'overdueCheckouts', (select count(*) from public.booking_payments where status = 'requires_payment' and deadline_at < now()));
end $$;
revoke all on function public.kinnso_ops_payments_status() from public, anon;
grant execute on function public.kinnso_ops_payments_status() to authenticated;

create or replace function kinnso_internal.mark_payment_paid(p_payment_id uuid, p_provider_payment_intent_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.booking_payments;
begin
  update public.booking_payments
     set status = 'paid', paid_at = now(), provider_payment_intent_id = coalesce(p_provider_payment_intent_id, provider_payment_intent_id), updated_at = now()
   where id = p_payment_id and status in ('requires_payment', 'processing')
   returning * into v_payment;
  if not found then raise exception 'payment_not_payable'; end if;
  insert into public.payment_events (booking_payment_id, kind, payload)
    values (v_payment.id, 'payment.paid', jsonb_build_object('provider', v_payment.provider, 'amountMinor', v_payment.amount_minor));
  update public.booking_requests set status = 'paid', updated_at = now()
   where id = v_payment.booking_request_id and status = 'awaiting_payment';
  return jsonb_build_object('id', v_payment.id, 'status', v_payment.status, 'paidAt', v_payment.paid_at);
end $$;
revoke all on function kinnso_internal.mark_payment_paid(uuid, text) from public, anon, authenticated;

create or replace function kinnso_internal.expire_payment_windows() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.booking_payments
       set status = 'expired', updated_at = now()
     where status = 'requires_payment' and deadline_at < now()
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
  update public.booking_payments set status = 'refunded', updated_at = now() where id = v_payment.id;
  insert into public.payment_events (booking_payment_id, kind, payload)
    values (v_payment.id, 'payment.refunded', jsonb_build_object('reason', v_reason, 'actorId', v_actor));
  update public.booking_requests set status = 'refunded', updated_at = now()
   where id = v_payment.booking_request_id and status in ('awaiting_payment', 'paid');
  return jsonb_build_object('id', v_payment.id, 'status', 'refunded', 'refundedAmountMinor', v_payment.amount_minor);
end $$;
revoke all on function public.kinnso_ops_refund_payment(uuid, text) from public, anon;
grant execute on function public.kinnso_ops_refund_payment(uuid, text) to authenticated;

-- Accepting a priced request under the payments flag moves the booking to payment.
create or replace function public.kinnso_respond_booking_request(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.booking_requests;
  v_title text;
  v_price integer;
  v_status text;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'invalid_status'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note'; end if;
  update public.booking_requests
     set status = p_status, response_note = v_note, updated_at = now()
   where id = p_id and creator_id = v_actor and status = 'requested'
   returning * into v_row;
  if not found then raise exception 'request_not_found_or_decided'; end if;
  v_status := v_row.status;
  if p_status = 'accepted' and kinnso_internal.payments_enabled() then
    select g.price_minor into v_price from public.guides g where g.id = v_row.guide_id;
    if v_price is not null then
      v_status := 'awaiting_payment';
      update public.booking_requests set status = 'awaiting_payment', updated_at = now() where id = v_row.id;
      insert into public.booking_payments (booking_request_id, creator_id, traveler_user_id, amount_minor, commission_minor, deadline_at)
        values (v_row.id, v_row.creator_id, v_row.traveler_user_id, v_price, greatest(0, round(v_price * 0.15)::integer), now() + interval '7 days');
    end if;
  end if;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.traveler_user_id and nm.event_type = 'booking.' || p_status and nm.muted);
  select g.title into v_title from public.guides g where g.id = v_row.guide_id;
  perform kinnso_internal.enqueue_booking_email(v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id,
    jsonb_build_object('guideTitle', v_title, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'status', v_status));
  return jsonb_build_object('id', v_row.id, 'status', v_status, 'responseNote', v_row.response_note, 'updatedAt', v_row.updated_at);
end $$;
revoke all on function public.kinnso_respond_booking_request(uuid, text, text) from public, anon;
grant execute on function public.kinnso_respond_booking_request(uuid, text, text) to authenticated;

-- Completed now also covers paid trips.
create or replace function public.kinnso_creator_complete_booking(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  update public.booking_requests
     set status = 'completed', updated_at = now()
   where id = p_id and creator_id = v_actor and status in ('accepted', 'paid')
     and coalesce(ends_on, starts_on) < current_date
   returning * into v_row;
  if not found then
    if exists (select 1 from public.booking_requests where id = p_id and creator_id = v_actor and status in ('accepted', 'paid')) then
      raise exception 'trip_not_finished';
    end if;
    raise exception 'request_not_found_or_decided';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;
revoke all on function public.kinnso_creator_complete_booking(uuid) from public, anon;
grant execute on function public.kinnso_creator_complete_booking(uuid) to authenticated;
