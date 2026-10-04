-- Phase 10A — Creators Operator Console: shared ops audit log + creator analytics.
-- ops_audit_log is platform-wide (every later console module reuses it). Writes go
-- ONLY through SECURITY DEFINER RPCs (ops_audit_log_append + future mutation RPCs);
-- direct insert/update/delete is denied. Reads are ops-only via the read policy.
-- admin_creator_analytics() is the ops-aggregate read for the Overview tab; it is
-- gated internally on is_active_ops() so non-ops are rejected at the DB boundary.

-- 1. Shared audit / notes log.
create table public.ops_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  actor_ops_member_id uuid not null references public.kinnso_ops_members(id),
  entity_type         text not null,           -- 'creator' | 'merchant' | 'settlement' | ...
  entity_id           uuid not null,
  action              text not null,           -- 'status.suspend' | 'verify.set' | 'note.add' | ...
  reason              text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index ops_audit_log_entity_idx
  on public.ops_audit_log (entity_type, entity_id, created_at desc);
create index ops_audit_log_type_created_idx
  on public.ops_audit_log (entity_type, created_at desc);

alter table public.ops_audit_log enable row level security;
-- Read: any active ops member sees all audit rows. No insert/update/delete policy
-- exists, so (with RLS on) direct writes are denied for everyone; writes happen only
-- inside SECURITY DEFINER functions, which bypass RLS.
create policy ops_audit_read on public.ops_audit_log
  for select using (public.is_active_ops());

-- 2. Append helper. SECURITY DEFINER so mutation RPCs can write an audit row in the
--    same transaction. Resolves the actor from the caller's auth.uid() (callers do not
--    pass an actor id — this prevents spoofing). Raises if the caller is not active ops.
create or replace function public.ops_audit_log_append(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_reason      text default null,
  p_metadata    jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_id    uuid;
begin
  select id into v_actor from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_actor is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.ops_audit_log
    (actor_ops_member_id, entity_type, entity_id, action, reason, metadata)
  values
    (v_actor, p_entity_type, p_entity_id, p_action, p_reason, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- 3. Ops-aggregate analytics for the Creators Overview. Single jsonb payload.
--    by_status uses a dynamic group-by so the 'banned' bucket appears automatically
--    once Phase 10B extends the status CHECK (no change to this function needed).
--    Heuristics (documented + tunable here):
--      payouts_pending = mission_settlements with overall status in (pending, partially_paid)
--      at_risk         = latest scan job failed  OR  active creator with no
--                        active/completed mission participation.
create or replace function public.admin_creator_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days       int := greatest(1, least(coalesce(p_days, 30), 365));
  v_start      timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev_start timestamptz := v_start - make_interval(days => v_days);
begin
  if not public.is_active_ops() then
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
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end $$;

-- 4. Grants. Revoke the implicit public+anon EXECUTE (Supabase re-grants anon by
--    default), then grant only to authenticated. is_active_ops() is the real gate.
revoke all on function public.ops_audit_log_append(text, uuid, text, text, jsonb) from public, anon;
revoke all on function public.admin_creator_analytics(int) from public, anon;
grant execute on function public.ops_audit_log_append(text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.admin_creator_analytics(int) to authenticated;
