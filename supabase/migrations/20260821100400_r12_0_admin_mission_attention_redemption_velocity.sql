-- R12.0 -- widen admin_mission_attention() to add redemption_velocity flag: offers whose
-- redemption count in the last hour crosses a threshold (10+ redemptions), flagging high-velocity
-- redemptions for ops visibility alongside the existing overdue_reviews and at_risk_missions.
create or replace function public.admin_mission_attention()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'overdue_reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'submission_id', r.submission_id, 'mission_id', r.mission_id, 'mission_title', r.mission_title,
        'creator_id', r.creator_id, 'review_deadline', r.review_deadline) order by r.review_deadline asc)
      from (
        select sub.id as submission_id, mi.id as mission_id, mi.title as mission_title,
          participant.creator_id, sub.review_deadline
        from public.mission_milestone_submissions sub
        join public.mission_participants participant on participant.id = sub.mission_participant_id
        join public.missions mi on mi.id = participant.mission_id
        where sub.status = 'submitted' and sub.review_deadline < now()
        order by sub.review_deadline asc
        limit 50
      ) r
    ), '[]'::jsonb),
    'at_risk_missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'merchant_name', r.merchant_name, 'reason', r.reason))
      from (
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
    ), '[]'::jsonb),
    'redemption_velocity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'offer_id', r.offer_id, 'offer_title', r.offer_title, 'merchant_name', r.merchant_name,
        'redemptions_last_hour', r.redemptions_last_hour) order by r.redemptions_last_hour desc)
      from (
        select mo.id as offer_id, mo.title as offer_title, mp.company_name as merchant_name,
          count(orr.id) as redemptions_last_hour
        from public.merchant_offers mo
        join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
        join public.offer_claims oc on oc.offer_id = mo.id
        join public.offer_redemptions orr on orr.offer_claim_id = oc.id
          and orr.redeemed_at > now() - interval '1 hour'
        group by mo.id, mo.title, mp.company_name
        having count(orr.id) >= 10
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_mission_attention() from public, anon;
grant execute on function public.admin_mission_attention() to authenticated;
