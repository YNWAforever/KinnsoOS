import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_budget_rpcs.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 budget RPCs', () => {
  it('admin_credit_merchant_budget gates on admin rank, requires a reason, and validates the amount', () => {
    expect(sql).toContain('create or replace function public.admin_credit_merchant_budget(p_merchant_profile_id uuid, p_amount numeric, p_reason text)')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;")
    expect(sql).toContain(
      "if p_amount is null or p_amount = 0 or p_amount = 'nan'::numeric or p_amount <> round(p_amount, 2) or abs(p_amount) > 9999999999.99 then raise exception 'bad_amount'; end if;"
    )
  })

  it('admin_credit_merchant_budget upserts the budget row, floor-checks negative adjustments, and ledgers with balance_after', () => {
    expect(sql).toContain('insert into public.merchant_budgets (merchant_profile_id) values (p_merchant_profile_id) on conflict (merchant_profile_id) do nothing')
    expect(sql).toContain('for update')
    expect(sql).toContain("if v_balance + p_amount < 0 then raise exception 'insufficient_budget'; end if;")
    expect(sql).toContain("case when p_amount > 0 then 'topup' else 'adjust' end")
    expect(sql).toContain('v_balance + p_amount')
  })

  it('admin_set_budget_enforcement gates on admin rank, requires an existing row, and audits', () => {
    expect(sql).toContain('create or replace function public.admin_set_budget_enforcement(p_merchant_profile_id uuid, p_enforced boolean, p_reason text)')
    expect(sql).toContain("if not found then raise exception 'not_found'; end if;")
  })

  it('both write RPCs append to ops_audit_log', () => {
    expect((sql.match(/perform public\.ops_audit_log_append\('merchant'/gu) ?? []).length).toBe(2)
  })

  it('funded_merchant_profiles is a stable definer returning only enforced merchant ids', () => {
    expect(sql).toContain('create or replace function public.funded_merchant_profiles()')
    expect(sql).toContain('returns setof uuid')
    expect(sql).toContain('language sql stable security definer set search_path = public')
    expect(sql).toContain('select merchant_profile_id from public.merchant_budgets where enforced')
  })

  it('revokes all three from public/anon; write RPCs granted to authenticated, read RPC too', () => {
    expect(sql).toContain('revoke all on function public.admin_credit_merchant_budget(uuid, numeric, text) from public, anon')
    expect(sql).toContain('revoke all on function public.admin_set_budget_enforcement(uuid, boolean, text) from public, anon')
    expect(sql).toContain('revoke all on function public.funded_merchant_profiles() from public, anon')
    expect(sql).toContain('grant execute on function public.admin_credit_merchant_budget(uuid, numeric, text) to authenticated')
    expect(sql).toContain('grant execute on function public.admin_set_budget_enforcement(uuid, boolean, text) to authenticated')
    expect(sql).toContain('grant execute on function public.funded_merchant_profiles() to authenticated')
  })
})
