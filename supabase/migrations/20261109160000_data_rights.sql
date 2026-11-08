-- L2 data rights: export, deletion and a recorded request channel.
--
-- The product stores AI conversations and creator content on behalf of people.
-- This migration makes the user's rights concrete: a complete export of their
-- AI and studio data, a real deletion for the data it is safe to erase in bulk,
-- and an auditable request channel for everything else. Published guides are not
-- bulk-deleted here: they are public content with attribution and are withdrawn
-- through the studio workflow, so deletion of published work is a recorded
-- request, never an implicit side effect.
create table if not exists kinnso_internal.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('export', 'delete', 'access', 'correction')),
  scope text not null check (scope in ('ai_conversations', 'creator_content', 'account')),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'rejected')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists privacy_requests_actor_idx on kinnso_internal.privacy_requests (actor_id, created_at desc);
alter table kinnso_internal.privacy_requests enable row level security;
revoke all on kinnso_internal.privacy_requests from public, anon, authenticated, service_role;

create function public.kinnso_export_account_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exportedAt', now(),
    'version', 1,
    'spaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'createdAt', s.created_at, 'updatedAt', s.updated_at, 'archivedAt', s.archived_at,
        'chats', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', t.id, 'title', t.title, 'createdAt', t.created_at, 'updatedAt', t.updated_at,
            'archivedAt', t.archived_at, 'pinnedAt', t.pinned_at,
            'messages', coalesce((
              select jsonb_agg(jsonb_build_object(
                'role', m.role, 'body', m.body, 'toolName', m.tool_name,
                'toolPayload', m.tool_payload, 'metadata', m.metadata, 'createdAt', m.created_at
              ) order by m.sequence)
              from public.chat_messages m where m.thread_id = t.id
            ), '[]'::jsonb)
          ) order by t.created_at)
          from public.chat_threads t where t.space_id = s.id
        ), '[]'::jsonb)
      ) order by s.created_at)
      from public.chat_spaces s where s.owner_actor_id = v_actor
    ), '[]'::jsonb),
    'guides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'status', g.status,
        'createdAt', g.created_at, 'updatedAt', g.updated_at,
        'synthetic', g.synthetic, 'rightsBasis', g.rights_basis,
        'sourceCount', jsonb_array_length(g.source_refs), 'placeVerifiedAt', g.place_verified_at))
      from public.guides g where g.creator_id = v_actor
    ), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'guideId', d.guide_id, 'revision', d.revision, 'payload', d.payload, 'updatedAt', d.updated_at))
      from kinnso_internal.guide_drafts d
      join public.guides g on g.id = d.guide_id
      where g.creator_id = v_actor
    ), '[]'::jsonb),
    'attestations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'guideId', a.guide_id, 'version', a.version, 'rightsBasis', a.rights_basis,
        'statement', a.statement, 'attestedAt', a.attested_at))
      from kinnso_internal.guide_version_attestations a
      join public.guides g on g.id = a.guide_id
      where g.creator_id = v_actor
    ), '[]'::jsonb),
    'privacyRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind, 'scope', r.scope, 'note', r.note, 'status', r.status,
        'createdAt', r.created_at, 'resolutionNote', r.resolution_note))
      from kinnso_internal.privacy_requests r where r.actor_id = v_actor
    ), '[]'::jsonb)
  );
end $$;

create function public.kinnso_delete_ai_conversations() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_spaces integer; v_threads integer; v_messages integer;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  select count(*) into v_spaces from public.chat_spaces where owner_actor_id = v_actor;
  select count(*) into v_threads from public.chat_threads where owner_actor_id = v_actor;
  select count(*) into v_messages from public.chat_messages m
    join public.chat_threads t on t.id = m.thread_id where t.owner_actor_id = v_actor;
  delete from public.chat_spaces where owner_actor_id = v_actor;
  delete from kinnso_internal.chat_turn_budget where actor_id = v_actor;
  return jsonb_build_object('deletedSpaces', v_spaces, 'deletedThreads', v_threads,
    'deletedMessages', v_messages, 'clearedAt', now());
end $$;

create function public.kinnso_delete_creator_drafts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_deleted integer;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  delete from kinnso_internal.guide_drafts d
   using public.guides g
   where g.id = d.guide_id and g.creator_id = v_actor;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deletedDrafts', v_deleted, 'clearedAt', now());
end $$;

create function public.kinnso_privacy_request(p_kind text, p_scope text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := btrim(coalesce(p_note, ''));
  v_row kinnso_internal.privacy_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_kind not in ('export', 'delete', 'access', 'correction') then raise exception 'invalid_request'; end if;
  if p_scope not in ('ai_conversations', 'creator_content', 'account') then raise exception 'invalid_request'; end if;
  if char_length(v_note) > 1000 then raise exception 'invalid_request'; end if;
  insert into kinnso_internal.privacy_requests (actor_id, kind, scope, note)
    values (v_actor, p_kind, p_scope, v_note) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'scope', v_row.scope,
    'note', v_row.note, 'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

create function public.kinnso_my_privacy_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'scope', r.scope,
      'note', r.note, 'status', r.status, 'resolutionNote', r.resolution_note,
      'createdAt', r.created_at, 'updatedAt', r.updated_at) order by r.created_at desc)
    from kinnso_internal.privacy_requests r where r.actor_id = v_actor), '[]'::jsonb);
end $$;

create function public.kinnso_ops_privacy_requests(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'scope', r.scope,
      'note', r.note, 'status', r.status, 'resolutionNote', r.resolution_note,
      'createdAt', r.created_at, 'updatedAt', r.updated_at) order by
      case r.status when 'received' then 0 when 'in_progress' then 1 else 2 end, r.created_at)
    from (select * from kinnso_internal.privacy_requests order by created_at desc limit v_limit) r), '[]'::jsonb));
end $$;

create function public.kinnso_ops_update_privacy_request(p_id uuid, p_status text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row kinnso_internal.privacy_requests;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('received', 'in_progress', 'completed', 'rejected') then raise exception 'invalid_status'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'invalid_note'; end if;
  update kinnso_internal.privacy_requests
     set status = p_status, resolution_note = coalesce(v_note, resolution_note), updated_at = now()
   where id = p_id returning * into v_row;
  if not found then raise exception 'request_not_found'; end if;
  return jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'scope', v_row.scope,
    'note', v_row.note, 'status', v_row.status, 'resolutionNote', v_row.resolution_note,
    'createdAt', v_row.created_at, 'updatedAt', v_row.updated_at);
end $$;

revoke all on function public.kinnso_export_account_data() from public, anon;
revoke all on function public.kinnso_delete_ai_conversations() from public, anon;
revoke all on function public.kinnso_delete_creator_drafts() from public, anon;
revoke all on function public.kinnso_privacy_request(text, text, text) from public, anon;
revoke all on function public.kinnso_my_privacy_requests() from public, anon;
revoke all on function public.kinnso_ops_privacy_requests(integer) from public, anon;
revoke all on function public.kinnso_ops_update_privacy_request(uuid, text, text) from public, anon;
grant execute on function public.kinnso_export_account_data() to authenticated;
grant execute on function public.kinnso_delete_ai_conversations() to authenticated;
grant execute on function public.kinnso_delete_creator_drafts() to authenticated;
grant execute on function public.kinnso_privacy_request(text, text, text) to authenticated;
grant execute on function public.kinnso_my_privacy_requests() to authenticated;
grant execute on function public.kinnso_ops_privacy_requests(integer) to authenticated;
grant execute on function public.kinnso_ops_update_privacy_request(uuid, text, text) to authenticated;
