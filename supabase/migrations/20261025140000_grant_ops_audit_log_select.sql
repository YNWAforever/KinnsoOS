-- Creator and merchant detail pages read ops_audit_log as the signed-in operator
-- (apps/web/lib/admin/audit.ts). The ops_audit_read policy already limits those
-- rows to active ops, but this table never received SELECT for authenticated.
-- Postgres rejects the query with 42501 before the policy runs, and the detail
-- page turns that into a 500, so an operator cannot open a creator to activate
-- them. Writes stay on the security-definer append function: this grant is select only.
grant select on table public.ops_audit_log to authenticated;
