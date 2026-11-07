-- Invite IDs back confirmed operation receipts and audit history.
-- No Data API role may remove rows, even if it bypasses RLS.
-- Revocation, expiry and acceptance continue through the existing lifecycle RPCs.
revoke delete, truncate on table public.kinnso_ops_invites
  from public, anon, authenticated, service_role;
