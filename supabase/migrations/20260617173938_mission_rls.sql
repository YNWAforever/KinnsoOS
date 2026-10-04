create schema if not exists app_private;

create or replace function app_private.is_mission_participant(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mission_participants participant
    where participant.mission_id = target_mission_id
      and participant.creator_id = (select auth.uid())
      and participant.status in ('invited','applied','active','completed')
  );
$$;

revoke all on schema app_private from public;
revoke all on function app_private.is_mission_participant(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_mission_participant(uuid) to authenticated;

alter table public.merchant_profiles enable row level security;
alter table public.kinnso_ops_members enable row level security;
alter table public.affiliate_network_programs enable row level security;
alter table public.missions enable row level security;
alter table public.mission_participants enable row level security;
alter table public.mission_milestones enable row level security;
alter table public.mission_milestone_submissions enable row level security;
alter table public.mission_social_snapshots enable row level security;
alter table public.affiliate_partner_links enable row level security;
alter table public.affiliate_network_events enable row level security;
alter table public.mission_settlements enable row level security;

create policy "merchant_profiles_owner_select" on public.merchant_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "merchant_profiles_owner_insert" on public.merchant_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "merchant_profiles_owner_update" on public.merchant_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "kinnso_ops_members_self_select" on public.kinnso_ops_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "affiliate_network_programs_ops_select" on public.affiliate_network_programs
  for select
  to authenticated
  using (
    status = 'active'
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_network_programs_ops_insert" on public.affiliate_network_programs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_network_programs_ops_update" on public.affiliate_network_programs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "missions_visible_select" on public.missions
  for select
  to authenticated
  using (
    (
      status = 'published'
      and (
        visibility = 'open'
        or app_private.is_mission_participant(missions.id)
      )
    )
    or exists (
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
  );

create policy "missions_owner_insert" on public.missions
  for insert
  to authenticated
  with check (
    (
      mission_source = 'merchant'
      and exists (
        select 1
        from public.merchant_profiles merchant
        where merchant.id = missions.merchant_profile_id
          and merchant.user_id = (select auth.uid())
      )
    )
    or (
      mission_source = 'travelpayouts'
      and exists (
        select 1
        from public.kinnso_ops_members ops
        where ops.id = missions.created_by_ops_member_id
          and ops.user_id = (select auth.uid())
          and ops.status = 'active'
      )
    )
  );

create policy "missions_owner_update" on public.missions
  for update
  to authenticated
  using (
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
  with check (
    (
      mission_source = 'merchant'
      and exists (
        select 1
        from public.merchant_profiles merchant
        where merchant.id = missions.merchant_profile_id
          and merchant.user_id = (select auth.uid())
      )
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_participants_visible_select" on public.mission_participants
  for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
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
  );

create policy "mission_participants_actor_insert" on public.mission_participants
  for insert
  to authenticated
  with check (
    (
      creator_id = (select auth.uid())
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

create policy "mission_participants_merchant_ops_update" on public.mission_participants
  for update
  to authenticated
  using (
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
  with check (
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
  );

create policy "mission_milestones_visible_select" on public.mission_milestones
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.missions mission
      where mission.id = mission_milestones.mission_id
    )
  );

create policy "mission_milestones_merchant_ops_insert" on public.mission_milestones
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.missions mission
      left join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      left join public.kinnso_ops_members ops on ops.id = mission.created_by_ops_member_id
      where mission.id = mission_milestones.mission_id
        and (
          merchant.user_id = (select auth.uid())
          or (ops.user_id = (select auth.uid()) and ops.status = 'active')
        )
    )
  );

create policy "mission_milestones_merchant_ops_update" on public.mission_milestones
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = mission_milestones.mission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = mission_milestones.mission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_submissions_visible_select" on public.mission_milestone_submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_milestone_submissions.mission_participant_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants participant
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where participant.id = mission_milestone_submissions.mission_participant_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_submissions_creator_insert" on public.mission_milestone_submissions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_milestone_submissions.mission_participant_id
        and participant.creator_id = (select auth.uid())
        and participant.status = 'active'
    )
  );

create policy "mission_submissions_creator_merchant_ops_update" on public.mission_milestone_submissions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_milestone_submissions.mission_participant_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants participant
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where participant.id = mission_milestone_submissions.mission_participant_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    (
      status in ('pending','submitted')
      and exists (
        select 1
        from public.mission_participants participant
        where participant.id = mission_milestone_submissions.mission_participant_id
          and participant.creator_id = (select auth.uid())
      )
    )
    or exists (
      select 1
      from public.mission_participants participant
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where participant.id = mission_milestone_submissions.mission_participant_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_social_snapshots_visible_select" on public.mission_social_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_social_snapshots.mission_participant_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants participant
      join public.mission_milestone_submissions submission
        on submission.mission_participant_id = participant.id
      where submission.id = mission_social_snapshots.mission_milestone_submission_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = mission_social_snapshots.mission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants participant
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where participant.id = mission_social_snapshots.mission_participant_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_milestone_submissions submission
      join public.mission_participants participant on participant.id = submission.mission_participant_id
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where submission.id = mission_social_snapshots.mission_milestone_submission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_partner_links_visible_select" on public.affiliate_partner_links
  for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = affiliate_partner_links.mission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_partner_links_creator_insert" on public.affiliate_partner_links
  for insert
  to authenticated
  with check (
    creator_id = (select auth.uid())
    and network = 'travelpayouts'
    and exists (
      select 1
      from public.mission_participants participant
      join public.missions mission on mission.id = participant.mission_id
      join public.affiliate_network_programs program
        on program.id = affiliate_partner_links.affiliate_network_program_id
      where participant.id = affiliate_partner_links.mission_participant_id
        and participant.mission_id = affiliate_partner_links.mission_id
        and participant.creator_id = affiliate_partner_links.creator_id
        and participant.status = 'active'
        and mission.id = affiliate_partner_links.mission_id
        and mission.mission_source = 'travelpayouts'
        and mission.affiliate_network_program_id = affiliate_partner_links.affiliate_network_program_id
        and program.status = 'active'
    )
  );

create policy "affiliate_network_events_ops_select" on public.affiliate_network_events
  for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_network_events_ops_insert" on public.affiliate_network_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "affiliate_network_events_ops_update" on public.affiliate_network_events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_settlements_visible_select" on public.mission_settlements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.missions mission
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where mission.id = mission_settlements.mission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_participants participant
      where participant.id = mission_settlements.mission_participant_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_settlements_ops_insert" on public.mission_settlements
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy "mission_settlements_ops_update" on public.mission_settlements
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
        and (
          mission_settlements.updated_by_ops_member_id is null
          or mission_settlements.updated_by_ops_member_id = ops.id
        )
    )
  );
