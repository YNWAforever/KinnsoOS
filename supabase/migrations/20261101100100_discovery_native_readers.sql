-- Unapplied continuation. Public readers check current rights even for old versions.
create function kinnso_internal.discovery_grant_json(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',g.id,'publicationId',g.publication_id,'publicationContentVersion',g.publication_content_version,
 'contentHash',g.content_hash,'grantVersion',g.grant_version,'grantorCompanyId',g.grantor_company_id,'issuerActorId',g.issuer_actor_id,
 'allowedFields',g.allowed_fields,'purpose',g.purpose,'expiresAt',g.expires_at,'revokedAt',g.revoked_at,'rightsBasisRef',g.rights_basis_ref,'verificationState',g.verification_state)
 from public.studio_source_grants g where id=p_id;
$$;
create function kinnso_internal.discovery_publication_json(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(v.body,'{"cityKey":"","dateTimeZone":"","priceBasis":"unknown","interestTags":[],"languages":[],"audiences":[],"displayFields":[]}'::jsonb)||jsonb_build_object('id',p.id,'companyId',p.company_id,'importId',p.import_id,'revision',p.revision,'contentVersion',p.content_version,
 'contentHash',p.content_hash,'previewDigest',p.preview_digest,'status',p.status,'publishedAt',p.published_at,'withdrawnAt',p.withdrawn_at)
 from public.offer_publications p left join public.offer_publication_versions v on v.publication_id=p.id and v.content_version=p.content_version where p.id=p_id;
$$;
create function kinnso_internal.discovery_offer_display(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('publicationId',p.id,'publicationRevision',p.revision,'contentVersion',p.content_version,
 'eligibility','needs_confirmation','score',30,'scoreBreakdown',jsonb_build_object('city',30,'dates',0,'interests',0,'budget',0,'language',0),
 'reasons',jsonb_build_array('符合目的地'),'missing',jsonb_build_array('旅程日期尚未決定','未指定興趣','未設定預算','語言資料不足'),'coverage',1,
 'observedAt',i.observed_at,'sourceRevision',i.source_revision,'checkedAt',(select checked_at from kinnso_internal.discovery_source_checks where import_id=i.id),
 'grantVersions',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'version',g.grant_version,'purpose',g.purpose)),'[]') from public.studio_source_grants g where g.publication_id=p.id and kinnso_internal.discovery_grant_current(g.id,g.grant_version,g.purpose)),
 'display',jsonb_build_object('title',i.fields->'title','details',case when v.body->'displayFields' ? 'details' then i.fields->'details' else '""'::jsonb end,
 'terms',i.fields->'terms','priceAmount',i.fields->'priceAmount','currency',i.fields->'currency','validFrom',i.fields->'validFrom','validUntil',i.fields->'validUntil'))
 from public.offer_publications p join public.offer_imports i on i.id=p.import_id
 join public.offer_publication_versions v on v.publication_id=p.id and v.content_version=p.content_version where p.id=p_id
 and exists(select 1 from public.studio_source_grants g where g.publication_id=p.id and kinnso_internal.discovery_grant_current(g.id,g.grant_version,'catalog'))
 and exists(select 1 from public.studio_source_grants g where g.publication_id=p.id and kinnso_internal.discovery_grant_current(g.id,g.grant_version,'matching'));
$$;
alter function public.read_kinnso_discovery(jsonb) set schema kinnso_internal;
alter function kinnso_internal.read_kinnso_discovery(jsonb) rename to discovery_private_read;
revoke all on function kinnso_internal.discovery_private_read(jsonb) from public,anon,authenticated,service_role;
create function public.read_kinnso_discovery(p_scope jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); k text:=p_scope->>'kind'; result jsonb; m public.match_runs; ref jsonb; display jsonb; items jsonb:='[]'; l public.merchant_links;
begin
 if k in('preferences','intents','intent') then return kinnso_internal.discovery_private_read(p_scope);end if;
 if k='companyOffers' then
  perform kinnso_internal.keys(p_scope,array['kind','companyId']);
  -- Read function is STABLE; owner check uses a read, not the locking write helper.
  if not exists(select 1 from public.merchant_profiles where id=(p_scope->>'companyId')::uuid and user_id=actor and status='active') then raise exception 'discovery_forbidden';end if;
  select * into l from public.merchant_links where company_id=(p_scope->>'companyId')::uuid order by (status='active') desc,(status='pending') desc,verified_at desc nulls last,id limit 1;
  result:=jsonb_build_object('companyId',p_scope->'companyId','canManage',true,'link',case when l.id is null then null else
   jsonb_build_object('id',l.id,'companyId',l.company_id,'smeWorkspaceId',l.sme_workspace_id,'locationIds',l.location_ids,'linkVersion',l.link_version,
    'status',l.status,'verifiedAt',l.verified_at,'proofDigest',l.proof_digest,'readRefreshAllowed',l.read_refresh_allowed,
    'challenge',(select nonce from kinnso_internal.discovery_link_challenges where link_id=l.id and consumed_at is null and expires_at>statement_timestamp())) end,
   'imports',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'linkId',i.link_id,'externalOfferId',i.external_offer_id,'sourceRevision',i.source_revision,
    'sourceHash',i.source_hash,'sourceLocationId',i.source_location_id,'appliedLocationId',i.applied_location_id,'sourceScopeVersion',i.source_scope_version,'observedAt',i.observed_at,'fields',i.fields) order by i.id)
    from public.offer_imports i join public.merchant_links ml on ml.id=i.link_id where ml.company_id=(p_scope->>'companyId')::uuid),'[]'),
   'publications',coalesce((select jsonb_agg(kinnso_internal.discovery_publication_json(id) order by id) from public.offer_publications where company_id=(p_scope->>'companyId')::uuid),'[]'),
   'grants',coalesce((select jsonb_agg(kinnso_internal.discovery_grant_json(id) order by id) from public.studio_source_grants where grantor_company_id=(p_scope->>'companyId')::uuid),'[]'),'availableOffers','[]'::jsonb);
 elsif k='publicOffers' then
  perform kinnso_internal.keys(p_scope,array['kind']);
  select coalesce(jsonb_agg(item),'[]') into result from (
   select kinnso_internal.discovery_offer_display(id) item from public.offer_publications where status='published' order by id limit 101
  ) q where item is not null;
 elsif k='match' then
  perform kinnso_internal.keys(p_scope,array['kind','id']);
  select * into m from public.match_runs where id=(p_scope->>'id')::uuid and owner_actor_id=actor;
  if not found then raise exception 'discovery_not_found';end if;
  if not exists(select 1 from public.trip_intents where id=m.intent_id and owner_actor_id=actor and revision=m.intent_revision and status='active') then raise exception 'discovery_source_changed';end if;
  for ref in select value from jsonb_array_elements(m.references_only) order by (value->>'score')::numeric desc,value->>'publicationId' loop
   display:=kinnso_internal.discovery_offer_display((ref->>'publicationId')::uuid);
   if display is null or display->'publicationRevision' is distinct from ref->'publicationRevision'
    or not exists(select 1 from public.studio_source_grants g where g.publication_id=(ref->>'publicationId')::uuid and kinnso_internal.discovery_grant_current(g.id,g.grant_version,'matching'))
    then raise exception 'discovery_restricted';end if;
   items:=items||jsonb_build_array(ref||jsonb_build_object('display',display->'display'));
  end loop;
  result:=jsonb_build_object('id',m.id,'ownerActorId',actor,'intentId',m.intent_id,'intentRevision',m.intent_revision,'policyVersion',m.policy_version,
   'candidateSetHash',m.candidate_set_hash,'computedAt',m.computed_at,'results',items,'coverage',m.coverage);
 else raise exception 'invalid_discovery_read';end if;
 return jsonb_build_object('ok',true,'data',result);
end $$;
revoke all on function public.read_kinnso_discovery(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_kinnso_discovery(jsonb) to authenticated;

alter table kinnso_internal.discovery_source_provenance add column grant_refs jsonb not null default '[]' check(jsonb_typeof(grant_refs)='array');
create function kinnso_internal.discovery_source_access(p_source uuid,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kinnso_internal.discovery_source_provenance sp cross join lateral jsonb_array_elements(sp.grant_refs) r
 join public.studio_source_grants g on g.id=(r->>'id')::uuid and g.grant_version=(r->>'version')::integer
 where sp.source_id=p_source and r->>'purpose'=p_purpose and g.publication_id=sp.publication_id
 and g.publication_content_version=sp.content_version and g.content_hash=sp.content_hash
 and kinnso_internal.discovery_grant_current(g.id,g.grant_version,p_purpose));
$$;
create function kinnso_internal.discovery_guide_visible(p_guide uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from kinnso_internal.studio_guide_bindings b cross join lateral jsonb_array_elements(b.source_refs) r
 join kinnso_internal.discovery_source_provenance sp on sp.source_id=(r->>'sourceId')::uuid
 where b.guide_id=p_guide and not kinnso_internal.discovery_source_access(sp.source_id,'public_guide'));
$$;
create function kinnso_internal.discovery_target_visible(p_kind text,p_id uuid,p_version integer) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from kinnso_internal.discovery_derivative_bindings b where b.target_kind=p_kind and b.target_id=p_id and b.target_version=p_version
 and not kinnso_internal.discovery_grant_current(b.grant_id,b.grant_version,case p_kind when 'guide_version' then 'public_guide' when 'share_projection' then 'trip_share' else 'trip_adoption' end));
$$;
-- A share can carry the same source in several days/stops. Keep each projection slot.
alter table kinnso_internal.discovery_derivative_bindings add column projection_slot uuid not null default '00000000-0000-0000-0000-000000000000';
alter table kinnso_internal.discovery_derivative_bindings drop constraint discovery_derivative_bindings_pkey;
alter table kinnso_internal.discovery_derivative_bindings add primary key(target_kind,target_id,target_version,field_path,source_id,grant_id,projection_slot);
-- Direct REST, search, owner headers and private trip raw rows cannot bypass projection.
create policy discovery_guide_read on public.guides as restrictive for select to anon,authenticated using(kinnso_internal.discovery_guide_visible(id));
create policy discovery_version_read on public.guide_versions as restrictive for select to anon,authenticated using(kinnso_internal.discovery_target_visible('guide_version',guide_id,version));
create policy discovery_day_read on public.trip_days as restrictive for select to authenticated using(kinnso_internal.discovery_target_visible('trip_day',id,1));
create policy discovery_stop_read on public.trip_stops as restrictive for select to authenticated using(kinnso_internal.discovery_target_visible('trip_stop',id,1));

create function kinnso_internal.discovery_project_record(p_value jsonb,p_kind text,p_id uuid,p_version integer,p_nested uuid default null) returns jsonb
language plpgsql stable set search_path='' as $$
declare b kinnso_internal.discovery_derivative_bindings; result jsonb:=p_value; field text; purpose text;
begin
 purpose:=case p_kind when 'guide_version' then 'public_guide' when 'share_projection' then 'trip_share' else 'trip_adoption' end;
 for b in select * from kinnso_internal.discovery_derivative_bindings where target_kind=p_kind and target_id=p_id and target_version=p_version
  and (p_kind<>'share_projection' or upstream_stop_id is not distinct from p_nested) loop
  if not kinnso_internal.discovery_grant_current(b.grant_id,b.grant_version,purpose) then
   foreach field in array case when b.field_path='root_metadata' then array['title','summary','city'] when b.field_path='day_title' then array['title'] else array[b.field_path] end loop
    if result ? field then result:=jsonb_set(result,array[field],to_jsonb(case when field='title' then '內容權限受限' else '' end));end if;
   end loop;
  end if;
 end loop;
 return result;
end $$;
create function kinnso_internal.discovery_project_trip(p_value jsonb,p_share uuid default null) returns jsonb
language plpgsql stable set search_path='' as $$
declare d jsonb; s jsonb; days jsonb:='[]'; stops jsonb; row jsonb;
begin
 if p_value is null or jsonb_typeof(p_value->'days') is distinct from 'array' then return p_value;end if;
 for d in select value from jsonb_array_elements(p_value->'days') loop
  stops:='[]';
  for s in select value from jsonb_array_elements(d->'stops') loop
   row:=case when p_share is null then kinnso_internal.discovery_project_record(s,'trip_stop',(s->>'id')::uuid,1)
    else kinnso_internal.discovery_project_record(s,'share_projection',p_share,1,(s->>'id')::uuid) end;
   stops:=stops||jsonb_build_array(row);
  end loop;
  row:=case when p_share is null then kinnso_internal.discovery_project_record(d,'trip_day',(d->>'id')::uuid,1)
   else kinnso_internal.discovery_project_record(d,'share_projection',p_share,1,(d->>'id')::uuid) end;
  days:=days||jsonb_build_array(jsonb_set(row,'{stops}',stops));
 end loop;
 return jsonb_set(p_value,'{days}',days);
end $$;
alter function kinnso_internal.snapshot(uuid) rename to discovery_legacy_trip_snapshot;
create function kinnso_internal.snapshot(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select kinnso_internal.discovery_project_trip(kinnso_internal.discovery_legacy_trip_snapshot(p_id));
$$;
alter function public.kinnso_guide(uuid) set schema kinnso_internal;
alter function kinnso_internal.kinnso_guide(uuid) rename to discovery_legacy_guide;
create function public.kinnso_guide(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not kinnso_internal.discovery_guide_visible(p_guide_id) then raise exception 'guide_not_found';end if;
 result:=kinnso_internal.discovery_legacy_guide(p_guide_id);
 if result->>'kind'='itinerary' and not kinnso_internal.discovery_target_visible('guide_version',p_guide_id,(result->>'version')::integer) then raise exception 'guide_not_found';end if;
 return result;
end $$;
alter function public.get_shared_trip(text) set schema kinnso_internal;
alter function kinnso_internal.get_shared_trip(text) rename to discovery_legacy_shared_trip;
create function public.get_shared_trip(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; share_id uuid;
begin
 result:=kinnso_internal.discovery_legacy_shared_trip(p_token);
 select id into share_id from kinnso_internal.trip_shares where token_hash=kinnso_internal.request_digest(p_token);
 return kinnso_internal.discovery_project_trip(result,share_id);
end $$;
alter function kinnso_share_api.receipt(uuid,uuid,uuid) rename to discovery_legacy_receipt;
create function kinnso_share_api.receipt(p_owner uuid,p_trip uuid,p_request uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_set(r,'{projection}',kinnso_internal.discovery_project_trip(r->'projection',(r->>'id')::uuid))
 from (select kinnso_share_api.discovery_legacy_receipt(p_owner,p_trip,p_request) r) q;
$$;
revoke all on function kinnso_internal.discovery_grant_json(uuid),kinnso_internal.discovery_publication_json(uuid),kinnso_internal.discovery_offer_display(uuid),
 kinnso_internal.discovery_source_access(uuid,text),kinnso_internal.discovery_guide_visible(uuid),kinnso_internal.discovery_target_visible(text,uuid,integer),
 kinnso_internal.discovery_project_record(jsonb,text,uuid,integer,uuid),kinnso_internal.discovery_project_trip(jsonb,uuid),
 kinnso_internal.discovery_legacy_trip_snapshot(uuid),kinnso_internal.snapshot(uuid),kinnso_internal.discovery_legacy_guide(uuid),
 kinnso_internal.discovery_legacy_shared_trip(text),kinnso_share_api.discovery_legacy_receipt(uuid,uuid,uuid),kinnso_share_api.receipt(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
-- Boolean-only helpers are required by the restrictive policies (no source text returned).
grant execute on function kinnso_internal.discovery_guide_visible(uuid),kinnso_internal.discovery_target_visible(text,uuid,integer) to anon,authenticated;
revoke all on function public.kinnso_guide(uuid),public.get_shared_trip(text) from public,anon,authenticated,service_role;
grant execute on function public.kinnso_guide(uuid),public.get_shared_trip(text) to anon,authenticated;
