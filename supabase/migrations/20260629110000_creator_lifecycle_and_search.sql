-- Phase 10B — Creators lifecycle (add terminal 'banned' + independent 'verified'),
-- moderation write RPCs, and a filtered/keyset-paginated search RPC. All writes are
-- SECURITY DEFINER, gated on is_active_ops(), require a reason, and append an
-- ops_audit_log row (entity_type='creator') in the same transaction via the 10A helper.

-- 1. Extend status with a terminal 'banned' value; add the independent verified flag.
alter table public.creators drop constraint if exists creators_status_check;
alter table public.creators add constraint creators_status_check
  check (status in ('onboarding','active','suspended','banned'));
alter table public.creators add column if not exists verified boolean not null default false;

-- 2. Transition-guarded status setter (activate / suspend / ban). Reinstate is separate.
create or replace function public.admin_set_creator_status(p_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if p_status = 'active'    and v_from not in ('onboarding','suspended') then raise exception 'bad_transition'; end if;
  if p_status = 'suspended' and v_from <> 'active'                       then raise exception 'bad_transition'; end if;
  if p_status = 'banned'    and v_from not in ('active','suspended')     then raise exception 'bad_transition'; end if;
  update public.creators set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $$;

-- 3. Reinstate: banned -> active ONLY (distinct, extra-guarded).
create or replace function public.admin_reinstate_creator(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.creators where id = p_id;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from <> 'banned' then raise exception 'not_banned'; end if;
  update public.creators set status = 'active', updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'status.reinstate', p_reason,
    jsonb_build_object('from', 'banned', 'to', 'active'));
end $$;

-- 4. Verified toggle (independent of status).
create or replace function public.admin_set_creator_verified(p_id uuid, p_verified boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  update public.creators set verified = p_verified, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('creator', p_id, 'verify.set', p_reason,
    jsonb_build_object('verified', p_verified));
end $$;

-- 5. Note-only audit row.
create or replace function public.admin_add_creator_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.creators where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('creator', p_id, 'note.add', p_note, '{}'::jsonb);
end $$;

-- 6. Bulk status: one transaction, audits each applied change, skips illegal transitions.
create or replace function public.admin_bulk_set_creator_status(p_ids uuid[], p_status text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.creators where id = v_id;
    if v_from is null then continue; end if;
    if (p_status = 'active'    and v_from in ('onboarding','suspended'))
    or (p_status = 'suspended' and v_from = 'active')
    or (p_status = 'banned'    and v_from in ('active','suspended')) then
      update public.creators set status = p_status, updated_at = now() where id = v_id;
      perform public.ops_audit_log_append('creator', v_id, 'status.' || p_status, p_reason,
        jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- 7. Filtered + keyset-paginated search. Ops-aggregate (bypasses owner RLS), ops-gated.
create or replace function public.admin_search_creators(
  p_search             text default null,
  p_statuses           text[] default null,
  p_tiers              text[] default null,
  p_dna                text default null,
  p_verified           boolean default null,
  p_limit              int default 25,
  p_cursor_created_at  timestamptz default null,
  p_cursor_id          uuid default null
) returns table (
  id uuid, display_name text, handle text, status text, verified boolean,
  tier text, dna_status text, contribution_points int, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.display_name, c.handle, c.status, c.verified,
           cc.tier, cd.status as dna_status, cc.contribution_points, c.created_at
    from public.creators c
    left join public.creator_contribution cc on cc.creator_id = c.id
    left join lateral (
      select d.status from public.creator_dna d where d.creator_id = c.id limit 1
    ) cd on true
    where (p_search is null or p_search = ''
           or c.display_name ilike '%' || p_search || '%'
           or c.handle ilike '%' || p_search || '%')
      and (p_statuses is null or c.status = any(p_statuses))
      and (p_tiers is null or cc.tier = any(p_tiers))
      and (p_verified is null or c.verified = p_verified)
      and (p_dna is null
           or (p_dna = 'none' and cd.status is null)
           or (p_dna <> 'none' and cd.status = p_dna))
      and (p_cursor_created_at is null
           or (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id))
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $$;

-- 8. Grants: revoke implicit public+anon EXECUTE, grant authenticated only.
revoke all on function public.admin_set_creator_status(uuid, text, text) from public, anon;
revoke all on function public.admin_reinstate_creator(uuid, text) from public, anon;
revoke all on function public.admin_set_creator_verified(uuid, boolean, text) from public, anon;
revoke all on function public.admin_add_creator_note(uuid, text) from public, anon;
revoke all on function public.admin_bulk_set_creator_status(uuid[], text, text) from public, anon;
revoke all on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_set_creator_status(uuid, text, text) to authenticated;
grant execute on function public.admin_reinstate_creator(uuid, text) to authenticated;
grant execute on function public.admin_set_creator_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_add_creator_note(uuid, text) to authenticated;
grant execute on function public.admin_bulk_set_creator_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_search_creators(text, text[], text[], text, boolean, int, timestamptz, uuid) to authenticated;
