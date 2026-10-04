-- supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql
--
-- Locks the claim row `for update` -- a genuinely concurrent second scan blocks until the
-- first commits, then observes status = 'redeemed' and returns the idempotent branch instead
-- of erroring. Ownership is enforced here, not by RLS: a creator cannot self-redeem (this RPC
-- requires the caller to be staff of the offer's own merchant_profile_id).
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

  select id, offer_id, status, expires_at
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

  return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);
end;
$$;

revoke all on function public.redeem_offer_claim(text, numeric) from public, anon;
grant execute on function public.redeem_offer_claim(text, numeric) to authenticated;
