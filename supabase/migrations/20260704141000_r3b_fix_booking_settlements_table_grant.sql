-- This hosted Supabase project's default privileges auto-grant ALL on every new
-- public table directly to anon/authenticated (the same default-ACL behavior that
-- bit confirm_booking_from_webhook() as a function grant in
-- 20260704130000_r3a2_fix_confirm_booking_webhook_grant.sql — here it's a table
-- grant instead). RLS already denies anon in practice (no anon-scoped policy exists
-- on booking_settlements), but the underlying grant should not be left standing —
-- see guides.sql for the same pattern on an older table.
revoke all on table public.booking_settlements from anon, authenticated;
