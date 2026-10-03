-- supabase/migrations/20260822090600_r12_2_at_most_one_repeatable_milestone.sql
--
-- submit_receipt (20260822090400) looks up a mission's repeatable milestone via
-- `where mission_id = p_mission_id and repeatable = true limit 1`, with no ORDER BY, and
-- scopes the per-creator cap count to that single milestone id. Nothing before this migration
-- stopped a merchant or ops actor from inserting a SECOND repeatable=true milestone on the
-- same mission via the ordinary mission_milestones_merchant_ops_insert policy (it only checks
-- mission ownership, not the repeatable flag) -- if that happened, a creator's submissions
-- could split across two milestone rows, each individually under max_receipts_per_creator,
-- multiplying the intended cap. Two independent guards close this:
--
-- 1. A partial unique index enforces "at most one repeatable milestone per mission" at the
--    DB level, regardless of which path inserts it (the Task 1 auto-creation trigger, a
--    direct ops insert, or anything else) -- this is the hard guarantee submit_receipt's
--    lookup actually depends on.
-- 2. The RLS insert policy is tightened so repeatable=true can only ever be set on a mission
--    whose mission_type is 'receipt_cashback' -- defense in depth, preventing a repeatable
--    milestone from ever attaching to the wrong mission type in the first place, independent
--    of the uniqueness guarantee above.

create unique index mission_milestones_one_repeatable_per_mission
  on public.mission_milestones (mission_id)
  where repeatable;

drop policy "mission_milestones_merchant_ops_insert" on public.mission_milestones;
create policy "mission_milestones_merchant_ops_insert" on public.mission_milestones
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.missions mission
      left join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      left join public.kinnso_ops_members ops on ops.id = mission.created_by_ops_member_id
      where mission.id = mission_milestones.mission_id
        and (
          merchant.user_id = (select auth.uid())
          or (ops.user_id = (select auth.uid()) and ops.status = 'active')
        )
        and (
          not mission_milestones.repeatable
          or mission.mission_type = 'receipt_cashback'
        )
    )
  );
