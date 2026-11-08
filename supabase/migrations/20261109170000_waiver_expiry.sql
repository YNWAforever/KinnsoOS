-- Waiver expiry: a waiver must say when it will be reviewed, and an expired waiver
-- blocks the launch again. Phase 4 exit requires "no stale waivers", which is only
-- meaningful if waivers carry an expiry and the verdict notices when it passes.
alter table kinnso_internal.launch_signoffs
  add column if not exists expires_at timestamptz;

comment on column kinnso_internal.launch_signoffs.expires_at is
  'Waivers must be reviewed by this date; an expired waiver blocks the launch again.';

create or replace function public.kinnso_ops_launch_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_published integer; v_synthetic integer; v_unverified integer; v_verified integer;
  v_signoffs jsonb;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;

  select count(*) filter (where status = 'published'),
         count(*) filter (where status = 'published' and synthetic),
         count(*) filter (where status = 'published' and not synthetic and not exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)),
         count(*) filter (where status = 'published' and not synthetic and exists (
           select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = g.id)
           and jsonb_array_length(g.source_refs) > 0 and g.place_verified_at is not null)
    into v_published, v_synthetic, v_unverified, v_verified
    from public.guides g;

  select coalesce(jsonb_object_agg(gate, latest), '{}'::jsonb) into v_signoffs
    from (
      select distinct on (gate) gate, jsonb_build_object(
        'gate', gate, 'status', status, 'note', note,
        'actorId', actor_id, 'signedAt', created_at,
        'expiresAt', expires_at,
        'stale', status = 'waived' and (expires_at is null or expires_at < now())
      ) as latest
      from kinnso_internal.launch_signoffs
      order by gate, created_at desc
    ) rows;

  return jsonb_build_object(
    'content', jsonb_build_object(
      'published', v_published, 'synthetic', v_synthetic,
      'unverified', v_unverified, 'verified', v_verified,
      'ready', v_published > 0 and v_verified > 0 and v_unverified = 0 and v_synthetic = 0),
    'signoffs', v_signoffs);
end $$;

drop function if exists public.kinnso_ops_sign_off(text, text, text);

create function public.kinnso_ops_sign_off(p_gate text, p_status text, p_note text, p_expires_at date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_gate is null or p_gate not in ('rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments') then
    raise exception 'invalid_gate';
  end if;
  if p_status is null or p_status not in ('accepted', 'waived', 'rejected') then
    raise exception 'invalid_status';
  end if;
  if char_length(v_note) < 20 or char_length(v_note) > 2000 then
    raise exception 'invalid_note';
  end if;
  if p_status = 'waived' then
    if p_expires_at is null then raise exception 'expiry_required'; end if;
    if p_expires_at <= current_date then raise exception 'expiry_in_past'; end if;
    if p_expires_at > current_date + 90 then raise exception 'expiry_too_far'; end if;
  elsif p_expires_at is not null and p_expires_at <= current_date then
    raise exception 'expiry_in_past';
  end if;
  insert into kinnso_internal.launch_signoffs (gate, status, note, actor_id, expires_at)
    values (p_gate, p_status, v_note, v_actor,
      case when p_expires_at is null then null else (p_expires_at::timestamp at time zone 'UTC') end);
  return public.kinnso_ops_launch_state();
end $$;

revoke all on function public.kinnso_ops_launch_state() from public, anon;
revoke all on function public.kinnso_ops_sign_off(text, text, text, date) from public, anon;
grant execute on function public.kinnso_ops_launch_state() to authenticated;
grant execute on function public.kinnso_ops_sign_off(text, text, text, date) to authenticated;
