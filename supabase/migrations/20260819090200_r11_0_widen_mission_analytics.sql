-- R11.0 — Widen admin_mission_analytics beyond the merchant-only mission source.
-- Why: the original migration (20260702090000_admin_mission_analytics.sql) scoped every
--   subquery to the merchant mission source, reasoning that travelpayouts-sourced missions
--   were "a system-seeded affiliate catalog, not an ops-console concern." That reasoning no
--   longer holds — travelpayouts-sourced missions need the same ops visibility (review
--   queues, at-risk flags, trend counts) as merchant-sourced ones, and their invisibility to
--   this RPC is the exact gap the R11.0 roadmap calls out by name.
-- What: this is `create or replace function` of the exact same function, with every
--   merchant-only mission_source filter condition (bare and qualified-alias forms) removed
--   from every subquery (kpis.total / by_status / by_type / by_visibility /
--   open_for_applications / submissions_awaiting_review, missions_created,
--   submissions_reviewed, and at_risk). No other logic, formatting, or structure changed.
-- Safety: `create or replace function` is safe here because this function returns `jsonb`,
--   not a `RETURNS TABLE` shape — the "can't widen RETURNS TABLE column count in place"
--   gotcha does not apply.
-- Gate: the is_active_ops() gate is unchanged — this stays a read-only RPC, not widened to
--   is_active_ops_role.
create or replace function public.admin_mission_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.missions),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.missions
          group by status
        ) s), '{}'::jsonb),
      'by_type', coalesce((
        select jsonb_object_agg(mission_type, c) from (
          select mission_type, count(*) as c from public.missions
          group by mission_type
        ) s), '{}'::jsonb),
      'by_visibility', coalesce((
        select jsonb_object_agg(visibility, c) from (
          select visibility, count(*) as c from public.missions
          group by visibility
        ) s), '{}'::jsonb),
      'open_for_applications', (
        select count(*) from public.missions
        where status = 'published' and visibility = 'open'
      ),
      'submissions_awaiting_review', (
        select count(*) from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where sub.status in ('submitted', 'revision_requested')
      )
    ),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions
        where created_at >= v_start
        group by 1
      ) t), '[]'::jsonb),
    'submissions_reviewed', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', sub.reviewed_at) as d, count(*) as cnt
        from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where sub.reviewed_at is not null and sub.reviewed_at >= v_start
        group by 1
      ) t), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'merchant_name', r.merchant_name, 'reason', r.reason))
      from (
        -- CASE order encodes reason priority: verification_failed and stalled_submissions
        -- (submission-level problems) outrank published_no_participants (a mission-level
        -- problem) so a mission with both is never mislabeled by the weaker reason.
        select mi.id, mi.title, mp.company_name as merchant_name,
          case
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            ) then 'verification_failed'
            when exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            ) then 'stalled_submissions'
            else 'published_no_participants'
          end as reason
        from public.missions mi
        join public.merchant_profiles mp on mp.id = mi.merchant_profile_id
        where (
            exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and (
                  select vj.status from public.mission_verification_jobs vj
                  where vj.mission_milestone_submission_id = sub.id
                  order by vj.created_at desc limit 1
                ) = 'failed'
            )
            or exists (
              select 1
              from public.mission_milestone_submissions sub
              join public.mission_milestones ms on ms.id = sub.mission_milestone_id
              where ms.mission_id = mi.id
                and sub.status = 'submitted'
                and sub.submitted_at < now() - interval '7 days'
            )
            or (
              mi.status = 'published' and mi.visibility = 'open'
              and mi.published_at < now() - interval '14 days'
              and not exists (
                select 1 from public.mission_participants part where part.mission_id = mi.id
              )
            )
          )
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_mission_analytics(int) from public, anon;
grant execute on function public.admin_mission_analytics(int) to authenticated;
