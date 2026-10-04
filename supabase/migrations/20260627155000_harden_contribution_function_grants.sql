-- Phase 5A hardening: lock down EXECUTE on the contribution-backbone functions.
--
-- Background
-- ----------
-- 20260625090000_creator_contribution_backbone.sql created six SECURITY DEFINER
-- functions in the public schema. Supabase's default privileges grant EXECUTE on
-- every new public function to PUBLIC + anon + authenticated + service_role, so all
-- six were reachable by the `anon` role over PostgREST via /rest/v1/rpc/<fn>.
-- The security advisor flags this as:
--   * 0028 anon_security_definer_function_executable          (anon)
--   * 0029 authenticated_security_definer_function_executable (authenticated)
-- An anonymous (or merely signed-in) caller could otherwise grant, revoke, or
-- force-recompute creator contribution points by POSTing to those RPC endpoints.
--
-- None of these functions are meant to be called over the API:
--   * contribution_on_dna/guide/submission are trigger functions (RETURNS trigger),
--     invoked only by row triggers. PostgreSQL does NOT perform an EXECUTE privilege
--     check when firing a trigger, so no PostgREST-exposed role needs the grant ->
--     revoke from every role (owner `postgres` retains it inherently).
--   * recompute/award/revoke are SECURITY DEFINER helpers invoked only via `perform`
--     from inside those (SECURITY DEFINER, owner = postgres) trigger functions and the
--     one-off backfill block. Inside a SECURITY DEFINER function the EXECUTE check
--     resolves against the function OWNER (postgres), not the original caller, so
--     revoking the exposed roles does NOT break the triggers. No application or worker
--     code calls them via .rpc(). service_role (server-secret-only, never client-
--     exposed) is deliberately retained as a gated path for a future ops/admin
--     recompute; it is not covered by the anon/authenticated advisor lints.
--
-- IMPORTANT: `revoke ... from public` alone is NOT enough -- Supabase's default
-- privileges separately grant EXECUTE to anon/authenticated/service_role on new
-- public functions, so each role must be named explicitly.
--
-- Grants only. Function bodies, signatures, and SECURITY DEFINER status are unchanged.

-- 1. Trigger-only functions: no role needs EXECUTE (triggers don't require a grant).
revoke all on function public.contribution_on_dna()        from public, anon, authenticated, service_role;
revoke all on function public.contribution_on_guide()      from public, anon, authenticated, service_role;
revoke all on function public.contribution_on_submission() from public, anon, authenticated, service_role;

-- 2. SECURITY DEFINER helpers: never callable by anon/authenticated. Owner (via the
--    triggers) and service_role (reserved server-side path) retain EXECUTE.
revoke all on function public.recompute_creator_contribution(p_creator_id uuid)
  from public, anon, authenticated;
revoke all on function public.award_contribution_event(p_creator_id uuid, p_event_type text, p_points integer, p_source_id uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_contribution_event(p_creator_id uuid, p_event_type text, p_source_id uuid)
  from public, anon, authenticated;
