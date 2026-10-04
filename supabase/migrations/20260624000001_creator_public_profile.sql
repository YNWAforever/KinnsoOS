-- Phase 3: real creator directory.
-- Enrich `creators` with a PUBLIC, denormalized projection so anon can read a
-- curated profile (handle/bio/qualitative DNA + platform presence) WITHOUT ever
-- exposing the private creator_dna blob (follower counts, avg engagement).
-- A SECURITY DEFINER trigger on creator_dna keeps the projection in sync on
-- publish; handles are minted once and stable. Mirrors guides public-read +
-- grant conventions (20260619000001).

-- 1. Columns
alter table public.creators add column if not exists handle text unique;
alter table public.creators add column if not exists bio text;
alter table public.creators add column if not exists public_profile jsonb;

-- 2. slugify helper: lowercase, non-alphanumeric -> '-', collapse/trim dashes.
create or replace function public.slugify(input text)
returns text language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'creator'
  );
$$;

-- 3. Curated public projection from a DNA `final` blob (DRY: trigger + backfill).
create or replace function public.creator_public_profile_json(p_final jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'niches',           coalesce(p_final->'niches', '[]'::jsonb),
    'content_pillars',  coalesce(p_final->'content_pillars', '[]'::jsonb),
    'tone',             coalesce(p_final->'tone', '[]'::jsonb),
    'audience_geos',    coalesce(p_final->'audience'->'top_geos', '[]'::jsonb),
    'audience_locales', coalesce(p_final->'audience'->'top_locales', '[]'::jsonb),
    'languages',        coalesce(p_final->'languages', '[]'::jsonb),
    'platforms',        coalesce(
      (select jsonb_agg(jsonb_build_object(
                'platform', p->>'platform',
                'verified', coalesce((p->>'verified')::boolean, false)))
       from jsonb_array_elements(coalesce(p_final->'platforms', '[]'::jsonb)) as p),
      '[]'::jsonb)
  );
$$;

-- 4. Sync handle + projection on DNA publish.
create or replace function public.sync_creator_public_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_base text;
  v_handle text;
  v_existing text;
  v_n int := 1;
begin
  if new.status <> 'published' or new.final is null then
    return new;
  end if;

  select display_name, handle into v_name, v_existing
  from public.creators where id = new.creator_id;

  if v_existing is null then
    v_base := public.slugify(v_name);
    v_handle := v_base;
    while exists (select 1 from public.creators where handle = v_handle and id <> new.creator_id) loop
      v_n := v_n + 1;
      v_handle := v_base || '-' || v_n;
    end loop;
  else
    v_handle := v_existing;
  end if;

  update public.creators
  set handle = v_handle,
      bio = new.final->>'bio',
      public_profile = public.creator_public_profile_json(new.final)
  where id = new.creator_id;

  return new;
end;
$$;

create trigger creator_dna_sync_public_profile
  after insert or update on public.creator_dna
  for each row execute procedure public.sync_creator_public_profile();

-- 5. Public read of discoverable creators (anon + all roles).
create policy "creators_public_read" on public.creators
  for select using (
    status = 'active' and handle is not null and public_profile is not null
  );

-- 6. Grant anon SELECT (RLS gates rows; every column here is public-safe —
--    no follower data lives on this table). Mirrors guides grant style.
grant select on public.creators to anon;

-- 7. Backfill existing active creators that already published DNA. Loop so
--    handle de-dup is correct even with duplicate display names.
do $$
declare
  r record;
  v_base text;
  v_handle text;
  v_n int;
begin
  for r in
    select c.id, c.display_name, d.final
    from public.creators c
    join public.creator_dna d on d.creator_id = c.id
    where c.status = 'active' and d.status = 'published'
      and d.final is not null and c.handle is null
  loop
    v_base := public.slugify(r.display_name);
    v_handle := v_base; v_n := 1;
    while exists (select 1 from public.creators where handle = v_handle) loop
      v_n := v_n + 1; v_handle := v_base || '-' || v_n;
    end loop;
    update public.creators
    set handle = v_handle,
        bio = r.final->>'bio',
        public_profile = public.creator_public_profile_json(r.final)
    where id = r.id;
  end loop;
end $$;
