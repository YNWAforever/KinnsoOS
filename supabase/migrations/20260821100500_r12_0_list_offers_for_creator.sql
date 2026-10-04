-- R12.0 -- public read RPC listing offers a creator can promote on their guide/profile.
-- Backs the claim CTA on both /g/[slug] and /c/[handle]. Only returns offers where the
-- creator has an active/completed mission_participants row on the offer's mission.
-- An offer with no mission_id never appears here (matches Task 4's settlement no-op).
--
create or replace function public.list_offers_for_creator(p_creator_id uuid)
returns table (
  id uuid, title text, terms text, discount_kind text, discount_value numeric,
  merchant_name text, valid_to timestamptz
)
language sql stable security definer set search_path = public as $$
  select mo.id, mo.title, mo.terms, mo.discount_kind, mo.discount_value,
    mp.company_name, mo.valid_to
  from public.merchant_offers mo
  join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
  where mo.status = 'live'
    and now() between mo.valid_from and mo.valid_to
    and (mo.total_cap is null or mo.claimed_count < mo.total_cap)
    and app_private.merchant_is_active(mo.merchant_profile_id)
    and exists (
      select 1 from public.mission_participants part
      where part.mission_id = mo.mission_id
        and part.creator_id = p_creator_id
        and part.status in ('active', 'completed')
    )
  order by mo.valid_to asc
  limit 10;
$$;

revoke all on function public.list_offers_for_creator(uuid) from public, anon;
grant execute on function public.list_offers_for_creator(uuid) to anon, authenticated;
