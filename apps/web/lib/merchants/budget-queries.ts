import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface BudgetLedgerRow {
  id: string
  kind: string
  amount: number
  balanceAfter: number
  reason: string | null
  createdAt: string
}

export interface MerchantBudget {
  balance: number
  currency: string
  enforced: boolean
  ledger: BudgetLedgerRow[]
}

/**
 * The merchant's own budget + recent ledger, read through owner-scoped RLS (the session's
 * merchant sees only their row; ops sees all). Returns null when no budget row exists —
 * merchants are funded lazily by ops, so "no row" is a normal state, not an error.
 */
export async function getMerchantBudget(supabase: Client, merchantProfileId: string): Promise<MerchantBudget | null> {
  const { data: budget, error } = await supabase
    .from('merchant_budgets')
    .select('id, balance, currency, enforced')
    .eq('merchant_profile_id', merchantProfileId)
    .maybeSingle()
  if (error) throw error
  if (!budget) return null

  const { data: ledger, error: ledgerError } = await supabase
    .from('merchant_budget_transactions')
    .select('id, kind, amount, balance_after, reason, created_at')
    .eq('merchant_budget_id', budget.id)
    .order('created_at', { ascending: false })
    .limit(20)
  if (ledgerError) throw ledgerError

  return {
    balance: budget.balance,
    currency: budget.currency,
    enforced: budget.enforced,
    ledger: (ledger ?? []).map((t) => ({
      id: t.id, kind: t.kind, amount: t.amount, balanceAfter: t.balance_after,
      reason: t.reason, createdAt: t.created_at,
    })),
  }
}
