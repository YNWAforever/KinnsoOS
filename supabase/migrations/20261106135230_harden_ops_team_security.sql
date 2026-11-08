-- Close the remaining operations-team authorization and concurrency gaps.
-- This migration is candidate-only until the production envelope is separately
-- reviewed and approved.

-- Operations helpers must validate the current Auth session, not merely trust
-- an unexpired JWT. This also protects RLS evaluated through authenticated
-- table access and every SECURITY DEFINER lifecycle RPC.
create or replace function public.is_active_ops()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  return exists (
    select 1
      from public.kinnso_ops_members m
     where m.user_id = v_actor
       and m.status = 'active'
  );
end
$$;

create or replace function public.is_active_ops_role(p_min text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_role text;
  rank_map constant jsonb := '{"analyst":1,"moderator":2,"admin":3,"owner":4}';
begin
  select m.role into v_role
    from public.kinnso_ops_members m
   where m.user_id = v_actor
     and m.status = 'active';
  if v_role is null or rank_map ->> v_role is null or rank_map ->> p_min is null then
    return false;
  end if;
  return (rank_map ->> v_role)::int >= (rank_map ->> p_min)::int;
end
$$;

revoke all on function public.is_active_ops() from public, anon;
revoke all on function public.is_active_ops_role(text) from public, anon;
grant execute on function public.is_active_ops() to authenticated;
grant execute on function public.is_active_ops_role(text) to authenticated;

-- Audit insertion is an internal primitive. Lifecycle RPCs call it inside
-- their own SECURITY DEFINER transactions; no client role may forge rows.
create or replace function public.ops_audit_log_append(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor_user uuid := kinnso_internal.actor();
  v_actor_member uuid;
  v_id uuid;
begin
  select m.id into v_actor_member
    from public.kinnso_ops_members m
   where m.user_id = v_actor_user
     and m.status = 'active';
  if v_actor_member is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.ops_audit_log
    (actor_ops_member_id, entity_type, entity_id, action, reason, metadata)
  values
    (v_actor_member, p_entity_type, p_entity_id, p_action, p_reason,
     coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.ops_audit_log_append(text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- The generic legacy status RPC must never mutate operations membership.
-- Use admin_suspend_ops_member/admin_reactivate_ops_member instead so the
-- owner invariant and audit trail cannot be bypassed.
create or replace function public.admin_set_user_status(
  p_kind text,
  p_id uuid,
  p_status text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended') then
    raise exception 'bad_status';
  end if;
  if p_kind = 'ops' then
    raise exception 'use_ops_lifecycle_rpc' using errcode = '42501';
  elsif p_kind = 'creator' then
    update public.creators set status = p_status where id = p_id;
    if not found then raise exception 'not_found'; end if;
  elsif p_kind = 'merchant' then
    update public.merchant_profiles set status = p_status where id = p_id;
    if not found then raise exception 'not_found'; end if;
  else
    raise exception 'bad_kind';
  end if;
end
$$;

revoke all on function public.admin_set_user_status(text, uuid, text)
  from public, anon;
grant execute on function public.admin_set_user_status(text, uuid, text)
  to authenticated;

-- Every owner-changing transition uses the same transaction lock. The target
-- row lock alone is insufficient when two owners modify one another.
create or replace function public.admin_set_ops_member_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_current_role text;
  v_current_status text;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kinnso_ops_owner_invariant', 0)
  );
  select m.id into v_caller_id
    from public.kinnso_ops_members m
   where m.user_id = auth.uid()
     and m.status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;
  select m.role, m.status into v_current_role, v_current_status
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_role = p_role then return; end if;
  if p_role <> 'owner' and v_current_role = 'owner' and v_current_status = 'active' then
    select count(*) into v_owner_count
      from public.kinnso_ops_members m
     where m.role = 'owner'
       and m.status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members
     set role = p_role
   where id = p_member_id;
  perform public.ops_audit_log_append(
    'ops_member',
    p_member_id,
    'role.set',
    trim(p_reason),
    jsonb_build_object('from', v_current_role, 'to', p_role)
  );
end
$$;

create or replace function public.admin_suspend_ops_member(
  p_member_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_current_status text;
  v_current_role text;
  v_owner_count int;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long' using errcode = '22000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kinnso_ops_owner_invariant', 0)
  );
  select m.id into v_caller_id
    from public.kinnso_ops_members m
   where m.user_id = auth.uid()
     and m.status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_suspend' using errcode = '42501';
  end if;
  select m.status, m.role into v_current_status, v_current_role
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_status = 'suspended' then return; end if;
  if v_current_status <> 'active' then
    raise exception 'not_found_or_not_active' using errcode = '22000';
  end if;
  if v_current_role = 'owner' then
    select count(*) into v_owner_count
      from public.kinnso_ops_members m
     where m.role = 'owner'
       and m.status = 'active';
    if v_owner_count <= 1 then
      raise exception 'last_owner' using errcode = '42501';
    end if;
  end if;
  update public.kinnso_ops_members
     set status = 'suspended'
   where id = p_member_id;
  perform public.ops_audit_log_append(
    'ops_member',
    p_member_id,
    'status.suspended',
    trim(p_reason),
    '{}'::jsonb
  );
end
$$;

create or replace function public.admin_reactivate_ops_member(
  p_member_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current_status text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
  end if;
  if length(trim(p_reason)) > 500 then
    raise exception 'reason_too_long' using errcode = '22000';
  end if;
  select m.status into v_current_status
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_status = 'active' then return; end if;
  if v_current_status <> 'suspended' then
    raise exception 'not_found_or_not_suspended' using errcode = '22000';
  end if;
  update public.kinnso_ops_members
     set status = 'active'
   where id = p_member_id;
  perform public.ops_audit_log_append(
    'ops_member',
    p_member_id,
    'status.active',
    trim(p_reason),
    '{}'::jsonb
  );
end
$$;

create or replace function public.admin_invite_ops_member(
  p_email text,
  p_role text
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
  v_existing_id uuid;
  v_existing_token text;
  v_existing_role text;
  v_token text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'email_required' using errcode = '22000';
  end if;
  if length(v_email) > 254 then
    raise exception 'email_too_long' using errcode = '22000';
  end if;
  if p_role not in ('owner','admin','moderator','analyst') then
    raise exception 'bad_role' using errcode = '22000';
  end if;
  if exists (
    select 1
      from public.kinnso_ops_members m
      join auth.users u on u.id = m.user_id
     where lower(u.email) = v_email
       and m.status = 'active'
  ) then
    raise exception 'already_ops_member' using errcode = '23505';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_email, 0)
  );
  update public.kinnso_ops_invites i
     set status = 'expired'
   where lower(i.email) = v_email
     and i.status = 'pending'
     and i.expires_at <= now();
  select i.id, i.token, i.role
    into v_existing_id, v_existing_token, v_existing_role
    from public.kinnso_ops_invites i
   where lower(i.email) = v_email
     and i.status = 'pending'
   for update;
  if found then
    if v_existing_role <> p_role then
      raise exception 'pending_invite_conflict' using errcode = '23505';
    end if;
    return v_existing_token;
  end if;

  insert into public.kinnso_ops_invites (email, role, invited_by)
  values (
    v_email,
    p_role,
    (select m.id
       from public.kinnso_ops_members m
      where m.user_id = auth.uid()
        and m.status = 'active')
  )
  returning id, token into v_invite_id, v_token;

  perform public.ops_audit_log_append(
    'ops_invite',
    v_invite_id,
    'invite.create',
    'invited ' || v_email || ' as ' || p_role,
    jsonb_build_object('email', v_email, 'role', p_role)
  );
  return v_token;
end
$$;

create or replace function public.admin_revoke_ops_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_status text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select i.email, i.status into v_email, v_status
    from public.kinnso_ops_invites i
   where i.id = p_invite_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_status = 'revoked' then return; end if;
  if v_status <> 'pending' then
    raise exception 'not_found_or_not_pending' using errcode = '22000';
  end if;
  update public.kinnso_ops_invites
     set status = 'revoked'
   where id = p_invite_id
     and status = 'pending';
  perform public.ops_audit_log_append(
    'ops_invite',
    p_invite_id,
    'invite.revoke',
    'revoked invite for ' || v_email,
    jsonb_build_object('email', v_email)
  );
end
$$;

-- Acceptance locks the exact invite before examining state. Revocation and
-- acceptance therefore serialize; a revoked or expired token can never create
-- membership after the owner decision commits.
create or replace function public.admin_accept_ops_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invite public.kinnso_ops_invites%rowtype;
  v_uid uuid;
  v_email text;
  v_confirmed_at timestamptz;
  v_name text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'not_found' using errcode = '22000';
  end if;
  v_uid := kinnso_internal.actor();
  select lower(trim(u.email)), u.email_confirmed_at
    into v_email, v_confirmed_at
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'email_unverified' using errcode = '42501';
  end if;

  select i.* into v_invite
    from public.kinnso_ops_invites i
   where i.token = p_token
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if lower(v_invite.email) <> v_email then
    raise exception 'email_mismatch' using errcode = '42501';
  end if;
  if v_invite.status = 'accepted' and v_invite.accepted_user_id = v_uid then
    return;
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite_%', v_invite.status using errcode = '22000';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = '22000';
  end if;
  if exists (
    select 1 from public.kinnso_ops_members m where m.user_id = v_uid
  ) then
    raise exception 'already_ops_member' using errcode = '23505';
  end if;

  v_name := split_part(v_email, '@', 1);
  insert into public.kinnso_ops_members (user_id, display_name, role, status)
  values (v_uid, v_name, v_invite.role, 'active');
  update public.kinnso_ops_invites
     set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
   where id = v_invite.id
     and status = 'pending'
     and expires_at > now();
  if not found then
    raise exception 'invite_not_pending' using errcode = '22000';
  end if;
  perform public.ops_audit_log_append(
    'ops_invite',
    v_invite.id,
    'invite.accept',
    'accepted invite for ' || v_email,
    jsonb_build_object('email', v_email, 'role', v_invite.role)
  );
end
$$;

-- Tokens remain available only to the SECURITY DEFINER invite/accept RPCs.
-- Direct Data API reads may list safe invitation metadata, never the secret.
revoke all on public.kinnso_ops_invites from public, anon, authenticated;
grant select (id, email, role, status, invited_by, created_at, expires_at,
  accepted_at, accepted_user_id)
  on public.kinnso_ops_invites to authenticated;

revoke all on function public.admin_invite_ops_member(text, text)
  from public, anon;
revoke all on function public.admin_revoke_ops_invite(uuid)
  from public, anon;
revoke all on function public.admin_accept_ops_invite(text)
  from public, anon;
revoke all on function public.admin_set_ops_member_role(uuid, text, text)
  from public, anon;
revoke all on function public.admin_suspend_ops_member(uuid, text)
  from public, anon;
revoke all on function public.admin_reactivate_ops_member(uuid, text)
  from public, anon;
grant execute on function public.admin_invite_ops_member(text, text)
  to authenticated;
grant execute on function public.admin_revoke_ops_invite(uuid)
  to authenticated;
grant execute on function public.admin_accept_ops_invite(text)
  to authenticated;
grant execute on function public.admin_set_ops_member_role(uuid, text, text)
  to authenticated;
grant execute on function public.admin_suspend_ops_member(uuid, text)
  to authenticated;
grant execute on function public.admin_reactivate_ops_member(uuid, text)
  to authenticated;
