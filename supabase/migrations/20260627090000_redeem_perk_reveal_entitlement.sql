-- Phase 6B follow-up: re-reveal a perk the creator already redeemed WITHOUT re-running
-- the tier gate. The spec promises redeemed cards always re-reveal; a creator whose tier
-- later drops (e.g. a contribution revocation lowers their tier) must still see a code
-- they already claimed. Entitlement is proven by an existing perk_redemptions row.
-- Same signature/returns as the original — no type regeneration needed.
create or replace function public.redeem_perk(p_perk_id uuid)
returns table (redemption_type text, redemption_value text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_min text; v_type text; v_val text; v_already boolean;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select min_tier, redemption_type, redemption_value into v_min, v_type, v_val
    from public.partner_perks where id = p_perk_id and active;
  if not found then raise exception 'perk_not_found' using errcode = 'P0002'; end if;
  select exists (select 1 from public.perk_redemptions
                 where creator_id = v_uid and perk_id = p_perk_id) into v_already;
  -- Tier gate applies only to a first-time redemption; an existing redemption re-reveals freely.
  if not v_already and v_min is not null and
     public.contribution_tier_rank(coalesce((select tier from public.creator_contribution
        where creator_id = v_uid), 'seed')) < public.contribution_tier_rank(v_min)
  then raise exception 'below_tier' using errcode = '42501'; end if;
  insert into public.perk_redemptions (creator_id, perk_id)
    values (v_uid, p_perk_id) on conflict (creator_id, perk_id) do nothing;
  return query select v_type, v_val;
end $$;
revoke all on function public.redeem_perk(uuid) from public, anon;
grant execute on function public.redeem_perk(uuid) to authenticated;
