-- Phase 10A fixup: make admin_creator_analytics()'s at_risk subset deterministic.
-- The original at_risk subquery applied LIMIT 20 with no ORDER BY, so when more than
-- 20 creators matched, Postgres returned an arbitrary, run-to-run nondeterministic
-- slice with no prioritization between the two reasons. Add a deterministic ORDER BY
-- before the LIMIT: scan_failed creators first, then most-recent signups, then id as a
-- stable tiebreak (mirrors the leaderboard's ORDER BY ... LIMIT pattern). Everything
-- else is unchanged. create or replace, so this only updates the function body.
create or replace function public.admin_creator_analytics(p_days int default 30)
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
      'total', (select count(*) from public.creators),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.creators group by status
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.creators where created_at >= v_start),
      'new_prev_period', (select count(*) from public.creators
        where created_at >= v_prev_start and created_at < v_start),
      'payouts_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid'))
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.creators where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'engagement', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'points', pts) order by d) from (
        select date_trunc('day', created_at) as d, sum(points) as pts
        from public.creator_contribution_events where created_at >= v_start group by 1
      ) e), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', cc.creator_id, 'display_name', cr.display_name,
        'points', cc.contribution_points, 'tier', cc.tier)
        order by cc.contribution_points desc)
      from (
        select creator_id, contribution_points, tier
        from public.creator_contribution
        order by contribution_points desc limit 10
      ) cc join public.creators cr on cr.id = cc.creator_id
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', r.id, 'display_name', r.display_name, 'reason', r.reason))
      from (
        select c.id, c.display_name,
          case when latest.status = 'failed' then 'scan_failed'
               else 'no_active_missions' end as reason
        from public.creators c
        left join lateral (
          select j.status from public.creator_scan_jobs j
          where j.creator_id = c.id order by j.created_at desc limit 1
        ) latest on true
        where latest.status = 'failed'
           or (c.status = 'active' and not exists (
                select 1 from public.mission_participants mp
                where mp.creator_id = c.id and mp.status in ('active', 'completed')))
        order by (case when latest.status = 'failed' then 0 else 1 end), c.created_at desc, c.id
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;
