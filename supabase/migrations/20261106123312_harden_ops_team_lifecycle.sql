-- Operations invitations and member updates must be safe to retry after an
-- unknown network response. The original RPCs created a second invite, emitted
-- duplicate audit rows for unchanged roles, or raised a terminal error after a
-- state-changing request had already committed.

-- One actionable invite per email. Historical revoked/accepted/expired rows
-- remain intact. This intentionally fails if an existing environment contains
-- duplicate pending invites rather than silently revoking one of them.
create unique index if not exists kinnso_ops_invites_one_pending_email
  on public.kinnso_ops_invites (lower(email))
  where status = 'pending';

-- RLS restricts rows to active operations members, but PostgreSQL still
-- requires the table privilege for the authenticated role.
grant select on public.kinnso_ops_invites to authenticated;

create or replace function public.admin_invite_ops_member(p_email text, p_role text)
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
end $$;

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
  if v_status = 'revoked' then
    return;
  end if;
  if v_status <> 'pending' then
    raise exception 'not_found_or_not_pending' using errcode = '22000';
  end if;
  update public.kinnso_ops_invites
     set status = 'revoked'
   where id = p_invite_id;
  perform public.ops_audit_log_append(
    'ops_invite',
    p_invite_id,
    'invite.revoke',
    'revoked invite for ' || v_email,
    jsonb_build_object('email', v_email)
  );
end $$;

create or replace function public.admin_set_ops_member_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_current_role text;
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
  select m.id into v_caller_id
    from public.kinnso_ops_members m
   where m.user_id = auth.uid()
     and m.status = 'active';
  if v_caller_id = p_member_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;
  select m.role into v_current_role
    from public.kinnso_ops_members m
   where m.id = p_member_id
   for update;
  if not found then
    raise exception 'not_found' using errcode = '22000';
  end if;
  if v_current_role = p_role then return; end if;
  if p_role <> 'owner' and v_current_role = 'owner' then
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
end $$;

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
end $$;

create or replace function public.admin_reactivate_ops_member(
  p_member_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_current_status text; begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22000';
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
end $$;

revoke all on function public.admin_invite_ops_member(text, text) from public, anon;
revoke all on function public.admin_revoke_ops_invite(uuid) from public, anon;
revoke all on function public.admin_set_ops_member_role(uuid, text, text) from public, anon;
revoke all on function public.admin_suspend_ops_member(uuid, text) from public, anon;
revoke all on function public.admin_reactivate_ops_member(uuid, text) from public, anon;
grant execute on function public.admin_invite_ops_member(text, text) to authenticated;
grant execute on function public.admin_revoke_ops_invite(uuid) to authenticated;
grant execute on function public.admin_set_ops_member_role(uuid, text, text) to authenticated;
grant execute on function public.admin_suspend_ops_member(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_ops_member(uuid, text) to authenticated;
