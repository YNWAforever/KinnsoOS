drop policy if exists "affiliate_network_events_mission_owner_select" on public.affiliate_network_events;
drop policy if exists "missions_owner_delete_without_dependents" on public.missions;

create or replace function app_private.can_delete_empty_mission(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.missions mission
    where mission.id = target_mission_id
      and (
        exists (
          select 1
          from public.merchant_profiles merchant
          where merchant.id = mission.merchant_profile_id
            and merchant.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.kinnso_ops_members ops
          where ops.user_id = (select auth.uid())
            and ops.status = 'active'
        )
      )
      and not exists (
        select 1
        from public.mission_participants participant
        where participant.mission_id = mission.id
      )
      and not exists (
        select 1
        from public.mission_settlements settlement
        where settlement.mission_id = mission.id
      )
      and not exists (
        select 1
        from public.affiliate_partner_links partner_link
        where partner_link.mission_id = mission.id
      )
      and not exists (
        select 1
        from public.affiliate_network_events network_event
        where network_event.mission_id = mission.id
      )
      and not exists (
        select 1
        from public.mission_social_snapshots snapshot
        where snapshot.mission_id = mission.id
      )
  );
$$;

revoke all on function app_private.can_delete_empty_mission(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_delete_empty_mission(uuid) to authenticated;

create policy "missions_owner_delete_without_dependents" on public.missions
  for delete
  to authenticated
  using (app_private.can_delete_empty_mission(missions.id));
