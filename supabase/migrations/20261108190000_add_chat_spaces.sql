-- Spaces + continuous chat threads for the MCP-grounded conversation surface.
-- Additive only: no existing table, policy, grant or function is modified.
-- Reads and writes go through the security-definer RPCs below; the underlying
-- tables keep RLS on and are not granted to anon/authenticated/service_role.

create table public.chat_spaces(
  id uuid primary key,
  owner_actor_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_spaces_owner on public.chat_spaces(owner_actor_id, updated_at desc);

create table public.chat_threads(
  id uuid primary key,
  space_id uuid not null references public.chat_spaces(id) on delete cascade,
  owner_actor_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(btrim(title)) between 1 and 120),
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_space on public.chat_threads(space_id, updated_at desc);
create index chat_threads_owner on public.chat_threads(owner_actor_id, updated_at desc);

create table public.chat_messages(
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  role text not null check (role in ('user','assistant','tool')),
  body text not null default '' check (char_length(body) <= 32000),
  tool_name text check (tool_name is null or char_length(tool_name) <= 80),
  tool_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (thread_id, sequence)
);
create index chat_messages_thread on public.chat_messages(thread_id, sequence);

create table kinnso_internal.chat_requests(
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  digest text not null,
  kind text not null,
  resource_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);

alter table public.chat_spaces enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table kinnso_internal.chat_requests enable row level security;

-- Private bodies stay behind the RPC boundary, including for service_role.
revoke all on table public.chat_spaces, public.chat_threads, public.chat_messages,
  kinnso_internal.chat_requests from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Spaces
-- ---------------------------------------------------------------------------
create function public.chat_list_spaces() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description,
      'threadCount', (select count(*) from public.chat_threads t where t.space_id = s.id),
      'updatedAt', s.updated_at) order by s.updated_at desc, s.id)
    from (select * from public.chat_spaces where owner_actor_id = actor order by updated_at desc, id limit 100) s), '[]'::jsonb));
end $$;

create function public.chat_create_space(p_id uuid, p_name text, p_description text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  if p_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 80
    or char_length(coalesce(p_description,'')) > 280 then raise exception 'invalid_space'; end if;
  if (select count(*) from public.chat_spaces where owner_actor_id = actor) >= 50 then raise exception 'invalid_space_limit'; end if;
  insert into public.chat_spaces(id, owner_actor_id, name, description)
    values (p_id, actor, btrim(p_name), coalesce(p_description,''))
    on conflict (id) do nothing;
  if not exists (select 1 from public.chat_spaces where id = p_id and owner_actor_id = actor) then raise exception 'space_conflict'; end if;
  return (select jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'threadCount', 0, 'updatedAt', s.updated_at)
    from public.chat_spaces s where s.id = p_id);
end $$;

create function public.chat_delete_space(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  delete from public.chat_spaces where id = p_id and owner_actor_id = actor;
  if not found then raise exception 'space_not_found'; end if;
  return jsonb_build_object('deleted', true);
end $$;

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------
create function public.chat_list_threads(p_space_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor();
begin
  if not exists (select 1 from public.chat_spaces where id = p_space_id and owner_actor_id = actor) then raise exception 'space_not_found'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'spaceId', t.space_id, 'title', t.title,
      'messageCount', t.message_count, 'updatedAt', t.updated_at) order by t.updated_at desc, t.id)
    from (select * from public.chat_threads where space_id = p_space_id and owner_actor_id = actor
          order by updated_at desc, id limit 200) t), '[]'::jsonb));
end $$;

create function public.chat_create_thread(p_id uuid, p_space_id uuid, p_title text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); title text := nullif(btrim(coalesce(p_title,'')), '');
begin
  if p_id is null or not exists (select 1 from public.chat_spaces where id = p_space_id and owner_actor_id = actor)
    then raise exception 'space_not_found'; end if;
  if title is not null and char_length(title) > 120 then raise exception 'invalid_thread'; end if;
  if (select count(*) from public.chat_threads where space_id = p_space_id and owner_actor_id = actor) >= 200 then raise exception 'invalid_thread_limit'; end if;
  insert into public.chat_threads(id, space_id, owner_actor_id, title)
    values (p_id, p_space_id, actor, coalesce(title, 'New chat'))
    on conflict (id) do nothing;
  if not exists (select 1 from public.chat_threads where id = p_id and owner_actor_id = actor) then raise exception 'thread_conflict'; end if;
  update public.chat_spaces set updated_at = now() where id = p_space_id;
  return (select jsonb_build_object('id', t.id, 'spaceId', t.space_id, 'title', t.title, 'messageCount', t.message_count, 'updatedAt', t.updated_at)
    from public.chat_threads t where t.id = p_id);
end $$;

create function public.chat_delete_thread(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); v_space uuid;
begin
  delete from public.chat_threads where id = p_id and owner_actor_id = actor returning space_id into v_space;
  if v_space is null then raise exception 'thread_not_found'; end if;
  update public.chat_spaces set updated_at = now() where id = v_space;
  return jsonb_build_object('deleted', true);
end $$;

create function public.chat_get_thread(p_thread_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); thread public.chat_threads;
begin
  select * into thread from public.chat_threads where id = p_thread_id and owner_actor_id = actor;
  if not found then raise exception 'thread_not_found'; end if;
  return jsonb_build_object(
    'id', thread.id, 'spaceId', thread.space_id, 'title', thread.title,
    'messageCount', thread.message_count, 'updatedAt', thread.updated_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'sequence', m.sequence, 'role', m.role,
        'body', m.body, 'toolName', m.tool_name, 'toolPayload', m.tool_payload, 'createdAt', m.created_at)
        order by m.sequence)
      from (select * from public.chat_messages where thread_id = thread.id order by sequence desc limit 400) m), '[]'::jsonb));
end $$;

-- Idempotent append of one message (a chat turn is user message + assistant reply,
-- each written with its own request id by the server, in order).
create function public.chat_append_message(p_thread_id uuid, p_request_id uuid, p_role text,
  p_body text, p_tool_name text default null, p_tool_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); digest text; prior kinnso_internal.chat_requests;
  thread public.chat_threads; seq integer; v_id uuid; result jsonb;
begin
  if p_request_id is null or p_thread_id is null then raise exception 'invalid_chat_message'; end if;
  if coalesce(p_role,'') not in ('user','assistant','tool') then raise exception 'invalid_chat_role'; end if;
  if char_length(coalesce(p_body,'')) > 32000 then raise exception 'invalid_chat_message'; end if;
  if octet_length(coalesce(p_tool_payload,'{}')::text) > 65536 then raise exception 'invalid_chat_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat-request:' || actor::text || p_request_id::text, 0));
  digest := kinnso_internal.request_digest(jsonb_build_object('thread', p_thread_id, 'role', p_role,
    'body', p_body, 'tool', p_tool_name, 'payload', p_tool_payload)::text);
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
  insert into public.chat_messages(thread_id, sequence, role, body, tool_name, tool_payload)
    values (p_thread_id, seq + 1, p_role, coalesce(p_body,''), p_tool_name, coalesce(p_tool_payload,'{}'::jsonb))
    returning id into v_id;
  update public.chat_threads set message_count = message_count + 1, updated_at = now() where id = p_thread_id;
  update public.chat_spaces set updated_at = now() where id = thread.space_id;
  result := jsonb_build_object('id', v_id, 'threadId', p_thread_id, 'sequence', seq + 1, 'role', p_role);
  insert into kinnso_internal.chat_requests(actor_id, request_id, digest, kind, resource_id, result)
    values (actor, p_request_id, digest, 'appendMessage', v_id, result);
  return result;
end $$;

create function public.chat_rename_thread(p_id uuid, p_title text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); v_title text := btrim(coalesce(p_title,''));
begin
  if char_length(v_title) not between 1 and 120 then raise exception 'invalid_thread'; end if;
  update public.chat_threads t set title = v_title, updated_at = now()
   where t.id = p_id and t.owner_actor_id = actor;
  if not found then raise exception 'thread_not_found'; end if;
  return jsonb_build_object('id', p_id, 'title', v_title);
end $$;
-- ---------------------------------------------------------------------------
-- Cost guard: bounded model turns per actor per rolling hour window
-- ---------------------------------------------------------------------------
create table kinnso_internal.chat_turn_budget(
  actor_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  used integer not null default 0 check (used >= 0),
  primary key (actor_id, window_start)
);
revoke all on table kinnso_internal.chat_turn_budget from public, anon, authenticated, service_role;

create function public.chat_reserve_turn(p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); v_limit integer := least(greatest(coalesce(p_limit,30),1),200);
  v_window timestamptz := date_trunc('hour', now()); v_used integer;
begin
  insert into kinnso_internal.chat_turn_budget(actor_id, window_start, used)
    values (actor, v_window, 1)
    on conflict (actor_id, window_start) do update
      set used = case when kinnso_internal.chat_turn_budget.used < v_limit
                      then kinnso_internal.chat_turn_budget.used + 1
                      else kinnso_internal.chat_turn_budget.used end
    returning used into v_used;
  delete from kinnso_internal.chat_turn_budget where window_start < now() - interval '2 days';
  return jsonb_build_object('allowed', v_used <= v_limit, 'used', v_used, 'limit', v_limit,
    'resetAt', (v_window + interval '1 hour'));
end $$;

-- ---------------------------------------------------------------------------
-- Read-only readers exposed as MCP tools
-- ---------------------------------------------------------------------------
create function public.mcp_search_guides(p_query text, p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text := nullif(btrim(coalesce(p_query,'')), ''); lim integer := least(greatest(coalesce(p_limit,5),1),20);
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'summary', left(g.summary, 400),
      'city', g.city, 'creatorName', g.creator_name, 'creatorHandle', g.creator_handle,
      'publishedAt', g.published_at, 'path', '/g/' || g.id) order by g.published_at desc)
    from (select * from public.guides
          where status = 'published'
            and (q is null or title ilike '%' || q || '%' or summary ilike '%' || q || '%'
                 or city ilike '%' || q || '%' or creator_name ilike '%' || q || '%')
          order by published_at desc limit lim) g), '[]'::jsonb), 'query', q);
end $$;

create function public.mcp_list_my_trips(p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := kinnso_internal.actor(); lim integer := least(greatest(coalesce(p_limit,10),1),50);
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'updatedAt', t.updated_at, 'path', '/trips/' || t.id)
      order by t.updated_at desc) from (select * from public.trips where owner_user_id = actor order by updated_at desc limit lim) t), '[]'::jsonb));
end $$;

create function public.mcp_workspace_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor jsonb := public.kinnso_actor();
begin
  return jsonb_build_object(
    'roles', actor->'roles',
    'spaces', (select count(*) from public.chat_spaces where owner_actor_id = (actor->>'id')::uuid),
    'threads', (select count(*) from public.chat_threads where owner_actor_id = (actor->>'id')::uuid),
    'messages', (select count(*) from public.chat_messages m join public.chat_threads t on t.id = m.thread_id where t.owner_actor_id = (actor->>'id')::uuid));
end $$;

revoke all on function public.chat_list_spaces(), public.chat_create_space(uuid,text,text),
  public.chat_delete_space(uuid), public.chat_list_threads(uuid), public.chat_create_thread(uuid,uuid,text),
  public.chat_delete_thread(uuid), public.chat_get_thread(uuid), public.chat_rename_thread(uuid,text),
  public.chat_append_message(uuid,uuid,text,text,text,jsonb),
  public.mcp_search_guides(text,integer), public.mcp_list_my_trips(integer),
  public.mcp_workspace_summary(), public.chat_reserve_turn(integer) from public, anon;

grant execute on function public.chat_list_spaces(), public.chat_create_space(uuid,text,text),
  public.chat_delete_space(uuid), public.chat_list_threads(uuid), public.chat_create_thread(uuid,uuid,text),
  public.chat_delete_thread(uuid), public.chat_get_thread(uuid), public.chat_rename_thread(uuid,text),
  public.chat_append_message(uuid,uuid,text,text,text,jsonb),
  public.mcp_search_guides(text,integer), public.mcp_list_my_trips(integer),
  public.mcp_workspace_summary(), public.chat_reserve_turn(integer) to authenticated;
