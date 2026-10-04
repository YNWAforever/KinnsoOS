-- Phase 13A — Missions Operator Console: ops-aggregate analytics for the Overview.
-- Mirrors admin_merchant_analytics: single jsonb payload, gated on is_active_ops(),
-- read-only (no audit). Scope is mission_source='merchant' only — travelpayouts
-- offers are a system-seeded affiliate catalog, not an ops-console concern.
-- Heuristics (documented + tunable here):
--   open_for_applications        = status='published' and visibility='open'
--   submissions_awaiting_review  = mission_milestone_submissions.status in ('submitted','revision_requested')
--   at_risk reasons:
--     published_no_participants = status='published', visibility='open', published_at
--                                  older than 14 days, zero mission_participants rows
--     stalled_submissions       = a submission status='submitted', submitted_at older than
--                                  7 days, reviewed_at still null
--     verification_failed       = a submission's LATEST mission_verification_jobs row has
--                                  status='failed' and no newer job exists for that submission
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
      'total', (select count(*) from public.missions where mission_source = 'merchant'),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.missions
          where mission_source = 'merchant' group by status
        ) s), '{}'::jsonb),
      'by_type', coalesce((
        select jsonb_object_agg(mission_type, c) from (
          select mission_type, count(*) as c from public.missions
          where mission_source = 'merchant' group by mission_type
        ) s), '{}'::jsonb),
      'by_visibility', coalesce((
        select jsonb_object_agg(visibility, c) from (
          select visibility, count(*) as c from public.missions
          where mission_source = 'merchant' group by visibility
        ) s), '{}'::jsonb),
      'open_for_applications', (
        select count(*) from public.missions
        where mission_source = 'merchant' and status = 'published' and visibility = 'open'
      ),
      'submissions_awaiting_review', (
        select count(*) from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where mi.mission_source = 'merchant'
          and sub.status in ('submitted', 'revision_requested')
      )
    ),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions
        where mission_source = 'merchant' and created_at >= v_start
        group by 1
      ) t), '[]'::jsonb),
    'submissions_reviewed', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', sub.reviewed_at) as d, count(*) as cnt
        from public.mission_milestone_submissions sub
        join public.mission_milestones ms on ms.id = sub.mission_milestone_id
        join public.missions mi on mi.id = ms.mission_id
        where mi.mission_source = 'merchant'
          and sub.reviewed_at is not null and sub.reviewed_at >= v_start
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
        where mi.mission_source = 'merchant'
          and (
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
