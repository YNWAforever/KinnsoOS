-- supabase/migrations/20260822090500_r12_2_lock_down_repeatable_submission_insert.sql
--
-- Code review finding: mission_submissions_creator_insert (20260617173938_mission_rls.sql)
-- only checked participant ownership + active status before allowing a direct insert into
-- mission_milestone_submissions -- it said nothing about mission_type, repeatable, or
-- missions.max_receipts_per_creator. Combined with Task 1's partial unique index
-- (mission_milestone_submissions_unique_non_repeatable ... where not milestone_repeatable,
-- 20260822090000_r12_2_receipt_cashback_schema.sql), which deliberately allows unlimited rows
-- for a repeatable milestone, any authenticated creator could bypass submit_receipt's
-- lock-count-cap enforcement entirely by inserting directly into
-- mission_milestone_submissions against a repeatable milestone via the ordinary PostgREST
-- client -- submit_receipt's cap check never runs for a direct insert, so a creator (or any
-- client speaking to PostgREST) could rack up unlimited 'submitted' rows past
-- missions.max_receipts_per_creator.
--
-- Fix: require the referenced mission_milestones.repeatable = false for a direct creator
-- insert, ANDed onto the existing participant-ownership/active-status check (unchanged).
-- Every pre-existing mission type (coupon_affiliate/hybrid/paid) only ever has
-- repeatable = false milestones -- only create_repeatable_milestone_for_receipt_mission_trg
-- (20260822090000_r12_2_receipt_cashback_schema.sql) ever sets repeatable = true, and only for
-- a receipt_cashback mission's single auto-created milestone -- so this new condition is a
-- no-op for every existing mission type's normal submission flow. It only closes the gap for
-- repeatable (receipt-cashback) milestones, forcing all such submissions through the
-- security-definer submit_receipt RPC (20260822090400_r12_2_submit_receipt.sql) instead.
-- submit_receipt's own insert is unaffected: SECURITY DEFINER functions run with the
-- privileges of the function owner, bypassing the CALLING user's RLS policies -- the same
-- mechanism already relied on by claim_offer inserting into offer_claims
-- (20260821100100_r12_0_claim_offer.sql) despite offer_claims carrying a blanket
-- `revoke all ... from public, anon, authenticated` (20260821100000_r12_0_offer_claim_redemption_tables.sql)
-- that leaves ordinary clients with no insert path into that table at all.

drop policy "mission_submissions_creator_insert" on public.mission_milestone_submissions;

create policy "mission_submissions_creator_insert" on public.mission_milestone_submissions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_milestone_submissions.mission_participant_id
        and participant.creator_id = (select auth.uid())
        and participant.status = 'active'
    )
    and exists (
      select 1
      from public.mission_milestones milestone
      where milestone.id = mission_milestone_submissions.mission_milestone_id
        and milestone.repeatable = false
    )
  );
