-- SP2 1a: creator table grants — authenticated only, per-command.
-- anon gets NOTHING in the creator schema (creator data is private).
-- service_role already has ALL via alter default privileges in 000006.
-- schema usage was already granted to all roles in 000006.

grant select, update
  on public.creators
  to authenticated;

grant select, insert, update, delete
  on public.creator_social_handles
  to authenticated;

grant select
  on public.creator_scan_jobs
  to authenticated;

grant select, update
  on public.creator_dna
  to authenticated;

-- Hosted Supabase carries project-level default privileges (owned by postgres /
-- supabase_admin) that auto-grant ALL to anon on every new public table. The
-- creator tables hold private PII, so revoke anon explicitly to enforce the
-- "NEVER anon" contract at the grant layer (defense-in-depth alongside RLS).
-- Idempotent: a no-op on a clean Postgres where anon was never auto-granted.
revoke all on public.creators               from anon;
revoke all on public.creator_social_handles from anon;
revoke all on public.creator_scan_jobs      from anon;
revoke all on public.creator_dna            from anon;
