-- R13.0: adds an optional, richer brief to missions -- deliverables, requirements, dos/don'ts,
-- key messages, reference links, and an effort estimate. Purely additive: every column is
-- nullable or empty-by-default, no existing mission is affected, and there is no backfill.
--
-- Field set matches the R10-R13 roadmap's R13.0 scope exactly, a deliberate subset of the
-- sibling Adfocate repo's migrations 0011_mission_brief.sql/0019_mission_brief_rich.sql --
-- Adfocate's `platforms` and `target_audience` columns are NOT ported (out of scope, see the
-- phase design doc's Decision 1).
--
-- effort is a nullable text CHECK enum (not numeric hours, not freeform), matching Adfocate's
-- 0011 exactly -- "unspecified" is a valid, common state, so it stays nullable with no default.

alter table public.missions
  add column deliverables text[] not null default '{}',
  add column requirements text[] not null default '{}',
  add column dos text[] not null default '{}',
  add column donts text[] not null default '{}',
  add column key_messages text[] not null default '{}',
  add column reference_links text[] not null default '{}',
  add column effort text check (effort in ('low', 'medium', 'high'));
