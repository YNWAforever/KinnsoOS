-- Unapplied. Bindings are inserted by the original domain transaction, never a second HTTP write.
alter table public.studio_sources drop constraint studio_sources_rights_state_check;
alter table public.studio_sources add constraint studio_sources_rights_state_check check(rights_state in('own','unknown','licensed'));
create table kinnso_internal.discovery_ingest_permits (
 transaction_id bigint not null, source_id uuid not null, primary key(transaction_id,source_id)
);
alter table kinnso_internal.discovery_ingest_permits enable row level security;
revoke all on kinnso_internal.discovery_ingest_permits from public,anon,authenticated,service_role;
create or replace function kinnso_internal.discovery_no_licensed_ingestion() returns trigger language plpgsql set search_path='' as $$
begin
 if (select licensed_writes from kinnso_internal.discovery_gate where singleton) is distinct from true
 or not exists(select 1 from kinnso_internal.discovery_ingest_permits where transaction_id=txid_current() and source_id=new.source_id)
 or tg_op<>'INSERT' then raise exception 'discovery_licensed_ingestion_unavailable';end if;
 return new;
end $$;
create function kinnso_internal.discovery_guard_licensed_source() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' and new.rights_state='licensed' and not exists(select 1 from kinnso_internal.discovery_ingest_permits where transaction_id=txid_current() and source_id=new.id)
 then raise exception 'discovery_restricted';end if;
 if tg_op='UPDATE' and (old.rights_state='licensed' or exists(select 1 from kinnso_internal.discovery_source_provenance where source_id=old.id))
 and (new.rights_state is distinct from old.rights_state or new.body is distinct from old.body or new.title is distinct from old.title
 or new.owner_actor_id is distinct from old.owner_actor_id or new.thread_id is distinct from old.thread_id or new.content_hash is distinct from old.content_hash)
 then raise exception 'discovery_immutable';end if;
 return new;
end $$;
create trigger discovery_guard_licensed_source before insert or update on public.studio_sources for each row execute function kinnso_internal.discovery_guard_licensed_source();

create function public.ingest_kinnso_matched_source(p_thread_id uuid,p_source_id uuid,p_match_id uuid,p_publication_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior kinnso_internal.discovery_requests; digest text; m public.match_runs;
 p public.offer_publications; i public.offer_imports; v public.offer_publication_versions; g public.studio_source_grants; refs jsonb:='[]'; body text; title text;
begin
 if p_source_id is null or p_request_id is null then raise exception 'invalid_discovery_ingestion';end if;
 perform pg_advisory_xact_lock(hashtextextended('discovery-request:'||actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('kind','ingestMatchedSource','threadId',p_thread_id,'sourceId',p_source_id,'matchId',p_match_id,'publicationId',p_publication_id)));
 select * into prior from kinnso_internal.discovery_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.command_digest<>digest then raise exception 'idempotency_conflict';end if;
  -- Receipt may be recovered after disable. Source bytes still use current permission.
  return jsonb_build_object('receipt',public.get_kinnso_discovery_request(p_request_id)->'receipt','source',kinnso_internal.studio_source_snapshot(p_source_id));
 end if;
 if (select private_writes and licensed_writes from kinnso_internal.discovery_gate where singleton) is distinct from true then raise exception 'discovery_unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('studio-target:'||p_thread_id::text,0));
 perform 1 from public.studio_threads where id=p_thread_id and owner_actor_id=actor and archived_at is null for update;
 if not found then raise exception 'studio_not_found';end if;
 if (select count(*) from public.studio_sources where thread_id=p_thread_id)>=50 then raise exception 'invalid_studio_source_limit';end if;
 select * into m from public.match_runs where id=p_match_id and owner_actor_id=actor for share;
 if not found or not exists(select 1 from public.trip_intents where id=m.intent_id and revision=m.intent_revision and owner_actor_id=actor and status='active')
 then raise exception 'discovery_not_found';end if;
 select * into p from public.offer_publications where id=p_publication_id for share;
 if not exists(select 1 from jsonb_array_elements(m.references_only) r where r->>'publicationId'=p.id::text and (r->>'contentVersion')::integer=p.content_version
 and (r->>'publicationRevision')::integer=p.revision) then raise exception 'discovery_source_changed';end if;
 for g in select * from public.studio_source_grants where publication_id=p.id and publication_content_version=p.content_version and revoked_at is null order by id for share loop
  if kinnso_internal.discovery_grant_current(g.id,g.grant_version,g.purpose) and exists(
   select 1 from jsonb_array_elements(m.references_only) mr cross join lateral jsonb_array_elements(mr->'grantVersions') gr
   where mr->>'publicationId'=p.id::text and gr->>'id'=g.id::text and (gr->>'version')::integer=g.grant_version and gr->>'purpose'=g.purpose) then
   refs:=refs||jsonb_build_array(jsonb_build_object('id',g.id,'version',g.grant_version,'purpose',g.purpose));
  end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(refs) r where r->>'purpose'='private_brief') then raise exception 'discovery_restricted';end if;
 select * into i from public.offer_imports where id=p.import_id;
 select * into v from public.offer_publication_versions where publication_id=p.id and content_version=p.content_version;
 title:=i.fields->>'title';body:=concat_ws(E'\n',title,case when v.body->'displayFields' ? 'details' then i.fields->>'details' else null end,i.fields->>'terms');
 insert into kinnso_internal.discovery_ingest_permits values(txid_current(),p_source_id);
 insert into public.studio_sources(id,thread_id,owner_actor_id,title,body,revision,acl_version,content_hash,rights_state)
 values(p_source_id,p_thread_id,actor,title,body,1,1,kinnso_internal.request_digest(body),'licensed');
 insert into kinnso_internal.discovery_source_provenance(source_id,publication_id,content_version,content_hash,import_hash,checked_at,source_scope_version,grant_refs)
 values(p_source_id,p.id,p.content_version,p.content_hash,i.source_hash,(select checked_at from kinnso_internal.discovery_source_checks where import_id=i.id),i.source_scope_version,refs);
 delete from kinnso_internal.discovery_ingest_permits where transaction_id=txid_current() and source_id=p_source_id;
 insert into kinnso_internal.discovery_requests values(actor,p_request_id,digest,'ingestMatchedSource',p_source_id,1,clock_timestamp());
 return jsonb_build_object('receipt',public.get_kinnso_discovery_request(p_request_id)->'receipt','source',kinnso_internal.studio_source_snapshot(p_source_id));
end $$;

-- Extend source checks centrally so messages, pinned briefs, drafts and handoffs all re-check live grants.
create or replace function kinnso_internal.studio_refs_current(p_refs jsonb,p_actor uuid,p_public boolean default false) returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(p_refs) r(ref) where not exists(
 select 1 from public.studio_sources s where s.id=(r.ref->>'sourceId')::uuid and s.owner_actor_id=p_actor and s.status='active'
 and s.revision=(r.ref->>'version')::integer and s.acl_version=(r.ref->>'aclVersion')::integer and s.content_hash=r.ref->>'hash'
 and case when s.rights_state='licensed' then kinnso_internal.discovery_source_access(s.id,case when p_public then 'public_guide' else 'private_brief' end)
 else not p_public or s.rights_state='own' end));
$$;
create or replace function kinnso_internal.assert_studio_refs(p_refs jsonb,p_actor uuid,p_thread uuid,p_public boolean default false) returns void
language plpgsql set search_path='' as $$
declare ref jsonb; s public.studio_sources; b record; v_purpose text:=case when p_public then 'public_guide' else 'private_brief' end;
begin
 if jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)>400 then raise exception 'invalid_studio_refs';end if;
 for ref in select value from jsonb_array_elements(p_refs) order by value->>'sourceId' loop
  select * into s from public.studio_sources where id=(ref->>'sourceId')::uuid for share;
  if not found or s.owner_actor_id<>p_actor or s.thread_id<>p_thread or s.status<>'active' then raise exception 'studio_restricted';end if;
  if s.revision is distinct from (ref->>'version')::integer or s.acl_version is distinct from (ref->>'aclVersion')::integer or s.content_hash is distinct from ref->>'hash' then raise exception 'source_stale';end if;
  if s.rights_state<>'licensed' and p_public and s.rights_state<>'own' then raise exception 'studio_restricted';end if;
 end loop;
 -- Publication then grant ordering is shared with revoke and derivative writes.
 for b in select distinct g.publication_id,g.id,g.grant_version,g.publication_content_version,g.content_hash
 from jsonb_array_elements(p_refs) r join kinnso_internal.discovery_source_provenance sp on sp.source_id=(r->>'sourceId')::uuid
 cross join lateral jsonb_array_elements(sp.grant_refs) gr join public.studio_source_grants g on g.id=(gr->>'id')::uuid
 where gr->>'purpose'=v_purpose order by g.publication_id,g.id loop
  perform kinnso_internal.discovery_assert_grant(b.id,b.grant_version,v_purpose,b.publication_content_version,b.content_hash);
 end loop;
 if not kinnso_internal.studio_refs_current(p_refs,p_actor,p_public) then raise exception 'studio_restricted';end if;
end $$;
create or replace function kinnso_internal.studio_source_snapshot(p_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare s public.studio_sources; sp kinnso_internal.discovery_source_provenance; available boolean; result jsonb; grants jsonb;
begin
 select * into s from public.studio_sources where id=p_id;
 if not found then return null;end if;
 available:=s.status='active' and (s.rights_state<>'licensed' or kinnso_internal.discovery_source_access(s.id,'private_brief'));
 result:=jsonb_build_object('id',s.id,'threadId',s.thread_id,'ownerId',s.owner_actor_id,'title',case when available then s.title else 'Restricted source' end,
 'text',case when available then s.body else '' end,'version',s.revision,'aclVersion',s.acl_version,'hash',s.content_hash,'rights',s.rights_state,'status',case when available then 'active' else 'restricted' end,'createdAt',s.created_at);
 if s.rights_state='licensed' and available then
  select * into sp from kinnso_internal.discovery_source_provenance where source_id=s.id;
  select coalesce(jsonb_agg(kinnso_internal.discovery_grant_json((r->>'id')::uuid)),'[]') into grants from jsonb_array_elements(sp.grant_refs) r;
  result:=result||jsonb_build_object('license',jsonb_build_object('provenance',jsonb_build_object('publicationId',sp.publication_id,'contentVersion',sp.content_version,
   'contentHash',sp.content_hash,'grantRefs',sp.grant_refs,'importHash',sp.import_hash,'checkedAt',sp.checked_at),'grants',grants,
   'fields',(select body->'displayFields' from public.offer_publication_versions where publication_id=sp.publication_id and content_version=sp.content_version)));
 end if;
 return result;
end $$;

create function kinnso_internal.discovery_bind(p_kind text,p_target uuid,p_version integer,p_fields text[],p_sources uuid[],p_guide uuid default null,p_guide_version integer default null,p_nested uuid default null) returns void
language plpgsql set search_path='' as $$
declare sp kinnso_internal.discovery_source_provenance; r jsonb; g public.studio_source_grants; field text;
 purpose text:=case p_kind when 'guide_version' then 'public_guide' when 'share_projection' then 'trip_share' else 'trip_adoption' end;
begin
 for sp in select * from kinnso_internal.discovery_source_provenance where source_id=any(p_sources) order by publication_id,source_id loop
  select value into r from jsonb_array_elements(sp.grant_refs) where value->>'purpose'=purpose;
  select * into g from public.studio_source_grants where id=(r->>'id')::uuid;
  perform kinnso_internal.discovery_assert_grant(g.id,(r->>'version')::integer,purpose,sp.content_version,sp.content_hash);
  if not kinnso_internal.discovery_grant_current(g.id,(r->>'version')::integer,purpose) then raise exception 'discovery_restricted';end if;
  foreach field in array p_fields loop
   insert into kinnso_internal.discovery_derivative_bindings values(p_kind,p_target,p_version,field,sp.source_id,g.id,g.grant_version,sp.publication_id,sp.content_version,p_guide,p_guide_version,p_nested,coalesce(p_nested,'00000000-0000-0000-0000-000000000000'::uuid))
   on conflict do nothing;
  end loop;
 end loop;
end $$;
create function kinnso_internal.discovery_bind_guide() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 select array_agg((r->>'sourceId')::uuid) into ids from kinnso_internal.studio_guide_bindings b cross join lateral jsonb_array_elements(b.source_refs) r where b.guide_id=new.guide_id;
 perform kinnso_internal.discovery_bind('guide_version',new.guide_id,new.version,array['root_metadata','title','description','day_title'],ids);
 return new;
end $$;
create trigger discovery_bind_guide after insert on public.guide_versions for each row execute function kinnso_internal.discovery_bind_guide();
-- Old adopted rows remain valid; new original adoption writes fill these stable identities.
alter table public.trip_days add column source_guide_id uuid, add column source_guide_version integer, add column source_guide_day_id uuid;
alter table public.trip_stops add column source_guide_stop_id uuid;
create function kinnso_internal.discovery_bind_adoption() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if new.source_guide_id is null then return new;end if;
 select array_agg(distinct source_id) into ids from kinnso_internal.discovery_derivative_bindings where target_kind='guide_version' and target_id=new.source_guide_id and target_version=new.source_guide_version;
 if tg_table_name='trip_days' then
  perform kinnso_internal.discovery_bind('trip_day',new.id,1,array['day_title'],ids,new.source_guide_id,new.source_guide_version,new.source_guide_day_id);
 else
  perform kinnso_internal.discovery_bind('trip_stop',new.id,1,array['title','sourceDescription'],ids,new.source_guide_id,new.source_guide_version,new.source_guide_stop_id);
 end if;
 return new;
end $$;
create trigger discovery_bind_day after insert on public.trip_days for each row execute function kinnso_internal.discovery_bind_adoption();
create trigger discovery_bind_stop after insert on public.trip_stops for each row execute function kinnso_internal.discovery_bind_adoption();
create function kinnso_internal.discovery_bind_share() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb; s jsonb; ids uuid[];
begin
 for d in select value from jsonb_array_elements(new.projection->'days') loop
  select array_agg(distinct source_id) into ids from kinnso_internal.discovery_derivative_bindings where target_kind='trip_day' and target_id=(d->>'id')::uuid;
  perform kinnso_internal.discovery_bind('share_projection',new.id,1,array['day_title'],ids,null,null,(d->>'id')::uuid);
  for s in select value from jsonb_array_elements(d->'stops') loop
   select array_agg(distinct source_id) into ids from kinnso_internal.discovery_derivative_bindings where target_kind='trip_stop' and target_id=(s->>'id')::uuid;
   perform kinnso_internal.discovery_bind('share_projection',new.id,1,array['title','description'],ids,null,null,(s->>'id')::uuid);
  end loop;
 end loop;
 return new;
end $$;
create trigger discovery_bind_share after insert on kinnso_internal.trip_shares for each row execute function kinnso_internal.discovery_bind_share();
revoke all on function public.ingest_kinnso_matched_source(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ingest_kinnso_matched_source(uuid,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function kinnso_internal.discovery_guard_licensed_source(),kinnso_internal.discovery_bind(text,uuid,integer,text[],uuid[],uuid,integer,uuid),
 kinnso_internal.discovery_bind_guide(),kinnso_internal.discovery_bind_adoption(),kinnso_internal.discovery_bind_share() from public,anon,authenticated,service_role;
