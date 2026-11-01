-- REVIEW CANDIDATE ONLY. No migration execution or credentials are authorized.
-- An empty key/rights registry and false gates deny activation independently of the BFF.
alter table public.merchant_links add column source_scope_version integer;
alter table kinnso_internal.discovery_gate add column licensed_writes boolean not null default false;
create table kinnso_internal.discovery_authority_keys (
 id text primary key, secret bytea not null check(octet_length(secret)>=32), active boolean not null default false
);
create table kinnso_internal.discovery_link_challenges (
 link_id uuid primary key references public.merchant_links(id), nonce text not null unique default rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=') check(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes', consumed_at timestamptz
);
create table kinnso_internal.discovery_used_proofs (proof_id text primary key, link_id uuid not null references public.merchant_links(id));
create table kinnso_internal.discovery_rights_approvals (
 basis_ref text primary key, company_id uuid not null references public.merchant_profiles(id), source_hash text not null,
 allowed_fields text[] not null, purposes text[] not null, expires_at timestamptz not null, revoked_at timestamptz
);
create table kinnso_internal.discovery_source_checks (
 import_id uuid primary key references public.offer_imports(id), link_version integer not null,
 scope_version integer not null, checked_at timestamptz not null
);
alter table kinnso_internal.discovery_authority_keys enable row level security;
alter table kinnso_internal.discovery_link_challenges enable row level security;
alter table kinnso_internal.discovery_used_proofs enable row level security;
alter table kinnso_internal.discovery_rights_approvals enable row level security;
alter table kinnso_internal.discovery_source_checks enable row level security;
revoke all on kinnso_internal.discovery_authority_keys,kinnso_internal.discovery_link_challenges,
 kinnso_internal.discovery_used_proofs,kinnso_internal.discovery_rights_approvals,kinnso_internal.discovery_source_checks
 from public,anon,authenticated,service_role;

create function kinnso_internal.discovery_owner(p_company uuid,p_actor uuid) returns void
language plpgsql set search_path='' as $$
begin
 perform 1 from public.merchant_profiles where id=p_company and user_id=p_actor and status='active' for share;
 if not found then raise exception 'discovery_forbidden';end if;
end $$;
create function kinnso_internal.discovery_authority(p_envelope jsonb,p_actor uuid,p_request uuid,p_digest text) returns jsonb
language plpgsql set search_path='' as $$
declare payload jsonb:=p_envelope->'payload'; key_bytes bytea; stamp numeric:=extract(epoch from clock_timestamp())*1000;
begin
 perform kinnso_internal.keys(p_envelope,array['keyId','payload','signature']);
 perform kinnso_internal.keys(payload,array['actorId','requestId','commandDigest','issuedAt','expiresAt','facts']);
 if octet_length(p_envelope::text)>262144 or payload->>'actorId' is distinct from p_actor::text
 or payload->>'requestId' is distinct from p_request::text or payload->>'commandDigest' is distinct from p_digest
 or jsonb_typeof(payload->'facts') is distinct from 'object'
 or coalesce(payload->>'issuedAt','')!~'^[0-9]{13}$' or coalesce(payload->>'expiresAt','')!~'^[0-9]{13}$'
 then raise exception 'discovery_restricted';end if;
 if (payload->>'expiresAt')::numeric-(payload->>'issuedAt')::numeric<>60000
 or (payload->>'issuedAt')::numeric>stamp or (payload->>'expiresAt')::numeric<=stamp then raise exception 'discovery_source_changed';end if;
 select secret into key_bytes from kinnso_internal.discovery_authority_keys where id=p_envelope->>'keyId' and active for share;
 if key_bytes is null or p_envelope->>'signature' is distinct from encode(extensions.hmac(
 convert_to(kinnso_internal.discovery_canonical(payload),'UTF8'),key_bytes,'sha256'),'hex') then raise exception 'discovery_restricted';end if;
 return payload->'facts';
end $$;
create function kinnso_internal.discovery_assert_source(p_import uuid,p_facts jsonb) returns void
language plpgsql set search_path='' as $$
declare i public.offer_imports; l public.merchant_links; checked timestamptz;
begin
 select * into i from public.offer_imports where id=p_import;
 select * into l from public.merchant_links where id=i.link_id for share;
 checked:=(p_facts->>'checkedAt')::timestamptz;
 if i.id is null or l.status is distinct from 'active' or not l.read_refresh_allowed
 or l.link_version is distinct from (p_facts->>'linkVersion')::integer
 or l.source_scope_version is distinct from (p_facts->>'scopeVersion')::integer
 or p_facts->>'linkId' is distinct from l.id::text or p_facts->>'workspaceId' is distinct from l.sme_workspace_id
 or p_facts->>'offerId' is distinct from i.external_offer_id or (p_facts->>'revision')::integer is distinct from i.source_revision
 or p_facts->>'hash' is distinct from i.source_hash or p_facts->>'locationId' is distinct from i.applied_location_id
 or not (i.applied_location_id=any(l.location_ids)) or p_facts->>'state' is distinct from 'current'
 or checked is null or checked>clock_timestamp() or checked<=clock_timestamp()-interval '60 seconds'
 then raise exception 'discovery_source_changed';end if;
end $$;
create function kinnso_internal.discovery_check_source(p_import uuid,p_facts jsonb) returns void
language plpgsql set search_path='' as $$
begin
 perform kinnso_internal.discovery_assert_source(p_import,p_facts);
 insert into kinnso_internal.discovery_source_checks values(p_import,(p_facts->>'linkVersion')::integer,(p_facts->>'scopeVersion')::integer,(p_facts->>'checkedAt')::timestamptz)
 on conflict(import_id) do update set link_version=excluded.link_version,scope_version=excluded.scope_version,checked_at=excluded.checked_at;
end $$;
create function kinnso_internal.discovery_source_current(p_import uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.offer_imports i join public.merchant_links l on l.id=i.link_id
 join kinnso_internal.discovery_source_checks c on c.import_id=i.id where i.id=p_import and l.status='active' and l.read_refresh_allowed
 and l.link_version=c.link_version and l.source_scope_version=c.scope_version and i.applied_location_id=any(l.location_ids)
 and c.checked_at<=statement_timestamp() and c.checked_at>statement_timestamp()-interval '60 seconds'
 and i.fields->>'sourceStatus'='confirmed' and (i.fields->>'validUntil')::date>=(statement_timestamp() at time zone 'Asia/Hong_Kong')::date);
$$;
create function kinnso_internal.discovery_grant_current(p_id uuid,p_version integer,p_purpose text,p_require_fresh boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_source_grants g join public.offer_publications p on p.id=g.publication_id
 join public.offer_publication_versions v on v.publication_id=p.id and v.content_version=p.content_version
 join public.offer_imports i on i.id=p.import_id
 join kinnso_internal.discovery_rights_approvals a on a.basis_ref=g.rights_basis_ref
 where g.id=p_id and g.grant_version=p_version and g.purpose=p_purpose and g.verification_state='approved'
 and g.revoked_at is null and g.expires_at>statement_timestamp() and p.status='published'
 and p.content_version=g.publication_content_version and p.content_hash=g.content_hash
 and a.company_id=p.company_id and a.source_hash=i.source_hash and a.revoked_at is null and a.expires_at>statement_timestamp()
 and g.allowed_fields<@a.allowed_fields and g.purpose=any(a.purposes)
 and array(select jsonb_array_elements_text(v.body->'displayFields'))<@g.allowed_fields
 and (not p_require_fresh or kinnso_internal.discovery_source_current(p.import_id)));
$$;

create function kinnso_internal.discovery_grant_current(p_id uuid,p_version integer,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
 select kinnso_internal.discovery_grant_current(p_id,p_version,p_purpose,true);
$$;
revoke all on function kinnso_internal.discovery_assert_source(uuid,jsonb),kinnso_internal.discovery_grant_current(uuid,integer,text,boolean) from public,anon,authenticated,service_role;

-- Keep the existing five private commands and their quota/tombstone semantics unchanged.
alter function public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb) set schema kinnso_internal;
alter function kinnso_internal.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb) rename to discovery_private_command;
revoke all on function kinnso_internal.discovery_private_command(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.apply_kinnso_discovery_command(p_target_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb,p_authority jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); k text:=p_command->>'kind'; d jsonb:=p_command->'data'; digest text;
 prior kinnso_internal.discovery_requests; f jsonb; rev integer; l public.merchant_links; i public.offer_imports; p public.offer_publications;
 g public.studio_source_grants; t public.trip_intents; v jsonb; h text; preview text; cv integer; item jsonb; refs jsonb:='[]';
 import_uuid uuid; v_purpose text; fields text[]; purposes text[]; approval kinnso_internal.discovery_rights_approvals; current_rev integer; n integer;
begin
 if k in('savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent') then
  return kinnso_internal.discovery_private_command(p_target_id,p_expected_revision,p_request_id,p_command);
 end if;
 if p_target_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0
 or jsonb_typeof(p_command) is distinct from 'object' or jsonb_typeof(d) is distinct from 'object' or octet_length(p_command::text)>32768
 or k is null or k not in('beginLink','confirmLink','revokeLink','importOffer','preparePublication','grantContentUse','revokeContentUse','publishOffer','withdrawOffer','recordMatch','chooseOffer')
 then raise exception 'invalid_discovery_command';end if;
 perform kinnso_internal.keys(p_command,array['kind','data']);
 perform pg_advisory_xact_lock(hashtextextended('discovery-request:'||actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'expectedRevision',p_expected_revision,'command',p_command)));
 select * into prior from kinnso_internal.discovery_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.command_digest<>digest then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('ok',true,'receipt',public.get_kinnso_discovery_request(p_request_id)->'receipt');
 end if;
 if (select private_writes from kinnso_internal.discovery_gate where singleton) is distinct from true then raise exception 'discovery_unavailable';end if;
 if k in('confirmLink','importOffer','preparePublication','publishOffer','recordMatch') then f:=kinnso_internal.discovery_authority(p_authority,actor,p_request_id,digest);end if;
 perform pg_advisory_xact_lock(hashtextextended('discovery-owner:'||actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('discovery-target:'||p_target_id::text,0));
 rev:=p_expected_revision+1;
 if k='beginLink' then
  perform kinnso_internal.keys(d,array['companyId','locationIds']);
  perform kinnso_internal.discovery_owner((d->>'companyId')::uuid,actor);
  perform pg_advisory_xact_lock(hashtextextended('discovery-company:'||(d->>'companyId'),0));
  perform kinnso_internal.discovery_strings(d->'locationIds',20);
  if jsonb_array_length(d->'locationIds')<1 or p_expected_revision<>0 or exists(select 1 from public.merchant_links where id=p_target_id
   or (company_id=(d->>'companyId')::uuid and status in('pending','active'))) then raise exception 'revision_conflict';end if;
  insert into public.merchant_links(id,company_id,location_ids,status) values(p_target_id,(d->>'companyId')::uuid,array(select jsonb_array_elements_text(d->'locationIds')),'pending');
  insert into kinnso_internal.discovery_link_challenges(link_id) values(p_target_id);
 elsif k in('confirmLink','revokeLink') then
  select * into l from public.merchant_links where id=p_target_id for update;
  perform kinnso_internal.discovery_owner(l.company_id,actor);
  if l.link_version is distinct from p_expected_revision then raise exception 'revision_conflict';end if;
  if k='confirmLink' then
   perform kinnso_internal.keys(d,array['proof','readRefreshAllowed']);
   if l.status<>'pending' or jsonb_typeof(d->'readRefreshAllowed') is distinct from 'boolean'
   or f->>'companyId' is distinct from l.company_id::text or f->>'linkId' is distinct from l.id::text
   or f->>'role' is distinct from 'owner' or coalesce(length(f->>'workspaceId'),0) not between 1 and 200
   or (f->>'scopeVersion')::integer is null or (f->>'scopeVersion')::integer<1
   or coalesce(length(f->>'proofId'),0) not between 1 and 200
   or f->>'proofDigest' is distinct from kinnso_internal.request_digest(d->>'proof')
   or array(select jsonb_array_elements_text(f->'locationIds') order by 1) is distinct from array(select unnest(l.location_ids) order by 1)
   then raise exception 'discovery_restricted';end if;
   perform 1 from kinnso_internal.discovery_link_challenges where link_id=l.id and nonce::text=f->>'nonce' and consumed_at is null and expires_at>clock_timestamp() for update;
   if not found then raise exception 'discovery_restricted';end if;
   insert into kinnso_internal.discovery_used_proofs values(f->>'proofId',l.id);
   update kinnso_internal.discovery_link_challenges set consumed_at=clock_timestamp() where link_id=l.id;
   update public.merchant_links set status='active',sme_workspace_id=f->>'workspaceId',source_scope_version=(f->>'scopeVersion')::integer,
    proof_digest=f->>'proofDigest',verified_at=clock_timestamp(),read_refresh_allowed=(d->>'readRefreshAllowed')::boolean,link_version=rev where id=l.id;
  else
   if d<>'{}'::jsonb then raise exception 'invalid_discovery_command';end if;
   update public.merchant_links set status='revoked',read_refresh_allowed=false,link_version=rev where id=l.id;
  end if;
 elsif k='importOffer' then
  perform kinnso_internal.keys(d,array['linkId','offerId','expectedSourceRevision','locationId']);
  select * into l from public.merchant_links where id=(d->>'linkId')::uuid for share;
  perform kinnso_internal.discovery_owner(l.company_id,actor);
  if p_expected_revision<>0 or exists(select 1 from public.offer_publications where id=p_target_id) then raise exception 'revision_conflict';end if;
  item:=f->'offer';
  if item->>'offerId' is distinct from d->>'offerId' or item->>'appliedLocationId' is distinct from d->>'locationId'
   or (item->>'revision')::integer is distinct from (d->>'expectedSourceRevision')::integer
   or item->>'sourceStatus' is distinct from 'confirmed' or item->>'rightsState' is distinct from 'unverified_for_kinnso_reuse'
   or coalesce(item->>'hash','')!~'^[a-f0-9]{64}$' or coalesce(length(item->>'title'),0) not between 1 and 200
   or jsonb_typeof(item->'details') is distinct from 'string' or jsonb_typeof(item->'terms') is distinct from 'string'
   then raise exception 'discovery_source_changed';end if;
  select * into i from public.offer_imports where link_id=l.id and external_offer_id=item->>'offerId' and source_revision=(item->>'revision')::integer and applied_location_id=item->>'appliedLocationId';
  if i.id is not null and i.source_hash<>item->>'hash' then raise exception 'discovery_source_changed';end if;
  import_uuid:=coalesce(i.id,gen_random_uuid());
  if exists(select 1 from public.offer_publications where import_id=import_uuid and company_id=l.company_id) then raise exception 'revision_conflict';end if;
  if i.id is null then
   insert into public.offer_imports values(import_uuid,l.id,item->>'offerId',(item->>'revision')::integer,item->>'hash',item->>'sourceLocationId',item->>'appliedLocationId',
    (f->'check'->>'scopeVersion')::integer,(item->>'observedAt')::timestamptz,item);
  end if;
  perform kinnso_internal.discovery_check_source(import_uuid,f->'check');
  insert into public.offer_publications(id,company_id,import_id,revision) values(p_target_id,l.company_id,import_uuid,1);
 elsif k='preparePublication' then
  perform kinnso_internal.keys(d,array['importId','cityKey','dateTimeZone','priceBasis','interestTags','languages','audiences','displayFields','campaignId']);
  select * into i from public.offer_imports where id=(d->>'importId')::uuid;
  select * into l from public.merchant_links where id=i.link_id;
  perform kinnso_internal.discovery_owner(l.company_id,actor);
  select * into p from public.offer_publications where id=p_target_id for update;
  if p.id is null or p.revision<>p_expected_revision or p.status='published' or p.company_id<>l.company_id or p.import_id<>i.id then raise exception 'revision_conflict';end if;
  perform kinnso_internal.discovery_check_source(i.id,f->'check');
  if d->>'cityKey' is distinct from 'city:hk:hong-kong' or d->>'dateTimeZone' is distinct from 'Asia/Hong_Kong'
   or coalesce(d->>'priceBasis','') not in('per_person','other','unknown') then raise exception 'invalid_discovery_publication';end if;
  perform kinnso_internal.discovery_strings(d->'interestTags',10);
  perform kinnso_internal.discovery_strings(d->'languages',5,array['en','zh-HK','zh-TW']);
  perform kinnso_internal.discovery_strings(d->'audiences',2,array['traveller','creator']);
  perform kinnso_internal.discovery_strings(d->'displayFields',3,array['title','details','terms']);
  if jsonb_array_length(d->'audiences')<1 or not (d->'displayFields' ?& array['title','terms']) then raise exception 'invalid_discovery_publication';end if;
  cv:=coalesce(p.content_version,0)+1;
  h:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('input',d,'sourceHash',i.source_hash)));
  preview:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('publicationId',p_target_id,'contentVersion',cv,'contentHash',h)));
  insert into public.offer_publications(id,company_id,import_id,revision,content_version,content_hash,preview_digest,status)
  values(p_target_id,l.company_id,i.id,rev,cv,h,preview,'draft') on conflict(id) do update set import_id=excluded.import_id,revision=rev,
   content_version=cv,content_hash=h,preview_digest=preview,status='draft',published_at=null,withdrawn_at=null;
  insert into public.offer_publication_versions values(p_target_id,cv,h,d,clock_timestamp());
 elsif k in('grantContentUse','revokeContentUse','publishOffer','withdrawOffer') then
  -- revokeContentUse targets the grant; all other commands target the publication.
  if k='revokeContentUse' then select * into g from public.studio_source_grants where id=p_target_id;end if;
  select * into p from public.offer_publications where id=case when k='revokeContentUse' then g.publication_id else p_target_id end for update;
  perform kinnso_internal.discovery_owner(p.company_id,actor);
  if (case when k='revokeContentUse' then g.grant_version else p.revision end) is distinct from p_expected_revision then raise exception 'revision_conflict';end if;
  if k='grantContentUse' then
   perform kinnso_internal.keys(d,array['publicationContentVersion','allowedFields','purposes','expiresAt','rightsBasisRef','previewDigest','confirmed']);
   perform kinnso_internal.discovery_strings(d->'allowedFields',3,array['title','details','terms']);
   perform kinnso_internal.discovery_strings(d->'purposes',6,array['catalog','matching','private_brief','public_guide','trip_adoption','trip_share']);
   fields:=array(select jsonb_array_elements_text(d->'allowedFields'));purposes:=array(select jsonb_array_elements_text(d->'purposes'));
   select * into i from public.offer_imports where id=p.import_id;
   select * into approval from kinnso_internal.discovery_rights_approvals where basis_ref=d->>'rightsBasisRef' for share;
   if d->'confirmed' is distinct from 'true'::jsonb or (d->>'publicationContentVersion')::integer is distinct from p.content_version
    or d->>'previewDigest' is distinct from p.preview_digest or cardinality(fields)<1 or cardinality(purposes)<1
    or approval.basis_ref is null or approval.company_id<>p.company_id or approval.source_hash<>i.source_hash
    or approval.revoked_at is not null or not fields<@approval.allowed_fields or not purposes<@approval.purposes
    or (d->>'expiresAt')::timestamptz is null or (d->>'expiresAt')::timestamptz<=clock_timestamp()
    or (d->>'expiresAt')::timestamptz>approval.expires_at then raise exception 'discovery_restricted';end if;
   foreach v_purpose in array purposes loop
    update public.studio_source_grants set revoked_at=clock_timestamp() where publication_id=p.id and publication_content_version=p.content_version and studio_source_grants.purpose=v_purpose and revoked_at is null;
    insert into public.studio_source_grants values(gen_random_uuid(),p.id,p.content_version,p.content_hash,1,p.company_id,actor,fields,v_purpose,(d->>'expiresAt')::timestamptz,null,approval.basis_ref,'approved');
   end loop;
  elsif k='revokeContentUse' then
   if d<>'{}'::jsonb then raise exception 'invalid_discovery_command';end if;
   perform kinnso_internal.discovery_revoke_grant(g.id);rev:=g.grant_version;
   update public.offer_publications set revision=revision+1 where id=p.id;
  elsif k='publishOffer' then
   perform kinnso_internal.keys(d,array['contentVersion','previewDigest','confirmed']);
   if p.status<>'draft' or d->'confirmed' is distinct from 'true'::jsonb or (d->>'contentVersion')::integer is distinct from p.content_version
    or d->>'previewDigest' is distinct from p.preview_digest then raise exception 'revision_conflict';end if;
   perform kinnso_internal.discovery_check_source(p.import_id,f->'check');
   -- Transition is in this transaction; any failed grant assertion rolls it back.
   update public.offer_publications set status='published',published_at=clock_timestamp() where id=p.id;
   foreach v_purpose in array array['catalog','matching'] loop
    select * into g from public.studio_source_grants where publication_id=p.id and publication_content_version=p.content_version and studio_source_grants.purpose=v_purpose and revoked_at is null for share;
    if not kinnso_internal.discovery_grant_current(g.id,g.grant_version,v_purpose) then raise exception 'discovery_restricted';end if;
   end loop;
  else
   if d<>'{}'::jsonb then raise exception 'invalid_discovery_command';end if;
   update public.offer_publications set status='withdrawn',withdrawn_at=clock_timestamp() where id=p.id;
  end if;
  if k<>'revokeContentUse' then update public.offer_publications set revision=rev where id=p.id;end if;
 elsif k='chooseOffer' then
  perform kinnso_internal.keys(d,array['intentId','publicationId','choice']);
  select * into t from public.trip_intents where id=(d->>'intentId')::uuid and owner_actor_id=actor and status='active' for share;
  if not found then raise exception 'discovery_not_found';end if;
  -- Composite key lock prevents two different target UUIDs racing the same choice.
  perform pg_advisory_xact_lock(hashtextextended('discovery-choice:'||actor::text||t.id::text||(d->>'publicationId'),0));
  select revision into current_rev from public.match_choices where owner_actor_id=actor and intent_id=t.id and publication_id=(d->>'publicationId')::uuid for update;
  if coalesce(current_rev,0)<>p_expected_revision then raise exception 'revision_conflict';end if;
  if coalesce(d->>'choice','') not in('saved','dismissed','cleared') then raise exception 'invalid_discovery_choice';end if;
  if d->>'choice'='saved' and not exists(select 1 from public.match_runs m cross join lateral jsonb_array_elements(m.references_only) r
   join public.offer_publications q on q.id=(r->>'publicationId')::uuid where m.owner_actor_id=actor and m.intent_id=t.id and m.intent_revision=t.revision
   and q.id=(d->>'publicationId')::uuid and q.revision=(r->>'publicationRevision')::integer and kinnso_internal.discovery_source_current(q.import_id)
   and exists(select 1 from public.studio_source_grants sg where sg.publication_id=q.id and kinnso_internal.discovery_grant_current(sg.id,sg.grant_version,'matching')))
   then raise exception 'discovery_restricted';end if;
  insert into public.match_choices values(actor,t.id,(d->>'publicationId')::uuid,rev,d->>'choice',clock_timestamp())
   on conflict(owner_actor_id,intent_id,publication_id) do update set revision=rev,choice=excluded.choice,updated_at=excluded.updated_at;
 elsif k='recordMatch' then
  perform kinnso_internal.keys(d,array['intentId','intentRevision']);
  select * into t from public.trip_intents where id=(d->>'intentId')::uuid and owner_actor_id=actor and status='active' for share;
  if not found then raise exception 'discovery_not_found';end if;
  if p_expected_revision<>0 or t.revision is distinct from (d->>'intentRevision')::integer or exists(select 1 from public.match_runs where id=p_target_id) then raise exception 'revision_conflict';end if;
  -- Results are produced by the server matching-v1 policy, bound to this intent/command.
  if f->>'intentId' is distinct from t.id::text or (f->>'intentRevision')::integer is distinct from t.revision
   or f->>'policyVersion' is distinct from 'matching-v1' or jsonb_typeof(f->'results') is distinct from 'array'
   or jsonb_array_length(f->'results')>100 or jsonb_typeof(f->'coverage') is distinct from 'object' then raise exception 'invalid_discovery_match';end if;
  for item in select value from jsonb_array_elements(f->'results') order by value->>'publicationId' loop
   select * into p from public.offer_publications where id=(item->>'publicationId')::uuid for share;
   if p.revision is distinct from (item->>'publicationRevision')::integer or p.content_version is distinct from (item->>'contentVersion')::integer then raise exception 'discovery_source_changed';end if;
   perform kinnso_internal.discovery_check_source(p.import_id,item->'check');
   foreach v_purpose in array array['catalog','matching'] loop
    select * into g from public.studio_source_grants where publication_id=p.id and v_purpose=studio_source_grants.purpose and revoked_at is null and publication_content_version=p.content_version for share;
    if not kinnso_internal.discovery_grant_current(g.id,g.grant_version,v_purpose) then raise exception 'discovery_restricted';end if;
   end loop;
   -- Whitelist metadata; never persist display text, a proof or upstream credential in match history.
   refs:=refs||jsonb_build_array(jsonb_build_object('publicationId',p.id,'publicationRevision',p.revision,'contentVersion',p.content_version,
    'score',item->'score','scoreBreakdown',item->'scoreBreakdown','eligibility',item->'eligibility','coverage',item->'coverage',
    'reasons',item->'reasons','missing',item->'missing','grantVersions',item->'grantVersions','sourceRevision',item->'sourceRevision','observedAt',item->'observedAt','checkedAt',item->'checkedAt'));
  end loop;
  if (select count(distinct value->>'publicationId') from jsonb_array_elements(refs))<>jsonb_array_length(refs) then raise exception 'invalid_discovery_match';end if;
  insert into public.match_runs values(p_target_id,actor,t.id,t.revision,'matching-v1',kinnso_internal.request_digest(kinnso_internal.discovery_canonical(refs)),refs,f->'coverage',clock_timestamp());
 end if;
 insert into kinnso_internal.discovery_requests values(actor,p_request_id,digest,k,p_target_id,rev,clock_timestamp());
 return jsonb_build_object('ok',true,'receipt',jsonb_build_object('requestId',p_request_id,'commandDigest',digest,'resourceId',p_target_id,'revision',rev));
end $$;
create function public.apply_kinnso_discovery_command(p_target_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select public.apply_kinnso_discovery_command(p_target_id,p_expected_revision,p_request_id,p_command,null);
$$;
revoke all on function kinnso_internal.discovery_owner(uuid,uuid),kinnso_internal.discovery_authority(jsonb,uuid,uuid,text),
 kinnso_internal.discovery_check_source(uuid,jsonb),kinnso_internal.discovery_source_current(uuid),kinnso_internal.discovery_grant_current(uuid,integer,text)
 from public,anon,authenticated,service_role;
revoke all on function public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb),public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb),public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb,jsonb) to authenticated;
