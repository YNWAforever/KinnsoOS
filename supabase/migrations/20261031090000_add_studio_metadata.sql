-- REVIEW SOURCE ONLY for the creator studio slice. No provider or business writer.
-- Application of this migration requires a separately approved isolated target.
create table public.studio_threads(
 id uuid primary key, owner_actor_id uuid not null references auth.users(id) on delete cascade,
 origin_app text not null default 'journeys' check(origin_app in('journeys','web')),
 topic text not null check(topic='creation'), template_id text not null check(template_id ~ '^C[1-5]$'),
 title text not null check(length(title) between 1 and 200),
 revision integer not null default 1 check(revision>0), archived_at timestamptz,
 created_at timestamptz not null default now(), unique(id,owner_actor_id)
);
create index studio_threads_owner on public.studio_threads(owner_actor_id,id);
create table public.studio_sources(
 id uuid primary key, thread_id uuid not null, owner_actor_id uuid not null,
 title text not null check(length(title) between 1 and 200),
 body text not null check(length(body) between 1 and 16000),
 revision integer not null check(revision>0), acl_version integer not null check(acl_version>0),
 content_hash text not null, rights_state text not null check(rights_state in('own','unknown')),
 status text not null default 'active' check(status in('active','restricted')),
 created_at timestamptz not null default now(),
 foreign key(thread_id,owner_actor_id) references public.studio_threads(id,owner_actor_id) on delete cascade
);
create index studio_sources_thread on public.studio_sources(thread_id,id);
create table public.studio_messages(
 id uuid primary key, thread_id uuid not null references public.studio_threads(id) on delete cascade,
 sequence integer not null, role text not null check(role in('user','assistant')),
 body text not null check(length(body)<=8000), source_refs jsonb not null default '[]',
 created_at timestamptz not null default now(), unique(thread_id,sequence)
);
create table public.studio_artifacts(
 id uuid primary key, thread_id uuid not null, owner_actor_id uuid not null,
 kind text not null default 'brief' check(kind in('brief','checklist','report')),
 revision integer not null check(revision>0), created_at timestamptz not null default now(),
 foreign key(thread_id,owner_actor_id) references public.studio_threads(id,owner_actor_id) on delete cascade
);
create index studio_artifacts_thread on public.studio_artifacts(thread_id,id);
create table public.studio_artifact_versions(
 artifact_id uuid not null references public.studio_artifacts(id) on delete cascade,
 revision integer not null check(revision>0), body jsonb not null,
 created_at timestamptz not null default now(), primary key(artifact_id,revision)
);
create table public.studio_evidence_links(
 artifact_id uuid not null, artifact_revision integer not null, block_id uuid not null,
 source_id uuid not null references public.studio_sources(id) on delete cascade, source_revision integer not null,
 acl_version integer not null, excerpt_hash text not null,
 primary key(artifact_id,artifact_revision,block_id,source_id),
 foreign key(artifact_id,artifact_revision) references public.studio_artifact_versions(artifact_id,revision) on delete cascade
);
create table kinnso_internal.studio_requests(
 actor_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 digest text not null, kind text not null, resource_id uuid not null, revision integer not null,
 result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table public.studio_threads enable row level security;
alter table public.studio_sources enable row level security;
alter table public.studio_messages enable row level security;
alter table public.studio_artifacts enable row level security;
alter table public.studio_artifact_versions enable row level security;
alter table public.studio_evidence_links enable row level security;
alter table kinnso_internal.studio_requests enable row level security;
-- Intentionally no direct private-body SELECT grants, including to Ops/service_role.
-- Caller ownership and derivative access are enforced inside the bounded RPCs.
revoke all on table public.studio_threads,public.studio_sources,public.studio_messages,
 public.studio_artifacts,public.studio_artifact_versions,public.studio_evidence_links,
 kinnso_internal.studio_requests from public,anon,authenticated,service_role;

create function kinnso_internal.studio_source_snapshot(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'threadId',s.thread_id,'ownerId',s.owner_actor_id,
 'title',case when s.status='active' then s.title else 'Restricted source' end,
 'text',case when s.status='active' then s.body else '' end,
 'version',s.revision,'aclVersion',s.acl_version,'hash',s.content_hash,
 'rights',s.rights_state,'status',s.status,'createdAt',s.created_at)
 from public.studio_sources s where s.id=p_id;
$$;
create function kinnso_internal.studio_brief_refs(p_body jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(r.ref),'[]'::jsonb)
 from jsonb_array_elements(p_body->'blocks') b(block)
 cross join lateral jsonb_array_elements(b.block->'sources') r(ref);
$$;
create function kinnso_internal.studio_refs_current(p_refs jsonb,p_actor uuid,p_public boolean default false) returns boolean
language sql stable set search_path='' as $$
 select not exists(
  select 1 from jsonb_array_elements(p_refs) r(ref) where not exists(
   select 1 from public.studio_sources s where s.id=(r.ref->>'sourceId')::uuid and s.owner_actor_id=p_actor
   and s.status='active' and s.revision=(r.ref->>'version')::integer
   and s.acl_version=(r.ref->>'aclVersion')::integer and s.content_hash=r.ref->>'hash'
   and (not p_public or s.rights_state='own')
  )
 );
$$;
create function kinnso_internal.assert_studio_refs(p_refs jsonb,p_actor uuid,p_thread uuid,p_public boolean default false) returns void
language plpgsql set search_path='' as $$
declare ref jsonb; source public.studio_sources;
begin
 if jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)>400 then raise exception 'invalid_studio_refs'; end if;
 -- Stable source-ID ordering for all writers. These locks are held through domain commit.
 for ref in select value from jsonb_array_elements(p_refs) order by value->>'sourceId' loop
  select * into source from public.studio_sources where id=(ref->>'sourceId')::uuid for share;
  if not found or source.owner_actor_id<>p_actor or source.thread_id<>p_thread or source.status<>'active'
   then raise exception 'studio_restricted'; end if;
  if source.revision is distinct from (ref->>'version')::integer or source.acl_version is distinct from (ref->>'aclVersion')::integer
   or source.content_hash is distinct from ref->>'hash' then raise exception 'source_stale'; end if;
  if p_public and source.rights_state<>'own' then raise exception 'studio_restricted'; end if;
 end loop;
end $$;
create function kinnso_internal.studio_thread_snapshot(p_id uuid,p_actor uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare thread public.studio_threads; result jsonb;
begin
 select * into thread from public.studio_threads where id=p_id and owner_actor_id=p_actor;
 if not found then raise exception 'studio_not_found'; end if;
 result:=jsonb_build_object('id',thread.id,'ownerId',thread.owner_actor_id,'topic',thread.topic,
 'templateId',thread.template_id,'title',thread.title,'revision',thread.revision,'archived',thread.archived_at is not null,
 'sources',(select coalesce(jsonb_agg(kinnso_internal.studio_source_snapshot(s.id) order by s.created_at,s.id),'[]') from public.studio_sources s where s.thread_id=p_id),
 'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,
 'body',case when kinnso_internal.studio_refs_current(m.source_refs,p_actor) then m.body else 'Source restricted; select permitted evidence again.' end,
 'sourceIds',case when kinnso_internal.studio_refs_current(m.source_refs,p_actor) then (select coalesce(jsonb_agg(r->'sourceId'),'[]') from jsonb_array_elements(m.source_refs) r) else '[]'::jsonb end) order by m.sequence),'[]')
 from public.studio_messages m where m.thread_id=p_id),
 'artifacts',(select coalesce(jsonb_agg(v.body order by a.created_at desc,a.id),'[]') from public.studio_artifacts a
 join public.studio_artifact_versions v on v.artifact_id=a.id and v.revision=a.revision
 where a.thread_id=p_id and kinnso_internal.studio_refs_current(kinnso_internal.studio_brief_refs(v.body),p_actor)));
 return result;
end $$;
create function public.get_kinnso_studio_thread(p_thread_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select kinnso_internal.studio_thread_snapshot(p_thread_id,kinnso_internal.actor());
$$;
create function public.list_kinnso_studio_threads() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 return jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'revision',x.revision,'templateId',x.template_id) order by x.created_at desc,x.id),'[]') from
 (select * from public.studio_threads where owner_actor_id=actor and archived_at is null order by created_at desc,id limit 100) x));
end $$;

create function public.get_kinnso_studio_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); receipt kinnso_internal.studio_requests; body jsonb; source public.studio_sources; artifact public.studio_artifacts;
begin
 select * into receipt from kinnso_internal.studio_requests where actor_id=actor and request_id=p_request_id;
 if not found then return jsonb_build_object('status','unknown','requestId',p_request_id); end if;
 body:=receipt.result->'data';
 if receipt.kind in('saveSource','restrictSource') then
  select * into source from public.studio_sources where id=receipt.resource_id and owner_actor_id=actor;
  if not found or source.revision<>receipt.revision or (receipt.kind='saveSource' and source.status<>'active')
   then return jsonb_build_object('status','restricted','requestId',p_request_id,'completed',true); end if;
  body:=kinnso_internal.studio_source_snapshot(source.id);
 elsif receipt.kind='saveArtifact' then
  select * into artifact from public.studio_artifacts where id=receipt.resource_id and owner_actor_id=actor;
  if not found then return jsonb_build_object('status','restricted','requestId',p_request_id,'completed',true); end if;
  select v.body into body from public.studio_artifact_versions v where artifact_id=artifact.id and revision=receipt.revision;
  if body is null or not kinnso_internal.studio_refs_current(kinnso_internal.studio_brief_refs(body),actor)
   then return jsonb_build_object('status','restricted','requestId',p_request_id,'completed',true); end if;
 elsif receipt.kind in('prepareGuideSave','prepareGuidePublish') then
  -- Added by the second migration. It reads the immutable handoff and current ACL.
  body:=kinnso_internal.studio_handoff_snapshot(receipt.resource_id,actor);
 else
  if not exists(select 1 from public.studio_threads where id=receipt.resource_id and owner_actor_id=actor)
   then return jsonb_build_object('status','restricted','requestId',p_request_id,'completed',true); end if;
 end if;
 return jsonb_build_object('status','complete','receipt',(receipt.result-'data')||jsonb_build_object('data',body));
end $$;

create function public.apply_kinnso_studio_command(p_target_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior kinnso_internal.studio_requests; digest text;
 kind text:=p_command->>'kind'; thread public.studio_threads; source public.studio_sources;
 artifact public.studio_artifacts; body jsonb; old_body jsonb; block jsonb; ref jsonb; refs jsonb:='[]';
 result jsonb; v_revision integer; v_thread_id uuid; seq integer; ids uuid[];
begin
 if p_target_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0
  or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>131072 then raise exception 'invalid_studio_command'; end if;
 if kind not in('createThread','appendMessage','archiveThread','saveSource','restrictSource','saveArtifact','prepareGuideSave','prepareGuidePublish') or kind is null then raise exception 'invalid_studio_command'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-request:'||actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_object('id',p_target_id,'expected',p_expected_revision,'command',p_command)::text);
 select * into prior from kinnso_internal.studio_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.digest<>digest then raise exception 'idempotency_conflict'; end if;
  result:=public.get_kinnso_studio_request(p_request_id);
  if result->>'status'<>'complete' then raise exception 'studio_restricted'; end if;
  return result->'receipt';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-target:'||p_target_id::text,0));
 if kind='createThread' then
  perform kinnso_internal.keys(p_command,array['kind','title','topic','templateId']);
  if p_expected_revision<>0 or exists(select 1 from public.studio_threads where id=p_target_id) then raise exception 'revision_conflict'; end if;
  if (select count(*) from public.studio_threads where owner_actor_id=actor and archived_at is null)>=100 then raise exception 'invalid_thread_limit'; end if;
  if jsonb_typeof(p_command->'title') is distinct from 'string' or length(btrim(p_command->>'title'))<1
   or p_command->>'topic' is distinct from 'creation' or coalesce(p_command->>'templateId','')!~'^C[1-5]$' then raise exception 'invalid_studio_thread'; end if;
  insert into public.studio_threads(id,owner_actor_id,title,topic,template_id) values(p_target_id,actor,p_command->>'title','creation',p_command->>'templateId');
  v_revision:=1;body:=jsonb_build_object('id',p_target_id,'threadId',p_target_id,'revision',v_revision);
 elsif kind in('appendMessage','archiveThread') then
  select * into thread from public.studio_threads where id=p_target_id and owner_actor_id=actor for update;
  if not found then raise exception 'studio_not_found'; end if;
  if thread.revision<>p_expected_revision then raise exception 'revision_conflict'; end if;
  if thread.archived_at is not null then raise exception 'invalid_archived_thread'; end if;
  if kind='archiveThread' then
   perform kinnso_internal.keys(p_command,array['kind']);
   update public.studio_threads set archived_at=now(),revision=studio_threads.revision+1 where id=p_target_id returning studio_threads.revision into v_revision;
  else
   perform kinnso_internal.keys(p_command,array['kind','body','sourceIds']);
   if jsonb_typeof(p_command->'body') is distinct from 'string' or length(btrim(p_command->>'body')) not between 1 and 8000
    or jsonb_typeof(p_command->'sourceIds') is distinct from 'array' or jsonb_array_length(p_command->'sourceIds')>20 then raise exception 'invalid_studio_message'; end if;
   select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_command->'sourceIds');
   select coalesce(jsonb_agg(jsonb_build_object('sourceId',s.id,'version',s.revision,'aclVersion',s.acl_version,'hash',s.content_hash) order by s.id),'[]') into refs
    from public.studio_sources s where s.id=any(ids) and s.thread_id=thread.id and s.owner_actor_id=actor;
   if jsonb_array_length(refs)<>cardinality(ids) then raise exception 'studio_restricted'; end if;
   perform kinnso_internal.assert_studio_refs(refs,actor,thread.id);
   select coalesce(max(sequence),0) into seq from public.studio_messages where studio_messages.thread_id=thread.id;
   if seq>=200 then raise exception 'invalid_message_limit'; end if;
   insert into public.studio_messages(id,thread_id,sequence,role,body,source_refs) values
    (gen_random_uuid(),thread.id,seq+1,'user',p_command->>'body',refs),
    (gen_random_uuid(),thread.id,seq+2,'assistant','來源摘錄模式：請核對已選來源，再另開私人 brief。外部事實尚未驗證。',refs);
   update public.studio_threads set revision=studio_threads.revision+1 where id=thread.id returning studio_threads.revision into v_revision;
  end if;
  body:=jsonb_build_object('id',p_target_id,'threadId',p_target_id,'revision',v_revision);
 elsif kind in('saveSource','restrictSource') then
  if kind='saveSource' then
   perform kinnso_internal.keys(p_command,array['kind','threadId','title','text','rights','attested']);
   v_thread_id:=(p_command->>'threadId')::uuid;
   select * into thread from public.studio_threads where id=v_thread_id and owner_actor_id=actor and archived_at is null for update;
   if not found then raise exception 'studio_not_found'; end if;
   if jsonb_typeof(p_command->'title') is distinct from 'string' or jsonb_typeof(p_command->'text') is distinct from 'string'
    or coalesce(p_command->>'rights','') not in('own','unknown') or jsonb_typeof(p_command->'attested') is distinct from 'boolean'
    or (p_command->>'rights'='own' and p_command->>'attested'<>'true') then raise exception 'invalid_studio_source'; end if;
  else perform kinnso_internal.keys(p_command,array['kind']); end if;
  select * into source from public.studio_sources where id=p_target_id for update;
  if found and source.owner_actor_id<>actor then raise exception 'studio_not_found'; end if;
  if coalesce(source.revision,0)<>p_expected_revision then raise exception 'revision_conflict'; end if;
  if kind='restrictSource' then
   if source.id is null then raise exception 'studio_not_found'; end if;
   update public.studio_sources set status='restricted',revision=studio_sources.revision+1,acl_version=acl_version+1 where id=p_target_id returning studio_sources.revision into v_revision;
  else
   if source.id is not null and source.thread_id<>v_thread_id then raise exception 'studio_restricted'; end if;
   if source.id is null and (select count(*) from public.studio_sources s where s.thread_id=v_thread_id)>=20 then raise exception 'invalid_source_limit'; end if;
   v_revision:=coalesce(source.revision,0)+1;
   insert into public.studio_sources(id,thread_id,owner_actor_id,title,body,revision,acl_version,content_hash,rights_state)
    values(p_target_id,v_thread_id,actor,p_command->>'title',p_command->>'text',v_revision,coalesce(source.acl_version,0)+1,kinnso_internal.request_digest(p_command->>'text'),p_command->>'rights')
   on conflict(id) do update set title=excluded.title,body=excluded.body,revision=excluded.revision,acl_version=excluded.acl_version,content_hash=excluded.content_hash,rights_state=excluded.rights_state,status='active';
  end if;
  body:=kinnso_internal.studio_source_snapshot(p_target_id);
 elsif kind='saveArtifact' then
  perform kinnso_internal.keys(p_command,array['kind','threadId','brief']);
  v_thread_id:=(p_command->>'threadId')::uuid;body:=p_command->'brief';
  select * into thread from public.studio_threads where id=v_thread_id and owner_actor_id=actor and archived_at is null for update;
  if not found then raise exception 'studio_not_found'; end if;
  select * into artifact from public.studio_artifacts where id=p_target_id for update;
  if found and (artifact.owner_actor_id<>actor or artifact.thread_id<>v_thread_id) then raise exception 'studio_not_found'; end if;
  if coalesce(artifact.revision,0)<>p_expected_revision then raise exception 'revision_conflict'; end if;
  if artifact.id is null and (select count(*) from public.studio_artifacts a where a.thread_id=v_thread_id)>=20 then raise exception 'invalid_artifact_limit'; end if;
  perform kinnso_internal.keys(body,array['id','threadId','revision','title','city','summary','blocks']);
  if (body->>'id')::uuid is distinct from p_target_id or (body->>'threadId')::uuid is distinct from v_thread_id
   or (body->>'revision')::integer is distinct from p_expected_revision or jsonb_typeof(body->'blocks') is distinct from 'array'
   or jsonb_array_length(body->'blocks')>20 or jsonb_typeof(body->'title') is distinct from 'string' or length(body->>'title')>200
   or jsonb_typeof(body->'city') is distinct from 'string' or length(body->>'city')>120
   or jsonb_typeof(body->'summary') is distinct from 'string' or length(body->>'summary')>4000 then raise exception 'invalid_studio_brief'; end if;
  for block in select value from jsonb_array_elements(body->'blocks') loop
   perform kinnso_internal.keys(block,array['id','title','text','sources','intendedUse']);
   if (block->>'id')::uuid is null or jsonb_typeof(block->'title') is distinct from 'string' or length(block->>'title')>200
    or jsonb_typeof(block->'text') is distinct from 'string' or length(block->>'text')>4000
    or coalesce(block->>'intendedUse','') not in('private','public-candidate')
    or jsonb_typeof(block->'sources') is distinct from 'array' or jsonb_array_length(block->'sources') not between 1 and 20 then raise exception 'invalid_studio_block'; end if;
   if (select count(distinct r->>'sourceId') from jsonb_array_elements(block->'sources') r)<>jsonb_array_length(block->'sources') then raise exception 'invalid_studio_ref'; end if;
   for ref in select value from jsonb_array_elements(block->'sources') loop
    perform kinnso_internal.keys(ref,array['sourceId','version','aclVersion','hash']);
    if (ref->>'sourceId')::uuid is null or coalesce((ref->>'version')::integer,0)<1 or coalesce((ref->>'aclVersion')::integer,0)<1 or coalesce(ref->>'hash','')!~'^[a-f0-9]{64}$' then raise exception 'invalid_studio_ref'; end if;
   end loop;
  end loop;
  if (select count(distinct b->>'id') from jsonb_array_elements(body->'blocks') b)<>jsonb_array_length(body->'blocks') then raise exception 'invalid_studio_block'; end if;
  if artifact.id is not null then
   select v.body into old_body from public.studio_artifact_versions v where artifact_id=artifact.id and v.revision=artifact.revision;
   for block in select value from jsonb_array_elements(old_body->'blocks') loop
    if not exists(select 1 from jsonb_array_elements(body->'blocks') b where b->>'id'=block->>'id' and b->'sources'=block->'sources') then raise exception 'invalid_lineage_change'; end if;
   end loop;
  end if;
  refs:=kinnso_internal.studio_brief_refs(body);perform kinnso_internal.assert_studio_refs(refs,actor,v_thread_id);
  v_revision:=coalesce(artifact.revision,0)+1;body:=body||jsonb_build_object('revision',v_revision);
  insert into public.studio_artifacts(id,thread_id,owner_actor_id,revision) values(p_target_id,v_thread_id,actor,v_revision)
   on conflict(id) do update set revision=excluded.revision;
  insert into public.studio_artifact_versions(artifact_id,revision,body) values(p_target_id,v_revision,body);
  insert into public.studio_evidence_links(artifact_id,artifact_revision,block_id,source_id,source_revision,acl_version,excerpt_hash)
   select p_target_id,v_revision,(b->>'id')::uuid,(r->>'sourceId')::uuid,(r->>'version')::integer,(r->>'aclVersion')::integer,r->>'hash'
   from jsonb_array_elements(body->'blocks') b cross join lateral jsonb_array_elements(b->'sources') r;
 else
  if p_expected_revision<>0 then raise exception 'revision_conflict'; end if;
  body:=kinnso_internal.studio_prepare_guide(actor,p_target_id,p_command);v_revision:=1;
 end if;
 result:=jsonb_build_object('requestId',p_request_id,'resourceId',p_target_id,'revision',v_revision,'digest',digest,'data',body);
 insert into kinnso_internal.studio_requests(actor_id,request_id,digest,kind,resource_id,revision,result) values(actor,p_request_id,digest,kind,p_target_id,v_revision,result);
 return result;
end $$;
revoke all on function kinnso_internal.studio_source_snapshot(uuid),kinnso_internal.studio_brief_refs(jsonb),
 kinnso_internal.studio_refs_current(jsonb,uuid,boolean),kinnso_internal.assert_studio_refs(jsonb,uuid,uuid,boolean),
 kinnso_internal.studio_thread_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_kinnso_studio_thread(uuid),public.list_kinnso_studio_threads(),
 public.get_kinnso_studio_request(uuid),public.apply_kinnso_studio_command(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.get_kinnso_studio_thread(uuid),public.list_kinnso_studio_threads(),
 public.get_kinnso_studio_request(uuid),public.apply_kinnso_studio_command(uuid,integer,uuid,jsonb) to authenticated;
