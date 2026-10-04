-- supabase/migrations/20260821120400_r12_1_creator_visits_driven.sql
--
-- R12.1 Task 5 -- widens creator_insights() with a single 'visits_driven' total: a
-- count of offer redemptions attributable to the calling creator, across every offer
-- they've ever promoted. Deliberately simpler than Task 4's merchant-side
-- visits_driven -- this is the creator's OWN single number, not a per-creator/guide
-- breakdown table.
--
-- creator_insights() takes no parameters; it resolves the caller's own creator via
-- v_uid (== auth.uid()), which is compared DIRECTLY against creators.id (see the
-- function's existing forbidden-check: `where id = v_uid and status = 'active'`) --
-- unlike merchant_profiles, creators has no separate user_id indirection column, so
-- v_uid is also the correct, direct scoping value for offer_claims.creator_id (which
-- references creators(id)). Pure additive change to the function's return value -- the
-- signature is unchanged, so this is a true in-place CREATE OR REPLACE (no DROP
-- FUNCTION needed).
--
-- Join path: unlike offer_redemptions.merchant_profile_id (set directly on the row, so
-- Task 4's merchant-side redemption count needed no join through merchant_offers),
-- offer_redemptions has no creator_id/guide_id column of its own -- the only path from
-- a redemption to the creator who drove it is via offer_claims.creator_id, joined
-- through offer_redemptions.offer_claim_id. That column is `unique` on
-- offer_redemptions (one redemption per claim, one claim per redemption), so this join
-- is a strict 1:1 and cannot fan out or double-count -- count(*) here is equivalent to
-- count(distinct orr.id).
create or replace function public.creator_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_window_start timestamptz := date_trunc('week', now()) - interval '11 weeks';
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'points_total',
      coalesce((select sum(points) from public.creator_contribution_events where creator_id = v_uid), 0),
    'points_before_window',
      coalesce((select sum(points) from public.creator_contribution_events
                where creator_id = v_uid and created_at < v_window_start), 0),
    'points_by_type', coalesce((
      select jsonb_object_agg(event_type, pts) from (
        select event_type, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid group by event_type) s
    ), '{}'::jsonb),
    'points_trajectory', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', wk, 'points', pts) order by wk) from (
        select date_trunc('week', created_at)::date as wk, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid and created_at >= v_window_start
        group by 1) t
    ), '[]'::jsonb),
    'guides_published',
      (select count(*) from public.guides where creator_id = v_uid and status = 'published'),
    'guide_saves_total',
      coalesce((select sum(saves_count) from public.guides
                where creator_id = v_uid and status = 'published'), 0),
    'missions_by_status', coalesce((
      select jsonb_object_agg(status, c) from (
        select status, count(*) as c from public.mission_participants
        where creator_id = v_uid group by status) m
    ), '{}'::jsonb),
    'submissions_approved', (
      select count(*) from public.mission_milestone_submissions s
      join public.mission_participants mp on mp.id = s.mission_participant_id
      where mp.creator_id = v_uid and s.status = 'approved'),
    'visits_driven', coalesce((
      select count(*)
      from public.offer_redemptions orr
      join public.offer_claims oc on oc.id = orr.offer_claim_id
      where oc.creator_id = v_uid
    ), 0)
  );
end $$;

-- Signature is unchanged (still zero-arg) -- grants persist across CREATE OR REPLACE,
-- but re-assert them for clarity/defense-in-depth, matching the original migration.
revoke all on function public.creator_insights() from public, anon;
grant execute on function public.creator_insights() to authenticated;
