-- Review fix for Task 4 (destination-matching queries). The prior fix (15c6363)
-- made getSessionsForDestination's case-sensitive `.overlaps()` work by lowercasing
-- destination_tags at write time (parseTags in lib/sessions/validation.ts) and
-- lowercasing matchTerms in the query. Two problems with that approach:
--
--   1. No backfill — any community_sessions row written before 15c6363 keeps
--      whatever casing it already had until someone happens to re-open and
--      re-save it (the only code path that re-runs the now-lowercasing parseTags).
--      Since surfacing sessions on destination pages is the whole point of Task 4,
--      pre-existing rows were effectively invisible to the new query.
--   2. Every future save permanently discards the creator's original tag casing,
--      and that lowercased value silently round-trips back into the Studio
--      (app/[locale]/studio/sessions/[id]/edit) and admin (AdminSessionsView)
--      edit-form pre-fill.
--
-- Fix: decouple "the value creators see" from "the value used for matching".
-- destination_tags keeps its original casing (the app-layer revert of parseTags
-- ships alongside this migration). A generated, STORED column destination_tags_ci
-- carries the lowercase form and is used ONLY by getSessionsForDestination's
-- .overlaps() comparison. Because it's a STORED GENERATED column (not a trigger or
-- an app-layer write), Postgres computes it for every existing row the moment the
-- column is added — no manual UPDATE backfill statement needed — and keeps it in
-- sync automatically on every future insert/update regardless of which code path
-- writes the row (Studio, admin, or any future one).

create or replace function public.lowercase_text_array(arr text[])
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(lower(t)), '{}'::text[]) from unnest(arr) as t
$$;

alter table public.community_sessions
  add column destination_tags_ci text[] generated always as (public.lowercase_text_array(destination_tags)) stored;

create index community_sessions_destination_tags_ci_idx
  on public.community_sessions using gin (destination_tags_ci);
