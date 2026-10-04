-- Phase 12C — Thread is_active_ops_role(p_min) into every existing audited RPC.
-- Pattern: replace `if not public.is_active_ops() then` with
-- `if not public.is_active_ops_role('<level>') then`. Every function body below is
-- byte-identical to its live definition (pulled via pg_get_functiondef) except that
-- one gate line. is_active_ops() is NOT dropped — it still gates requireOpsPage /
-- requireOpsAction in the app layer (binary active-member check unchanged).
--
-- Permission matrix: read = analyst+, moderation = moderator+, settlements = admin+.

-- ══════════════════════════════ READ (analyst) ══════════════════════════════

create or replace function public.admin_creator_analytics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_start timestamptz := v_start - make_interval(days => v_days);
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.creators),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.creators group by status
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.creators where created_at >= v_start),
      'new_prev_period', (select count(*) from public.creators
        where created_at >= v_prev_start and created_at < v_start),
      'payouts_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid'))
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.creators where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'engagement', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'points', pts) order by d) from (
        select date_trunc('day', created_at) as d, sum(points) as pts
        from public.creator_contribution_events where created_at >= v_start group by 1
      ) e), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', cc.creator_id, 'display_name', cr.display_name,
        'points', cc.contribution_points, 'tier', cc.tier)
        order by cc.contribution_points desc)
      from (
        select creator_id, contribution_points, tier
        from public.creator_contribution
        order by contribution_points desc limit 10
      ) cc join public.creators cr on cr.id = cc.creator_id
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', r.id, 'display_name', r.display_name, 'reason', r.reason))
      from (
        select c.id, c.display_name,
          case when latest.status = 'failed' then 'scan_failed'
               else 'no_active_missions' end as reason
        from public.creators c
        left join lateral (
          select j.status from public.creator_scan_jobs j
          where j.creator_id = c.id order by j.created_at desc limit 1
        ) latest on true
        where latest.status = 'failed'
           or (c.status = 'active' and not exists (
                select 1 from public.mission_participants mp
                where mp.creator_id = c.id and mp.status in ('active', 'completed')))
        order by (case when latest.status = 'failed' then 0 else 1 end), c.created_at desc, c.id
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $function$;
revoke all on function public.admin_creator_analytics(int) from public, anon;
grant execute on function public.admin_creator_analytics(int) to authenticated;

create or replace function public.admin_merchant_analytics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_start timestamptz := v_start - make_interval(days => v_days);
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.merchant_profiles),
      'by_status', coalesce((
        select jsonb_object_agg(status, c) from (
          select status, count(*) as c from public.merchant_profiles group by status
        ) s), '{}'::jsonb),
      'by_tier', coalesce((
        select jsonb_object_agg(tier, c) from (
          select tier, count(*) as c from public.merchant_profiles group by tier
        ) s), '{}'::jsonb),
      'new_in_period', (select count(*) from public.merchant_profiles where created_at >= v_start),
      'new_prev_period', (select count(*) from public.merchant_profiles
        where created_at >= v_prev_start and created_at < v_start),
      'missions_live', (select count(*) from public.missions where status = 'published'),
      'settlements_pending', (select count(*) from public.mission_settlements
        where status in ('pending', 'partially_paid')),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'pending' group by 1
        ) o), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', cur, 'amount', amt) order by cur) from (
          select coalesce(amount_currency, 'unknown') as cur, sum(coalesce(creator_commission_amount, 0)) as amt
          from public.mission_settlements where creator_payout_status = 'paid' group by 1
        ) s2), '[]'::jsonb)
    ),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.merchant_profiles where created_at >= v_start group by 1
      ) t), '[]'::jsonb),
    'missions_created', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', cnt) order by d) from (
        select date_trunc('day', created_at) as d, count(*) as cnt
        from public.missions where created_at >= v_start and merchant_profile_id is not null group by 1
      ) m), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'company_name', x.company_name, 'tier', x.tier,
        'missions_count', x.missions_count, 'creators_engaged', x.creators_engaged)
        order by x.missions_count desc, x.creators_engaged desc) from (
        select mp.id, mp.company_name, mp.tier,
          (select count(*) from public.missions mi where mi.merchant_profile_id = mp.id) as missions_count,
          (select count(distinct part.creator_id) from public.missions mi2
             join public.mission_participants part on part.mission_id = mi2.id
             where mi2.merchant_profile_id = mp.id) as creators_engaged
        from public.merchant_profiles mp
        order by missions_count desc, creators_engaged desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'at_risk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'company_name', r.company_name, 'reason', r.reason))
      from (
        select mp.id, mp.company_name,
          case
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'disputed') then 'disputed'
            when exists (
              select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
              where mi.merchant_profile_id = mp.id and ms.status = 'pending'
                and ms.created_at < now() - interval '30 days') then 'pending_overdue'
            else 'growth_idle'
          end as reason
        from public.merchant_profiles mp
        where exists (
                select 1 from public.missions mi join public.mission_settlements ms on ms.mission_id = mi.id
                where mi.merchant_profile_id = mp.id and ms.status in ('disputed', 'pending')
                  and (ms.status = 'disputed' or ms.created_at < now() - interval '30 days'))
           or (mp.tier = 'growth' and not exists (
                select 1 from public.missions mi
                where mi.merchant_profile_id = mp.id and mi.status = 'published'))
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $function$;
revoke all on function public.admin_merchant_analytics(int) from public, anon;
grant execute on function public.admin_merchant_analytics(int) to authenticated;

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

create or replace function public.admin_merchant_detail(p_merchant_id uuid)
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

  select true into v_exists from public.merchant_profiles where id = p_merchant_id;
  if v_exists is null then
    return null;  -- missing merchant -> wrapper returns null -> page notFound()
  end if;

  return jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', mp.id, 'company_name', mp.company_name,
        'contact_name', mp.contact_name, 'contact_email', mp.contact_email,
        'website_url', mp.website_url, 'status', mp.status, 'tier', mp.tier,
        'created_at', mp.created_at, 'updated_at', mp.updated_at)
      from public.merchant_profiles mp where mp.id = p_merchant_id
    ),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'status', m.status, 'visibility', m.visibility,
        'participants_count', (select count(*) from public.mission_participants mp where mp.mission_id = m.id),
        'milestones_total', (select count(*) from public.mission_milestones ms where ms.mission_id = m.id),
        'milestones_approved', (
          select count(*) from public.mission_milestone_submissions sub
          join public.mission_milestones ms on ms.id = sub.mission_milestone_id
          where ms.mission_id = m.id and sub.status = 'approved'
        ),
        'created_at', m.created_at)
        order by m.created_at desc)
      from public.missions m where m.merchant_profile_id = p_merchant_id
    ), '[]'::jsonb),
    'creators', jsonb_build_object(
      'engaged', coalesce((
        select jsonb_agg(row_to_json(e) order by e.display_name nulls last)
        from (
          select distinct on (mp.creator_id)
            mp.creator_id, c.display_name, c.handle, mp.status as participant_status
          from public.mission_participants mp
          join public.missions m on m.id = mp.mission_id
          join public.creators c on c.id = mp.creator_id
          where m.merchant_profile_id = p_merchant_id
          order by mp.creator_id, mp.created_at desc
        ) e
      ), '[]'::jsonb),
      'saved_count', (
        select count(*) from public.merchant_saved_creators sc where sc.merchant_id = p_merchant_id
      )
    ),
    'billing', jsonb_build_object(
      'settlements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id, 'mission_title', m.title, 'status', st.status,
          'creator_payout_status', st.creator_payout_status,
          'kinnso_commission_status', st.kinnso_commission_status,
          'affiliate_commission_status', st.affiliate_commission_status,
          'currency', st.amount_currency,
          'creator_payout_amount', st.creator_commission_amount,
          'updated_at', st.updated_at)
          order by st.updated_at desc)
        from public.mission_settlements st
        join public.missions m on m.id = st.mission_id
        where m.merchant_profile_id = p_merchant_id
      ), '[]'::jsonb),
      'owed', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and coalesce(st.creator_payout_status, '') <> 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb),
      'settled', coalesce((
        select jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount))
        from (
          select st.amount_currency as currency, sum(st.creator_commission_amount) as amount
          from public.mission_settlements st
          join public.missions m on m.id = st.mission_id
          where m.merchant_profile_id = p_merchant_id
            and st.creator_payout_status = 'paid'
            and st.creator_commission_amount is not null
            and st.amount_currency is not null
          group by st.amount_currency
        ) t
      ), '[]'::jsonb)
    )
  );
end $function$;
revoke all on function public.admin_merchant_detail(uuid) from public, anon;
grant execute on function public.admin_merchant_detail(uuid) to authenticated;

create or replace function public.admin_search_creators(p_search text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_tiers text[] DEFAULT NULL::text[], p_dna text DEFAULT NULL::text, p_verified boolean DEFAULT NULL::boolean, p_limit integer DEFAULT 25, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, display_name text, handle text, status text, verified boolean, tier text, dna_status text, contribution_points integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_active_ops_role('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.display_name, c.handle, c.status, c.verified,
           cc.tier, cd.status as dna_status, cc.contribution_points, c.created_at
    from public.creators c
    left join public.creator_contribution cc on cc.creator_id = c.id
    left join lateral (
      select d.status from public.creator_dna d where d.creator_id = c.id limit 1
    ) cd on true
    where (p_search is null or p_search = ''
           or c.display_name ilike '%' || p_search || '%'
           or c.handle ilike '%' || p_search || '%')
      and (p_statuses is null or c.status = any(p_statuses))
      and (p_tiers is null or cc.tier = any(p_tiers))
      and (p_verified is null or c.verified = p_verified)
      and (p_dna is null
           or (p_dna = 'none' and cd.status is null)
           or (p_dna <> 'none' and cd.status = p_dna))
      and (p_cursor_created_at is null
           or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id))
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $function$;
revoke all on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) to authenticated;

create or replace function public.admin_search_merchants(p_search text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_tiers text[] DEFAULT NULL::text[], p_limit integer DEFAULT 25, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, company_name text, status text, tier text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_active_ops_role('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.id, m.company_name, m.status, m.tier, m.created_at
    from public.merchant_profiles m
    where (p_search is null or p_search = '' or m.company_name ilike '%' || p_search || '%')
      and (p_statuses is null or m.status = any(p_statuses))
      and (p_tiers is null or m.tier = any(p_tiers))
      and (p_cursor_created_at is null
           or (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $function$;
revoke all on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) to authenticated;

create or replace function public.admin_list_ops_members()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id',           m.id,
        'display_name', m.display_name,
        'user_id',      m.user_id,
        'role',         m.role,
        'status',       m.status,
        'joined_at',    m.created_at)
      order by m.created_at asc)
    from public.kinnso_ops_members m
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_ops_members() from public, anon;
grant execute on function public.admin_list_ops_members() to authenticated;

-- ═══════════════════════════ MODERATION (moderator) ═════════════════════════

create or replace function public.admin_set_creator_status(p_id uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if p_status = 'active'    and v_from not in ('onboarding','suspended') then raise exception 'bad_transition'; end if;
  if p_status = 'suspended' and v_from <> 'active'                       then raise exception 'bad_transition'; end if;
  if p_status = 'banned'    and v_from not in ('active','suspended')     then raise exception 'bad_transition'; end if;
  update public.creators set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $function$;
revoke all on function public.admin_set_creator_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_creator_status(uuid, text, text) to authenticated;

create or replace function public.admin_reinstate_creator(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from <> 'banned' then raise exception 'not_banned'; end if;
  update public.creators set status = 'active', updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.reinstate', p_reason,
    jsonb_build_object('from', 'banned', 'to', 'active'));
end $function$;
revoke all on function public.admin_reinstate_creator(uuid, text) from public, anon;
grant execute on function public.admin_reinstate_creator(uuid, text) to authenticated;

create or replace function public.admin_set_creator_verified(p_id uuid, p_verified boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_exists boolean;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  update public.creators set verified = p_verified, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'verify.set', p_reason,
    jsonb_build_object('verified', p_verified));
end $function$;
revoke all on function public.admin_set_creator_verified(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_creator_verified(uuid, boolean, text) to authenticated;

create or replace function public.admin_add_creator_note(p_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_exists boolean;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('creator', p_id, 'note.add', p_note, '{}'::jsonb);
end $function$;
revoke all on function public.admin_add_creator_note(uuid, text) from public, anon;
grant execute on function public.admin_add_creator_note(uuid, text) to authenticated;

create or replace function public.admin_bulk_set_creator_status(p_ids uuid[], p_status text, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.creators where id = v_id;
    if v_from is null then continue; end if;
    if (p_status = 'active'    and v_from in ('onboarding','suspended'))
    or (p_status = 'suspended' and v_from = 'active')
    or (p_status = 'banned'    and v_from in ('active','suspended')) then
      update public.creators set status = p_status, updated_at = now() where id = v_id;
      perform public.ops_audit_log_append('creator', v_id, 'status.' || p_status, p_reason,
        jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $function$;
revoke all on function public.admin_bulk_set_creator_status(uuid[], text, text) from public, anon;
grant execute on function public.admin_bulk_set_creator_status(uuid[], text, text) to authenticated;

create or replace function public.admin_set_merchant_status(p_id uuid, p_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_status then raise exception 'no_change'; end if;
  update public.merchant_profiles set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $function$;
revoke all on function public.admin_set_merchant_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_merchant_status(uuid, text, text) to authenticated;

create or replace function public.admin_set_merchant_tier(p_id uuid, p_tier text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from text;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('free','growth') then raise exception 'bad_tier'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select tier into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_tier then raise exception 'no_change'; end if;
  update public.merchant_profiles set tier = p_tier, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'tier.set', p_reason,
    jsonb_build_object('from', v_from, 'to', p_tier));
end $function$;
revoke all on function public.admin_set_merchant_tier(uuid, text, text) from public, anon;
grant execute on function public.admin_set_merchant_tier(uuid, text, text) to authenticated;

create or replace function public.admin_add_merchant_note(p_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_exists boolean;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.merchant_profiles where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('merchant', p_id, 'note.add', p_note, '{}'::jsonb);
end $function$;
revoke all on function public.admin_add_merchant_note(uuid, text) from public, anon;
grant execute on function public.admin_add_merchant_note(uuid, text) to authenticated;

create or replace function public.admin_bulk_set_merchant_status(p_ids uuid[], p_status text, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops_role('moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.merchant_profiles where id = v_id for update;
    if v_from is null or v_from = p_status then continue; end if;
    update public.merchant_profiles set status = p_status, updated_at = now() where id = v_id;
    perform public.ops_audit_log_append('merchant', v_id, 'status.' || p_status, p_reason,
      jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;
revoke all on function public.admin_bulk_set_merchant_status(uuid[], text, text) from public, anon;
grant execute on function public.admin_bulk_set_merchant_status(uuid[], text, text) to authenticated;

-- ══════════════════════════════ SETTLEMENTS (admin) ═════════════════════════

create or replace function public.admin_set_settlement_status(p_id uuid, p_status text DEFAULT NULL::text, p_creator_payout_status text DEFAULT NULL::text, p_kinnso_commission_status text DEFAULT NULL::text, p_affiliate_commission_status text DEFAULT NULL::text, p_allow_revert boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text; v_cp text; v_kc text; v_ac text;
  v_changed jsonb := '{}'::jsonb;
  v_rank_to int; v_rank_from int;
begin
  if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_status is null
     and p_creator_payout_status is null
     and p_kinnso_commission_status is null
     and p_affiliate_commission_status is null then
    raise exception 'no_change';
  end if;

  select status, creator_payout_status, kinnso_commission_status, affiliate_commission_status
    into v_status, v_cp, v_kc, v_ac
    from public.mission_settlements where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  -- Overall status.
  if p_status is not null and p_status is distinct from v_status then
    if p_status not in ('not_started','pending','partially_paid','paid','disputed') then
      raise exception 'bad_status';
    end if;
    v_rank_to   := case p_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    v_rank_from := case v_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    if p_status <> 'disputed' and v_status <> 'disputed'
       and v_rank_to < v_rank_from and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('status', jsonb_build_object('from', v_status, 'to', p_status));
  end if;

  -- Creator payout leg.
  if p_creator_payout_status is not null and p_creator_payout_status is distinct from v_cp then
    if p_creator_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_cp = 'paid' and p_creator_payout_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('creator_payout_status', jsonb_build_object('from', v_cp, 'to', p_creator_payout_status));
  end if;

  -- Kinnso commission leg.
  if p_kinnso_commission_status is not null and p_kinnso_commission_status is distinct from v_kc then
    if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_kc = 'paid' and p_kinnso_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('kinnso_commission_status', jsonb_build_object('from', v_kc, 'to', p_kinnso_commission_status));
  end if;

  -- Affiliate commission leg.
  if p_affiliate_commission_status is not null and p_affiliate_commission_status is distinct from v_ac then
    if p_affiliate_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_ac = 'paid' and p_affiliate_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('affiliate_commission_status', jsonb_build_object('from', v_ac, 'to', p_affiliate_commission_status));
  end if;

  if v_changed = '{}'::jsonb then raise exception 'no_change'; end if;

  update public.mission_settlements set
    status                      = coalesce(p_status, status),
    creator_payout_status       = coalesce(p_creator_payout_status, creator_payout_status),
    kinnso_commission_status    = coalesce(p_kinnso_commission_status, kinnso_commission_status),
    affiliate_commission_status = coalesce(p_affiliate_commission_status, affiliate_commission_status),
    ops_note                    = btrim(p_reason),
    updated_by_ops_member_id    = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    updated_at                  = now()
  where id = p_id;

  perform public.ops_audit_log_append('settlement', p_id, 'settlement.status', p_reason,
    v_changed || jsonb_build_object('allow_revert', coalesce(p_allow_revert, false)));
end $function$;
revoke all on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) to authenticated;
