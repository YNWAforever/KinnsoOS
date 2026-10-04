import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetailMission } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function MissionsTab({ t, missions }: { t: T; missions: MerchantDetailMission[] }) {
  if (missions.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.missionsEmpty}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-edge">
          <th className="py-2 font-bold">{t.colMission}</th>
          <th className="py-2 font-bold">{t.colStatus}</th>
          <th className="py-2 font-bold">{t.colVisibility}</th>
          <th className="py-2 font-bold">{t.colParticipants}</th>
          <th className="py-2 font-bold">{t.colMilestones}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {missions.map((m) => (
          <tr key={m.id} className="border-b border-kinnso-edge/60">
            <td className="py-2 font-bold text-kinnso-ink">{m.title}</td>
            <td className="py-2 text-kinnso-muted">{m.status}</td>
            <td className="py-2 text-kinnso-muted">{m.visibility ?? '—'}</td>
            <td className="py-2 text-kinnso-muted">{m.participantsCount}</td>
            <td className="py-2 text-kinnso-muted">{m.milestonesApproved}/{m.milestonesTotal}</td>
            <td className="py-2 text-kinnso-muted">{day(m.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default MissionsTab
