-- Phase 6C hardening (post-review): make admin_set_user_status's no-lockout guard
-- concurrency-safe and stop it from silently succeeding on a 0-row update.
--   1. FOR UPDATE lock on the active-ops rows before the last-ops count, so two
--      concurrent suspends of the last two ops serialize instead of both passing the
--      guard (which would leave zero active ops → full admin lockout).
--   2. raise 'not_found' when the UPDATE matches no row (wrong id/kind or a deleted
--      user), so the action can't report a status change the DB never made.
-- Same signature + RETURNS void → no type regeneration.
create or replace function public.admin_set_user_status(p_kind text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'bad_status'; end if;
  if p_kind = 'creator' then
    update public.creators set status = p_status where id = p_id;
    if not found then raise exception 'not_found'; end if;
  elsif p_kind = 'merchant' then
    update public.merchant_profiles set status = p_status where id = p_id;
    if not found then raise exception 'not_found'; end if;
  elsif p_kind = 'ops' then
    if p_status = 'suspended' then
      -- Serialize concurrent suspends: lock the active-ops rows so the count below
      -- can't race with another suspend committing between our read and write.
      perform 1 from public.kinnso_ops_members where status = 'active' for update;
      if (select user_id from public.kinnso_ops_members where id = p_id) = auth.uid()
        then raise exception 'cannot_suspend_self'; end if;
      if (select count(*) from public.kinnso_ops_members where status = 'active') <= 1
        then raise exception 'last_active_ops'; end if;
    end if;
    update public.kinnso_ops_members set status = p_status where id = p_id;
    if not found then raise exception 'not_found'; end if;
  else raise exception 'bad_kind'; end if;
end $$;
revoke all on function public.admin_set_user_status(text, uuid, text) from public, anon;
grant execute on function public.admin_set_user_status(text, uuid, text) to authenticated;
