-- Non-sensitive operational health snapshot for scheduled monitoring.
--
-- The scheduler has no user session, so it cannot call the ops-gated readiness
-- RPC. This projection exposes aggregate counts only (no identities, no content,
-- no per-account data) and is readable by anon by design: it is the same public
-- catalogue signal the site already shows, plus the current hour's turn count.
-- Reads go through the existing derivation so scheduled monitoring cannot report
-- a different status than the ops page.
create function public.kinnso_public_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published integer;
  v_synthetic integer;
  v_attested integer;
  v_verified integer;
  v_turns integer;
begin
  select count(*) filter (where status = 'published'),
         count(*) filter (where status = 'published' and synthetic),
         count(*) filter (where status = 'published' and not synthetic and exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)),
         count(*) filter (where status = 'published' and not synthetic and exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)
           and jsonb_array_length(g.source_refs) > 0 and g.place_verified_at is not null)
    into v_published, v_synthetic, v_attested, v_verified
    from public.guides g;

  select coalesce(sum(used), 0)::integer into v_turns
    from kinnso_internal.chat_turn_budget
   where window_start = date_trunc('hour', now());

  return jsonb_build_object(
    'snapshotAt', now(),
    'publishedGuides', v_published,
    'syntheticGuides', v_synthetic,
    'attestedGuides', v_attested,
    'verifiedGuides', v_verified,
    'chatTurnsUsedThisHour', v_turns);
end $$;

revoke all on function public.kinnso_public_health() from public;
grant execute on function public.kinnso_public_health() to anon, authenticated;

comment on function public.kinnso_public_health() is
  'Aggregate-only operational snapshot for scheduled monitoring; no identities or content.';
