-- supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql

-- R5 cleanup: agent_waitlist has 0 live rows (confirmed at plan time), its
-- server-action consumer (joinAgentWaitlistAction) was deleted in R4's waitlist
-- removal, and it is currently a live anon-INSERT surface with no reader beyond
-- ops. Dropping it closes a real, unnecessary attack-surface line item cheaply
-- while this phase is already touching adjacent RSVP/rate-limit schema.

drop table if exists public.agent_waitlist;
