-- REVIEW SOURCE ONLY. Must be reviewed with 20261031090000; neither is applied.
-- Existing guide writers remain authoritative. Permits are private transaction rows,
-- never caller-set session flags. Both old apps and direct lower RPCs are guarded.
create table kinnso_internal.studio_guide_bindings(
 guide_id uuid primary key references public.guides(id) on delete cascade,
 owner_actor_id uuid not null references auth.users(id) on delete cascade, artifact_id uuid not null,
 artifact_revision integer not null, thread_id uuid not null references public.studio_threads(id) on delete cascade,
 selected_block_ids jsonb not null, source_refs jsonb not null,
 foreign key(artifact_id,artifact_revision) references public.studio_artifact_versions(artifact_id,revision) on delete cascade
);
create table kinnso_internal.studio_handoffs(
 id uuid primary key, actor_id uuid not null references auth.users(id) on delete cascade,
 artifact_id uuid not null, artifact_revision integer not null, thread_id uuid not null,
 guide_id uuid not null, expected_revision integer not null,
 domain_request_id uuid not null, operation text not null check(operation in('save','publish')),
 selected_block_ids jsonb not null, source_refs jsonb not null, payload jsonb not null,
 digest text not null, created_at timestamptz not null default now(),
 unique(actor_id,domain_request_id),
 foreign key(artifact_id,artifact_revision) references public.studio_artifact_versions(artifact_id,revision) on delete cascade
);
create index studio_handoffs_guide on kinnso_internal.studio_handoffs(guide_id);
create table kinnso_internal.studio_write_permits(
 transaction_id bigint not null, guide_id uuid not null, actor_id uuid not null,
 handoff_id uuid not null references kinnso_internal.studio_handoffs(id) on delete cascade,
 operation text not null, primary key(transaction_id,guide_id)
);
alter table kinnso_internal.studio_guide_bindings enable row level security;
alter table kinnso_internal.studio_handoffs enable row level security;
alter table kinnso_internal.studio_write_permits enable row level security;
revoke all on table kinnso_internal.studio_guide_bindings,kinnso_internal.studio_handoffs,
 kinnso_internal.studio_write_permits from public,anon,authenticated,service_role;

-- Deletion remains supported; an opaque tombstone prevents resurrecting an ID
-- as an unbound guide and escaping its original lineage. No private body is retained here.
create table kinnso_internal.studio_guide_tombstones(guide_id uuid primary key,deleted_at timestamptz not null default now());
alter table kinnso_internal.studio_guide_tombstones enable row level security;
revoke all on table kinnso_internal.studio_guide_tombstones from public,anon,authenticated,service_role;
create function kinnso_internal.guard_studio_guide_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  perform pg_advisory_xact_lock(hashtextextended('studio-guide-identity:'||old.id::text,0));
  if exists(select 1 from kinnso_internal.studio_guide_bindings where guide_id=old.id) then
   insert into kinnso_internal.studio_guide_tombstones(guide_id) values(old.id) on conflict do nothing;
  end if;
  return old;
 end if;
 -- Serialize both direct INSERT and DELETE, not just RPC writers. This function
 -- is VOLATILE: its READ COMMITTED SPI check runs after any identity-lock wait.
 perform pg_advisory_xact_lock(hashtextextended('studio-guide-identity:'||new.id::text,0));
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=new.id) then raise exception 'studio_restricted'; end if;
 return new;
end $$;
create trigger studio_guard_guide_identity before insert or delete on public.guides for each row execute function kinnso_internal.guard_studio_guide_identity();
-- Also recheck after uniqueness waits have resolved; never return a resurrected row.
create trigger studio_guard_guide_identity_after after insert on public.guides for each row execute function kinnso_internal.guard_studio_guide_identity();
revoke all on function kinnso_internal.guard_studio_guide_identity() from public,anon,authenticated,service_role;

create function kinnso_internal.studio_handoff_snapshot(p_id uuid,p_actor uuid) returns jsonb
language plpgsql set search_path='' as $$
declare h kinnso_internal.studio_handoffs;
begin
 select * into h from kinnso_internal.studio_handoffs where id=p_id and actor_id=p_actor;
 if not found then raise exception 'studio_not_found'; end if;
 perform kinnso_internal.assert_studio_refs(h.source_refs,p_actor,h.thread_id,true);
 return jsonb_build_object('id',h.id,'artifactId',h.artifact_id,'artifactRevision',h.artifact_revision,
 'guideId',h.guide_id,'expectedRevision',h.expected_revision,'domainRequestId',h.domain_request_id,
 'operation',h.operation,'payload',h.payload,'digest',h.digest);
end $$;

create function kinnso_internal.studio_prepare_guide(p_actor uuid,p_id uuid,p_command jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare a public.studio_artifacts; binding kinnso_internal.studio_guide_bindings; d kinnso_internal.guide_drafts;
 body jsonb; block jsonb; refs jsonb:='[]'; blocks jsonb; payload jsonb; stops jsonb:='[]';
 v_guide_id uuid:=(p_command->>'guideId')::uuid; expected integer:=(p_command->>'expectedGuideRevision')::integer;
 domain_id uuid:=(p_command->>'domainRequestId')::uuid; op text; v_artifact_revision integer;
begin
 if not exists(select 1 from public.creators where id=p_actor and status='active') then raise exception 'creator_required'; end if;
 if v_guide_id is null or domain_id is null or expected is null or expected<0 or p_command->'confirmed' is distinct from 'true'::jsonb then raise exception 'invalid_studio_confirmation'; end if;
 -- Same guide-first lock order as the original writers; source locks always last.
 perform pg_advisory_xact_lock(hashtextextended('guide-draft:'||v_guide_id::text,0));
 perform 1 from public.guides where id=v_guide_id for update;
 if found and not exists(select 1 from public.guides where id=v_guide_id and creator_id=p_actor) then raise exception 'guide_not_found'; end if;
 select * into binding from kinnso_internal.studio_guide_bindings b where b.guide_id=v_guide_id;
 select * into d from kinnso_internal.guide_drafts g where g.guide_id=v_guide_id for update;
 if coalesce(d.revision,0)<>expected then raise exception 'revision_conflict'; end if;
 if p_command->>'kind'='prepareGuideSave' then
  op:='save';
  perform kinnso_internal.keys(p_command,array['kind','artifactId','artifactRevision','guideId','expectedGuideRevision','domainRequestId','selectedBlockIds','confirmed','editedPayload']);
  select * into a from public.studio_artifacts where id=(p_command->>'artifactId')::uuid and owner_actor_id=p_actor for share;
  if not found then raise exception 'studio_not_found'; end if;
  v_artifact_revision:=(p_command->>'artifactRevision')::integer;
  if (binding.guide_id is null and a.revision is distinct from v_artifact_revision)
   or (binding.guide_id is not null and binding.artifact_revision is distinct from v_artifact_revision) then raise exception 'revision_conflict'; end if;
  select v.body into body from public.studio_artifact_versions v where artifact_id=a.id and revision=v_artifact_revision;
  blocks:=p_command->'selectedBlockIds';
  if jsonb_typeof(blocks) is distinct from 'array' or jsonb_array_length(blocks)>20
   or (select count(distinct x) from jsonb_array_elements_text(blocks) x)<>jsonb_array_length(blocks) then raise exception 'invalid_studio_selection'; end if;
  for block in select value from jsonb_array_elements(body->'blocks') where blocks ? (value->>'id') loop
   if block->>'intendedUse'<>'public-candidate' or length(btrim(block->>'title'))<1 then raise exception 'invalid_studio_selection'; end if;
   refs:=refs||(block->'sources');
   stops:=stops||jsonb_build_array(jsonb_build_object('title',block->>'title','description',block->>'text','placeId',null,'startMinuteOfDay',null,'durationMinutes',null));
  end loop;
  if jsonb_array_length(stops)<>jsonb_array_length(blocks) then raise exception 'invalid_studio_selection'; end if;
  payload:=jsonb_build_object('title',body->>'title','city',body->>'city','summary',body->>'summary','content',
   jsonb_build_object('days',case when jsonb_array_length(stops)=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('offset',0,'title','','stops',stops)) end));
  if binding.guide_id is not null then
   -- Existing editor may revise public wording; it cannot detach any lineage.
   if binding.artifact_id<>a.id or binding.artifact_revision<>v_artifact_revision
    or binding.selected_block_ids<>blocks or binding.source_refs<>refs then raise exception 'invalid_lineage_change'; end if;
   if p_command ? 'editedPayload' then payload:=p_command->'editedPayload'; end if;
  elsif p_command ? 'editedPayload' or expected<>0 or exists(select 1 from public.guides g where g.id=v_guide_id) then
   raise exception 'invalid_studio_handoff';
  end if;
 else
  op:='publish';
  perform kinnso_internal.keys(p_command,array['kind','guideId','expectedGuideRevision','domainRequestId','confirmed']);
  if binding.guide_id is null or d.guide_id is null then raise exception 'studio_not_found'; end if;
  select * into a from public.studio_artifacts where id=binding.artifact_id and owner_actor_id=p_actor for share;
  if not found then raise exception 'studio_not_found'; end if;
  -- A guide pins an immutable brief version. Editing the brief head never silently
  -- rewrites this guide, and does not strand its independent editor. Live source ACLs still apply.
  v_artifact_revision:=binding.artifact_revision;
  refs:=binding.source_refs;blocks:=binding.selected_block_ids;payload:=d.payload;
 end if;
 -- This validates shape through the original save/publication writer at commit too.
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>131072 then raise exception 'invalid_draft'; end if;
 perform kinnso_internal.assert_studio_refs(refs,p_actor,a.thread_id,true);
 insert into kinnso_internal.studio_handoffs(id,actor_id,artifact_id,artifact_revision,thread_id,guide_id,expected_revision,domain_request_id,operation,selected_block_ids,source_refs,payload,digest)
 values(p_id,p_actor,a.id,v_artifact_revision,a.thread_id,v_guide_id,expected,domain_id,op,blocks,refs,payload,kinnso_internal.request_digest(payload::text));
 return kinnso_internal.studio_handoff_snapshot(p_id,p_actor);
end $$;

create function public.get_kinnso_studio_guide_context(p_guide_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); b kinnso_internal.studio_guide_bindings;
begin
 select * into b from kinnso_internal.studio_guide_bindings where guide_id=p_guide_id and owner_actor_id=actor;
 if not found then raise exception 'studio_not_found'; end if;
 perform kinnso_internal.assert_studio_refs(b.source_refs,actor,b.thread_id,true);
 return jsonb_build_object('artifactId',b.artifact_id,'artifactRevision',b.artifact_revision,'selectedBlockIds',b.selected_block_ids,'threadId',b.thread_id);
end $$;

-- Keep original writer bodies, receipts, validation and publication semantics.
alter function public.save_kinnso_guide_draft(uuid,integer,uuid,jsonb) set schema kinnso_internal;
alter function kinnso_internal.save_kinnso_guide_draft(uuid,integer,uuid,jsonb) rename to legacy_save_kinnso_guide_draft;
alter function public.publish_kinnso_guide_draft(uuid,integer,uuid) set schema kinnso_internal;
alter function kinnso_internal.publish_kinnso_guide_draft(uuid,integer,uuid) rename to legacy_publish_kinnso_guide_draft;
alter function public.publish_guide_version(uuid,integer,uuid,jsonb) set schema kinnso_internal;
alter function kinnso_internal.publish_guide_version(uuid,integer,uuid,jsonb) rename to legacy_publish_guide_version;
alter function kinnso_internal.creator_draft_snapshot(uuid) rename to legacy_creator_draft_snapshot;
revoke all on function kinnso_internal.legacy_save_kinnso_guide_draft(uuid,integer,uuid,jsonb),
 kinnso_internal.legacy_publish_kinnso_guide_draft(uuid,integer,uuid),
 kinnso_internal.legacy_publish_guide_version(uuid,integer,uuid,jsonb),
 kinnso_internal.legacy_creator_draft_snapshot(uuid) from public,anon,authenticated,service_role;

create function kinnso_internal.studio_binding_readable(p_guide uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from kinnso_internal.studio_guide_bindings b where b.guide_id=p_guide
  and (b.owner_actor_id is distinct from p_actor or not kinnso_internal.studio_refs_current(b.source_refs,p_actor,true)));
$$;
create function kinnso_internal.creator_draft_snapshot(p_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare b kinnso_internal.studio_guide_bindings; result jsonb;
begin
 select * into b from kinnso_internal.studio_guide_bindings where guide_id=p_id;
 if found and not kinnso_internal.studio_binding_readable(p_id,auth.uid()) then raise exception 'studio_restricted'; end if;
 result:=kinnso_internal.legacy_creator_draft_snapshot(p_id);
 if b.guide_id is null then return result; end if;
 return result||jsonb_build_object('studio',jsonb_build_object('artifactId',b.artifact_id,'artifactRevision',b.artifact_revision,'threadId',b.thread_id,'sourceCount',jsonb_array_length(b.source_refs),'restricted',false));
end $$;
-- Avoid one restricted item preventing the owner from opening other authored guides.
create or replace function public.list_kinnso_guide_drafts(p_after uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); items jsonb;
begin
 select coalesce(jsonb_agg(kinnso_internal.creator_draft_snapshot(g.id) order by g.id),'[]') into items
 from(select id from public.guides where creator_id=actor and (p_after is null or id>p_after)
 and kinnso_internal.studio_binding_readable(id,actor) order by id limit 21) g;
 return jsonb_build_object('items',case when jsonb_array_length(items)>20 then items-20 else items end,
 'nextCursor',case when jsonb_array_length(items)>20 then items->19->'id' else null end);
end $$;
-- Existing explicitly published metadata stays public. Unpublished derivatives
-- cannot leak through web's direct owner-row SELECT after source access changes.
create policy studio_private_guide_read on public.guides as restrictive for select to authenticated
 using(status='published' or kinnso_internal.studio_binding_readable(id,auth.uid()));

create function kinnso_internal.assert_studio_guide_write(p_guide uuid,p_request uuid,p_expected integer,p_payload jsonb,p_op text) returns uuid
language plpgsql set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); h kinnso_internal.studio_handoffs; b kinnso_internal.studio_guide_bindings;
begin
 perform pg_advisory_xact_lock(hashtextextended('guide-draft:'||p_guide::text,0));
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=p_guide) then raise exception 'studio_restricted'; end if;
 perform 1 from public.guides where id=p_guide for update;
 select * into b from kinnso_internal.studio_guide_bindings where guide_id=p_guide;
 select * into h from kinnso_internal.studio_handoffs where actor_id=actor and domain_request_id=p_request;
 if b.guide_id is null and h.id is null then return null; end if;
 if h.id is null or h.guide_id<>p_guide or h.operation<>p_op or h.expected_revision is distinct from p_expected
  or (p_payload is not null and h.payload<>p_payload) then raise exception 'studio_confirmation_required'; end if;
 if b.guide_id is not null and (b.owner_actor_id<>actor or b.artifact_id<>h.artifact_id or b.artifact_revision<>h.artifact_revision or b.source_refs<>h.source_refs) then raise exception 'studio_restricted'; end if;
 -- Lock the artifact identity and validate the pinned immutable version; head edits are independent.
 perform 1 from public.studio_artifacts where id=h.artifact_id and owner_actor_id=actor for share;
 if not found or not exists(select 1 from public.studio_artifact_versions where artifact_id=h.artifact_id and revision=h.artifact_revision) then raise exception 'revision_conflict'; end if;
 perform kinnso_internal.assert_studio_refs(h.source_refs,actor,h.thread_id,true);
 insert into kinnso_internal.studio_write_permits(transaction_id,guide_id,actor_id,handoff_id,operation)
 values(txid_current(),p_guide,actor,h.id,p_op);
 return h.id;
end $$;

create function public.save_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h_id uuid; h kinnso_internal.studio_handoffs; result jsonb;
begin
 h_id:=kinnso_internal.assert_studio_guide_write(p_draft_id,p_request_id,p_expected_revision,p_payload,'save');
 result:=kinnso_internal.legacy_save_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id,p_payload);
 if h_id is not null then
  select * into h from kinnso_internal.studio_handoffs where id=h_id;
  insert into kinnso_internal.studio_guide_bindings values(p_draft_id,h.actor_id,h.artifact_id,h.artifact_revision,h.thread_id,h.selected_block_ids,h.source_refs)
   on conflict(guide_id) do nothing;
  result:=result||jsonb_build_object('studio',jsonb_build_object('artifactId',h.artifact_id,'artifactRevision',h.artifact_revision,'threadId',h.thread_id,'sourceCount',jsonb_array_length(h.source_refs),'restricted',false));
  delete from kinnso_internal.studio_write_permits where transaction_id=txid_current() and guide_id=p_draft_id;
 end if;
 return result;
end $$;
create function public.publish_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h_id uuid; result jsonb; expected_payload jsonb;
begin
 h_id:=kinnso_internal.assert_studio_guide_write(p_draft_id,p_request_id,p_expected_revision,null,'publish');
 if h_id is not null then
  select payload into expected_payload from kinnso_internal.studio_handoffs where id=h_id;
  if not exists(select 1 from kinnso_internal.guide_drafts where guide_id=p_draft_id and payload=expected_payload) then raise exception 'revision_conflict'; end if;
 end if;
 result:=kinnso_internal.legacy_publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 delete from kinnso_internal.studio_write_permits where transaction_id=txid_current() and guide_id=p_draft_id;
 return result;
end $$;
create function public.publish_guide_version(p_guide_id uuid,p_expected_version integer,p_request_id uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=p_guide_id) then raise exception 'studio_restricted'; end if;
 if exists(select 1 from kinnso_internal.studio_guide_bindings where guide_id=p_guide_id) and not exists(
  select 1 from kinnso_internal.studio_write_permits p join kinnso_internal.studio_handoffs h on h.id=p.handoff_id
  where p.transaction_id=txid_current() and p.guide_id=p_guide_id and p.actor_id=kinnso_internal.actor()
  and p.operation='publish' and h.payload->'content'=p_content) then raise exception 'studio_confirmation_required'; end if;
 return kinnso_internal.legacy_publish_guide_version(p_guide_id,p_expected_version,p_request_id,p_content);
end $$;

create function kinnso_internal.guard_studio_guide_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare guide uuid; h kinnso_internal.studio_handoffs;
begin
 if tg_table_name='guide_versions' then guide:=new.guide_id; else guide:=new.id; end if;
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=guide) then raise exception 'studio_restricted'; end if;
 if not exists(select 1 from kinnso_internal.studio_guide_bindings where guide_id=guide) then return new; end if;
 if tg_table_name='guides' then
  -- Original bookmark triggers maintain counters; authenticated column grants
  -- still forbid direct counter writes. Every content/identity field stays guarded.
  if (to_jsonb(new)-array['saves_count','updated_at']) is not distinct from (to_jsonb(old)-array['saves_count','updated_at']) then return new; end if;
 end if;
 select h1.* into h from kinnso_internal.studio_write_permits p join kinnso_internal.studio_handoffs h1 on h1.id=p.handoff_id
 where p.transaction_id=txid_current() and p.guide_id=guide and p.actor_id=kinnso_internal.actor();
 if not found then raise exception 'studio_confirmation_required'; end if;
 perform kinnso_internal.assert_studio_refs(h.source_refs,h.actor_id,h.thread_id,true);
 if tg_table_name='guide_versions' then
  if h.operation<>'publish' then raise exception 'studio_confirmation_required'; end if;
 elsif new.creator_id<>h.actor_id or new.title is distinct from h.payload->>'title'
  or new.city is distinct from h.payload->>'city' or new.summary is distinct from h.payload->>'summary' then
  raise exception 'invalid_studio_projection';
 end if;
 return new;
end $$;
create trigger studio_guard_guide_update before update on public.guides for each row execute function kinnso_internal.guard_studio_guide_mutation();
create trigger studio_guard_version_insert before insert on public.guide_versions for each row execute function kinnso_internal.guard_studio_guide_mutation();
revoke all on function kinnso_internal.studio_handoff_snapshot(uuid,uuid),kinnso_internal.studio_prepare_guide(uuid,uuid,jsonb),
 kinnso_internal.assert_studio_guide_write(uuid,uuid,integer,jsonb,text),kinnso_internal.guard_studio_guide_mutation(),
 kinnso_internal.creator_draft_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function kinnso_internal.studio_binding_readable(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function kinnso_internal.studio_binding_readable(uuid,uuid) to authenticated;
revoke all on function public.get_kinnso_studio_guide_context(uuid),public.save_kinnso_guide_draft(uuid,integer,uuid,jsonb),
 public.publish_kinnso_guide_draft(uuid,integer,uuid),public.publish_guide_version(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_studio_guide_context(uuid),public.save_kinnso_guide_draft(uuid,integer,uuid,jsonb),
 public.publish_kinnso_guide_draft(uuid,integer,uuid),public.publish_guide_version(uuid,integer,uuid,jsonb) to authenticated;
