-- Phase 6C — Users module. Ops manage creators/merchants/ops via SECURITY DEFINER
-- functions gated on is_active_ops() (existing helper — do NOT redefine).
-- v1 = view + activate/suspend only (no role granting).

-- 1. Allow a 'suspended' status on each user table. The existing enums had no "off"
--    value matching the spec's active/suspended vocabulary, so extend the CHECK
--    constraints (idempotent drop+add). is_active_ops()/resolveViewerRole already
--    require status='active', so a suspended ops loses access (hence the last-ops guard).
alter table public.creators drop constraint if exists creators_status_check;
alter table public.creators add constraint creators_status_check
  check (status in ('onboarding','active','suspended'));

alter table public.merchant_profiles drop constraint if exists merchant_profiles_status_check;
alter table public.merchant_profiles add constraint merchant_profiles_status_check
  check (status in ('active','paused','archived','suspended'));

alter table public.kinnso_ops_members drop constraint if exists kinnso_ops_members_status_check;
alter table public.kinnso_ops_members add constraint kinnso_ops_members_status_check
  check (status in ('active','paused','suspended'));

-- 2. Ops-only readers. SECURITY DEFINER (bypass owner-scoped RLS) but gated on
--    is_active_ops() internally; a non-ops caller is rejected at the DB boundary.
--    NOTE: table aliased + columns qualified (c.id …) so the OUT params don't collide
--    with the source columns (an unqualified `select id …` raises "ambiguous column").
create or replace function public.admin_list_creators()
returns table (id uuid, display_name text, handle text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.id, c.display_name, c.handle, c.status, c.created_at
    from public.creators c order by c.created_at desc;
end $$;

create or replace function public.admin_list_merchants()
returns table (id uuid, company_name text, contact_email text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select m.id, m.company_name, m.contact_email, m.status, m.created_at
    from public.merchant_profiles m order by m.created_at desc;
end $$;

create or replace function public.admin_list_ops()
returns table (id uuid, user_id uuid, display_name text, status text, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select o.id, o.user_id, o.display_name, o.status, o.created_at
    from public.kinnso_ops_members o order by o.created_at desc;
end $$;

-- 3. Status setter with no-lockout guards (ops can't suspend self or the last active ops).
create or replace function public.admin_set_user_status(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  if p_kind = 'creator' then
    update public.creators set status = p_status where id = p_id;
  elsif p_kind = 'merchant' then
    update public.merchant_profiles set status = p_status where id = p_id;
  elsif p_kind = 'ops' then
    if p_status = 'suspended' then
      if (select user_id from public.kinnso_ops_members where id = p_id) = auth.uid()
        then raise exception 'cannot_suspend_self'; end if;
      if (select count(*) from public.kinnso_ops_members where status = 'active') <= 1
        then raise exception 'last_active_ops'; end if;
    end if;
    update public.kinnso_ops_members set status = p_status where id = p_id;
  else raise exception 'bad_kind'; end if;
end $$;

-- 4. Grants: revoke the implicit public+anon EXECUTE (Supabase default privileges
--    re-grant anon), then grant only to authenticated. is_active_ops() is the real gate.
revoke all on function public.admin_list_creators() from public, anon;
revoke all on function public.admin_list_merchants() from public, anon;
revoke all on function public.admin_list_ops() from public, anon;
revoke all on function public.admin_set_user_status(text, uuid, text) from public, anon;
grant execute on function public.admin_list_creators() to authenticated;
grant execute on function public.admin_list_merchants() to authenticated;
grant execute on function public.admin_list_ops() to authenticated;
grant execute on function public.admin_set_user_status(text, uuid, text) to authenticated;
