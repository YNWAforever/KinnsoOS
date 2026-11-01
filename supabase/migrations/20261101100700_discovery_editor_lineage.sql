-- GENERATED, UNAPPLIED field-lineage continuations. See generator and source hashes.

-- Source: 20261031090100_guard_studio_guide_writes.sql; function sha256 9357ae0b423a36caa5a961f625627cf411e05b1ee6f643d100eff2959cd4de95
create or replace function kinnso_internal.studio_prepare_guide(p_actor uuid,p_id uuid,p_command jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare a public.studio_artifacts; binding kinnso_internal.studio_guide_bindings; d kinnso_internal.guide_drafts;
 body jsonb; block jsonb; refs jsonb:='[]'; blocks jsonb; payload jsonb; stops jsonb:='[]';
 v_guide_id uuid:=(p_command->>'guideId')::uuid; expected integer:=(p_command->>'expectedGuideRevision')::integer;
 domain_id uuid:=(p_command->>'domainRequestId')::uuid; op text; v_artifact_revision integer; has_licensed boolean:=false;
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
  select exists(select 1 from jsonb_array_elements(body->'blocks') b cross join lateral jsonb_array_elements(b->'sources') r
   join kinnso_internal.discovery_source_provenance sp on sp.source_id=(r->>'sourceId')::uuid where blocks ? (b->>'id')) into has_licensed;
  for block in select value from jsonb_array_elements(body->'blocks') where blocks ? (value->>'id') loop
   if block->>'intendedUse'<>'public-candidate' or length(btrim(block->>'title'))<1 then raise exception 'invalid_studio_selection'; end if;
   refs:=refs||(block->'sources');
   stops:=stops||jsonb_build_array(jsonb_build_object('title',block->>'title','description',block->>'text','placeId',null,'startMinuteOfDay',null,'durationMinutes',null)||case when has_licensed then jsonb_build_object('studioBlockId',block->'id') else '{}'::jsonb end);
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
  refs:=binding.source_refs;blocks:=binding.selected_block_ids;payload:=kinnso_internal.discovery_restore_markers(v_guide_id,d.payload);
 end if;
 -- This validates shape through the original save/publication writer at commit too.
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>131072 then raise exception 'invalid_draft'; end if;
 perform kinnso_internal.discovery_assert_markers(payload,a.id,v_artifact_revision,blocks);
 perform kinnso_internal.assert_studio_refs(refs,p_actor,a.thread_id,true);
 insert into kinnso_internal.studio_handoffs(id,actor_id,artifact_id,artifact_revision,thread_id,guide_id,expected_revision,domain_request_id,operation,selected_block_ids,source_refs,payload,digest)
 values(p_id,p_actor,a.id,v_artifact_revision,a.thread_id,v_guide_id,expected,domain_id,op,blocks,refs,payload,kinnso_internal.request_digest(payload::text));
 return kinnso_internal.studio_handoff_snapshot(p_id,p_actor);
end $$;

-- Source: 20261031090100_guard_studio_guide_writes.sql; function sha256 c582079307d95e6de64c9bc78ddd4eeff2d76c48ea7950f81cb2bf1bca8630ba
create or replace function kinnso_internal.creator_draft_snapshot(p_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare b kinnso_internal.studio_guide_bindings; result jsonb;
begin
 select * into b from kinnso_internal.studio_guide_bindings where guide_id=p_id;
 if found and not kinnso_internal.studio_binding_readable(p_id,auth.uid()) then raise exception 'studio_restricted'; end if;
 result:=kinnso_internal.legacy_creator_draft_snapshot(p_id);
 result:=jsonb_set(result,'{payload}',kinnso_internal.discovery_restore_markers(p_id,result->'payload'));
 if b.guide_id is null then return result; end if;
 return result||jsonb_build_object('studio',jsonb_build_object('artifactId',b.artifact_id,'artifactRevision',b.artifact_revision,'threadId',b.thread_id,'sourceCount',jsonb_array_length(b.source_refs),'restricted',false));
end $$;

-- Source: 20261031090100_guard_studio_guide_writes.sql; function sha256 5e074fe267c1cad78dc591274300004b2099e50d2f841717ae3cee50513e7a55
create or replace function public.save_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h_id uuid; h kinnso_internal.studio_handoffs; result jsonb;
begin
 h_id:=kinnso_internal.assert_studio_guide_write(p_draft_id,p_request_id,p_expected_revision,p_payload,'save');
 result:=kinnso_internal.legacy_save_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id,kinnso_internal.discovery_strip_markers(p_payload));
 if h_id is not null then
  select * into h from kinnso_internal.studio_handoffs where id=h_id;
  perform kinnso_internal.discovery_record_markers(p_draft_id,(result->>'revision')::integer,h.payload);
  result:=jsonb_set(result,'{payload}',h.payload);
  insert into kinnso_internal.studio_guide_bindings values(p_draft_id,h.actor_id,h.artifact_id,h.artifact_revision,h.thread_id,h.selected_block_ids,h.source_refs)
   on conflict(guide_id) do nothing;
  result:=result||jsonb_build_object('studio',jsonb_build_object('artifactId',h.artifact_id,'artifactRevision',h.artifact_revision,'threadId',h.thread_id,'sourceCount',jsonb_array_length(h.source_refs),'restricted',false));
  delete from kinnso_internal.studio_write_permits where transaction_id=txid_current() and guide_id=p_draft_id;
 end if;
 return result;
end $$;

-- Source: 20261031090100_guard_studio_guide_writes.sql; function sha256 c44293de6059245f9618e9bd7cd8f5dc1fce99b5e2c6077bad0a067deb56e635
create or replace function public.publish_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h_id uuid; result jsonb; expected_payload jsonb;
begin
 h_id:=kinnso_internal.assert_studio_guide_write(p_draft_id,p_request_id,p_expected_revision,null,'publish');
 if h_id is not null then
  select payload into expected_payload from kinnso_internal.studio_handoffs where id=h_id;
  if not exists(select 1 from kinnso_internal.guide_drafts where guide_id=p_draft_id and payload=kinnso_internal.discovery_strip_markers(expected_payload)) then raise exception 'revision_conflict'; end if;
 end if;
 result:=kinnso_internal.legacy_publish_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id);
 delete from kinnso_internal.studio_write_permits where transaction_id=txid_current() and guide_id=p_draft_id;
 return result;
end $$;

-- Source: 20261031090100_guard_studio_guide_writes.sql; function sha256 bc78dbf2039f8e07e389417bf74bf3da219e2073f8dd6d4b5db0d20450312cf7
create or replace function public.publish_guide_version(p_guide_id uuid,p_expected_version integer,p_request_id uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from kinnso_internal.studio_guide_tombstones where guide_id=p_guide_id) then raise exception 'studio_restricted'; end if;
 if exists(select 1 from kinnso_internal.studio_guide_bindings where guide_id=p_guide_id) and not exists(
  select 1 from kinnso_internal.studio_write_permits p join kinnso_internal.studio_handoffs h on h.id=p.handoff_id
  where p.transaction_id=txid_current() and p.guide_id=p_guide_id and p.actor_id=kinnso_internal.actor()
  and p.operation='publish' and kinnso_internal.discovery_strip_markers(h.payload)->'content'=p_content) then raise exception 'studio_confirmation_required'; end if;
 return kinnso_internal.legacy_publish_guide_version(p_guide_id,p_expected_version,p_request_id,p_content);
end $$;
