-- Launch decision control plane.
--
-- The launch gate has been tracked in documents and chat decisions. This makes it
-- data: operations record an explicit sign-off (accepted or waived, with a note)
-- per human gate, and the product computes the verdict from live facts plus those
-- decisions. Sign-offs are append-only; the latest row per gate wins, so the
-- decision history survives every change of mind and is never rewritten.
create table if not exists kinnso_internal.launch_signoffs (
  id uuid primary key default gen_random_uuid(),
  gate text not null check (gate in ('rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments')),
  status text not null check (status in ('accepted', 'waived', 'rejected')),
  note text not null check (char_length(btrim(note)) between 20 and 2000),
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists launch_signoffs_gate_created_idx
  on kinnso_internal.launch_signoffs (gate, created_at desc);
alter table kinnso_internal.launch_signoffs enable row level security;
revoke all on kinnso_internal.launch_signoffs from public, anon, authenticated, service_role;

create function public.kinnso_ops_launch_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
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
        'actorId', actor_id, 'signedAt', created_at) as latest
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

create function public.kinnso_ops_sign_off(p_gate text, p_status text, p_note text) returns jsonb
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
  insert into kinnso_internal.launch_signoffs (gate, status, note, actor_id)
    values (p_gate, p_status, v_note, v_actor);
  return public.kinnso_ops_launch_state();
end $$;

revoke all on function public.kinnso_ops_launch_state() from public, anon;
revoke all on function public.kinnso_ops_sign_off(text, text, text) from public, anon;
grant execute on function public.kinnso_ops_launch_state() to authenticated;
grant execute on function public.kinnso_ops_sign_off(text, text, text) to authenticated;
