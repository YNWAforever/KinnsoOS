-- Creator performance: honest, creator-scoped counts per authored guide.
--
-- Only aggregates are exposed (no traveller identities, no per-user rows). The
-- product currently records saves and contribution events; traveller analytics is
-- not yet populated, so this deliberately reports what exists rather than zeros
-- dressed up as metrics. Verified status uses the same derivation as the public
-- content-status badge.
create function public.kinnso_creator_guide_performance()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_items jsonb;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators where id = v_actor and status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id,
      'title', g.title,
      'status', g.status,
      'synthetic', g.synthetic,
      'verified', (g.status = 'published' and not g.synthetic
        and exists (select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)
        and jsonb_array_length(g.source_refs) > 0
        and g.place_verified_at is not null),
      'saves', (select count(*) from public.guide_saves s where s.guide_id = g.id),
      'saves30d', (select count(*) from public.guide_saves s where s.guide_id = g.id and s.created_at > now() - interval '30 days'),
      'contributions', (select count(*) from public.creator_contribution_events e where e.source_id = g.id and e.creator_id = v_actor),
      'points', coalesce((select sum(e.points) from public.creator_contribution_events e where e.source_id = g.id and e.creator_id = v_actor), 0)
    ) order by g.updated_at desc), '[]'::jsonb)
    into v_items
    from public.guides g
   where g.creator_id = v_actor;

  return jsonb_build_object(
    'generatedAt', now(),
    'guides', v_items,
    'totals', jsonb_build_object(
      'guides', jsonb_array_length(v_items),
      'verified', (select count(*) from jsonb_array_elements(v_items) item where (item->>'verified')::boolean),
      'saves', (select coalesce(sum((item->>'saves')::integer), 0) from jsonb_array_elements(v_items) item),
      'contributions', (select coalesce(sum((item->>'contributions')::integer), 0) from jsonb_array_elements(v_items) item),
      'points', (select coalesce(sum((item->>'points')::integer), 0) from jsonb_array_elements(v_items) item)),
    'notes', jsonb_build_array(
      'Counts are aggregates for your own guides only; no traveller identities are exposed.',
      'Saves come from guide bookmarks; contributions are your creator events. Traveller analytics is not yet populated, so view metrics are not reported here rather than shown as zero.',
      'Small numbers are not statistically meaningful; read them as activity, not performance.'));
end $$;

revoke all on function public.kinnso_creator_guide_performance() from public, anon;
grant execute on function public.kinnso_creator_guide_performance() to authenticated;
