-- SP2 Plan 3: enforce the single-active-job invariant at the DB level.
--
-- The POST /scan handler checks "no active job exists" in app code via a
-- read-then-insert, which is racy: two concurrent requests for the same creator
-- can both pass the check and both insert a 'queued' job (TOCTOU), wasting
-- RapidAPI/LLM quota and spawning redundant scans.
--
-- A partial unique index makes "at most one non-terminal job per creator" a hard
-- DB invariant. A conflicting insert raises a unique violation (SQLSTATE 23505),
-- which apps/scan maps to HTTP 429 (rate limited), matching the app-level check.
create unique index creator_scan_jobs_one_active_per_creator
  on public.creator_scan_jobs (creator_id)
  where status in ('queued', 'fetching', 'analyzing');
