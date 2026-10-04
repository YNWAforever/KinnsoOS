create or replace function app_private.prepare_affiliate_partner_link_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
begin
  if current_setting('app.bypass_partner_link_prepare', true) = 'on'
    or current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_user = 'service_role' then
    return new;
  end if;

  select participant.creator_id
  into participant_creator_id
  from public.mission_participants participant
  where participant.id = new.mission_participant_id;

  if actor_id is not null and actor_id = participant_creator_id then
    new.sub_id := 'pending:' || gen_random_uuid()::text;
    new.partner_url := new.original_url;
    new.external_status := 'pending';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prepare_affiliate_partner_link_insert() from public;

create or replace function public.create_travelpayouts_partner_link(
  p_affiliate_network_program_id uuid,
  p_mission_id uuid,
  p_mission_participant_id uuid,
  p_original_url text,
  p_partner_url text,
  p_sub_id text
)
returns table(id uuid, partner_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expected_sub_id text;
  v_inserted boolean;
  v_original_url text := btrim(p_original_url);
  v_partner_url text := btrim(p_partner_url);
  v_previous_bypass_setting text := coalesce(
    current_setting('app.bypass_partner_link_prepare', true),
    ''
  );
begin
  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;

  if nullif(v_original_url, '') is null
    or nullif(v_partner_url, '') is null
    or nullif(btrim(p_sub_id), '') is null then
    raise exception 'Partner link values are required' using errcode = '22023';
  end if;

  v_expected_sub_id :=
    'kinnso_m_' || replace(p_mission_id::text, '-', '')
    || '_p_' || replace(p_mission_participant_id::text, '-', '')
    || '_c_' || replace(v_actor_id::text, '-', '');

  if btrim(p_sub_id) <> v_expected_sub_id then
    raise exception 'Partner link SubID is invalid' using errcode = '22023';
  end if;

  if v_original_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Original URL is invalid' using errcode = '22023';
  end if;

  if v_partner_url !~* '^https://(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)\.)*tp\.st/[^[:space:]#]*$'
    or position('#' in v_partner_url) > 0
    or regexp_count(v_partner_url, '\?') <> 1
    or regexp_count(v_partner_url, '[?&]sub_id=') <> 1
    or v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|$)') then
    raise exception 'Partner URL is invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.mission_participants participant
    join public.missions mission
      on mission.id = participant.mission_id
    join public.affiliate_network_programs program
      on program.id = mission.affiliate_network_program_id
    where participant.id = p_mission_participant_id
      and participant.creator_id = v_actor_id
      and participant.status = 'active'
      and mission.id = p_mission_id
      and mission.status = 'published'
      and mission.mission_source = 'travelpayouts'
      and mission.affiliate_network_program_id = p_affiliate_network_program_id
      and program.id = p_affiliate_network_program_id
      and program.network = 'travelpayouts'
      and program.status = 'active'
  ) then
    raise exception 'Partner link is not allowed' using errcode = '42501';
  end if;

  return query
  select link.id, link.partner_url
  from public.affiliate_partner_links link
  where link.network = 'travelpayouts'
    and link.mission_participant_id = p_mission_participant_id
    and link.creator_id = v_actor_id
    and link.original_url = v_original_url
    and link.sub_id = v_expected_sub_id
    and link.external_status = 'success'
  order by link.generated_at desc
  limit 1;
  if found then
    perform set_config('app.bypass_partner_link_prepare', v_previous_bypass_setting, true);
    return;
  end if;

  perform set_config('app.bypass_partner_link_prepare', 'on', true);

  return query
  insert into public.affiliate_partner_links (
    affiliate_network_program_id,
    mission_id,
    mission_participant_id,
    creator_id,
    network,
    original_url,
    partner_url,
    sub_id,
    external_status
  )
  values (
    p_affiliate_network_program_id,
    p_mission_id,
    p_mission_participant_id,
    v_actor_id,
    'travelpayouts',
    v_original_url,
    v_partner_url,
    v_expected_sub_id,
    'success'
  )
  on conflict (network, sub_id, original_url) do nothing
  returning affiliate_partner_links.id, affiliate_partner_links.partner_url;

  v_inserted := found;
  perform set_config('app.bypass_partner_link_prepare', v_previous_bypass_setting, true);

  if v_inserted then
    return;
  end if;

  return query
  select link.id, link.partner_url
  from public.affiliate_partner_links link
  where link.network = 'travelpayouts'
    and link.affiliate_network_program_id = p_affiliate_network_program_id
    and link.mission_id = p_mission_id
    and link.mission_participant_id = p_mission_participant_id
    and link.sub_id = v_expected_sub_id
    and link.original_url = v_original_url
    and link.creator_id = v_actor_id
    and link.external_status = 'success'
  limit 1;
  if not found then
    raise exception 'Partner link could not be persisted';
  end if;

  perform set_config('app.bypass_partner_link_prepare', v_previous_bypass_setting, true);
  return;
end;
$$;

revoke all on function public.create_travelpayouts_partner_link(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.create_travelpayouts_partner_link(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;
