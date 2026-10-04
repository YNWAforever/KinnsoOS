-- supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql
--
-- R12.1 Task 4 -- widens merchant_insights() with a 'visits_driven' breakdown: per
-- creator/guide, a redemptions count (offer commission channel) and a separately
-- tracked attributed_bookings count (booking commission channel). Deliberately NOT
-- merged into one number -- they represent different revenue channels.
--
-- merchant_insights() takes no parameters; it resolves the caller's own merchant via
-- v_merchant (looked up from auth.uid() against merchant_profiles, same as the rest of
-- the function). Pure additive change to the function's return value -- the signature
-- is unchanged, so this is a true in-place CREATE OR REPLACE (no DROP FUNCTION needed).
--
-- Code-review fixes applied here (post-initial-draft):
--   1. The inner truncation subquery now has an explicit ORDER BY ... DESC immediately
--      before its LIMIT 50. Postgres LIMIT without ORDER BY has no defined row
--      selection, so without this a merchant with more than 50 qualifying creator/guide
--      rows could silently lose its actual top performers, and unstably across re-runs.
--   2. attributed_bookings is now counted independently of offer_claims. Previously
--      bookings were only reachable via bookings.guide_id -> guides.id <- offer_claims,
--      so a booking could never count unless that SAME creator/guide pairing also had an
--      offer_claims row -- undercounting the dominant real-world case of a booking whose
--      visitor never claimed a merchant offer. It now uses bookings.creator_id/guide_id
--      directly -- the same attribution signal create_booking_settlement_on_confirm()
--      already uses to trigger creator-commission settlements (see
--      20260704140000_r3b_booking_settlements_and_trigger.sql) -- scoped to the merchant
--      via experiences.merchant_profile_id. redemptions and attributed_bookings are each
--      computed in their own grouped CTE and combined with a FULL OUTER JOIN on
--      (creator_id, guide_id), so neither channel requires the other to exist and the two
--      counts can never cross-multiply each other. The now-dead merchant_offers join
--      (never selected/filtered beyond its own ON clause) is removed as part of this
--      restructure -- redemptions were already correctly scoped via
--      offer_redemptions.merchant_profile_id, which is independently set at redemption
--      time and never depended on the mo join.
create or replace function public.merchant_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles
    where user_id = v_uid and status = 'active';
  if v_merchant is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'missions_published', (
      select count(*) from public.missions
      where merchant_profile_id = v_merchant and status = 'published'),
    'per_mission', coalesce((
      select jsonb_agg(m order by m->>'title') from (
        select jsonb_build_object(
          'mission_id', mi.id,
          'title', mi.title,
          'status', mi.status,
          'invited',  count(mp.id) filter (where mp.status = 'invited'),
          'applied',  count(mp.id) filter (where mp.status = 'applied'),
          'active',   count(mp.id) filter (where mp.status = 'active'),
          'rejected', count(mp.id) filter (where mp.status = 'rejected'),
          'approved_submissions', (
            select count(*) from public.mission_milestone_submissions s
            join public.mission_participants mp2 on mp2.id = s.mission_participant_id
            where mp2.mission_id = mi.id and s.status = 'approved')
        ) as m
        from public.missions mi
        left join public.mission_participants mp on mp.mission_id = mi.id
        where mi.merchant_profile_id = v_merchant
        group by mi.id, mi.title, mi.status
      ) rows
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'participants', count(mp.id),
        'invited',  count(mp.id) filter (where mp.source = 'merchant_invite'),
        'accepted', count(mp.id) filter (where mp.source = 'merchant_invite' and mp.status = 'active'),
        'approved_submissions', (
          select count(*) from public.mission_milestone_submissions s
          join public.mission_participants mp3 on mp3.id = s.mission_participant_id
          join public.missions mi3 on mi3.id = mp3.mission_id
          where mi3.merchant_profile_id = v_merchant and s.status = 'approved')
      )
      from public.mission_participants mp
      join public.missions mi2 on mi2.id = mp.mission_id
      where mi2.merchant_profile_id = v_merchant
    ),
    'visits_driven', coalesce((
      with redemption_counts as (
        -- redemptions: offer commission channel. A redemption only counts once its
        -- offer_redemptions row is scoped to THIS merchant -- merchant_profile_id is
        -- independently stored on offer_redemptions (set at redemption time), so this
        -- does not need a join through merchant_offers to be correctly scoped (see the
        -- removed mo join, above).
        select oc.creator_id, oc.guide_id, count(distinct orr.id) as redemptions
        from public.offer_claims oc
        join public.offer_redemptions orr
          on orr.offer_claim_id = oc.id and orr.merchant_profile_id = v_merchant
        group by oc.creator_id, oc.guide_id
      ),
      booking_counts as (
        -- attributed_bookings: booking commission channel, independent of offer_claims.
        -- Uses bookings.creator_id/guide_id directly -- the same signal
        -- create_booking_settlement_on_confirm() uses to trigger a creator commission --
        -- scoped to this merchant via experiences.merchant_profile_id.
        select b.creator_id, b.guide_id, count(distinct b.id) as attributed_bookings
        from public.bookings b
        join public.experiences e
          on e.id = b.experience_id and e.merchant_profile_id = v_merchant
        where b.status in ('confirmed', 'completed')
          and b.creator_id is not null
        group by b.creator_id, b.guide_id
      ),
      combined as (
        -- FULL OUTER JOIN, not a plain join: a creator/guide pairing may appear in only
        -- one of the two channels, and each channel's count must survive even when the
        -- other channel has zero rows for that pairing. Matching on (creator_id,
        -- guide_id) keeps the two counts as independent scalars per pairing -- no
        -- fan-out, no cross-multiplication between redemptions and attributed_bookings.
        -- guide_id is matched with IS NOT DISTINCT FROM so two NULL-guide pairings for
        -- the same creator (e.g. a profile-surface claim and a guide-less booking) merge
        -- into one combined row instead of splitting spuriously on NULL <> NULL.
        select
          coalesce(rc.creator_id, bc.creator_id) as creator_id,
          coalesce(rc.guide_id, bc.guide_id) as guide_id,
          coalesce(rc.redemptions, 0) as redemptions,
          coalesce(bc.attributed_bookings, 0) as attributed_bookings
        from redemption_counts rc
        full outer join booking_counts bc
          on bc.creator_id = rc.creator_id and bc.guide_id is not distinct from rc.guide_id
      )
      select jsonb_agg(jsonb_build_object(
        'creator_id', c.id, 'creator_name', c.display_name,
        'guide_id', g.id, 'guide_title', g.title,
        'redemptions', top50.redemptions, 'attributed_bookings', top50.attributed_bookings
      ) order by (top50.redemptions + top50.attributed_bookings) desc)
      from (
        select * from combined
        order by (redemptions + attributed_bookings) desc
        limit 50
      ) top50
      join public.creators c on c.id = top50.creator_id
      left join public.guides g on g.id = top50.guide_id
    ), '[]'::jsonb)
  );
end $$;

-- Signature is unchanged (still zero-arg) -- grants persist across CREATE OR REPLACE,
-- but re-assert them for clarity/defense-in-depth, matching the original migration.
revoke all on function public.merchant_insights() from public, anon;
grant execute on function public.merchant_insights() to authenticated;
