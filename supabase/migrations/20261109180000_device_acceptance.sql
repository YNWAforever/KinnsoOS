-- L4 device and assistive-tech acceptance, recorded per surface.
--
-- A single "devices accepted" checkbox cannot represent six surfaces across four
-- platforms, and it gives the owner nothing to point at. This records one outcome
-- per surface × platform with a mandatory evidence note, append-only (latest row
-- per cell wins), and the launch gate only counts the matrix when every required
-- cell has a passing record. Waiving the gate remains possible through the
-- existing dated waiver sign-off.
create table if not exists kinnso_internal.device_acceptance (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('public_site', 'guide_reader', 'account', 'studio_editor', 'spaces_chat', 'ops_pages')),
  platform text not null check (platform in ('ios_safari', 'android_chrome', 'voiceover', 'nvda')),
  outcome text not null check (outcome in ('pass', 'fail')),
  note text not null check (char_length(btrim(note)) between 20 and 1000),
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists device_acceptance_cell_idx
  on kinnso_internal.device_acceptance (surface, platform, created_at desc);
alter table kinnso_internal.device_acceptance enable row level security;
revoke all on kinnso_internal.device_acceptance from public, anon, authenticated, service_role;

create function public.kinnso_ops_device_acceptance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cells jsonb;
  v_passed integer;
  v_failed integer;
  v_total integer;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;

  with latest as (
    select distinct on (surface, platform) surface, platform, outcome, note, created_at, actor_id
      from kinnso_internal.device_acceptance
     order by surface, platform, created_at desc
  ), grid as (
    select s.surface, p.platform, l.outcome, l.note, l.created_at
      from unnest(array['public_site','guide_reader','account','studio_editor','spaces_chat','ops_pages']) as s(surface)
     cross join unnest(array['ios_safari','android_chrome','voiceover','nvda']) as p(platform)
      left join latest l on l.surface = s.surface and l.platform = p.platform
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'surface', surface, 'platform', platform,
           'outcome', coalesce(outcome, 'pending'), 'note', note, 'recordedAt', created_at)
         order by surface, platform), '[]'::jsonb),
         count(*) filter (where outcome = 'pass'),
         count(*) filter (where outcome = 'fail'),
         count(*)
    into v_cells, v_passed, v_failed, v_total
    from grid;

  return jsonb_build_object(
    'cells', v_cells,
    'total', v_total,
    'passed', v_passed,
    'failed', v_failed,
    'complete', v_passed = v_total);
end $$;

create function public.kinnso_ops_record_device_acceptance(p_surface text, p_platform text, p_outcome text, p_note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_surface is null or p_surface not in ('public_site', 'guide_reader', 'account', 'studio_editor', 'spaces_chat', 'ops_pages') then
    raise exception 'invalid_surface';
  end if;
  if p_platform is null or p_platform not in ('ios_safari', 'android_chrome', 'voiceover', 'nvda') then
    raise exception 'invalid_platform';
  end if;
  if p_outcome is null or p_outcome not in ('pass', 'fail') then
    raise exception 'invalid_outcome';
  end if;
  if char_length(v_note) < 20 or char_length(v_note) > 1000 then
    raise exception 'invalid_note';
  end if;
  insert into kinnso_internal.device_acceptance (surface, platform, outcome, note, actor_id)
    values (p_surface, p_platform, p_outcome, v_note, v_actor);
  return public.kinnso_ops_device_acceptance();
end $$;

revoke all on function public.kinnso_ops_device_acceptance() from public, anon;
revoke all on function public.kinnso_ops_record_device_acceptance(text, text, text, text) from public, anon;
grant execute on function public.kinnso_ops_device_acceptance() to authenticated;
grant execute on function public.kinnso_ops_record_device_acceptance(text, text, text, text) to authenticated;
