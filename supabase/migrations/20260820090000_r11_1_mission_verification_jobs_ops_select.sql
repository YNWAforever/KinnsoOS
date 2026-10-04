-- R11.1 -- ops needs to read mission_verification_jobs.confidence_status directly. The
-- review queue's confidence badge (getReviewQueue in mission-review-queries.ts) is a plain
-- client-side nested select through PostgREST, not a SECURITY DEFINER RPC, so it is fully
-- subject to this table's own RLS. The table's only existing policy (the owner-scoped select
-- added in 20260619000002_mission_verification_jobs.sql) scopes reads to
-- `creator_id = auth.uid()` -- an ops session has never been able to see this table at all
-- outside a SECURITY DEFINER function like admin_mission_analytics. Discovered while building
-- R11.1's own queue confidence sort/badges, which depend on exactly this read succeeding for a
-- real ops session, not just a service-role one.
--
-- A second permissive SELECT policy ORs with the existing owner policy (Postgres RLS: any
-- matching permissive policy on a table grants access) -- this does not narrow or replace the
-- existing creator-owner read, and mirrors the third exists-branch of
-- mission_review_events_select (20260819090000_r11_0_mission_review_events.sql) exactly.
create policy mission_verification_jobs_ops_select on public.mission_verification_jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );
