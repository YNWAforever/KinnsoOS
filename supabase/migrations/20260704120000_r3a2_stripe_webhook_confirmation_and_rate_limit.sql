-- Phase R3A-2 — Stripe webhook confirmation RPC, guest-confirmation-read RPC,
-- and IP-based checkout rate limiting.
-- (1) checkout_rate_limits + check_and_increment_checkout_rate_limit(): a
--     minimal Postgres-backed IP rate limiter for the anon-reachable
--     checkout-session-creation action (design spec §D-R3-2's abuse
--     mitigation). No existing rate-limiting utility or vendor exists in this
--     codebase (confirmed by repo-wide grep) — this avoids introducing a new
--     third-party dependency for a single call site.
-- (2) confirm_booking_from_webhook(): the one write path allowed to flip
--     bookings.status outside an ops action (design spec §D-R3-3). Idempotent
--     on repeat delivery (Stripe redelivers events). Increments
--     experience_availability.booked_count via least(booked_count + qty,
--     capacity) rather than a hard capacity check, so a booking whose payment
--     already succeeded can never fail to confirm because of a rare
--     concurrent-checkout race (plan PD-1) — the rare clamp event is logged
--     as a booking_events row of type 'overbooked' for ops visibility.
-- (3) get_booking_by_checkout_session(): the sanctioned anon-read exception
--     (design spec §D-R3-2) letting a guest (no session) read back their own
--     booking via the unguessable Stripe Checkout Session id — never a list,
--     never searchable by email.

-- ── 1. Checkout rate limiting ────────────────────────────────────────────────
create table public.checkout_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.checkout_rate_limits enable row level security;
-- No policies at all: this table is never read/written directly by any
-- client role, only through the SECURITY DEFINER function below.
revoke all on table public.checkout_rate_limits from anon, authenticated;

create or replace function public.check_and_increment_checkout_rate_limit(
  p_ip text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.checkout_rate_limits (ip, window_start, request_count)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set window_start = case
          when public.checkout_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.checkout_rate_limits.window_start
        end,
        request_count = case
          when public.checkout_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.checkout_rate_limits.request_count + 1
        end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.check_and_increment_checkout_rate_limit(text, integer, integer) from public;
grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to anon, authenticated;

-- ── 2. Webhook confirmation RPC ───────────────────────────────────────────────
create or replace function public.confirm_booking_from_webhook(
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_status text;
  v_availability_id uuid;
  v_qty integer;
  v_booked_before integer;
  v_capacity integer;
begin
  select id, status, availability_id, qty
    into v_booking_id, v_status, v_availability_id, v_qty
    from public.bookings
    where stripe_checkout_session_id = p_stripe_checkout_session_id
    for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if v_status <> 'pending_payment' then
    return;
  end if;

  update public.bookings
    set status = 'confirmed',
        stripe_payment_intent_id = p_stripe_payment_intent_id,
        updated_at = now()
    where id = v_booking_id;

  select booked_count, capacity into v_booked_before, v_capacity
    from public.experience_availability where id = v_availability_id for update;

  update public.experience_availability
    set booked_count = least(booked_count + v_qty, capacity)
    where id = v_availability_id;

  insert into public.booking_events (booking_id, event_type, metadata)
  values (v_booking_id, 'webhook_confirmed', jsonb_build_object('stripe_payment_intent_id', p_stripe_payment_intent_id));

  if v_booked_before + v_qty > v_capacity then
    insert into public.booking_events (booking_id, event_type, metadata)
    values (v_booking_id, 'overbooked', jsonb_build_object(
      'availability_id', v_availability_id, 'attempted_increment', v_qty,
      'booked_before', v_booked_before, 'capacity', v_capacity));
  end if;
end;
$$;

revoke all on function public.confirm_booking_from_webhook(text, text) from public;
grant execute on function public.confirm_booking_from_webhook(text, text) to service_role;

-- ── 3. Guest/signed-in confirmation read, keyed on the unguessable session id ─
create or replace function public.get_booking_by_checkout_session(p_session_id text)
returns table (
  booking_id uuid,
  status text,
  qty integer,
  total_amount numeric,
  currency text,
  experience_title text,
  experience_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.status, b.qty, b.total_amount, b.currency, e.title, e.slug
  from public.bookings b
  join public.experiences e on e.id = b.experience_id
  where b.stripe_checkout_session_id = p_session_id;
$$;

revoke all on function public.get_booking_by_checkout_session(text) from public;
grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated;
