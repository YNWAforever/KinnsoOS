-- SP2 1a: enable Realtime for creator_scan_jobs so clients can subscribe
-- to status changes without polling.
alter publication supabase_realtime add table public.creator_scan_jobs;
