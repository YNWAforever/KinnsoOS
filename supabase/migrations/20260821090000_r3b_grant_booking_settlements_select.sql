-- 20260704141000_r3b_fix_booking_settlements_table_grant.sql correctly revoked the
-- project's default auto-grant of ALL privileges to anon/authenticated on this table,
-- but never re-granted the SELECT that the RLS policy booking_settlements_ops_all
-- (20260704140000) was written to gate: a revoked table-level GRANT blocks the query
-- before RLS is even consulted, so every ops read of booking_settlements has failed
-- with "permission denied" since that revoke shipped. RLS still restricts rows to
-- public.is_active_ops() callers, so this grant does not widen actual data access.
grant select on table public.booking_settlements to authenticated;
