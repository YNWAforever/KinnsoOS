import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantBudget } from '@/lib/merchants/budget-queries'
import { TicketCard } from '@/components/kinnso/MarketPassport'

type T = Messages['merchantDashboard']

const KIND_LABEL = (t: T): Record<string, string> => ({
  topup: t.kindTopup, debit: t.kindDebit, adjust: t.kindAdjust,
})

export function MerchantBudgetView({ t, budget }: { t: T; budget: MerchantBudget | null }) {
  return (
    <main>
      <h1 className="k-display">{t.budgetTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.budgetSubtitle}</p>

      {budget === null ? (
        <TicketCard className="mt-8 p-5">
          <p className="py-6 text-sm text-kinnso-muted">{t.budgetNoBudget}</p>
        </TicketCard>
      ) : (
        <>
          <TicketCard className="mt-8 p-5">
            <p className="text-sm text-kinnso-muted">{t.budgetBalance}</p>
            <p className="text-3xl font-black text-kinnso-ink">{budget.currency} {budget.balance.toFixed(2)}</p>
            <p className="mt-2 text-xs font-bold text-kinnso-muted">
              {budget.enforced ? t.budgetEnforcedOn : t.budgetEnforcedOff}
            </p>
          </TicketCard>

          <TicketCard className="mt-8 p-5">
            <p className="mb-3 text-sm font-bold text-kinnso-ink">{t.budgetLedgerTitle}</p>
            {budget.ledger.length === 0 ? (
              <p className="py-6 text-sm text-kinnso-muted">{t.budgetLedgerEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {budget.ledger.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <span className="shrink-0 font-bold text-kinnso-ink">{KIND_LABEL(t)[row.kind] ?? row.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-kinnso-muted">{row.reason ?? '—'}</span>
                    <span className={`shrink-0 font-bold ${row.amount < 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                      {row.amount > 0 ? '+' : ''}{row.amount.toFixed(2)}
                    </span>
                    <span className="shrink-0 text-kinnso-muted">{budget.currency} {row.balanceAfter.toFixed(2)}</span>
                    <span className="shrink-0 text-kinnso-muted">{row.createdAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </TicketCard>
        </>
      )}
    </main>
  )
}

export default MerchantBudgetView
