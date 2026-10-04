-- Task 4's code-quality review flagged that 20260711062712_r6b_fix_session_destination_tags_ci_backfill.sql
-- switched getSessionsForDestination's overlap filter from destination_tags to the new
-- destination_tags_ci column, but never dropped the now-orphaned
-- community_sessions_destination_tags_idx GIN index (created in
-- 20260709090000_r6b_destinations.sql specifically to support that query, before the
-- casing bug was found). No remaining code path array-filters on raw destination_tags,
-- so the old index is now pure write-path overhead with zero read benefit --
-- community_sessions_destination_tags_ci_idx (added alongside destination_tags_ci) is the
-- one actually used by getSessionsForDestination's .overlaps() call today.

drop index if exists public.community_sessions_destination_tags_idx;
