-- Read context for the authenticated BFF. No proof keys, credentials or third-party text.
create function kinnso_internal.discovery_link_context(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'companyId',l.company_id,'workspaceId',l.sme_workspace_id,'smeWorkspaceId',l.sme_workspace_id,
 'locationIds',l.location_ids,'linkVersion',l.link_version,'scopeVersion',l.source_scope_version,'status',l.status,'verifiedAt',l.verified_at,
 'proofDigest',l.proof_digest,'readRefreshAllowed',l.read_refresh_allowed) from public.merchant_links l where id=p_id;
$$;
create function kinnso_internal.discovery_import_ref(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',i.id,'linkId',i.link_id,'externalOfferId',i.external_offer_id,'sourceRevision',i.source_revision,'sourceHash',i.source_hash,
 'sourceLocationId',i.source_location_id,'appliedLocationId',i.applied_location_id,'sourceScopeVersion',i.source_scope_version,'observedAt',i.observed_at)
 from public.offer_imports i where i.id=p_id;
$$;
create function public.get_kinnso_discovery_context(p_target_id uuid,p_command jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); k text:=p_command->>'kind'; d jsonb:=p_command->'data'; l public.merchant_links; i public.offer_imports;
 p public.offer_publications; t public.trip_intents; data jsonb; offers jsonb; choices jsonb;
begin
 if p_target_id is null or octet_length(p_command::text)>32768 then raise exception 'invalid_discovery_context';end if;
 if k='recordMatch' then
  select * into t from public.trip_intents where id=(d->>'intentId')::uuid and owner_actor_id=actor and status='active';
  if not found then raise exception 'discovery_not_found';end if;
  -- Only grant metadata and opaque import refs. The adapter fetches current text from SME.
  select coalesce(jsonb_agg(item order by id),'[]') into offers from (
   select p1.id,jsonb_build_object('publication',kinnso_internal.discovery_publication_json(p1.id),'import',kinnso_internal.discovery_import_ref(p1.import_id),
   'link',kinnso_internal.discovery_link_context(i1.link_id),'grants',(select jsonb_agg(kinnso_internal.discovery_grant_json(g.id)) from public.studio_source_grants g where g.publication_id=p1.id and g.revoked_at is null),
   'sourceState','unavailable','checkedAt',null) item
   from public.offer_publications p1 join public.offer_imports i1 on i1.id=p1.import_id join public.merchant_links l1 on l1.id=i1.link_id
   where p1.status='published' and l1.status='active' and l1.read_refresh_allowed
   and exists(select 1 from public.studio_source_grants g where g.publication_id=p1.id and g.purpose='catalog' and g.verification_state='approved' and g.revoked_at is null and g.expires_at>statement_timestamp())
   order by p1.id limit 21
  ) q;
  select coalesce(jsonb_agg(jsonb_build_object('ownerActorId',c.owner_actor_id,'intentId',c.intent_id,'publicationId',c.publication_id,'choice',c.choice,'revision',c.revision,'updatedAt',c.updated_at)),'[]')
   into choices from public.match_choices c where c.owner_actor_id=actor and c.intent_id=t.id;
  data:=jsonb_build_object('intent',kinnso_internal.discovery_intent_snapshot(t.id,actor),'choices',choices,
   'offers',case when jsonb_array_length(offers)>20 then offers-20 else offers end,'poolHasMore',jsonb_array_length(offers)>20);
 elsif k in('confirmLink','importOffer','preparePublication','publishOffer') then
  if k='preparePublication' then select * into i from public.offer_imports where id=(d->>'importId')::uuid;
  elsif k='publishOffer' then
   select * into p from public.offer_publications where id=p_target_id;
   select * into i from public.offer_imports where id=p.import_id;
  end if;
  select * into l from public.merchant_links where id=case k when 'confirmLink' then p_target_id when 'importOffer' then (d->>'linkId')::uuid else i.link_id end;
  if l.id is null or not exists(select 1 from public.merchant_profiles where id=l.company_id and user_id=actor and status='active') then raise exception 'discovery_forbidden';end if;
  data:=jsonb_build_object('link',kinnso_internal.discovery_link_context(l.id),'nonce',(select nonce from kinnso_internal.discovery_link_challenges where link_id=l.id and consumed_at is null and expires_at>statement_timestamp()),
   'offerImport',kinnso_internal.discovery_import_ref(i.id),'publicationRevision',p.revision);
 else raise exception 'invalid_discovery_context';end if;
 return jsonb_build_object('actorId',actor,'kind',k,'targetId',p_target_id,'data',data);
end $$;
revoke all on function kinnso_internal.discovery_link_context(uuid),kinnso_internal.discovery_import_ref(uuid),public.get_kinnso_discovery_context(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_discovery_context(uuid,jsonb) to authenticated;
