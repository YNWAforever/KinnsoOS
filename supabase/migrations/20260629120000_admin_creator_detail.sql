-- Phase 10C — Creator 360 detail aggregator. One SECURITY DEFINER, is_active_ops()-gated
-- RPC returning a single jsonb payload for the detail page (mirrors admin_creator_analytics).
-- Returns NULL when the creator id does not exist, so the page can render notFound().
-- Settlements are linked to a creator via mission_settlements.mission_participant_id ->
-- mission_participants.creator_id. Reads only; no writes, no PII (creators has no email).

create or replace function public.admin_creator_detail(p_creator_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_exists boolean;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.creators where id = p_creator_id;
  if v_exists is null then
    return null;  -- missing creator -> wrapper returns null -> page notFound()
  end if;

  return jsonb_build_object(
    'creator', (
      select jsonb_build_object(
        'id', c.id, 'display_name', c.display_name, 'handle', c.handle,
        'status', c.status, 'verified', c.verified, 'bio', c.bio,
        'created_at', c.created_at, 'updated_at', c.updated_at)
      from public.creators c where c.id = p_creator_id
    ),
    'contribution', (
      select jsonb_build_object(
        'points', cc.contribution_points, 'tier', cc.tier, 'tier_updated_at', cc.tier_updated_at)
      from public.creator_contribution cc where cc.creator_id = p_creator_id
    ),
    'dna', (
      select jsonb_build_object(
        'id', d.id, 'status', d.status, 'model', d.model,
        'draft_ready_at', d.draft_ready_at, 'updated_at', d.updated_at)
      from public.creator_dna d where d.creator_id = p_creator_id
      order by d.updated_at desc limit 1
    ),
    'scan', (
      select jsonb_build_object(
        'id', j.id, 'status', j.status, 'error', j.error,
        'started_at', j.started_at, 'completed_at', j.completed_at, 'created_at', j.created_at)
      from public.creator_scan_jobs j where j.creator_id = p_creator_id
      order by j.created_at desc limit 1
    ),
    'socials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', s.platform, 'handle', s.handle, 'url', s.url) order by s.platform)
      from public.creator_social_handles s where s.creator_id = p_creator_id
    ), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', mp.id, 'mission_id', mp.mission_id, 'title', m.title,
        'status', mp.status, 'source', mp.source,
        'approved_at', mp.approved_at, 'created_at', mp.created_at)
        order by mp.created_at desc)
      from public.mission_participants mp
      join public.missions m on m.id = mp.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'mission_title', m.title, 'status', st.status,
        'creator_payout_status', st.creator_payout_status,
        'creator_commission_amount', st.creator_commission_amount,
        'amount_currency', st.amount_currency, 'created_at', st.created_at)
        order by st.created_at desc)
      from public.mission_settlements st
      join public.mission_participants mp on mp.id = st.mission_participant_id
      join public.missions m on m.id = st.mission_id
      where mp.creator_id = p_creator_id
    ), '[]'::jsonb),
    'points_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'points', e.points, 'created_at', e.created_at)
        order by e.created_at desc)
      from (
        select id, event_type, points, created_at
        from public.creator_contribution_events
        where creator_id = p_creator_id
        order by created_at desc limit 50
      ) e
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'slug', g.slug, 'status', g.status,
        'saves_count', g.saves_count, 'published_at', g.published_at, 'created_at', g.created_at)
        order by g.created_at desc)
      from public.guides g where g.creator_id = p_creator_id
    ), '[]'::jsonb)
  );
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (is_active_ops() is the gate).
revoke all on function public.admin_creator_detail(uuid) from public, anon;
grant execute on function public.admin_creator_detail(uuid) to authenticated;
