-- N01/N03 REVIEW CANDIDATE. NOT APPLIED. No licensed ingestion until every
-- original writer/reader/cache path has native acceptance. Do not widen own/unknown.
create table public.studio_source_grants (
 id uuid primary key, publication_id uuid not null, publication_content_version integer not null,
 content_hash text not null, grant_version integer not null check(grant_version>0),
 grantor_company_id uuid not null references public.merchant_profiles(id),
 issuer_actor_id uuid not null references auth.users(id),
 allowed_fields text[] not null check(cardinality(allowed_fields) between 1 and 3 and allowed_fields<@array['title','details','terms']),
 purpose text not null check(purpose in('catalog','matching','private_brief','public_guide','trip_adoption','trip_share')),
 expires_at timestamptz not null, revoked_at timestamptz, rights_basis_ref text not null,
 verification_state text not null default 'unverified' check(verification_state in('unverified','approved')),
 foreign key(publication_id,publication_content_version,content_hash) references public.offer_publication_versions(publication_id,content_version,content_hash),
 foreign key(publication_id,grantor_company_id) references public.offer_publications(id,company_id),
 unique(id,grant_version,publication_id,publication_content_version)
);
create unique index discovery_one_current_grant on public.studio_source_grants(publication_id,publication_content_version,purpose) where revoked_at is null;
create table kinnso_internal.discovery_source_provenance (
 source_id uuid primary key references public.studio_sources(id), publication_id uuid not null,
 content_version integer not null, content_hash text not null, import_hash text not null check(import_hash ~ '^[a-f0-9]{64}$'),
 checked_at timestamptz not null, source_scope_version integer not null check(source_scope_version>0),
 foreign key(publication_id,content_version,content_hash) references public.offer_publication_versions(publication_id,content_version,content_hash)
);
create table kinnso_internal.discovery_derivative_bindings (
 target_kind text not null check(target_kind in('guide_version','trip_day','trip_stop','share_projection')),
 target_id uuid not null, target_version integer not null check(target_version>0),
 field_path text not null check(field_path in('root_metadata','title','summary','city','day_title','sourceDescription','description')),
 source_id uuid not null references kinnso_internal.discovery_source_provenance(source_id),
 grant_id uuid not null, grant_version integer not null, publication_id uuid not null, publication_content_version integer not null,
 upstream_guide_id uuid, upstream_guide_version integer, upstream_stop_id uuid,
 primary key(target_kind,target_id,target_version,field_path,source_id,grant_id),
 foreign key(grant_id,grant_version,publication_id,publication_content_version) references public.studio_source_grants(id,grant_version,publication_id,publication_content_version)
);
alter table public.studio_source_grants enable row level security;
alter table kinnso_internal.discovery_source_provenance enable row level security;
alter table kinnso_internal.discovery_derivative_bindings enable row level security;
revoke all on public.studio_source_grants,kinnso_internal.discovery_source_provenance,kinnso_internal.discovery_derivative_bindings from public,anon,authenticated,service_role;

-- Original source guard remains authoritative; an unconnected adapter must not
-- manufacture an own source from licensed text. SQL trigger also blocks internal
-- insertion, so unguarded legacy readers cannot receive licensed bytes.
create function kinnso_internal.discovery_no_licensed_ingestion() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'discovery_licensed_ingestion_unavailable';end $$;
create trigger discovery_block_source_ingestion before insert or update on kinnso_internal.discovery_source_provenance
 for each row execute function kinnso_internal.discovery_no_licensed_ingestion();

-- This helper is deliberately internal. Future original guide/adopt/share writers
-- must lock original domain rows FIRST, then publication/grant rows in ID order.
create function kinnso_internal.discovery_assert_grant(p_id uuid,p_version integer,p_purpose text,p_content_version integer,p_hash text) returns void
language plpgsql set search_path='' as $$
declare g public.studio_source_grants;p public.offer_publications;
begin
 if p_id is null or p_version is null or p_version<1 or p_purpose is null
 or p_content_version is null or p_content_version<1 or p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'discovery_restricted';end if;
 select * into g from public.studio_source_grants where id=p_id;
 if not found then raise exception 'discovery_restricted';end if;
 select * into p from public.offer_publications where id=g.publication_id for share;
 select * into g from public.studio_source_grants where id=p_id for share;
 if p.status is distinct from 'published' or p.content_version is distinct from p_content_version or p.content_hash is distinct from p_hash
 or g.grant_version is distinct from p_version or g.purpose is distinct from p_purpose or g.publication_content_version is distinct from p_content_version
 or g.content_hash is distinct from p_hash or g.verification_state is distinct from 'approved' or g.revoked_at is not null or g.expires_at is null or g.expires_at<=clock_timestamp()
 then raise exception 'discovery_restricted';end if;
end $$;
-- No browser or service-role caller. A reviewed owner-command wrapper is needed
-- before activation. Updating revoked_at preserves immutable old grant identities.
create function kinnso_internal.discovery_revoke_grant(p_id uuid) returns void
language plpgsql set search_path='' as $$
declare publication uuid;
begin
 select publication_id into publication from public.studio_source_grants where id=p_id;
 perform 1 from public.offer_publications where id=publication for update;
 perform 1 from public.studio_source_grants where id=p_id for update;
 update public.studio_source_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_id;
end $$;
create function kinnso_internal.discovery_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'discovery_immutable';end $$;
create trigger discovery_import_immutable before update or delete on public.offer_imports for each row execute function kinnso_internal.discovery_immutable();
create trigger discovery_publication_version_immutable before update or delete on public.offer_publication_versions for each row execute function kinnso_internal.discovery_immutable();
revoke all on function kinnso_internal.discovery_no_licensed_ingestion(),kinnso_internal.discovery_assert_grant(uuid,integer,text,integer,text),kinnso_internal.discovery_revoke_grant(uuid),kinnso_internal.discovery_immutable() from public,anon,authenticated,service_role;
