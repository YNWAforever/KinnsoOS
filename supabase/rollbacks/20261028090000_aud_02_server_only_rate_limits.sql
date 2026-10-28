-- Emergency compatibility rollback ONLY: restores the audited browser-RPC
-- vulnerability. Coordinate with the application revert; see the audit runbook.
-- service_role already had EXECUTE via 20260613000006_grants.sql defaults.
begin;
grant execute on function public.check_and_increment_agent_rate_limit(text, integer, integer) to anon, authenticated;
grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to anon, authenticated;
commit;
