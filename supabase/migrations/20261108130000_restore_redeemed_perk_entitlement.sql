-- Restore the earned entitlement from 20260627090000 while retaining qualified column reads.
create or replace function public.redeem_perk(p_perk_id uuid)
returns table (redemption_type text, redemption_value text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_min text;
  v_type text;
  v_val text;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select p.min_tier, p.redemption_type, p.redemption_value
    into v_min, v_type, v_val
    from public.partner_perks p
   where p.id = p_perk_id
     and p.active;

  if not found then
    raise exception 'perk_not_found' using errcode = 'P0002';
  end if;

  -- An active perk's existing redemption belongs to this caller and survives
  -- a tier drop. Only a first-time redemption must meet the current tier.
  if exists (
    select 1 from public.perk_redemptions r
     where r.creator_id = v_uid and r.perk_id = p_perk_id
  ) then
    return query select v_type, v_val;
    return;
  end if;

  if v_min is not null
     and public.contribution_tier_rank(
       coalesce(
         (select c.tier
            from public.creator_contribution c
           where c.creator_id = v_uid),
         'seed'
       )
     ) < public.contribution_tier_rank(v_min)
  then
    raise exception 'below_tier' using errcode = '42501';
  end if;

  insert into public.perk_redemptions (creator_id, perk_id)
  values (v_uid, p_perk_id)
  on conflict (creator_id, perk_id) do nothing;

  return query select v_type, v_val;
end $$;

revoke all on function public.redeem_perk(uuid) from public, anon;
grant execute on function public.redeem_perk(uuid) to authenticated;
