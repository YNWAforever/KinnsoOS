-- S3 author verification: the creator-facing honesty projection, the creator
-- source-reference editor and the operations evidence controls that let the
-- content-honesty ladder reach 'verified'. Additive and RPC-only: this file
-- never rewrites a column, table, policy, grant or function created by the S2
-- content-honesty migration (20261109120000), which stays authoritative for
-- storage, attestations and the status derivation.
--
-- The ladder itself is still derived in exactly one place,
-- kinnso_internal.guide_honesty_payload. The author projection composes that
-- function instead of repeating the precedence, so the public badge, the
-- creator editor and the ops view can never disagree.
--
-- Security posture mirrors 20261109120000: every public entry point is
-- SECURITY DEFINER with an empty search_path, revoked from PUBLIC and anon, and
-- granted to authenticated only. The ops RPCs repeat the public.is_active_ops()
-- gate at the database boundary and the creator RPCs repeat the active-creator
-- ownership predicate used by public.kinnso_attest_guide_version.

-- ---------------------------------------------------------------------------
-- Author projection: the public honesty payload plus the draft/published flag
-- and the creator-managed source list. Drafts are included and readable by
-- their owner; the public entry points own the visibility gating. Internal
-- only: revoked from every client role, composed by the RPCs below.
-- ---------------------------------------------------------------------------
create function kinnso_internal.guide_author_honesty_payload(p_guide_id uuid)
returns jsonb
language sql stable set search_path='' as $$
  select kinnso_internal.guide_honesty_payload(g.id)
    || jsonb_build_object(
      'published', g.status = 'published',
      'sources', g.source_refs)
  from public.guides g
  where g.id = p_guide_id;
$$;
revoke all on function kinnso_internal.guide_author_honesty_payload(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Creator read: one guide's honesty projection, drafts included. Requires an
--    active creator who owns the guide (same predicate as attestation); a
--    guide that is not the actor's own is indistinguishable from a missing one.
-- ---------------------------------------------------------------------------
create function public.kinnso_creator_guide_honesty(p_guide_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := kinnso_internal.actor();
begin
  if not exists (select 1 from public.creators where id = actor and status = 'active') then
    raise exception 'creator_required'; end if;
  if p_guide_id is null or not exists (
    select 1 from public.guides where id = p_guide_id and creator_id = actor)
    then raise exception 'guide_not_found'; end if;
  return kinnso_internal.guide_author_honesty_payload(p_guide_id);
end $$;

-- ---------------------------------------------------------------------------
-- 2) Creator source editor: replace one owned guide's source_refs atomically.
--    The stored shape is exactly [{title, url?}]: title trimmed of ASCII spaces
--    and 1..200 characters, url optional and constrained to https:// plus
--    1..500 non-whitespace characters. Anything else is 'invalid_sources'.
--    An identical repeat is a no-op that does not bump guides.updated_at (the
--    before-update trigger only fires when the stored array really changes).
--    Never changes status or visibility, so it cannot publish a draft.
-- ---------------------------------------------------------------------------
create function public.kinnso_guide_set_sources(p_guide_id uuid, p_sources jsonb)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := kinnso_internal.actor();
  g public.guides;
  v_item jsonb;
  v_title text;
  v_normalized jsonb;
begin
  if not exists (select 1 from public.creators where id = actor and status = 'active') then
    raise exception 'creator_required'; end if;
  if p_sources is null or jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'invalid_sources'; end if;
  if jsonb_array_length(p_sources) > 20 then
    raise exception 'invalid_sources'; end if;
  for v_item in select value from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'invalid_sources'; end if;
    -- Exactly {title} or {title, url}; any extra key leaves a non-empty object.
    if v_item - 'title' - 'url' <> '{}'::jsonb
      or jsonb_typeof(v_item->'title') is distinct from 'string' then
      raise exception 'invalid_sources'; end if;
    v_title := btrim(v_item->>'title');
    if char_length(v_title) < 1 or char_length(v_title) > 200 then
      raise exception 'invalid_sources'; end if;
    if v_item ? 'url' then
      -- PostgreSQL ARE does not support \s inside a bracket expression, so the
      -- https prefix, the 1..500 length and the "no whitespace" rule are checked
      -- separately; `\s` is valid as a shorthand only outside brackets.
      if jsonb_typeof(v_item->'url') is distinct from 'string'
        or (v_item->>'url') !~ '^https://'
        or char_length(v_item->>'url') > 500
        or char_length(v_item->>'url') <= 8
        or (v_item->>'url') ~ '\s' then
        raise exception 'invalid_sources'; end if;
    end if;
  end loop;
  select * into g from public.guides where id = p_guide_id and creator_id = actor for update;
  if not found then raise exception 'guide_not_found'; end if;
  select coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'title', btrim(e->>'title'),
        'url', case when e ? 'url' then e->>'url' end))
      order by ord), '[]'::jsonb)
    into v_normalized
    from jsonb_array_elements(p_sources) with ordinality as t(e, ord);
  if g.source_refs is distinct from v_normalized then
    update public.guides set source_refs = v_normalized where id = g.id;
  end if;
  return kinnso_internal.guide_author_honesty_payload(g.id);
end $$;

-- ---------------------------------------------------------------------------
-- 3) Ops evidence: the two facts a creator cannot self-declare — the synthetic
--    classification and the place verification date. Ops-only (the RPC repeats
--    the is_active_ops() gate). A null argument means "leave alone"; the
--    explicit p_clear_place flag is needed to null the date because a missing
--    argument is also null. Only guides.synthetic/place_verified_at are
--    written; rights, sources, status and visibility are untouched. A command
--    that would set nothing is 'invalid_evidence'.
-- ---------------------------------------------------------------------------
create function public.kinnso_ops_set_evidence(
  p_guide_id uuid,
  p_synthetic boolean default null,
  p_place_verified_at date default null,
  p_clear_place boolean default false
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  g public.guides;
  v_place timestamptz;
  v_clear boolean := coalesce(p_clear_place, false);
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into g from public.guides where id = p_guide_id for update;
  if not found then raise exception 'guide_not_found'; end if;
  if v_clear and p_place_verified_at is not null then
    raise exception 'invalid_evidence'; end if;
  if p_synthetic is null and p_place_verified_at is null and not v_clear then
    raise exception 'invalid_evidence'; end if;
  -- A calendar date is stored as UTC midnight so the projection and both
  -- readers agree no matter which session timezone ops happens to use.
  v_place := case
    when v_clear then null
    when p_place_verified_at is not null then (p_place_verified_at::timestamp at time zone 'UTC')
    else g.place_verified_at end;
  if (p_synthetic is null or p_synthetic = g.synthetic)
    and v_place is not distinct from g.place_verified_at then
    return kinnso_internal.guide_author_honesty_payload(g.id);
  end if;
  update public.guides
    set synthetic = coalesce(p_synthetic, g.synthetic),
        place_verified_at = v_place
    where id = g.id;
  return kinnso_internal.guide_author_honesty_payload(g.id);
end $$;

-- ---------------------------------------------------------------------------
-- 4) Ops corpus: every published guide with its derived honesty status, ordered
--    by title. The limit is clamped to 1..200 rather than rejected so a caller
--    can never ask for an unbounded corpus or an empty page.
-- ---------------------------------------------------------------------------
create function public.kinnso_ops_published_guides(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_items jsonb;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(item order by sort_title, sort_id), '[]'::jsonb)
    into v_items
    from (
      select g.title as sort_title,
             g.id as sort_id,
             jsonb_build_object(
               'id', g.id,
               'title', g.title,
               'status', h->'status',
               'synthetic', h->'synthetic',
               'rightsBasis', h->'rightsBasis',
               'sourceCount', h->'sourceCount',
               'placeVerifiedAt', h->'placeVerifiedAt',
               'attestedAt', h->'attestedAt') as item
        from public.guides g
        cross join lateral (
          select kinnso_internal.guide_honesty_payload(g.id) as h) honesty
        where g.status = 'published'
        order by g.title, g.id
        limit v_limit) page;
  return jsonb_build_object('items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: revoke implicit PUBLIC/anon EXECUTE, then grant narrowly. No entry
-- point here is anon-callable and none of these functions adds a table grant or
-- exposes a new column outside the returned payloads.
-- ---------------------------------------------------------------------------
revoke all on function public.kinnso_creator_guide_honesty(uuid) from public, anon;
grant execute on function public.kinnso_creator_guide_honesty(uuid) to authenticated;
revoke all on function public.kinnso_guide_set_sources(uuid, jsonb) from public, anon;
grant execute on function public.kinnso_guide_set_sources(uuid, jsonb) to authenticated;
revoke all on function public.kinnso_ops_set_evidence(uuid, boolean, date, boolean) from public, anon;
grant execute on function public.kinnso_ops_set_evidence(uuid, boolean, date, boolean) to authenticated;
revoke all on function public.kinnso_ops_published_guides(integer) from public, anon;
grant execute on function public.kinnso_ops_published_guides(integer) to authenticated;
