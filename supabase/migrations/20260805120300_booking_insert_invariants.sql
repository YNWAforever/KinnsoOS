-- R8.2: make the booking-row invariants the checkout action already upholds
-- enforceable by the database.
--
-- bookings_owner_insert / bookings_guest_insert constrain only identity and
-- status, so a browser client posting straight to PostgREST can insert a row
-- with any unit_amount/total_amount, any creator_id (the 10% commission
-- target), and an availability_id belonging to a different experience.
--
-- Such a row cannot currently be confirmed — confirm_booking_from_webhook
-- matches on the Stripe checkout session id, and only createCheckoutSessionAction
-- ever creates one — so this is defence in depth, not a live hole. It exists so
-- the invariants survive any future confirmation path, and so the settlement
-- trigger (which computes real payouts from total_amount and creator_id) can
-- never be fed a forged row.
--
-- Every check below mirrors exactly what apps/web/lib/experiences/booking-actions.ts
-- already does server-side, so no legitimate insert is affected.

-- SECURITY DEFINER so the reference lookups below always resolve: as an invoker
-- the reads are themselves subject to RLS, and an experience the caller cannot
-- SELECT would be indistinguishable from a forged experience_id, rejecting
-- legitimate bookings.
--
-- Because of that, the caller's role must come from `current_setting('role')`
-- and NOT from `current_user`: inside a SECURITY DEFINER function `current_user`
-- is the function owner, so it would report `postgres` for every caller and the
-- guard would never engage.
create or replace function public.validate_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price      numeric(10,2);
  v_currency   text;
  v_exp_of_av  uuid;
  v_guide_creator uuid;
begin
  -- Only the browser-facing roles are constrained; trusted backends
  -- (service_role, or a direct maintenance connection, where this setting is
  -- 'none') pass through.
  if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.qty is null or new.qty <= 0 then
    raise exception 'booking_invalid_qty' using errcode = '22023';
  end if;

  -- Price and currency are re-derived from the experience at checkout; they are
  -- never client-chosen.
  select price_amount, currency into v_price, v_currency
    from public.experiences where id = new.experience_id;
  if v_price is null then
    raise exception 'booking_unknown_experience' using errcode = '22023';
  end if;
  if new.unit_amount is distinct from v_price then
    raise exception 'booking_unit_amount_mismatch' using errcode = '22023';
  end if;
  if new.currency is distinct from v_currency then
    raise exception 'booking_currency_mismatch' using errcode = '22023';
  end if;
  if new.total_amount is distinct from round(new.unit_amount * new.qty, 2) then
    raise exception 'booking_total_amount_mismatch' using errcode = '22023';
  end if;

  -- The booked slot must belong to the booked experience, or confirmation
  -- would decrement a different experience's capacity.
  select experience_id into v_exp_of_av
    from public.experience_availability where id = new.availability_id;
  if v_exp_of_av is null or v_exp_of_av <> new.experience_id then
    raise exception 'booking_availability_mismatch' using errcode = '22023';
  end if;

  -- Commission attribution is resolved from a published guide server-side, so
  -- a creator may only be credited via that guide — never named directly.
  if new.creator_id is not null then
    if new.guide_id is null then
      raise exception 'booking_attribution_requires_guide' using errcode = '22023';
    end if;
    select creator_id into v_guide_creator from public.guides where id = new.guide_id;
    if v_guide_creator is null or v_guide_creator <> new.creator_id then
      raise exception 'booking_attribution_mismatch' using errcode = '22023';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.validate_booking_insert() from public, anon, authenticated, service_role;

drop trigger if exists bookings_validate_insert on public.bookings;
create trigger bookings_validate_insert
  before insert on public.bookings
  for each row execute procedure public.validate_booking_insert();
