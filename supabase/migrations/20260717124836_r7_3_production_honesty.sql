-- R7.3: production-honesty structural changes, creator listing boundary,
-- save-counter repair, and explicit editorial attribution.

alter table public.guides alter column cover_url drop not null;

-- Repair historical drift once; the shipped guide_saves trigger remains installed.
update public.guides g
set saves_count = (
  select count(*)::int from public.guide_saves gs where gs.guide_id = g.id
)
where g.saves_count is distinct from (
  select count(*)::int from public.guide_saves gs where gs.guide_id = g.id
);

alter table public.creators
  add column if not exists is_listed boolean not null default false;

-- The existing owner policy still governs which row may be edited, while
-- column privileges make the listing override unreachable through direct
-- authenticated table updates (including an ops user's own creator row).
-- SECURITY DEFINER admin_set_creator_listed remains the sole write boundary.
revoke update on public.creators from authenticated;
grant update (
  id, display_name, status, created_at, updated_at, handle, bio, public_profile, verified
) on public.creators to authenticated;

create or replace function public.protect_creator_is_listed()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_listed is distinct from old.is_listed and not public.is_active_ops() then
    raise exception 'forbidden_listing_override' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger creators_protect_is_listed
  before update on public.creators
  for each row execute procedure public.protect_creator_is_listed();

revoke all on function public.protect_creator_is_listed() from public, anon, authenticated, service_role;

create or replace function public.admin_set_creator_listed(
  p_id uuid, p_is_listed boolean, p_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare v_from boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(p_reason) > 500 then raise exception 'reason_too_long'; end if;
  select is_listed into v_from from public.creators where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  update public.creators set is_listed = p_is_listed, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'listing.set', p_reason,
    jsonb_build_object('from', v_from, 'to', p_is_listed)
  );
end $$;

revoke all on function public.admin_set_creator_listed(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_creator_listed(uuid, boolean, text) to authenticated;

-- Re-create the current shipped Creator 360 function verbatim, adding only
-- is_listed to the nested creator object.
create or replace function public.admin_creator_detail(p_creator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_exists boolean;
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select true into v_exists from public.creators where id = p_creator_id;
  if v_exists is null then
    return null;
  end if;

  return jsonb_build_object(
    'creator', (
      select jsonb_build_object(
        'id', c.id, 'display_name', c.display_name, 'handle', c.handle,
        'status', c.status, 'verified', c.verified, 'bio', c.bio,
        'is_listed', c.is_listed,
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
        'approved_at', mp.approved_at, 'created_at', mp.created_at,
        'submissions_total', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id),
        'submissions_approved', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id and s.status = 'approved'),
        'submissions_pending', (
          select count(*) from public.mission_milestone_submissions s
          where s.mission_participant_id = mp.id
            and s.status in ('pending', 'submitted', 'revision_requested')))
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
end $function$;
revoke all on function public.admin_creator_detail(uuid) from public, anon;
grant execute on function public.admin_creator_detail(uuid) to authenticated;

insert into public.article_authors (slug, locale, name, title, bio, avatar, labels, is_active)
select 'kinnso-editorial', locale, 'KINNSO Editorial', null, null, null, '{}', true
from unnest(array['en','zh-hk','zh-tw','zh-cn','ja','ko','th']) as locale
on conflict (slug, locale) do update
set name = excluded.name, is_active = true;
