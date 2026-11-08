-- The owner-scoped list uses immutable creation time and ID as its sort boundary.
create index merchant_offers_company_created_id_idx
  on public.merchant_offers (merchant_profile_id, created_at desc, id desc);

-- Return one aggregate row regardless of the number of offers or REST row limits.
create function public.get_merchant_offer_totals(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := kinnso_internal.actor();
begin
  if not exists (
    select 1 from public.merchant_profiles
    where id = p_merchant_id and user_id = v_actor and status = 'active'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select pg_catalog.jsonb_build_object(
      'claimed', coalesce(sum(claimed_count), 0),
      'redeemed', coalesce(sum(redeemed_count), 0)
    )
    from public.merchant_offers
    where merchant_profile_id = p_merchant_id
  );
end
$$;

revoke all on function public.get_merchant_offer_totals(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_merchant_offer_totals(uuid) to authenticated;
