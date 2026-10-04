-- supabase/migrations/20260821120200_r12_1_redeem_emits_offer_redeemed.sql
--
-- Widens redeem_offer_claim (R12.0, 20260821100200_r12_0_redeem_offer_claim.sql) so a
-- genuinely new redemption emits its own offer_redeemed analytics event server-side. The
-- merchant staff member calling this RPC is not the visitor whose journey/locale should be
-- recorded, so only the journey_id/locale captured at claim time (Task 2,
-- 20260821120100_r12_1_claim_offer_journey_capture.sql) can attribute this event.
--
-- Unlike claim_offer's own R12.1 follow-up, this does NOT change the parameter list -- same
-- two params, same order, same types/defaults as the shipped R12.0 signature -- so this
-- CREATE OR REPLACE is a true in-place replace and no DROP FUNCTION is needed first.
--
-- Every existing line of the R12.0 body is unchanged except: the v_claim select now also
-- pulls analytics_journey_id/analytics_locale, and a new conditional event insert is added
-- as the last step before the final return -- placed after the real-redemption write (claim
-- status update, offer_redemptions insert, merchant_offers counter bump) and unreachable
-- from the already-redeemed or expired early-return branches above it, since both of those
-- return before reaching this point.
create or replace function public.redeem_offer_claim(
  p_raw_token text,
  p_amount_spent numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff uuid := auth.uid();
  v_token_hash text;
  v_claim record;
  v_offer record;
  v_redemption_id uuid;
  v_existing record;
begin
  if v_staff is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_raw_token), '') = '' then raise exception 'bad_token'; end if;

  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');

  select id, offer_id, status, expires_at, analytics_journey_id, analytics_locale
    into v_claim
    from public.offer_claims
    where claim_token_hash = v_token_hash
    for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;

  select id, merchant_profile_id, commission_kind
    into v_offer
    from public.merchant_offers
    where id = v_claim.offer_id;

  if not exists (
    select 1 from public.merchant_profiles mp
    where mp.id = v_offer.merchant_profile_id and mp.user_id = v_staff
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_claim.status = 'redeemed' then
    select id, redeemed_at into v_existing from public.offer_redemptions where offer_claim_id = v_claim.id;
    return jsonb_build_object('redemption_id', v_existing.id, 'redeemed_at', v_existing.redeemed_at, 'already_redeemed', true);
  end if;

  if v_claim.status = 'expired' or now() > v_claim.expires_at then
    update public.offer_claims set status = 'expired' where id = v_claim.id and status = 'active';
    return jsonb_build_object('expired', true);
  end if;

  if p_amount_spent is not null and p_amount_spent = 'NaN'::numeric then
    raise exception 'bad_amount_spent';
  end if;

  if v_offer.commission_kind = 'percent' and p_amount_spent is null then
    raise exception 'amount_spent_required';
  end if;

  update public.offer_claims set status = 'redeemed' where id = v_claim.id;

  insert into public.offer_redemptions (offer_claim_id, merchant_profile_id, redeemed_by_merchant_user_id, amount_spent)
    values (v_claim.id, v_offer.merchant_profile_id, v_staff, p_amount_spent)
    returning id into v_redemption_id;

  update public.merchant_offers set redeemed_count = redeemed_count + 1, updated_at = now() where id = v_offer.id;

  -- Only reached on a genuinely new redemption (both early-return branches above already
  -- exited). Emits no event for an unconsented claim (analytics_journey_id null) -- there
  -- is no anonymous/invented fallback.
  if v_claim.analytics_journey_id is not null then
    insert into public.traveller_analytics_events (
      client_event_id, journey_id, consent_version, event_name, occurred_at,
      locale, route_key, entity_type, entity_id
    ) values (
      gen_random_uuid(), v_claim.analytics_journey_id, 'v1', 'offer_redeemed', now(),
      v_claim.analytics_locale, 'offer_redemption', 'offer', v_offer.id::text
    );
  end if;

  return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);
end;
$$;

revoke all on function public.redeem_offer_claim(text, numeric) from public, anon;
grant execute on function public.redeem_offer_claim(text, numeric) to authenticated;
