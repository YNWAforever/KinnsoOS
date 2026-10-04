-- Phase 11A — Merchants Operator Console: ops-aggregate analytics for the Overview.
-- Mirrors admin_creator_analytics: a single jsonb payload, gated internally on
-- is_active_ops() so non-ops are rejected at the DB boundary. Read-only (no audit).
-- Heuristics (documented + tunable here):
--   missions_live        = missions with status='published'
--   settlements_pending  = overall settlement lifecycle count (status pending/partially_paid);
--                          intentionally DISTINCT from the creator-payout `owed` leg below
--                          (a settlement can be overall paid yet still owe the creator, or vice versa).
--   owed / settled       = mission_settlements creator-payout leg, grouped by currency
--                          (never summed across currencies)
--   at_risk reasons:
--     growth_idle      = tier='growth' merchant with no published mission
--     disputed         = a settlement on one of the merchant's missions is 'disputed'
--     pending_overdue  = a settlement is 'pending' and older than 30 days
create or replace function public.admin_merchant_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_start timestamptz := v_start - make_interval(days => v_days);
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.merchant_profiles),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.merchant_profiles group by status
        ) s), '{}'::jsonb),
      'by_tier', coalesce((
        select jsonb_object_agg(tier, c) from (
          select tier, count(*) as c from public.merchant_profiles group by tier
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.merchant_profiles where created_at >= v_start),
      'new_prev_period', (select count(*) from public.merchant_profiles
        where created_at >= v_prev_start and created_at < v_start),
      'missions_live', (select count(*) from public.missions where status = 'published'),
      'settlements_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid')),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'pending' group by 1
        ) o), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'paid' group by 1
        ) s2), '[]'::jsonb)
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.merchant_profiles where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions where created_at >= v_start and merchant_profile_id is not null group by 1
      ) m), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'company_name', x.company_name, 'tier', x.tier,
        'missions_count', x.missions_count, 'creators_engaged', x.creators_engaged)
        order by x.missions_count desc, x.creators_engaged desc) from (
        select mp.id, mp.company_name, mp.tier,
          (select count(*) from public.missions mi where mi.merchant_profile_id = mp.id) as missions_count,
          (select count(distinct part.creator_id) from public.missions mi2
             join public.mission_participants part on part.mission_id = mi2.id
             where mi2.merchant_profile_id = mp.id) as creators_engaged
        from public.merchant_profiles mp
        order by missions_count desc, creators_engaged desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'company_name', r.company_name, 'reason', r.reason))
      from (
        -- The WHERE below admits a merchant via EITHER the settlement branch OR the
        -- growth-idle branch; the CASE arm order encodes reason priority and MUST keep
        -- the settlement reasons (disputed, pending_overdue) ahead of the growth_idle
        -- fallback, so a merchant flagged for a settlement is never mislabeled growth_idle.
        select mp.id, mp.company_name,
          case
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'disputed') then 'disputed'
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'pending'
                and ms.created_at < now() - interval '30 days') then 'pending_overdue'
            else 'growth_idle'
          end as reason
        from public.merchant_profiles mp
        where exists (
                select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
                where mi.merchant_profile_id = mp.id and ms.status in ('disputed', 'pending')
                  and (ms.status = 'disputed' or ms.created_at < now() - interval '30 days'))
           or (mp.tier = 'growth' and not exists (
                select 1 from public.missions mi
                where mi.merchant_profile_id = mp.id and mi.status = 'published'))
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

-- Grants. Revoke the implicit public+anon EXECUTE, grant only authenticated.
revoke all on function public.admin_merchant_analytics(int) from public, anon;
grant execute on function public.admin_merchant_analytics(int) to authenticated;
