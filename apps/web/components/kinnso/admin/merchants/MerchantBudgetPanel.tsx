'use client'
import { useState, useTransition } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { ActionResult } from '@/lib/admin/result'
import type { OpsMerchantBudget } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
export type CreditFn = (locale: Locale, merchantId: string, amount: number, reason: string) => Promise<ActionResult<{ id: string }>>
export type EnforceFn = (locale: Locale, merchantId: string, enforced: boolean, reason: string) => Promise<ActionResult<{ id: string }>>

export function MerchantBudgetPanel({
  t, locale, merchantId, budget, credit, enforce,
}: {
  t: T
  locale: Locale
  merchantId: string
  budget: OpsMerchantBudget | null
  credit: CreditFn
  enforce: EnforceFn
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<ActionResult<{ id: string }>>) => {
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) { setStatus('saved'); setAmount(''); setReason('') }
      else { setStatus('error'); setError(res.errors.form?.[0] ?? null) }
    })
  }

  return (
    <section className="mt-6 rounded-xl border border-kinnso-edge p-4">
      <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.budgetPanelTitle}</p>
      {budget ? (
        <p className="mb-3 text-sm text-kinnso-muted">
          {t.budgetBalance}: <span className="font-bold text-kinnso-ink">{budget.currency} {budget.balance.toFixed(2)}</span>
          {' · '}{budget.enforced ? t.budgetEnforced : t.budgetNotEnforced}
        </p>
      ) : (
        <p className="mb-3 text-sm text-kinnso-muted">{t.budgetNoRow}</p>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-kinnso-ink" htmlFor="budget-credit-amount">{t.budgetCreditLabel}</label>
        <input
          id="budget-credit-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t.budgetCreditAmountPlaceholder}
          className="rounded-md border border-kinnso-edge p-2 text-sm"
        />
        <label className="text-xs font-bold text-kinnso-ink" htmlFor="budget-credit-reason">{t.budgetReasonPlaceholder}</label>
        <textarea
          id="budget-credit-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.budgetReasonPlaceholder}
          rows={2}
          className="rounded-md border border-kinnso-edge p-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending || !amount || !reason.trim()}
            onClick={() => run(() => credit(locale, merchantId, Number(amount), reason))}
            className="rounded-md bg-kinnso-orange px-3 py-1 text-sm font-bold text-white disabled:opacity-50"
          >
            {t.budgetCreditSubmit}
          </button>
          <button
            type="button"
            disabled={isPending || !budget || !reason.trim()}
            onClick={() => run(() => enforce(locale, merchantId, !(budget?.enforced ?? false), reason))}
            className="rounded-md border border-kinnso-edge px-3 py-1 text-sm font-bold text-kinnso-ink disabled:opacity-50"
          >
            {budget?.enforced ? t.budgetEnforceOff : t.budgetEnforceOn}
          </button>
        </div>
        {status === 'saved' && <p role="status" className="text-xs text-emerald-700">{t.budgetSaved}</p>}
        {status === 'error' && error && <p role="status" className="text-xs text-red-600">{error}</p>}
      </div>
    </section>
  )
}

export default MerchantBudgetPanel
