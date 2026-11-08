-- Studio Chat 2.0: additive per-message metadata, archive/pin state and the
-- management, search and usage RPCs the Studio surface needs.
--
-- Additive only: existing tables keep their rows and policies, and the chat
-- tables stay private behind the security-definer RPC boundary exactly like
-- 20261108190000_add_chat_spaces.sql. The only replaced function signature is
-- chat_append_message, which grows one defaulted p_metadata argument; the old
-- six-argument overload is dropped so calls stay unambiguous.

alter table public.chat_messages add column metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(metadata) = 'object');
alter table public.chat_threads add column archived_at timestamptz;
alter table public.chat_threads add column pinned_at timestamptz;
alter table public.chat_spaces add column archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- List projections: archived rows leave the default lists, pinned chats first
-- ---------------------------------------------------------------------------
create or replace function public.chat_list_spaces() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description,
      'threadCount', (select count(*) from public.chat_threads t where t.space_id = s.id),
      'archivedAt', s.archived_at,
      'updatedAt', s.updated_at) order by s.updated_at desc, s.id)
    from (select * from public.chat_spaces
          where owner_actor_id = actor and archived_at is null
          order by updated_at desc, id limit 100) s), '[]'::jsonb));
end $$;

create or replace function public.chat_list_threads(p_space_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  if not exists (select 1 from public.chat_spaces where id = p_space_id and owner_actor_id = actor) then raise exception 'space_not_found'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'spaceId', t.space_id, 'title', t.title,
      'messageCount', t.message_count, 'archivedAt', t.archived_at, 'pinnedAt', t.pinned_at,
      'updatedAt', t.updated_at) order by t.pinned_at desc nulls last, t.updated_at desc, t.id)
    from (select * from public.chat_threads
          where space_id = p_space_id and owner_actor_id = actor and archived_at is null
          order by pinned_at desc nulls last, updated_at desc, id limit 200) t), '[]'::jsonb));
end $$;

create or replace function public.chat_get_thread(p_thread_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); thread public.chat_threads;
begin
  select * into thread from public.chat_threads where id = p_thread_id and owner_actor_id = actor;
  if not found then raise exception 'thread_not_found'; end if;
  return jsonb_build_object(
    'id', thread.id, 'spaceId', thread.space_id, 'title', thread.title,
    'messageCount', thread.message_count, 'archivedAt', thread.archived_at,
    'pinnedAt', thread.pinned_at, 'updatedAt', thread.updated_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'sequence', m.sequence, 'role', m.role,
        'body', m.body, 'toolName', m.tool_name, 'toolPayload', m.tool_payload,
        'metadata', m.metadata, 'createdAt', m.created_at)
        order by m.sequence)
      from (select * from public.chat_messages where thread_id = thread.id order by sequence desc limit 400) m), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Message append: same idempotent actor+request contract, one bounded metadata
-- object more. Metadata joins the request digest so a retry with different
-- metadata conflicts instead of silently storing the first copy.
--
-- Rollout compatibility: the previously deployed build still calls the six
-- argument form, so that function is deliberately NOT dropped here. The new
-- seven argument function therefore declares no defaults (PostgreSQL treats a
-- six argument call as ambiguous otherwise). Both coexist until a later
-- cleanup migration removes the six argument form.
-- ---------------------------------------------------------------------------
create function public.chat_append_message(p_thread_id uuid, p_request_id uuid, p_role text,
  p_body text, p_tool_name text, p_tool_payload jsonb, p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); digest text; prior kinnso_internal.chat_requests;
  thread public.chat_threads; seq integer; v_id uuid; v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb); result jsonb;
begin
  if p_request_id is null or p_thread_id is null then raise exception 'invalid_chat_message'; end if;
  if coalesce(p_role,'') not in ('user','assistant','tool') then raise exception 'invalid_chat_role'; end if;
  if char_length(coalesce(p_body,'')) > 32000 then raise exception 'invalid_chat_message'; end if;
  if octet_length(coalesce(p_tool_payload,'{}')::text) > 65536 then raise exception 'invalid_chat_message'; end if;
  if jsonb_typeof(v_metadata) <> 'object' or octet_length(v_metadata::text) > 16384 then raise exception 'invalid_chat_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat-request:' || actor::text || p_request_id::text, 0));
  -- An empty metadata object keeps the historical six-field digest, so a
  -- request retried across this migration still replays its prior result.
  digest := kinnso_internal.request_digest((jsonb_build_object('thread', p_thread_id, 'role', p_role,
    'body', p_body, 'tool', p_tool_name, 'payload', p_tool_payload)
    || case when v_metadata = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('metadata', v_metadata) end)::text);
  select * into prior from kinnso_internal.chat_requests where actor_id = actor and request_id = p_request_id;
  if found then
    if prior.digest <> digest then raise exception 'idempotency_conflict'; end if;
    return prior.result;
  end if;
  select * into thread from public.chat_threads where id = p_thread_id and owner_actor_id = actor for update;
  if not found then raise exception 'thread_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat-thread:' || p_thread_id::text, 0));
  select coalesce(max(sequence), 0) into seq from public.chat_messages where chat_messages.thread_id = p_thread_id;
  if seq >= 4000 then raise exception 'invalid_message_limit'; end if;
  insert into public.chat_messages(thread_id, sequence, role, body, tool_name, tool_payload, metadata)
    values (p_thread_id, seq + 1, p_role, coalesce(p_body,''), p_tool_name,
      coalesce(p_tool_payload,'{}'::jsonb), v_metadata)
    returning id into v_id;
  update public.chat_threads set message_count = message_count + 1, updated_at = now() where id = p_thread_id;
  update public.chat_spaces set updated_at = now() where id = thread.space_id;
  result := jsonb_build_object('id', v_id, 'threadId', p_thread_id, 'sequence', seq + 1, 'role', p_role,
    'metadata', v_metadata);
  insert into kinnso_internal.chat_requests(actor_id, request_id, digest, kind, resource_id, result)
    values (actor, p_request_id, digest, 'appendMessage', v_id, result);
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Management: rename / archive / pin. Identical repeated calls are no-ops and
-- never bump updated_at, so the lists stay stable across client retries.
-- ---------------------------------------------------------------------------
create function public.chat_update_space(p_id uuid, p_name text default null,
  p_description text default null, p_archived boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
  v_name text := case when p_name is null then null else btrim(p_name) end;
begin
  if p_id is null then raise exception 'invalid_space'; end if;
  if v_name is not null and char_length(v_name) not between 1 and 80 then raise exception 'invalid_space'; end if;
  if p_description is not null and char_length(p_description) > 280 then raise exception 'invalid_space'; end if;
  update public.chat_spaces s set
    name = coalesce(v_name, s.name),
    description = coalesce(p_description, s.description),
    archived_at = case when p_archived is null then s.archived_at
                       when p_archived then coalesce(s.archived_at, now())
                       else null end,
    updated_at = now()
   where s.id = p_id and s.owner_actor_id = actor
     and ((v_name is not null and v_name is distinct from s.name)
       or (p_description is not null and p_description is distinct from s.description)
       or (p_archived is not null and p_archived <> (s.archived_at is not null)));
  if not found and not exists (select 1 from public.chat_spaces where id = p_id and owner_actor_id = actor)
    then raise exception 'space_not_found'; end if;
  return (select jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
    'threadCount', (select count(*) from public.chat_threads t where t.space_id = s.id),
    'archivedAt', s.archived_at, 'updatedAt', s.updated_at)
    from public.chat_spaces s where s.id = p_id and s.owner_actor_id = actor);
end $$;

create function public.chat_update_thread(p_id uuid, p_title text default null,
  p_archived boolean default null, p_pinned boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
  v_title text := case when p_title is null then null else btrim(p_title) end;
begin
  if p_id is null then raise exception 'invalid_thread'; end if;
  if v_title is not null and char_length(v_title) not between 1 and 120 then raise exception 'invalid_thread'; end if;
  update public.chat_threads t set
    title = coalesce(v_title, t.title),
    archived_at = case when p_archived is null then t.archived_at
                       when p_archived then coalesce(t.archived_at, now())
                       else null end,
    pinned_at = case when p_pinned is null then t.pinned_at
                     when p_pinned then coalesce(t.pinned_at, now())
                     else null end,
    updated_at = now()
   where t.id = p_id and t.owner_actor_id = actor
     and ((v_title is not null and v_title is distinct from t.title)
       or (p_archived is not null and p_archived <> (t.archived_at is not null))
       or (p_pinned is not null and p_pinned <> (t.pinned_at is not null)));
  if not found and not exists (select 1 from public.chat_threads where id = p_id and owner_actor_id = actor)
    then raise exception 'thread_not_found'; end if;
  return (select jsonb_build_object('id', t.id, 'spaceId', t.space_id, 'title', t.title,
    'messageCount', t.message_count, 'archivedAt', t.archived_at, 'pinnedAt', t.pinned_at,
    'updatedAt', t.updated_at)
    from public.chat_threads t where t.id = p_id and t.owner_actor_id = actor);
end $$;

-- ---------------------------------------------------------------------------
-- Owner-scoped search over space names/descriptions, chat titles and message
-- bodies. Snippets are bounded to the first 120 characters of the hit.
-- ---------------------------------------------------------------------------
create function public.chat_search(p_query text, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
  q text := nullif(btrim(coalesce(p_query,'')), '');
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if q is null or char_length(q) > 80 then raise exception 'invalid_search'; end if;
  return jsonb_build_object('query', q, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('type', m.type, 'id', m.id, 'spaceId', m.space_id,
      'threadId', m.thread_id, 'title', m.title, 'snippet', m.snippet) order by m.matched_at desc, m.id)
    from (
      select 'space'::text as type, s.id, s.id as space_id, null::uuid as thread_id,
        s.name as title, nullif(left(nullif(btrim(s.description), ''), 120), '') as snippet,
        s.updated_at as matched_at
      from public.chat_spaces s
      where s.owner_actor_id = actor
        and (s.name ilike '%' || q || '%' or s.description ilike '%' || q || '%')
      union all
      select 'chat', t.id, t.space_id, t.id, t.title,
        (select left(m2.body, 120) from public.chat_messages m2
          where m2.thread_id = t.id and m2.body ilike '%' || q || '%'
          order by m2.sequence limit 1),
        t.updated_at
      from public.chat_threads t
      where t.owner_actor_id = actor
        and (t.title ilike '%' || q || '%'
          or exists (select 1 from public.chat_messages m3
                      where m3.thread_id = t.id and m3.body ilike '%' || q || '%'))
      order by 7 desc, 2 limit lim
    ) m), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Usage meter: the current hour's model-turn budget plus lifetime totals.
-- The application overlays its configured per-hour limit on top of this default.
-- ---------------------------------------------------------------------------
create function public.chat_usage() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
  v_window timestamptz := date_trunc('hour', now());
  v_used integer;
begin
  select coalesce(used, 0) into v_used from kinnso_internal.chat_turn_budget
   where actor_id = actor and window_start = v_window;
  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', 30,
    'resetAt', v_window + interval '1 hour',
    'spaces', (select count(*) from public.chat_spaces where owner_actor_id = actor),
    'threads', (select count(*) from public.chat_threads where owner_actor_id = actor),
    'messages', (select count(*) from public.chat_messages m
      join public.chat_threads t on t.id = m.thread_id where t.owner_actor_id = actor));
end $$;

revoke all on function public.chat_list_spaces(), public.chat_list_threads(uuid),
  public.chat_get_thread(uuid), public.chat_append_message(uuid,uuid,text,text,text,jsonb,jsonb),
  public.chat_update_space(uuid,text,text,boolean), public.chat_update_thread(uuid,text,boolean,boolean),
  public.chat_search(text,integer), public.chat_usage() from public, anon;

grant execute on function public.chat_list_spaces(), public.chat_list_threads(uuid),
  public.chat_get_thread(uuid), public.chat_append_message(uuid,uuid,text,text,text,jsonb,jsonb),
  public.chat_update_space(uuid,text,text,boolean), public.chat_update_thread(uuid,text,boolean,boolean),
  public.chat_search(text,integer), public.chat_usage() to authenticated;
