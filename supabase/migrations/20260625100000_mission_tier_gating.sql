-- Phase 5B: creator tier gating for mission eligibility.
-- Per-mission minimum tier (merchant-set). Gate applies to the CREATOR self-join
-- branch of mission_participants insert. Reads only the caller's own tier, so 5A's
-- tier privacy holds. RANKS MIRROR apps/web/lib/contribution/tiers.ts (tierRank).
-- Merchant invites (source='merchant_invite') intentionally bypass the gate.

-- 1. Per-mission minimum tier. NULL = open to all (default). 'seed' is disallowed
--    (everyone is >= seed). Only merchant missions can carry a gate.
alter table public.missions add column min_tier text;
alter table public.missions
  add constraint missions_min_tier_values_check
  check (min_tier is null or min_tier in ('rising','pro','elite'));
alter table public.missions
  add constraint missions_min_tier_merchant_only_check
  check (min_tier is null or mission_source = 'merchant');

-- 2. tier -> rank (mirrors tiers.ts tierRank).
create or replace function public.contribution_tier_rank(p_tier text)
returns int language sql immutable as $$
  select case p_tier
    when 'seed'   then 0
    when 'rising' then 1
    when 'pro'    then 2
    when 'elite'  then 3
    else 0
  end;
$$;

-- 3. Does the CALLER's own tier meet the mission's requirement?
--    SECURITY DEFINER but reads only auth.uid()'s own contribution row — no leak.
--    NULL min_tier (or unknown mission) => open => true. Missing row => 'seed'.
create or replace function app_private.creator_meets_mission_tier(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select m.min_tier from public.missions m where m.id = target_mission_id) is null
      then true
    else public.contribution_tier_rank(
           coalesce(
             (select c.tier from public.creator_contribution c
               where c.creator_id = (select auth.uid())),
             'seed')
         ) >= public.contribution_tier_rank(
           (select m.min_tier from public.missions m where m.id = target_mission_id)
         )
  end;
$$;

revoke all on function app_private.creator_meets_mission_tier(uuid) from public;
grant execute on function app_private.creator_meets_mission_tier(uuid) to authenticated;

-- 4. Recreate the participant insert policy, adding the tier gate to the creator
--    self-join branch only (merchant_invite branch unchanged).
drop policy "mission_participants_actor_insert" on public.mission_participants;

create policy "mission_participants_actor_insert" on public.mission_participants
  for insert
  to authenticated
  with check (
    (
      creator_id = (select auth.uid())
      and app_private.creator_meets_mission_tier(mission_participants.mission_id)
      and exists (
        select 1
        from public.missions mission
        where mission.id = mission_participants.mission_id
          and mission.status = 'published'
          and mission.visibility = 'open'
          and (
            (
              mission_participants.source = 'open_join'
              and mission_participants.status = 'active'
              and mission.mission_type = 'coupon_affiliate'
            )
            or (
              mission_participants.source = 'affiliate_network_join'
              and mission_participants.status = 'active'
              and mission.mission_source = 'travelpayouts'
            )
            or (
              mission_participants.source = 'application'
              and mission_participants.status = 'applied'
              and mission.mission_type in ('hybrid','paid')
            )
          )
      )
    )
    or (
      source = 'merchant_invite'
      and status = 'invited'
      and (
        exists (
          select 1
          from public.missions mission
          join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
          where mission.id = mission_participants.mission_id
            and merchant.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.kinnso_ops_members ops
          where ops.user_id = (select auth.uid())
            and ops.status = 'active'
        )
      )
    )
  );
