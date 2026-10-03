-- R4 (design doc D-R4-6): bookings made via an agent-surfaced experience link get
-- source_surface = 'agent', reusing R3C's attribution query-param mechanism unchanged
-- (?src=agent, same as ?src=guide/?src=article). creator_id/guide_id stay null for
-- agent-attributed bookings (the agent isn't tied to a specific creator the way a guide
-- CTA is) — resolveAttribution() already handles this correctly with zero code changes,
-- since it only special-cases sourceSurface === 'guide'.

alter table public.bookings drop constraint bookings_source_surface_check;

alter table public.bookings
  add constraint bookings_source_surface_check
  check (source_surface in ('guide','article','experience_page','direct','agent'));
