-- Phase 11B — Merchants Operator Console: audited lifecycle write RPCs + a
-- filtered/keyset-paginated search. All writes are SECURITY DEFINER, gated on
-- is_active_ops(), require a reason, lock the row FOR UPDATE, no-op guard, and append
-- an ops_audit_log row (entity_type='merchant') in the same transaction via the 10A helper.
-- Merchant status has no linear lifecycle, so the setter validates the TARGET is a valid
-- status (no transition matrix). The audited admin_set_merchant_tier(uuid,text,text) is
-- ADDITIVE here (coexists with the legacy 2-arg version); 11C drops the legacy overload.

-- 1. Status setter (active|paused|suspended|archived). No transition matrix; no-op guarded.
create or replace function public.admin_set_merchant_status(p_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select status into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_status then raise exception 'no_change'; end if;
  update public.merchant_profiles set status = p_status, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'status.' || p_status, p_reason,
    jsonb_build_object('from', v_from, 'to', p_status));
end $$;

-- 2. Tier setter (free|growth) — audited v2. ADDITIVE overload (legacy 2-arg untouched here).
create or replace function public.admin_set_merchant_tier(p_id uuid, p_tier text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_tier not in ('free','growth') then raise exception 'bad_tier'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select tier into v_from from public.merchant_profiles where id = p_id for update;
  if v_from is null then raise exception 'not_found'; end if;
  if v_from = p_tier then raise exception 'no_change'; end if;
  update public.merchant_profiles set tier = p_tier, updated_at = now() where id = p_id;
  perform public.ops_audit_log_append('merchant', p_id, 'tier.set', p_reason,
    jsonb_build_object('from', v_from, 'to', p_tier));
end $$;

-- 3. Note-only audit row.
create or replace function public.admin_add_merchant_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_exists boolean;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
  select true into v_exists from public.merchant_profiles where id = p_id;
  if v_exists is null then raise exception 'not_found'; end if;
  perform public.ops_audit_log_append('merchant', p_id, 'note.add', p_note, '{}'::jsonb);
end $$;

-- 4. Bulk status: one transaction, audits each applied change, skips not-found and no-ops.
create or replace function public.admin_bulk_set_merchant_status(p_ids uuid[], p_status text, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_from text; v_count int := 0;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','paused','suspended','archived') then raise exception 'bad_status'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if array_length(p_ids, 1) is null or array_length(p_ids, 1) > 100 then raise exception 'bad_bulk'; end if;
  foreach v_id in array p_ids loop
    select status into v_from from public.merchant_profiles where id = v_id for update;
    if v_from is null or v_from = p_status then continue; end if;
    update public.merchant_profiles set status = p_status, updated_at = now() where id = v_id;
    perform public.ops_audit_log_append('merchant', v_id, 'status.' || p_status, p_reason,
      jsonb_build_object('from', v_from, 'to', p_status, 'bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 5. Filtered + keyset-paginated search. Ops-aggregate (bypasses owner RLS), ops-gated.
--    Returns NO PII (no contact_email/contact_name) — the directory list is non-PII.
create or replace function public.admin_search_merchants(
  p_search             text default null,
  p_statuses           text[] default null,
  p_tiers              text[] default null,
  p_limit              int default 25,
  p_cursor_created_at  timestamptz default null,
  p_cursor_id          uuid default null
) returns table (
  id uuid, company_name text, status text, tier text, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.id, m.company_name, m.status, m.tier, m.created_at
    from public.merchant_profiles m
    where (p_search is null or p_search = '' or m.company_name ilike '%' || p_search || '%')
      and (p_statuses is null or m.status = any(p_statuses))
      and (p_tiers is null or m.tier = any(p_tiers))
      and (p_cursor_created_at is null
           or (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end $$;

-- 6. Grants: revoke implicit public+anon EXECUTE, grant authenticated only.
revoke all on function public.admin_set_merchant_status(uuid, text, text) from public, anon;
revoke all on function public.admin_set_merchant_tier(uuid, text, text) from public, anon;
revoke all on function public.admin_add_merchant_note(uuid, text) from public, anon;
revoke all on function public.admin_bulk_set_merchant_status(uuid[], text, text) from public, anon;
revoke all on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) from public, anon;
grant execute on function public.admin_set_merchant_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_merchant_tier(uuid, text, text) to authenticated;
grant execute on function public.admin_add_merchant_note(uuid, text) to authenticated;
grant execute on function public.admin_bulk_set_merchant_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_search_merchants(text, text[], text[], int, timestamptz, uuid) to authenticated;
