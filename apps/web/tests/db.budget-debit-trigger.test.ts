import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_2_budget_debit_trigger.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.2 budget debit trigger', () => {
  it('is a SECURITY DEFINER function fired AFTER INSERT on mission_settlements', () => {
    expect(sql).toContain('create or replace function public.debit_merchant_budget_on_settlement() returns trigger')
    expect(sql).toContain('language plpgsql security definer set search_path = public')
    expect(sql).toContain('create trigger debit_merchant_budget_on_settlement_trg')
    expect(sql).toContain('after insert on public.mission_settlements')
  })

  it('acts only on fee settlements, mirroring the R10.1 mint guard', () => {
    expect(sql).toContain('if new.mission_participant_id is null or new.affiliate_network_event_id is not null then return new; end if;')
    expect(sql).toContain('if new.paid_fee_amount is null or new.paid_fee_amount <= 0 then return new; end if;')
  })

  it('no-ops when there is no budget row or enforcement is off, and locks the row when enforced', () => {
    expect(sql).toContain('for update')
    expect(sql).toContain('if not found or not v_enforced then return new; end if;')
  })

  it('raises currency_mismatch and insufficient_budget as its two blocking conditions, in that order', () => {
    expect(sql).toContain(
      "if v_currency is distinct from upper(coalesce(new.amount_currency, 'hkd')) then raise exception 'currency_mismatch'; end if; " +
      "if v_balance < new.paid_fee_amount then raise exception 'insufficient_budget'; end if;"
    )
  })

  it('debits and writes exactly one ledger row keyed by the settlement id, in the same transaction', () => {
    expect(sql).toContain('update public.merchant_budgets set balance = balance - new.paid_fee_amount, updated_at = now() where id = v_budget_id')
    expect(sql).toContain("insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, source_ref)")
    expect(sql).toContain("values (v_budget_id, 'debit', -new.paid_fee_amount, v_balance - new.paid_fee_amount, 'settlement:' || new.id)")
  })

  it('never swallows exceptions -- blocking the transaction is its job', () => {
    const fnStart = sql.indexOf('create or replace function public.debit_merchant_budget_on_settlement()')
    const fnEnd = sql.indexOf('create trigger debit_merchant_budget_on_settlement_trg')
    expect(sql.slice(fnStart, fnEnd)).not.toContain('when others')
  })
})
