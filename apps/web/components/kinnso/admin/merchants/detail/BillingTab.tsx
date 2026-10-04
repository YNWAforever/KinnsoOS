import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

function MoneyList({ rows, empty }: { rows: { currency: string; amount: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-kinnso-muted">{empty}</p>
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((r) => (
        <li key={r.currency} className="flex justify-between gap-2">
          <span className="font-bold text-kinnso-ink">{r.currency}</span>
          <span className="text-kinnso-muted">{r.amount.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  )
}

export function BillingTab({ t, billing }: { t: T; billing: MerchantDetail['billing'] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-lg bg-kinnso-cream2 px-3 py-2 text-sm text-kinnso-muted">{t.billingReadonly}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-kinnso-edge p-4">
          <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.owedTitle}</p>
          <MoneyList rows={billing.owed} empty={t.moneyEmpty} />
        </section>
        <section className="rounded-xl border border-kinnso-edge p-4">
          <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.settledTitle}</p>
          <MoneyList rows={billing.settled} empty={t.moneyEmpty} />
        </section>
      </div>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.colSettlement}</p>
        {billing.settlements.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.settlementsEmpty}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-edge">
                <th className="py-2 font-bold">{t.colMission}</th>
                <th className="py-2 font-bold">{t.colAmount}</th>
                <th className="py-2 font-bold">{t.colCurrency}</th>
                <th className="py-2 font-bold">{t.colPayout}</th>
                <th className="py-2 font-bold">{t.colKinnso}</th>
                <th className="py-2 font-bold">{t.colAffiliate}</th>
                <th className="py-2 font-bold">{t.colStatus}</th>
                <th className="py-2 font-bold">{t.detailUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {billing.settlements.map((s) => (
                <tr key={s.id} className="border-b border-kinnso-edge/60">
                  <td className="py-2 font-bold text-kinnso-ink">{s.missionTitle}</td>
                  <td className="py-2 text-kinnso-muted">{money(s.creatorPayoutAmount)}</td>
                  <td className="py-2 text-kinnso-muted">{s.currency ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.creatorPayoutStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.kinnsoCommissionStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.affiliateCommissionStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.status}</td>
                  <td className="py-2 text-kinnso-muted">{day(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default BillingTab
