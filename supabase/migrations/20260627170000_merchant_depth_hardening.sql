-- Phase 7 hardening (post-review):
--  1. merchant_invite_creator — per-merchant advisory lock so the monthly invite
--     quota check can't be raced by concurrent invites (TOCTOU → quota overrun).
--     Same serialization intent as the 6C last-ops guard.
--  2. accept_mission_invite — a suspended creator must not be able to self-accept an
--     invite into active participation; require creators.status='active'.
-- Same signatures → no type regeneration.

create or replace function public.merchant_invite_creator(p_mission_id uuid, p_creator_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_tier text; v_used int; v_limit int; v_pid uuid;
begin
  select m.id, m.tier into v_merchant, v_tier
    from public.merchant_profiles m
    join public.missions mi on mi.merchant_profile_id = m.id
    where mi.id = p_mission_id and m.user_id = auth.uid()
      and m.status = 'active' and mi.status = 'published' and mi.mission_source = 'merchant';
  if v_merchant is null then raise exception 'not_authorized'; end if;
  -- Serialize this merchant's invites so the count→insert critical section can't race.
  perform pg_advisory_xact_lock(hashtextextended(v_merchant::text, 0));
  v_limit := case v_tier when 'growth' then 30 else 3 end;
  select count(*) into v_used from public.mission_participants mp
    join public.missions mi on mi.id = mp.mission_id
    where mi.merchant_profile_id = v_merchant and mp.source = 'merchant_invite'
      and mp.created_at >= date_trunc('month', now());
  if v_used >= v_limit then raise exception 'invite_quota_exceeded'; end if;
  if not exists (select 1 from public.creators where id = p_creator_id and status = 'active')
    then raise exception 'creator_not_found'; end if;
  if exists (select 1 from public.mission_participants
    where mission_id = p_mission_id and creator_id = p_creator_id)
    then raise exception 'already_participant'; end if;
  insert into public.mission_participants (mission_id, creator_id, status, source)
    values (p_mission_id, p_creator_id, 'invited', 'merchant_invite')
    returning id into v_pid;
  return v_pid;
end $$;

create or replace function public.accept_mission_invite(p_mission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- A suspended creator cannot transition an invite into active participation.
  if not exists (select 1 from public.creators where id = auth.uid() and status = 'active')
    then raise exception 'creator_not_found'; end if;
  update public.mission_participants set status = 'active'
    where mission_id = p_mission_id and creator_id = auth.uid()
      and status = 'invited' and source = 'merchant_invite';
  if not found then raise exception 'no_invite'; end if;
end $$;

revoke all on function public.merchant_invite_creator(uuid, uuid) from public, anon;
revoke all on function public.accept_mission_invite(uuid) from public, anon;
grant execute on function public.merchant_invite_creator(uuid, uuid) to authenticated;
grant execute on function public.accept_mission_invite(uuid) to authenticated;
