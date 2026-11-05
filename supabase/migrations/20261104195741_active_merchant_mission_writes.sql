-- Require an active merchant for direct mission creation and updates.
-- Preserve existing active operations permissions and read access.
-- Deploy only after isolated policy tests and production policy-drift review.
begin;

alter policy "missions_owner_insert" on public.missions
  to authenticated
  with check (
    (
      mission_source = 'merchant'
      and exists (
        select 1
        from public.merchant_profiles merchant
        where merchant.id = missions.merchant_profile_id
          and merchant.user_id = (select auth.uid())
          and merchant.status = 'active'
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

alter policy "missions_owner_update" on public.missions
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_profiles merchant
      where merchant.id = missions.merchant_profile_id
        and merchant.user_id = (select auth.uid())
        and merchant.status = 'active'
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
          and merchant.status = 'active'
      )
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create or replace function app_private.can_delete_empty_mission(target_mission_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Serialize merchant authorization with suspension updates until commit.
  perform 1 from public.merchant_profiles merchant
    where merchant.id = (select merchant_profile_id from public.missions where id = target_mission_id)
      and merchant.user_id = auth.uid()
    for share;
  return exists (
    select 1
    from public.missions mission
    where mission.id = target_mission_id
      and (
        exists (
          select 1
          from public.merchant_profiles merchant
          where merchant.id = mission.merchant_profile_id
            and merchant.user_id = (select auth.uid())
            and merchant.status = 'active'
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
end;
$$;

revoke all on function app_private.can_delete_empty_mission(uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.can_delete_empty_mission(uuid) to authenticated;


create or replace function public.mission_review_event_append(
  p_submission_id uuid,
  p_action text,
  p_reason_text text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_owner boolean;
begin
  perform 1 from public.merchant_profiles mp
    join public.missions m on m.merchant_profile_id = mp.id
    join public.mission_participants p on p.mission_id = m.id
    join public.mission_milestone_submissions sub on sub.mission_participant_id = p.id
    where sub.id = p_submission_id and mp.user_id = auth.uid()
    for share of mp;
  select exists (
    select 1
    from public.mission_milestone_submissions sub
    join public.mission_participants p on p.id = sub.mission_participant_id
    join public.missions m on m.id = p.mission_id
    join public.merchant_profiles mp on mp.id = m.merchant_profile_id
    where sub.id = p_submission_id and mp.user_id = auth.uid() and mp.status = 'active'
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'request_revision') then
    raise exception 'bad_action';
  end if;

  insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
    values (p_submission_id, 'merchant', auth.uid(), p_action, null, p_reason_text);
end;
$$;

revoke all on function public.mission_review_event_append(uuid, text, text) from public, anon;
grant execute on function public.mission_review_event_append(uuid, text, text) to authenticated;

commit;
