import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_merchant_budgets.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 merchant_budgets + merchant_budget_transactions', () => {
  it('creates merchant_budgets with a non-negative balance, HKD default currency, and enforcement off by default', () => {
    expect(sql).toContain('create table public.merchant_budgets')
    expect(sql).toContain('merchant_profile_id uuid not null unique references public.merchant_profiles(id) on delete cascade')
    expect(sql).toContain('balance numeric(12,2) not null default 0 check (balance >= 0)')
    expect(sql).toContain("currency text not null default 'hkd'")
    expect(sql).toContain('enforced boolean not null default false')
  })

  it('creates the ledger with kind/amount/balance_after and a unique source_ref for idempotency', () => {
    expect(sql).toContain('create table public.merchant_budget_transactions')
    expect(sql).toContain('merchant_budget_id uuid not null references public.merchant_budgets(id)')
    expect(sql).toContain("kind text not null check (kind in ('topup', 'debit', 'adjust'))")
    expect(sql).toContain('amount numeric(12,2) not null')
    expect(sql).toContain('balance_after numeric(12,2) not null check (balance_after >= 0)')
    expect(sql).toContain('source_ref text unique')
    expect(sql).toContain('create index merchant_budget_transactions_budget_idx on public.merchant_budget_transactions (merchant_budget_id, created_at desc)')
  })

  it('enables RLS on both tables with owner-or-ops SELECT policies', () => {
    expect(sql).toContain('alter table public.merchant_budgets enable row level security')
    expect(sql).toContain('alter table public.merchant_budget_transactions enable row level security')
    expect(sql).toContain('create policy merchant_budgets_select on public.merchant_budgets')
    expect(sql).toContain('create policy merchant_budget_transactions_select on public.merchant_budget_transactions')
    expect(sql).toContain("ops.status = 'active'")
  })

  it('grants no client writes on either table — definer functions are the only writers', () => {
    expect(sql).toContain('revoke all on public.merchant_budgets from public, anon, authenticated')
    expect(sql).toContain('revoke all on public.merchant_budget_transactions from public, anon, authenticated')
    expect(sql).toContain('grant select on public.merchant_budgets to authenticated')
    expect(sql).toContain('grant select on public.merchant_budget_transactions to authenticated')
    expect(sql).not.toContain('grant insert')
    expect(sql).not.toContain('grant update')
    expect(sql).not.toContain('grant delete')
  })
})
