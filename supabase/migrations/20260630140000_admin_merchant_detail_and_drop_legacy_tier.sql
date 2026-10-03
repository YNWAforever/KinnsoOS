-- Phase 11C — Merchant 360 detail aggregator + (appended in 11C Task 10) DROP of the legacy
-- 2-arg admin_set_merchant_tier overload. One SECURITY DEFINER, is_active_ops()-gated RPC
-- returning a single jsonb payload for the detail page (mirrors admin_merchant_analytics 11A
-- and admin_creator_detail 10C). Returns NULL when the merchant id does not exist, so the
-- page can render notFound(). Reads only; no writes, no audit. The profile section is the ONLY
-- place contact_email/contact_name (PII) is exposed — gated behind is_active_ops().
-- Settlements link to the merchant via missions.merchant_profile_id. Owed/settled are
-- per-currency arrays (never summed across currencies); "settled" = creator_payout_status='paid'.

create or replace function public.admin_merchant_detail(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.merchant_profiles where id = p_merchant_id;
  if v_exists is null then
    return null;  -- missing merchant -> wrapper returns null -> page notFound()
  end if;

  return jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', mp.id, 'company_name', mp.company_name,
        'contact_name', mp.contact_name, 'contact_email', mp.contact_email,
        'website_url', mp.website_url, 'status', mp.status, 'tier', mp.tier,
        'created_at', mp.created_at, 'updated_at', mp.updated_at)
      from public.merchant_profiles mp where mp.id = p_merchant_id
    ),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'status', m.status, 'visibility', m.visibility,
        'participants_count', (select count(*) from public.mission_participants mp where mp.mission_id = m.id),
        'milestones_total', (select count(*) from public.mission_milestones ms where ms.mission_id = m.id),
        'milestones_approved', (
          select count(*) from public.mission_milestone_submissions sub
          join public.mission_milestones ms on ms.id = sub.mission_milestone_id
          where ms.mission_id = m.id and sub.status = 'approved'
        ),
        'created_at', m.created_at)
        order by m.created_at desc)
      from public.missions m where m.merchant_profile_id = p_merchant_id
    ), '[]'::jsonb),
    'creators', jsonb_build_object(
      'engaged', coalesce((
        select jsonb_agg(row_to_json(e) order by e.display_name nulls last)
        from (
          select distinct on (mp.creator_id)
            mp.creator_id, c.display_name, c.handle, mp.status as participant_status
          from public.mission_participants mp
          join public.missions m on m.id = mp.mission_id
          join public.creators c on c.id = mp.creator_id
          where m.merchant_profile_id = p_merchant_id
          order by mp.creator_id, mp.created_at desc
        ) e
      ), '[]'::jsonb),
      'saved_count', (
        select count(*) from public.merchant_saved_creators sc where sc.merchant_id = p_merchant_id
      )
    ),
    'billing', jsonb_build_object(
      'settlements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id, 'mission_title', m.title, 'status', st.status,
          'creator_payout_status', st.creator_payout_status,
          'kinnso_commission_status', st.kinnso_commission_status,
          'affiliate_commission_status', st.affiliate_commission_status,
          'currency', st.amount_currency,
          'creator_payout_amount', st.creator_commission_amount,
          'updated_at', st.updated_at)
          order by st.updated_at desc)
        from public.mission_settlements st
        join public.missions m on m.id = st.mission_id
        where m.merchant_profile_id = p_merchant_id
      ), '[]'::jsonb),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and coalesce(st.creator_payout_status, '') <> 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and st.creator_payout_status = 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb)
    )
  );
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (is_active_ops() is the gate).
revoke all on function public.admin_merchant_detail(uuid) from public, anon;
grant execute on function public.admin_merchant_detail(uuid) to authenticated;

-- Phase 11C — drop the legacy Phase 7 2-arg tier setter. The audited 3-arg
-- admin_set_merchant_tier(uuid, text, text) (from 20260630130000) is the only tier write path now;
-- the /admin/users de-control removed the last caller of the 2-arg overload. Both overloads
-- coexisted between 11B and this point — dropping the 2-arg version makes the audited one canonical.
drop function if exists public.admin_set_merchant_tier(uuid, text);
