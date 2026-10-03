import { describe, expect, it } from 'vitest'
import { getMerchantBudget } from '@/lib/merchants/budget-queries'

type ChainResult = { data: unknown; error: unknown }
function makeChain(result: ChainResult) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: ChainResult) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}
function fakeClient(tables: Record<string, ChainResult>) {
  return {
    from: (table: string) => {
      const cfg = tables[table]
      if (!cfg) throw new Error(`Unexpected table in test: ${table}`)
      return makeChain(cfg)
    },
  } as never
}

describe('getMerchantBudget', () => {
  it('returns null when the merchant has no budget row', async () => {
    const supabase = fakeClient({ merchant_budgets: { data: null, error: null } })
    await expect(getMerchantBudget(supabase, 'merchant-1')).resolves.toBeNull()
  })

  it('maps the budget row and its ledger', async () => {
    const supabase = fakeClient({
      merchant_budgets: { data: { id: 'b1', balance: 250, currency: 'HKD', enforced: true }, error: null },
      merchant_budget_transactions: {
        data: [{ id: 't1', kind: 'topup', amount: 250, balance_after: 250, reason: 'Pilot funding', created_at: '2026-08-20T00:00:00Z' }],
        error: null,
      },
    })
    const result = await getMerchantBudget(supabase, 'merchant-1')
    expect(result).toEqual({
      balance: 250, currency: 'HKD', enforced: true,
      ledger: [{ id: 't1', kind: 'topup', amount: 250, balanceAfter: 250, reason: 'Pilot funding', createdAt: '2026-08-20T00:00:00Z' }],
    })
  })

  it('propagates a query error', async () => {
    const supabase = fakeClient({ merchant_budgets: { data: null, error: { message: 'boom' } } })
    await expect(getMerchantBudget(supabase, 'merchant-1')).rejects.toEqual({ message: 'boom' })
  })
})
