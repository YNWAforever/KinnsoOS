-- AUD-02: browser roles must never choose an IP, reset window or quota ceiling.
-- Keep the atomic limiter functions and existing buckets; only trusted servers
-- may execute them. Rollback: supabase/rollbacks/20261028090000_aud_02_server_only_rate_limits.sql
begin;

revoke all on function public.check_and_increment_agent_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.check_and_increment_checkout_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_increment_agent_rate_limit(text, integer, integer) to service_role;
grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to service_role;

-- Defense in depth against hosted default grants; no direct browser ledger access.
revoke all on table public.agent_rate_limits, public.checkout_rate_limits from public, anon, authenticated;

commit;
