-- A legacy create can be attributed only to the unique, server-written creation audit.
-- This helper is private; callers cannot manufacture an ownership claim.
create or replace function kinnso_internal.owns_ops_content_create(
  p_actor uuid, p_entity uuid, p_kind text, p_action text, p_metadata jsonb
) returns boolean language sql stable set search_path = '' as $$
  select count(*) = 1 and coalesce(bool_and(m.user_id = p_actor
    and a.reason is null and a.metadata = p_metadata), false)
  from public.ops_audit_log a
  join public.kinnso_ops_members m on m.id = a.actor_ops_member_id
  where a.entity_type = p_kind and a.entity_id = p_entity and a.action = p_action;
$$;

revoke all on function kinnso_internal.owns_ops_content_create(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.admin_create_partner_perk(
  p_request_id uuid,
  p_partner_name text,
  p_title text,
  p_summary text,
  p_category text,
  p_discount_label text,
  p_min_tier text default null,
  p_redemption_type text default 'code',
  p_redemption_value text default null,
  p_sort_order integer default 0,
  p_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_name text := pg_catalog.btrim(p_partner_name);
  v_title text := pg_catalog.btrim(p_title);
  v_summary text := pg_catalog.btrim(p_summary);
  v_category text := pg_catalog.btrim(p_category);
  v_discount_label text := pg_catalog.btrim(p_discount_label);
  v_redemption_value text := pg_catalog.btrim(p_redemption_value);
  v_created_id uuid;
  v_actor uuid;
  v_digest text;
  v_prior kinnso_internal.requests%rowtype;
  v_result jsonb;
  v_existing public.partner_perks%rowtype;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or p_active is distinct from false then
    raise exception 'invalid_perk' using errcode = '22023';
  end if;
  if v_partner_name is null or char_length(v_partner_name) not between 1 and 120
     or v_title is null or char_length(v_title) not between 1 and 160
     or v_summary is null or char_length(v_summary) not between 1 and 1000
     or v_category is null or char_length(v_category) not between 1 and 80
     or v_discount_label is null or char_length(v_discount_label) not between 1 and 80
     or v_redemption_value is null or char_length(v_redemption_value) not between 1 and 2048 then
    raise exception 'invalid_perk_text' using errcode = '22023';
  end if;
  if p_min_tier is not null and p_min_tier not in ('rising','pro','elite') then
    raise exception 'invalid_perk_tier' using errcode = '22023';
  end if;
  if p_redemption_type not in ('code','link') then
    raise exception 'invalid_perk_redemption_type' using errcode = '22023';
  end if;
  if p_redemption_type = 'link'
     and v_redemption_value !~* '^https?://[^/[:space:]@]+([/?#][^[:space:]]*)?$' then
    raise exception 'invalid_perk_link' using errcode = '22023';
  end if;

  v_actor := kinnso_internal.actor();
  v_digest := kinnso_internal.request_digest(pg_catalog.jsonb_build_array(
    'ops.perk.create', v_partner_name, v_title, v_summary, v_category,
    v_discount_label, p_min_tier, p_redemption_type, v_redemption_value, p_sort_order, p_active
  )::text);

  -- Serialize every replay on the same actor/request pair, including other
  -- commands sharing the receipt table. Do not persist the redemption value.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || p_request_id::text, 0));
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_prior from kinnso_internal.requests
   where actor_id = v_actor and request_id = p_request_id;
  if found then
    if v_prior.digest is distinct from v_digest then
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;

  insert into public.partner_perks
    (id, slug, partner_name, title, summary, category, discount_label,
     min_tier, redemption_type, redemption_value, sort_order, active)
  values
    (p_request_id, 'ops-perk-' || p_request_id::text, v_partner_name,
     v_title, v_summary, v_category, v_discount_label, p_min_tier,
     p_redemption_type, v_redemption_value, p_sort_order, false)
  on conflict do nothing
  returning id into v_created_id;

  if v_created_id is null then
    select * into v_existing from public.partner_perks where id = p_request_id for update;
    if not found
       or v_existing.slug is distinct from 'ops-perk-' || p_request_id::text
       or not kinnso_internal.owns_ops_content_create(
         v_actor, p_request_id, 'partner_perk', 'perk.create', '{"active":false}'::jsonb
       )
       or row(v_existing.partner_name, v_existing.title, v_existing.summary, v_existing.category,
              v_existing.discount_label, v_existing.min_tier, v_existing.redemption_type,
              v_existing.redemption_value, v_existing.sort_order)
          is distinct from
          row(v_partner_name, v_title, v_summary, v_category, v_discount_label,
              p_min_tier, p_redemption_type, v_redemption_value, p_sort_order) then
      raise exception 'perk_conflict' using errcode = '23505';
    end if;
  else
    perform public.ops_audit_log_append(
      'partner_perk', p_request_id, 'perk.create', null,
      pg_catalog.jsonb_build_object('active', false)
    );
  end if;
  v_result := pg_catalog.jsonb_build_object('id', p_request_id, 'active', false);
  insert into kinnso_internal.requests (actor_id, request_id, digest, result)
    values (v_actor, p_request_id, v_digest, v_result);
  return v_result;
end
$$;

revoke all on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) to authenticated;

create or replace function public.admin_create_community_session(
  p_request_id uuid,
  p_host_creator_id uuid,
  p_title text,
  p_description text,
  p_type text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_embed_url text default null,
  p_replay_url text default null,
  p_destination_tags text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_description text := pg_catalog.btrim(p_description);
  v_embed_url text := nullif(pg_catalog.btrim(p_embed_url), '');
  v_replay_url text := nullif(pg_catalog.btrim(p_replay_url), '');
  v_tags text[] := coalesce(p_destination_tags, '{}'::text[]);
  v_created_id uuid;
  v_existing public.community_sessions%rowtype;
  v_actor uuid;
  v_digest text;
  v_prior kinnso_internal.requests%rowtype;
  v_result jsonb;
  v_creation_metadata jsonb;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or p_host_creator_id is null or p_starts_at is null then
    raise exception 'invalid_session' using errcode = '22023';
  end if;
  if v_title is null or char_length(v_title) not between 1 and 160
     or v_description is null or char_length(v_description) not between 1 and 4000 then
    raise exception 'invalid_session_text' using errcode = '22023';
  end if;
  if p_type not in ('destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro')
     or p_duration_minutes not between 1 and 1440 then
    raise exception 'invalid_session_fields' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.creators c
     where c.id = p_host_creator_id and c.status = 'active'
  ) then
    raise exception 'invalid_session_host' using errcode = '22023';
  end if;
  if (v_embed_url is not null and (
        char_length(v_embed_url) > 2048
        or v_embed_url !~* '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)([/?#]|$)'
      ))
     or (v_replay_url is not null and (
        char_length(v_replay_url) > 2048
        or v_replay_url !~* '^https://(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)([/?#]|$)'
      )) then
    raise exception 'invalid_session_url' using errcode = '22023';
  end if;
  if cardinality(v_tags) > 20
     or exists (
       select 1 from pg_catalog.unnest(v_tags) tag
        where tag is null or char_length(pg_catalog.btrim(tag)) not between 1 and 40
     )
     or cardinality(v_tags) <> (
       select count(distinct pg_catalog.btrim(tag))
         from pg_catalog.unnest(v_tags) tag
     ) then
    raise exception 'invalid_session_tags' using errcode = '22023';
  end if;
  v_tags := array(
    select pg_catalog.btrim(tag)
      from pg_catalog.unnest(v_tags) tag
  );

  v_actor := kinnso_internal.actor();
  v_creation_metadata := pg_catalog.jsonb_build_object('hostCreatorId', p_host_creator_id, 'status', 'scheduled');
  v_digest := kinnso_internal.request_digest(pg_catalog.jsonb_build_array(
    'ops.session.create', p_host_creator_id, v_title, v_description, p_type,
    extract(epoch from p_starts_at), p_duration_minutes, v_embed_url, v_replay_url, v_tags
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || p_request_id::text, 0));
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_prior from kinnso_internal.requests
   where actor_id = v_actor and request_id = p_request_id;
  if found then
    if v_prior.digest is distinct from v_digest then
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;

  insert into public.community_sessions
    (id, slug, host_creator_id, title, description, type, starts_at,
     duration_minutes, embed_url, replay_url, destination_tags, status)
  values
    (p_request_id, 'ops-session-' || p_request_id::text, p_host_creator_id,
     v_title, v_description, p_type, p_starts_at, p_duration_minutes,
     v_embed_url, v_replay_url, v_tags, 'scheduled')
  on conflict do nothing
  returning id into v_created_id;

  if v_created_id is null then
    select * into v_existing
      from public.community_sessions s
     where s.id = p_request_id for update;
    if not found
       or v_existing.slug is distinct from 'ops-session-' || p_request_id::text
       or not kinnso_internal.owns_ops_content_create(
         v_actor, p_request_id, 'community_session', 'session.create', v_creation_metadata
       ) then
      raise exception 'session_conflict' using errcode = '23505';
    end if;
    if v_existing.host_creator_id is distinct from p_host_creator_id
       or v_existing.title is distinct from v_title
       or v_existing.description is distinct from v_description
       or v_existing.type is distinct from p_type
       or v_existing.starts_at is distinct from p_starts_at
       or v_existing.duration_minutes is distinct from p_duration_minutes
       or v_existing.embed_url is distinct from v_embed_url
       or v_existing.replay_url is distinct from v_replay_url
       or v_existing.destination_tags is distinct from v_tags then
      raise exception 'session_conflict' using errcode = '23505';
    end if;
  else
    perform public.ops_audit_log_append(
      'community_session', p_request_id, 'session.create', null, v_creation_metadata
    );
  end if;

  v_result := pg_catalog.jsonb_build_object('id', p_request_id, 'status', 'scheduled');
  insert into kinnso_internal.requests (actor_id, request_id, digest, result)
    values (v_actor, p_request_id, v_digest, v_result);
  return v_result;
end
$$;
