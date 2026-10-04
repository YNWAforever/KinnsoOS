-- R11.2 -- ops funding surface + the creator-facing funded read. Both write RPCs are
-- modeled on admin_set_settlement_status's shape (admin gate -> validate -> lock -> write ->
-- ops_audit_log_append in one transaction). Reads for the badge go through
-- funded_merchant_profiles() because merchant_budgets is owner-scoped: a creator's session
-- joining through it would silently see nothing (the documented RLS-join gotcha), so the
-- definer function exposes exactly the funded bit and nothing else -- never balances.

create or replace function public.admin_credit_merchant_budget(p_merchant_profile_id uuid, p_amount numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_budget_id uuid;
  v_balance   numeric;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  -- Rejects: null/zero; NaN (Postgres numeric NaN equals itself and sorts above all
  -- values, so it would pass every other check here AND the trigger's floor check,
  -- permanently poisoning the balance); sub-cent precision (the 12,2 columns would
  -- round it while the jsonb audit metadata kept the raw value -- a permanent audit
  -- divergence); and over-magnitude values that would otherwise surface as a raw
  -- numeric-overflow error instead of this RPC's clean-exception convention.
  if p_amount is null or p_amount = 0 or p_amount = 'NaN'::numeric
     or p_amount <> round(p_amount, 2) or abs(p_amount) > 9999999999.99 then
    raise exception 'bad_amount';
  end if;
  if not exists (select 1 from public.merchant_profiles where id = p_merchant_profile_id) then
    raise exception 'not_found';
  end if;

  -- Lazy row creation: the first credit creates the budget (enforced stays false until
  -- admin_set_budget_enforcement flips it).
  insert into public.merchant_budgets (merchant_profile_id)
    values (p_merchant_profile_id)
    on conflict (merchant_profile_id) do nothing;

  select id, balance into v_budget_id, v_balance
    from public.merchant_budgets
    where merchant_profile_id = p_merchant_profile_id
    for update;

  -- Floor-check up front so a too-large negative adjustment surfaces as a clean exception
  -- rather than the balance >= 0 constraint's raw error.
  if v_balance + p_amount < 0 then raise exception 'insufficient_budget'; end if;

  update public.merchant_budgets
    set balance = v_balance + p_amount, updated_at = now()
    where id = v_budget_id;

  insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, reason)
    values (v_budget_id, case when p_amount > 0 then 'topup' else 'adjust' end, p_amount, v_balance + p_amount, p_reason);

  perform public.ops_audit_log_append('merchant', p_merchant_profile_id, 'budget.credit', p_reason,
    jsonb_build_object('amount', p_amount, 'balance_after', v_balance + p_amount));
end;
$$;

create or replace function public.admin_set_budget_enforcement(p_merchant_profile_id uuid, p_enforced boolean, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_enforced is null then raise exception 'bad_enforced'; end if;

  -- Enforcement without funding is meaningless: credit first (which creates the row).
  update public.merchant_budgets
    set enforced = p_enforced, updated_at = now()
    where merchant_profile_id = p_merchant_profile_id;
  if not found then raise exception 'not_found'; end if;

  perform public.ops_audit_log_append('merchant', p_merchant_profile_id, 'budget.enforcement', p_reason,
    jsonb_build_object('enforced', p_enforced));
end;
$$;

create or replace function public.funded_merchant_profiles()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select merchant_profile_id from public.merchant_budgets where enforced
$$;

revoke all on function public.admin_credit_merchant_budget(uuid, numeric, text) from public, anon;
revoke all on function public.admin_set_budget_enforcement(uuid, boolean, text) from public, anon;
revoke all on function public.funded_merchant_profiles() from public, anon;
grant execute on function public.admin_credit_merchant_budget(uuid, numeric, text) to authenticated;
grant execute on function public.admin_set_budget_enforcement(uuid, boolean, text) to authenticated;
grant execute on function public.funded_merchant_profiles() to authenticated;
