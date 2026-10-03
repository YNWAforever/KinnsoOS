-- Visitors have no direct read access to merchant_offers/merchant_profiles (both are
-- owner-scoped RLS), so the claim confirmation page needs a security definer RPC to display
-- the offer title and merchant name -- same reason list_offers_for_creator exists.
create or replace function public.get_my_offer_claim(p_claim_id uuid)
returns table (offer_title text, merchant_name text)
language sql stable security definer set search_path = public as $$
  select mo.title, mp.company_name
  from public.offer_claims oc
  join public.merchant_offers mo on mo.id = oc.offer_id
  join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
  where oc.id = p_claim_id and oc.visitor_user_id = auth.uid()
$$;

revoke all on function public.get_my_offer_claim(uuid) from public, anon;
grant execute on function public.get_my_offer_claim(uuid) to authenticated;
