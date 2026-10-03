grant delete on public.missions to authenticated;

create policy "affiliate_network_events_mission_owner_select" on public.affiliate_network_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = affiliate_network_events.mission_id
        and merchant.user_id = (select auth.uid())
    )
  );

create policy "missions_owner_delete_without_dependents" on public.missions
  for delete
  to authenticated
  using (
    (
      exists (
        select 1
        from public.merchant_profiles merchant
        where merchant.id = missions.merchant_profile_id
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
      where participant.mission_id = missions.id
    )
    and not exists (
      select 1
      from public.mission_settlements settlement
      where settlement.mission_id = missions.id
    )
    and not exists (
      select 1
      from public.affiliate_partner_links partner_link
      where partner_link.mission_id = missions.id
    )
    and not exists (
      select 1
      from public.affiliate_network_events network_event
      where network_event.mission_id = missions.id
    )
    and not exists (
      select 1
      from public.mission_social_snapshots snapshot
      where snapshot.mission_id = missions.id
    )
  );
