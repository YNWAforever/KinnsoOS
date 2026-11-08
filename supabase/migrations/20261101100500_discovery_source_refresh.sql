-- Unapplied review correction: delegated refresh reads references, never new SME prose.
create function public.get_kinnso_discovery_match_evidence(p_target_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb,p_authority jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); facts jsonb; digest text; item jsonb; p public.offer_publications; v jsonb; result jsonb:='[]'; g public.studio_source_grants;
begin
 if p_command->>'kind' is distinct from 'recordMatch' or not exists(select 1 from public.trip_intents where id=(p_command->'data'->>'intentId')::uuid
 and revision=(p_command->'data'->>'intentRevision')::integer and owner_actor_id=actor and status='active') then raise exception 'discovery_forbidden';end if;
 digest:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'expectedRevision',p_expected_revision,'command',p_command)));
 facts:=kinnso_internal.discovery_authority(p_authority,actor,p_request_id,digest);
 if jsonb_typeof(facts->'checks') is distinct from 'array' or jsonb_array_length(facts->'checks')>20 then raise exception 'invalid_discovery_checks';end if;
 for item in select value from jsonb_array_elements(facts->'checks') order by value->>'publicationId' loop
  select * into p from public.offer_publications where id=(item->>'publicationId')::uuid for share;
  perform kinnso_internal.discovery_assert_source(p.import_id,item->'check');
  if not exists(select 1 from public.studio_source_grants g where g.publication_id=p.id and kinnso_internal.discovery_grant_current(g.id,g.grant_version,'catalog',false))
  or not exists(select 1 from public.studio_source_grants g where g.publication_id=p.id and kinnso_internal.discovery_grant_current(g.id,g.grant_version,'matching',false)) then raise exception 'discovery_restricted';end if;
  result:=result||jsonb_build_array(jsonb_build_object('publication',kinnso_internal.discovery_publication_json(p.id),
   'import',kinnso_internal.discovery_import_ref(p.import_id)||jsonb_build_object('fields',(select fields from public.offer_imports where id=p.import_id))));
 end loop;
 return result;
end $$;

create function public.get_kinnso_discovery_domain_context(p_method text,p_args jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); source_ids uuid[]:='{}'; refs jsonb:='[]'; c jsonb:=p_args->'p_command'; b jsonb; guide uuid; trip uuid; t public.studio_threads; h kinnso_internal.studio_handoffs;
begin
 if octet_length(p_args::text)>262144 then raise exception 'invalid_discovery_domain';end if;
 if p_method='apply_kinnso_studio_command' then
  if c->>'kind'='prepareGuideSave' then
   select v.body into b from public.studio_artifacts a join public.studio_artifact_versions v on v.artifact_id=a.id
   where a.id=(c->>'artifactId')::uuid and a.owner_actor_id=actor and v.revision=(c->>'artifactRevision')::integer;
   if b is null then raise exception 'studio_not_found';end if;
   select array_agg((r->>'sourceId')::uuid) into source_ids from jsonb_array_elements(b->'blocks') block cross join lateral jsonb_array_elements(block->'sources') r where c->'selectedBlockIds' ? (block->>'id');
  elsif c->>'kind'='prepareGuidePublish' then
   guide:=(c->>'guideId')::uuid;
  elsif c->>'kind' in('appendMessage','saveArtifact') then
   select * into t from public.studio_threads where id=case when c->>'kind'='appendMessage' then (p_args->>'p_target_id')::uuid else (c->>'threadId')::uuid end and owner_actor_id=actor;
   if not found then raise exception 'studio_not_found';end if;
   if c->>'kind'='appendMessage' then select array_agg(value::uuid) into source_ids from jsonb_array_elements_text(c->'sourceIds');
   else select array_agg((r->>'sourceId')::uuid) into source_ids from jsonb_array_elements(c->'brief'->'blocks') block cross join lateral jsonb_array_elements(block->'sources') r;end if;
   if exists(select 1 from unnest(source_ids) selected(source_id) where not exists(select 1 from public.studio_sources s where s.id=selected.source_id and s.owner_actor_id=actor and s.thread_id=t.id)) then raise exception 'studio_restricted';end if;
  end if;
 elsif p_method in('save_kinnso_guide_draft','publish_kinnso_guide_draft','publish_guide_version') then
  guide:=coalesce((p_args->>'p_draft_id')::uuid,(p_args->>'p_guide_id')::uuid);
  select * into h from kinnso_internal.studio_handoffs where actor_id=actor and domain_request_id=(p_args->>'p_request_id')::uuid and guide_id=guide;
  if found then select array_agg((r->>'sourceId')::uuid) into source_ids from jsonb_array_elements(h.source_refs) r;end if;
 elsif p_method='adopt_guide_to_trip' then
  trip:=(p_args->>'p_trip_id')::uuid;
  if not exists(select 1 from public.trips where id=trip and owner_user_id=actor) then raise exception 'trip_not_found';end if;
  select array_agg(distinct source_id) into source_ids from kinnso_internal.discovery_derivative_bindings
  where target_kind='guide_version' and target_id=(p_args->>'p_guide_id')::uuid and target_version=(p_args->>'p_version')::integer and field_path<>'root_metadata';
 elsif p_method='create_trip_share_v2' then
  trip:=(p_args->>'p_trip_id')::uuid;
  if not exists(select 1 from public.trips where id=trip and owner_user_id=actor) then raise exception 'trip_not_found';end if;
  select array_agg(distinct db.source_id) into source_ids from kinnso_internal.discovery_derivative_bindings db where
  (db.target_kind='trip_stop' and db.target_id in(select s.id from public.trip_stops s where s.trip_id=trip and p_args->'p_stop_ids' ? s.id::text))
  or (db.target_kind='trip_day' and db.target_id in(select s.trip_day_id from public.trip_stops s where s.trip_id=trip and p_args->'p_stop_ids' ? s.id::text));
 else raise exception 'invalid_discovery_domain';end if;
 if guide is not null then
  if exists(select 1 from public.guides where id=guide and creator_id<>actor) then raise exception 'guide_not_found';end if;
  if cardinality(source_ids)=0 or source_ids is null then
   select array_agg((r->>'sourceId')::uuid) into source_ids from kinnso_internal.studio_guide_bindings gb cross join lateral jsonb_array_elements(gb.source_refs) r where gb.guide_id=guide and gb.owner_actor_id=actor;
  end if;
 end if;
 select coalesce(jsonb_agg(ref order by import_id),'[]') into refs from (
  select distinct i.id import_id,jsonb_build_object('importId',i.id,'link',kinnso_internal.discovery_link_context(i.link_id),
   'ref',jsonb_build_object('offerId',i.external_offer_id,'revision',i.source_revision,'hash',i.source_hash,'locationId',i.applied_location_id)) ref
  from kinnso_internal.discovery_source_provenance sp join public.offer_publications p on p.id=sp.publication_id join public.offer_imports i on i.id=p.import_id where sp.source_id=any(source_ids)
 ) q;
 if jsonb_array_length(refs)>20 then raise exception 'invalid_discovery_source_limit';end if;
 return jsonb_build_object('actorId',actor,'refs',refs);
end $$;

create function public.apply_kinnso_discovery_bound_write(p_method text,p_args jsonb,p_authority jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); context jsonb; facts jsonb; row jsonb; observed jsonb; request uuid:=(p_args->>'p_request_id')::uuid; guide uuid; trip uuid;
begin
 -- Match the original writer's domain-first order before locking any source grant.
 if p_method='adopt_guide_to_trip' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
  perform 1 from public.guides where id=(p_args->>'p_guide_id')::uuid for share nowait;
  perform 1 from public.guide_versions where guide_id=(p_args->>'p_guide_id')::uuid and version=(p_args->>'p_version')::integer for share nowait;
  trip:=(p_args->>'p_trip_id')::uuid;
 elsif p_method='create_trip_share_v2' then
  perform pg_advisory_xact_lock(hashtextextended('kinnso:trip-share:'||actor::text,0));trip:=(p_args->>'p_trip_id')::uuid;
 elsif p_method in('save_kinnso_guide_draft','publish_kinnso_guide_draft','publish_guide_version') then
  guide:=coalesce((p_args->>'p_draft_id')::uuid,(p_args->>'p_guide_id')::uuid);
 elsif p_method='apply_kinnso_studio_command' then
  perform pg_advisory_xact_lock(hashtextextended('studio-request:'||actor::text||request::text,0));
  perform pg_advisory_xact_lock(hashtextextended('studio-target:'||(p_args->>'p_target_id'),0));
  if p_args->'p_command'->>'kind'='appendMessage' then
   perform 1 from public.studio_threads where id=(p_args->>'p_target_id')::uuid and owner_actor_id=actor for update;
  elsif p_args->'p_command'->>'kind'='saveArtifact' then
   perform 1 from public.studio_threads where id=(p_args->'p_command'->>'threadId')::uuid and owner_actor_id=actor for update;
   perform 1 from public.studio_artifacts where id=(p_args->>'p_target_id')::uuid for update;
  end if;
  if p_args->'p_command'->>'kind' in('prepareGuideSave','prepareGuidePublish') then guide:=(p_args->'p_command'->>'guideId')::uuid;end if;
 else raise exception 'invalid_discovery_domain';end if;
 if guide is not null then perform pg_advisory_xact_lock(hashtextextended('guide-draft:'||guide::text,0));perform 1 from public.guides where id=guide and creator_id=actor for update;end if;
 if p_method='apply_kinnso_studio_command' and guide is not null then
  perform 1 from kinnso_internal.guide_drafts where guide_id=guide for update;
  perform 1 from public.studio_artifacts where owner_actor_id=actor and id=coalesce((p_args->'p_command'->>'artifactId')::uuid,
   (select artifact_id from kinnso_internal.studio_guide_bindings where guide_id=guide)) for share;
 end if;
 if trip is not null then perform 1 from public.trips where id=trip and owner_user_id=actor for update;if not found then raise exception 'trip_not_found';end if;end if;
 context:=public.get_kinnso_discovery_domain_context(p_method,p_args);
 if jsonb_array_length(context->'refs')>0 then
  if (select licensed_writes and private_writes from kinnso_internal.discovery_gate where singleton) is distinct from true then raise exception 'discovery_unavailable';end if;
  facts:=kinnso_internal.discovery_authority(p_authority,actor,request,kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('method',p_method,'args',p_args))));
  if jsonb_typeof(facts->'checks') is distinct from 'array' or jsonb_array_length(facts->'checks')<>jsonb_array_length(context->'refs') then raise exception 'discovery_restricted';end if;
  for row in select value from jsonb_array_elements(context->'refs') order by value->>'importId' loop
   select value into observed from jsonb_array_elements(facts->'checks') where value->>'importId'=row->>'importId';
   perform kinnso_internal.discovery_check_source((row->>'importId')::uuid,observed->'check');
  end loop;
 end if;
 -- These are the original business writers, invoked inside this SAME transaction.
 case p_method
 when 'apply_kinnso_studio_command' then return public.apply_kinnso_studio_command((p_args->>'p_target_id')::uuid,(p_args->>'p_expected_revision')::integer,request,p_args->'p_command');
 when 'save_kinnso_guide_draft' then return public.save_kinnso_guide_draft((p_args->>'p_draft_id')::uuid,(p_args->>'p_expected_revision')::integer,request,p_args->'p_payload');
 when 'publish_kinnso_guide_draft' then return public.publish_kinnso_guide_draft((p_args->>'p_draft_id')::uuid,(p_args->>'p_expected_revision')::integer,request);
 when 'publish_guide_version' then return public.publish_guide_version((p_args->>'p_guide_id')::uuid,(p_args->>'p_expected_version')::integer,request,p_args->'p_content');
 when 'adopt_guide_to_trip' then return public.adopt_guide_to_trip((p_args->>'p_guide_id')::uuid,(p_args->>'p_version')::integer,(p_args->>'p_trip_id')::uuid,(p_args->>'p_expected_revision')::integer,request);
 when 'create_trip_share_v2' then return public.create_trip_share_v2(request,(p_args->>'p_trip_id')::uuid,array(select jsonb_array_elements_text(p_args->'p_stop_ids')::uuid),array(select jsonb_array_elements_text(p_args->'p_media_ids')::uuid),(p_args->>'p_expires_at')::timestamptz,p_args->>'p_token_hash',p_args->'p_envelope');
 else raise exception 'invalid_discovery_domain';end case;
end $$;
revoke all on function public.get_kinnso_discovery_match_evidence(uuid,integer,uuid,jsonb,jsonb),public.get_kinnso_discovery_domain_context(text,jsonb),public.apply_kinnso_discovery_bound_write(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_discovery_match_evidence(uuid,integer,uuid,jsonb,jsonb),public.get_kinnso_discovery_domain_context(text,jsonb),public.apply_kinnso_discovery_bound_write(text,jsonb,jsonb) to authenticated;
