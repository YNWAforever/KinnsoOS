-- Phase 6A — admin overview counts (fix RLS-scoped count bug).
-- The dashboard ran owner-scoped count() under the ops user's RLS session, so it
-- always read creators:0 / merchants:0 / ops:1. Per the Phase 6 spec, admin reads
-- go through SECURITY DEFINER functions that check ops membership internally.

-- Shared admin helper: true iff the caller is an active ops member.
-- SECURITY INVOKER (default): under RLS, kinnso_ops_members_self_select lets a user
-- see only their own row, so exists(... user_id = auth.uid() ...) is correct for a
-- direct call; inside a SECURITY DEFINER function RLS is bypassed but the
-- user_id = auth.uid() filter still scopes to the original caller. Correct in both.
create or replace function public.is_active_ops()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.kinnso_ops_members
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

-- Platform-wide counts for the admin dashboard. SECURITY DEFINER so an ops user can
-- see global totals despite owner-scoped RLS; gated internally on is_active_ops() so
-- a non-ops caller is rejected at the DB boundary (defense in depth behind the page gate).
create or replace function public.admin_overview_counts()
returns table (creators bigint, merchants bigint, ops bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from public.creators),
    (select count(*) from public.merchant_profiles),
    (select count(*) from public.kinnso_ops_members where status = 'active');
end;
$$;

-- Revoke the implicit PUBLIC execute grant so anon cannot even reach the RPC
-- (the internal is_active_ops() check is the real gate; this is defense in depth).
revoke all on function public.is_active_ops() from public;
revoke all on function public.admin_overview_counts() from public;
grant execute on function public.is_active_ops() to authenticated;
grant execute on function public.admin_overview_counts() to authenticated;
