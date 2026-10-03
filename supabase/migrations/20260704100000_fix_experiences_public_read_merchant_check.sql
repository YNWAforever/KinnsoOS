-- Fix: experiences_public_read (20260704090000) checks merchant activeness with a
-- direct subquery on public.merchant_profiles. Postgres enforces table-level grants
-- for a policy's USING clause using the QUERYING role's own privileges, regardless of
-- RLS — and anon has zero grant on merchant_profiles (deliberately revoked in
-- 20260617173941_mission_grants.sql to keep contact_email etc. off any anon-reachable
-- path). So every anon SELECT on experiences raised "permission denied for table
-- merchant_profiles" instead of being row-filtered. Route the check through a
-- SECURITY DEFINER helper (same shape as app_private.is_mission_participant in
-- 20260617173938_mission_rls.sql) so anon never needs a merchant_profiles grant.

create or replace function app_private.merchant_is_active(target_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.merchant_profiles
    where id = target_merchant_id and status = 'active'
  );
$$;

revoke all on function app_private.merchant_is_active(uuid) from public;
grant usage on schema app_private to anon;
grant execute on function app_private.merchant_is_active(uuid) to anon, authenticated;

drop policy if exists experiences_public_read on public.experiences;
create policy experiences_public_read on public.experiences
  for select to anon, authenticated
  using (status = 'published' and app_private.merchant_is_active(merchant_profile_id));
