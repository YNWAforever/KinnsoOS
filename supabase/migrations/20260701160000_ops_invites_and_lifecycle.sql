-- Phase 12B — kinnso_ops_invites table, is_active_ops_role() helper,
-- and all team lifecycle RPCs. is_active_ops() remains the gate for
-- requireOpsPage/requireOpsAction (switched in 12C).
--
-- ops_audit_log_append signature (from 20260628130000): (p_entity_type text,
-- p_entity_id uuid, p_action text, p_reason text default null, p_metadata jsonb
-- default '{}'). It has NO actor parameter — it derives the actor internally
-- from auth.uid() via kinnso_ops_members and raises 'forbidden' if none found.

-- ── Invites table ─────────────────────────────────────────────────────────
create table public.kinnso_ops_invites (
  id               uuid        primary key default gen_random_uuid(),
  email            text        not null,
  role             text        not null check (role in ('owner','admin','moderator','analyst')),
  token            text        not null unique default encode(gen_random_bytes(32), 'hex'),
  status           text        not null default 'pending'
                               check (status in ('pending','accepted','revoked','expired')),
  invited_by       uuid        not null references public.kinnso_ops_members(id),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid        references auth.users(id)
);

-- Ops members can read all invites via direct table query (used by getTeamOverview's
-- pending-invite count). The accept-invite flow does NOT need a table-level anon
-- policy — it goes entirely through the SECURITY DEFINER admin_accept_ops_invite RPC,
-- which bypasses RLS. An anon "read by token" policy would need `using (true)` (RLS
-- cannot express "only when queried by token"), which would let anon enumerate every
-- pending invite's email/role/token — so it is deliberately not added.
alter table public.kinnso_ops_invites enable row level security;
create policy "ops members read invites" on public.kinnso_ops_invites for select using (public.is_active_ops());

-- ── Role-rank helper ──────────────────────────────────────────────────────
create or replace function public.is_active_ops_role(p_min text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  rank_map constant jsonb := '{"analyst":1,"moderator":2,"admin":3,"owner":4}';
begin
  select role into v_role from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_role is null then return false; end if;
  return (rank_map ->> v_role)::int >= (rank_map ->> p_min)::int;
end $$;
revoke all on function public.is_active_ops_role(text) from public, anon;
grant execute on function public.is_active_ops_role(text) to authenticated;

-- ── Invite: create ────────────────────────────────────────────────────────
create or replace function public.admin_invite_ops_member(p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_invite_id uuid;
  v_token     text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email_required' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  insert into public.kinnso_ops_invites (email, role, invited_by)
    values (lower(trim(p_email)), p_role,
      (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'))
    returning id, token into v_invite_id, v_token;
  perform public.ops_audit_log_append('ops_invite', v_invite_id, 'invite.create',
    'invited ' || p_email || ' as ' || p_role, jsonb_build_object('email', p_email, 'role', p_role));
  return v_token;
end $$;
revoke all on function public.admin_invite_ops_member(text, text) from public, anon;
grant execute on function public.admin_invite_ops_member(text, text) to authenticated;

-- ── Invite: revoke ────────────────────────────────────────────────────────
create or replace function public.admin_revoke_ops_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.kinnso_ops_invites
    set status = 'revoked'
    where id = p_invite_id and status = 'pending'
    returning email into v_email;
  if v_email is null then
    raise exception 'not_found_or_not_pending' using errcode = '22000';
  end if;
  perform public.ops_audit_log_append('ops_invite', p_invite_id, 'invite.revoke',
    'revoked invite for ' || v_email, jsonb_build_object('email', v_email));
end $$;
revoke all on function public.admin_revoke_ops_invite(uuid) from public, anon;
grant execute on function public.admin_revoke_ops_invite(uuid) to authenticated;

-- ── Invite: accept ────────────────────────────────────────────────────────
-- Public (authenticated user). Email must match auth.email(). Inserts member row.
create or replace function public.admin_accept_ops_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite kinnso_ops_invites%rowtype;
  v_email  text;
  v_uid    uuid;
  v_name   text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  v_email := lower(trim(auth.email()));
  select * into v_invite from public.kinnso_ops_invites where token = p_token;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite_%', v_invite.status using errcode = '22000';
  end if;
  if v_invite.expires_at < now() then
    update public.kinnso_ops_invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite_expired' using errcode = '22000';
  end if;
  if lower(v_invite.email) <> v_email then
    raise exception 'email_mismatch' using errcode = '42501';
  end if;
  -- Derive a display name from the auth user's email (pre-@ portion).
  v_name := split_part(v_email, '@', 1);
  insert into public.kinnso_ops_members (user_id, display_name, role, status)
    values (v_uid, v_name, v_invite.role, 'active');
  update public.kinnso_ops_invites
    set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
    where id = v_invite.id;
end $$;
revoke all on function public.admin_accept_ops_invite(text) from public, anon;
grant execute on function public.admin_accept_ops_invite(text) to authenticated;

-- ── Member: set role ──────────────────────────────────────────────────────
create or replace function public.admin_set_ops_member_role(p_member_id uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id   uuid;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;
  -- Last-owner guard: prevent demoting if this is the only active owner.
  if p_role <> 'owner' then
    select count(*) into v_owner_count from public.kinnso_ops_members
      where role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      select count(*) into v_owner_count from public.kinnso_ops_members
        where id = p_member_id and role = 'owner' and status = 'active';
      if v_owner_count = 1 then
        raise exception 'last_owner' using errcode = '42501';
      end if;
    end if;
  end if;
  update public.kinnso_ops_members set role = p_role
    where id = p_member_id;
  if not found then raise exception 'not_found' using errcode = '22000'; end if;
  perform public.ops_audit_log_append('ops_member', p_member_id, 'role.set', trim(p_reason),
    jsonb_build_object('role', p_role));
end $$;
revoke all on function public.admin_set_ops_member_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_ops_member_role(uuid, text, text) to authenticated;

-- ── Member: suspend ───────────────────────────────────────────────────────
create or replace function public.admin_suspend_ops_member(p_member_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id   uuid;
  v_owner_count int;
  v_target_role text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_suspend' using errcode = '42501';
  end if;
  -- Last-owner guard.
  select role into v_target_role from public.kinnso_ops_members
    where id = p_member_id and status = 'active';
  if v_target_role = 'owner' then
    select count(*) into v_owner_count from public.kinnso_ops_members
      where role = 'owner' and status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members set status = 'suspended'
    where id = p_member_id and status = 'active';
  if not found then raise exception 'not_found_or_not_active' using errcode = '22000'; end if;
  perform public.ops_audit_log_append('ops_member', p_member_id, 'status.suspended', trim(p_reason), '{}'::jsonb);
end $$;
revoke all on function public.admin_suspend_ops_member(uuid, text) from public, anon;
grant execute on function public.admin_suspend_ops_member(uuid, text) to authenticated;

-- ── Member: reactivate ────────────────────────────────────────────────────
create or replace function public.admin_reactivate_ops_member(p_member_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller_id uuid; begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  select id into v_caller_id from public.kinnso_ops_members
    where user_id = auth.uid() and status = 'active';
  update public.kinnso_ops_members set status = 'active'
    where id = p_member_id and status = 'suspended';
  if not found then raise exception 'not_found_or_not_suspended' using errcode = '22000'; end if;
  perform public.ops_audit_log_append('ops_member', p_member_id, 'status.active', trim(p_reason), '{}'::jsonb);
end $$;
revoke all on function public.admin_reactivate_ops_member(uuid, text) from public, anon;
grant execute on function public.admin_reactivate_ops_member(uuid, text) to authenticated;
