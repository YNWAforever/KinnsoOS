-- Phase 12A — Add role column to kinnso_ops_members and a SECURITY DEFINER read helper.
-- Backfills all existing active members as 'owner' so the team is not left without an owner.
-- is_active_ops() remains the page/action gate throughout 12A; role enforcement is 12C.

alter table public.kinnso_ops_members
  add column role text not null default 'analyst'
  check (role in ('owner', 'admin', 'moderator', 'analyst'));

-- Every existing active member becomes an owner; suspended/inactive members get the default 'analyst'.
update public.kinnso_ops_members set role = 'owner' where status = 'active';

-- Read helper: returns all ops members as a jsonb array.
-- Used by the Team Overview and Directory. Returns [] when the table is empty.
create or replace function public.admin_list_ops_members()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id',           m.id,
        'display_name', m.display_name,
        'user_id',      m.user_id,
        'role',         m.role,
        'status',       m.status,
        'joined_at',    m.created_at)
      order by m.created_at asc)
    from public.kinnso_ops_members m
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_list_ops_members() from public, anon;
grant execute on function public.admin_list_ops_members() to authenticated;
