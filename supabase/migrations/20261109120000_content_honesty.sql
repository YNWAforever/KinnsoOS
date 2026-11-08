-- S2 content honesty: additive provenance columns, per-version rights
-- attestations and the RPC boundary the public library label, creator editor
-- and ops readiness view read. Additive only: no existing column, policy,
-- grant or function is replaced, and public.guides keeps its existing RLS.
--
-- Security posture mirrors the chat/studio RPCs (20261108190000, 20261109100000):
-- the new table lives in kinnso_internal with RLS on and no grants to any
-- client role; every public entry point is SECURITY DEFINER with an empty
-- search_path and is revoked from PUBLIC/anon. The public honesty read is the
-- only one additionally granted to anon, and it exposes only published rows.

-- ---------------------------------------------------------------------------
-- Provenance metadata (defaulted, so existing rows stay readable and honest:
-- unknown rights, no sources, no place verification, not synthetic).
-- ---------------------------------------------------------------------------
alter table public.guides
  add column if not exists synthetic boolean not null default false,
  add column if not exists rights_basis text not null default 'unknown'
    check (rights_basis in ('original', 'licensed', 'unknown')),
  add column if not exists source_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) <= 20),
  add column if not exists place_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Attestation receipts: one signed statement per (guide, version).
-- Append-only through kinnso_attest_guide_version; no direct grants.
-- ---------------------------------------------------------------------------
create table kinnso_internal.guide_version_attestations (
  guide_id uuid not null references public.guides(id) on delete cascade,
  version integer not null check (version > 0),
  attester_id uuid not null references auth.users(id) on delete cascade,
  rights_basis text not null check (rights_basis in ('original', 'licensed')),
  statement text not null check (char_length(statement) between 40 and 2000),
  statement_hash text not null check (statement_hash ~ '^[0-9a-f]{64}$'),
  attested_at timestamptz not null default now(),
  primary key (guide_id, version)
);
alter table kinnso_internal.guide_version_attestations enable row level security;
revoke all on kinnso_internal.guide_version_attestations
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One projection, one status derivation: synthetic always wins, then verified
-- requires an attestation AND at least one source AND a place verification,
-- then attested requires the attestation alone, else unverified. Column
-- ordering here is the single source of truth for the precedence.
-- ---------------------------------------------------------------------------
create function kinnso_internal.guide_honesty_payload(p_guide_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id', g.id,
    'status', case
      when g.synthetic then 'synthetic'
      when a.attested_at is not null
        and jsonb_array_length(g.source_refs) > 0
        and g.place_verified_at is not null then 'verified'
      when a.attested_at is not null then 'attested'
      else 'unverified' end,
    'synthetic', g.synthetic,
    -- The latest creator attestation is the current declared basis; the guide
    -- column stays the projection/backfill slot and defaults to 'unknown'.
    'rightsBasis', coalesce(a.rights_basis, g.rights_basis),
    'sourceCount', jsonb_array_length(g.source_refs),
    'placeVerifiedAt', g.place_verified_at,
    'attestedAt', a.attested_at,
    'latestAttestedVersion', a.version)
  from public.guides g
  left join lateral (
    select x.attested_at, x.version, x.rights_basis
    from kinnso_internal.guide_version_attestations x
    where x.guide_id = g.id
    order by x.attested_at desc, x.version desc
    limit 1) a on true
  where g.id = p_guide_id;
$$;
revoke all on function kinnso_internal.guide_honesty_payload(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Public read: one published guide's honesty projection. Drafts are not
--    readable and unknown ids are indistinguishable from drafts.
-- ---------------------------------------------------------------------------
create function public.kinnso_guide_honesty(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_guide_id is null or not exists (
    select 1 from public.guides where id = p_guide_id and status = 'published')
    then raise exception 'guide_not_found'; end if;
  return kinnso_internal.guide_honesty_payload(p_guide_id);
end $$;

-- ---------------------------------------------------------------------------
-- 2) Ops readiness: reproducible counts over the published guide corpus.
--    Public articles carry no synthetic/fixture classification column, so an
--    honest exact article/fixture count cannot be derived from this schema;
--    articleRows and fixtureArticles are null and the UI must render them as
--    unknown instead of inventing a number. (The public read predicate
--    published_at/end_at/deleted_at is the only article truth available and it
--    cannot distinguish fixture rows from real legacy rows.)
-- ---------------------------------------------------------------------------
create function public.kinnso_content_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  with published as (
    select g.id, g.synthetic, g.place_verified_at,
      jsonb_array_length(g.source_refs) as source_count,
      a.attested_at
    from public.guides g
    left join lateral (
      select x.attested_at
      from kinnso_internal.guide_version_attestations x
      where x.guide_id = g.id
      order by x.attested_at desc, x.version desc
      limit 1) a on true
    where g.status = 'published'
  ), classified as (
    select *,
      case
        when synthetic then 'synthetic'
        when attested_at is not null and source_count > 0 and place_verified_at is not null
          then 'verified'
        when attested_at is not null then 'attested'
        else 'unverified' end as status
    from published
  )
  select jsonb_build_object(
    'published', (select count(*) from classified),
    'synthetic', (select count(*) from classified where status = 'synthetic'),
    'unverified', (select count(*) from classified where status = 'unverified'),
    'attested', (select count(*) from classified where status = 'attested'),
    'verified', (select count(*) from classified where status = 'verified'),
    'withSources', (select count(*) from classified where source_count > 0),
    'withPlaceVerification', (select count(*) from classified where place_verified_at is not null),
    'attestedVersions', (
      select count(*) from kinnso_internal.guide_version_attestations a
      join public.guides g on g.id = a.guide_id
      where g.status = 'published'),
    'articleRows', null,
    'fixtureArticles', null)
  into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Creator attestation: authorship/rights statement for one current guide
--    version. Mirrors save_kinnso_guide_draft's ownership predicate: an active
--    creator who owns the guide. Never publishes or changes visibility. A
--    retry with the same actor, version, rights basis and statement is
--    idempotent; any different statement for that version conflicts.
-- ---------------------------------------------------------------------------
create function public.kinnso_attest_guide_version(
  p_guide_id uuid,
  p_version integer,
  p_rights_basis text,
  p_statement text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := kinnso_internal.actor();
  g public.guides;
  v_statement text := btrim(coalesce(p_statement, ''));
  v_hash text;
  v_max integer;
  v_active integer;
  v_expected integer;
  v_existing kinnso_internal.guide_version_attestations;
  v_attested_at timestamptz;
begin
  if not exists (select 1 from public.creators where id = actor and status = 'active') then
    raise exception 'creator_required'; end if;
  if p_version is null or p_version < 1 then raise exception 'invalid_attestation'; end if;
  if p_rights_basis is null or p_rights_basis not in ('original', 'licensed') then
    raise exception 'invalid_attestation'; end if;
  if char_length(v_statement) not between 40 and 2000 then
    raise exception 'invalid_attestation'; end if;
  select * into g from public.guides where id = p_guide_id and creator_id = actor for update;
  if not found then raise exception 'guide_not_found'; end if;
  if g.synthetic then raise exception 'synthetic_guide'; end if;
  -- Attestable versions are the current live version and the version the open
  -- draft will publish as (publish uses max(version)+1); stale versions are
  -- refused. A guide with no versions yet can attest its first version.
  select coalesce(max(version), 0) into v_max
    from public.guide_versions where guide_id = g.id;
  select max(version) into v_active
    from public.guide_versions where guide_id = g.id and withdrawn_at is null;
  v_expected := case
    when exists (select 1 from kinnso_internal.guide_drafts where guide_id = g.id) then v_max + 1
    when v_active is not null then v_active
    else 1 end;
  if p_version <> v_expected and p_version is distinct from v_active then
    raise exception 'version_conflict'; end if;
  v_hash := kinnso_internal.request_digest(v_statement);
  insert into kinnso_internal.guide_version_attestations
    (guide_id, version, attester_id, rights_basis, statement, statement_hash)
    values (g.id, p_version, actor, p_rights_basis, v_statement, v_hash)
    on conflict (guide_id, version) do nothing;
  if not found then
    select * into v_existing
      from kinnso_internal.guide_version_attestations
      where guide_id = g.id and version = p_version;
    if v_existing.attester_id <> actor
      or v_existing.rights_basis <> p_rights_basis
      or v_existing.statement_hash <> v_hash
      then raise exception 'attestation_conflict'; end if;
  end if;
  select attested_at into v_attested_at
    from kinnso_internal.guide_version_attestations
    where guide_id = g.id and version = p_version;
  return jsonb_build_object(
    'guideId', g.id,
    'version', p_version,
    'rightsBasis', p_rights_basis,
    'attestedAt', v_attested_at,
    'status', kinnso_internal.guide_honesty_payload(g.id)->'status');
end $$;

-- ---------------------------------------------------------------------------
-- Grants: revoke implicit PUBLIC/anon EXECUTE, then grant narrowly. The public
-- honesty read is the only anon-callable entry point; readiness is ops-gated
-- inside the function; attestation is creator-authenticated only.
-- ---------------------------------------------------------------------------
revoke all on function public.kinnso_guide_honesty(uuid) from public, anon;
grant execute on function public.kinnso_guide_honesty(uuid) to anon, authenticated;
revoke all on function public.kinnso_content_readiness() from public, anon;
grant execute on function public.kinnso_content_readiness() to authenticated;
revoke all on function public.kinnso_attest_guide_version(uuid, integer, text, text) from public, anon;
grant execute on function public.kinnso_attest_guide_version(uuid, integer, text, text) to authenticated;
