-- Phase 8 — Analytics & Insights. Two read-only SECURITY DEFINER aggregators.
-- No new tables. Each gates internally on the caller's identity and returns ONLY
-- that caller's own data as a single jsonb object. Honesty boundaries: no guide
-- views (not tracked), points not dollars, approved submissions (never the unused
-- 'completed' participant status) as the delivered-work signal.

create or replace function public.creator_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_window_start timestamptz := date_trunc('week', now()) - interval '11 weeks';
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'points_total',
      coalesce((select sum(points) from public.creator_contribution_events where creator_id = v_uid), 0),
    'points_before_window',
      coalesce((select sum(points) from public.creator_contribution_events
                where creator_id = v_uid and created_at < v_window_start), 0),
    'points_by_type', coalesce((
      select jsonb_object_agg(event_type, pts) from (
        select event_type, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid group by event_type) s
    ), '{}'::jsonb),
    'points_trajectory', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', wk, 'points', pts) order by wk) from (
        select date_trunc('week', created_at)::date as wk, sum(points) as pts
        from public.creator_contribution_events
        where creator_id = v_uid and created_at >= v_window_start
        group by 1) t
    ), '[]'::jsonb),
    'guides_published',
      (select count(*) from public.guides where creator_id = v_uid and status = 'published'),
    'guide_saves_total',
      coalesce((select sum(saves_count) from public.guides
                where creator_id = v_uid and status = 'published'), 0),
    'missions_by_status', coalesce((
      select jsonb_object_agg(status, c) from (
        select status, count(*) as c from public.mission_participants
        where creator_id = v_uid group by status) m
    ), '{}'::jsonb),
    'submissions_approved', (
      select count(*) from public.mission_milestone_submissions s
      join public.mission_participants mp on mp.id = s.mission_participant_id
      where mp.creator_id = v_uid and s.status = 'approved')
  );
end $$;

create or replace function public.merchant_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles
    where user_id = v_uid and status = 'active';
  if v_merchant is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'missions_published', (
      select count(*) from public.missions
      where merchant_profile_id = v_merchant and status = 'published'),
    'per_mission', coalesce((
      select jsonb_agg(m order by m->>'title') from (
        select jsonb_build_object(
          'mission_id', mi.id,
          'title', mi.title,
          'status', mi.status,
          'invited',  count(mp.id) filter (where mp.status = 'invited'),
          'applied',  count(mp.id) filter (where mp.status = 'applied'),
          'active',   count(mp.id) filter (where mp.status = 'active'),
          'rejected', count(mp.id) filter (where mp.status = 'rejected'),
          'approved_submissions', (
            select count(*) from public.mission_milestone_submissions s
            join public.mission_participants mp2 on mp2.id = s.mission_participant_id
            where mp2.mission_id = mi.id and s.status = 'approved')
        ) as m
        from public.missions mi
        left join public.mission_participants mp on mp.mission_id = mi.id
        where mi.merchant_profile_id = v_merchant
        group by mi.id, mi.title, mi.status
      ) rows
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'participants', count(mp.id),
        'invited',  count(mp.id) filter (where mp.source = 'merchant_invite'),
        'accepted', count(mp.id) filter (where mp.source = 'merchant_invite' and mp.status = 'active'),
        'approved_submissions', (
          select count(*) from public.mission_milestone_submissions s
          join public.mission_participants mp3 on mp3.id = s.mission_participant_id
          join public.missions mi3 on mi3.id = mp3.mission_id
          where mi3.merchant_profile_id = v_merchant and s.status = 'approved')
      )
      from public.mission_participants mp
      join public.missions mi2 on mi2.id = mp.mission_id
      where mi2.merchant_profile_id = v_merchant
    )
  );
end $$;

-- Grants: Supabase default privileges re-grant EXECUTE to anon/authenticated on new
-- public functions, so revoke from BOTH public and anon (advisor 0028), then grant
-- only authenticated. Ownership gate is internal (defense in depth behind page gates).
revoke all on function public.creator_insights()  from public, anon;
revoke all on function public.merchant_insights() from public, anon;
grant execute on function public.creator_insights()  to authenticated;
grant execute on function public.merchant_insights() to authenticated;
