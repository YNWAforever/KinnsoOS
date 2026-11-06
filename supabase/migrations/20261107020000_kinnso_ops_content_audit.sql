-- Audited operations content administration for community sessions, partner
-- perks and curated testimonials. Creator-owned session writes continue through
-- their existing ownership policy; operations mutations use these RPCs only so
-- every content-console write appends an audit event in the same transaction.

drop policy if exists community_sessions_ops_all on public.community_sessions;
drop policy if exists community_sessions_ops_read on public.community_sessions;
create policy community_sessions_ops_read on public.community_sessions
  for select to authenticated
  using ((select public.is_active_ops_role('moderator')));

drop policy if exists partner_perks_ops_all on public.partner_perks;
drop policy if exists partner_perks_ops_read on public.partner_perks;
create policy partner_perks_ops_read on public.partner_perks
  for select to authenticated
  using ((select public.is_active_ops_role('moderator')));
revoke insert, update, delete on public.partner_perks from authenticated;

drop policy if exists testimonials_ops_all on public.testimonials;
drop policy if exists testimonials_ops_read on public.testimonials;
create policy testimonials_ops_read on public.testimonials
  for select to authenticated
  using ((select public.is_active_ops_role('moderator')));
revoke insert, update, delete on public.testimonials from authenticated;

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

  insert into public.community_sessions
    (id, slug, host_creator_id, title, description, type, starts_at,
     duration_minutes, embed_url, replay_url, destination_tags, status)
  values
    (p_request_id, 'ops-session-' || p_request_id::text, p_host_creator_id,
     v_title, v_description, p_type, p_starts_at, p_duration_minutes,
     v_embed_url, v_replay_url, v_tags, 'scheduled')
  on conflict (id) do nothing
  returning id into v_created_id;

  if v_created_id is null then
    select * into v_existing
      from public.community_sessions s
     where s.id = p_request_id;
    if not found then
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
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status);
  end if;

  perform public.ops_audit_log_append(
    'community_session', p_request_id, 'session.create', null,
    pg_catalog.jsonb_build_object(
      'hostCreatorId', p_host_creator_id,
      'status', 'scheduled'
    )
  );
  return pg_catalog.jsonb_build_object('id', p_request_id, 'status', 'scheduled');
end
$$;

revoke all on function public.admin_create_community_session(
  uuid, uuid, text, text, text, timestamptz, integer, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.admin_create_community_session(
  uuid, uuid, text, text, text, timestamptz, integer, text, text, text[]
) to authenticated;

create or replace function public.admin_set_community_session_status(
  p_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
  v_embed_url text;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('live','ended','cancelled') then
    raise exception 'invalid_session_status' using errcode = '22023';
  end if;
  select s.status, s.embed_url into v_from, v_embed_url
    from public.community_sessions s
   where s.id = p_id
   for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_from = p_status then
    return pg_catalog.jsonb_build_object('id', p_id, 'status', p_status);
  end if;
  if p_status = 'live' and v_embed_url is null then
    raise exception 'session_live_url_required' using errcode = '22023';
  end if;
  update public.community_sessions
     set status = p_status
   where id = p_id;
  perform public.ops_audit_log_append(
    'community_session', p_id, 'session.status.' || p_status, null,
    pg_catalog.jsonb_build_object('from', v_from, 'to', p_status)
  );
  return pg_catalog.jsonb_build_object('id', p_id, 'status', p_status);
end
$$;

revoke all on function public.admin_set_community_session_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_community_session_status(uuid, text)
  to authenticated;

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

  insert into public.partner_perks
    (id, slug, partner_name, title, summary, category, discount_label,
     min_tier, redemption_type, redemption_value, sort_order, active)
  values
    (p_request_id, 'ops-perk-' || p_request_id::text, v_partner_name,
     v_title, v_summary, v_category, v_discount_label, p_min_tier,
     p_redemption_type, v_redemption_value, p_sort_order, false)
  on conflict (id) do nothing
  returning id into v_created_id;

  if v_created_id is null then
    select * into v_existing
      from public.partner_perks p
     where p.id = p_request_id;
    if not found then
      raise exception 'perk_conflict' using errcode = '23505';
    end if;
    if v_existing.partner_name is distinct from v_partner_name
       or v_existing.title is distinct from v_title
       or v_existing.summary is distinct from v_summary
       or v_existing.category is distinct from v_category
       or v_existing.discount_label is distinct from v_discount_label
       or v_existing.min_tier is distinct from p_min_tier
       or v_existing.redemption_type is distinct from p_redemption_type
       or v_existing.redemption_value is distinct from v_redemption_value
       or v_existing.sort_order is distinct from p_sort_order then
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'active', v_existing.active);
  end if;

  perform public.ops_audit_log_append(
    'partner_perk', p_request_id, 'perk.create', null,
    pg_catalog.jsonb_build_object('active', false)
  );
  return pg_catalog.jsonb_build_object('id', p_request_id, 'active', false);
end
$$;

revoke all on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_partner_perk(
  uuid, text, text, text, text, text, text, text, text, integer, boolean
) to authenticated;

create or replace function public.admin_set_partner_perk_active(
  p_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from boolean;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'invalid_perk_active' using errcode = '22023';
  end if;
  select p.active into v_from
    from public.partner_perks p
   where p.id = p_id
   for update;
  if not found then
    raise exception 'perk_not_found' using errcode = 'P0002';
  end if;
  if v_from = p_active then
    return pg_catalog.jsonb_build_object('id', p_id, 'active', p_active);
  end if;
  update public.partner_perks
     set active = p_active
   where id = p_id;
  perform public.ops_audit_log_append(
    'partner_perk', p_id, 'perk.active.' || p_active::text, null,
    pg_catalog.jsonb_build_object('from', v_from, 'to', p_active)
  );
  return pg_catalog.jsonb_build_object('id', p_id, 'active', p_active);
end
$$;

revoke all on function public.admin_set_partner_perk_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_partner_perk_active(uuid, boolean)
  to authenticated;

create or replace function public.admin_create_testimonial(
  p_request_id uuid,
  p_quote text,
  p_author_name text,
  p_author_role text,
  p_content_locale text default null,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote text := pg_catalog.btrim(p_quote);
  v_author_name text := pg_catalog.btrim(p_author_name);
  v_created_id uuid;
  v_existing public.testimonials%rowtype;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'invalid_testimonial' using errcode = '22023';
  end if;
  if v_quote is null or char_length(v_quote) not between 1 and 2000
     or v_author_name is null or char_length(v_author_name) not between 1 and 120 then
    raise exception 'invalid_testimonial_text' using errcode = '22023';
  end if;
  if p_author_role not in ('creator','traveller','merchant') then
    raise exception 'invalid_testimonial_role' using errcode = '22023';
  end if;
  if p_content_locale is not null
     and p_content_locale not in ('en','zh-hk','zh-tw','zh-cn','ja','ko','th') then
    raise exception 'invalid_testimonial_locale' using errcode = '22023';
  end if;

  insert into public.testimonials
    (id, quote, author_name, author_role, locale, sort_order, status)
  values
    (p_request_id, v_quote, v_author_name, p_author_role, p_content_locale,
     p_sort_order, 'draft')
  on conflict (id) do nothing
  returning id into v_created_id;

  if v_created_id is null then
    select * into v_existing
      from public.testimonials t
     where t.id = p_request_id;
    if not found then
      raise exception 'testimonial_conflict' using errcode = '23505';
    end if;
    if v_existing.quote is distinct from v_quote
       or v_existing.author_name is distinct from v_author_name
       or v_existing.author_role is distinct from p_author_role
       or v_existing.locale is distinct from p_content_locale
       or v_existing.sort_order is distinct from p_sort_order then
      raise exception 'request_id_reused' using errcode = '23505';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status);
  end if;

  perform public.ops_audit_log_append(
    'testimonial', p_request_id, 'testimonial.create', null,
    pg_catalog.jsonb_build_object('status', 'draft')
  );
  return pg_catalog.jsonb_build_object('id', p_request_id, 'status', 'draft');
end
$$;

revoke all on function public.admin_create_testimonial(
  uuid, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.admin_create_testimonial(
  uuid, text, text, text, text, integer
) to authenticated;

create or replace function public.admin_set_testimonial_status(
  p_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  if not public.is_active_ops_role('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('draft','published') then
    raise exception 'invalid_testimonial_status' using errcode = '22023';
  end if;
  select t.status into v_from
    from public.testimonials t
   where t.id = p_id
   for update;
  if not found then
    raise exception 'testimonial_not_found' using errcode = 'P0002';
  end if;
  if v_from = p_status then
    return pg_catalog.jsonb_build_object('id', p_id, 'status', p_status);
  end if;
  update public.testimonials
     set status = p_status
   where id = p_id;
  perform public.ops_audit_log_append(
    'testimonial', p_id, 'testimonial.status.' || p_status, null,
    pg_catalog.jsonb_build_object('from', v_from, 'to', p_status)
  );
  return pg_catalog.jsonb_build_object('id', p_id, 'status', p_status);
end
$$;

revoke all on function public.admin_set_testimonial_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_testimonial_status(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
