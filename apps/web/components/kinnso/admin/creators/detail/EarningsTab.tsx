import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailContribution, CreatorDetailSettlement, CreatorDetailPointsEvent } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
const money = (n: number | null) => (n === null ? '—' : n.toFixed(2))

export function EarningsTab({
  t, contribution, settlements, pointsEvents,
}: {
  t: T
  contribution: CreatorDetailContribution | null
  settlements: CreatorDetailSettlement[]
  pointsEvents: CreatorDetailPointsEvent[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="text-xs font-bold uppercase text-kinnso-muted">{t.secContribution}</p>
        <p className="text-sm font-bold text-kinnso-ink">{t.totalPoints}</p>
        <p className="mt-1 text-2xl font-black text-kinnso-ink">{contribution?.points ?? 0}</p>
      </section>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.colSettlement}</p>
        {settlements.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.settlementsNoData}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-edge">
                <th className="py-2 font-bold">{t.colMission}</th>
                <th className="py-2 font-bold">{t.colAmount}</th>
                <th className="py-2 font-bold">{t.colPayout}</th>
                <th className="py-2 font-bold">{t.colStatus}</th>
                <th className="py-2 font-bold">{t.colJoined}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id} className="border-b border-kinnso-edge/60">
                  <td className="py-2 font-bold text-kinnso-ink">{s.missionTitle}</td>
                  <td className="py-2 text-kinnso-muted">{money(s.creatorCommissionAmount)} <span className="text-kinnso-ink">{s.currency ?? ''}</span></td>
                  <td className="py-2 text-kinnso-muted">{s.creatorPayoutStatus ?? '—'}</td>
                  <td className="py-2 text-kinnso-muted">{s.status}</td>
                  <td className="py-2 text-kinnso-muted">{day(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.pointsHistory}</p>
        {pointsEvents.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.pointsNoData}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-edge">
                <th className="py-2 font-bold">{t.colEvent}</th>
                <th className="py-2 font-bold">{t.colPoints}</th>
                <th className="py-2 font-bold">{t.colJoined}</th>
              </tr>
            </thead>
            <tbody>
              {pointsEvents.map((e) => (
                <tr key={e.id} className="border-b border-kinnso-edge/60">
                  <td className="py-2 font-bold text-kinnso-ink">{e.eventType}</td>
                  <td className="py-2 text-kinnso-muted">{e.points}</td>
                  <td className="py-2 text-kinnso-muted">{day(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default EarningsTab
