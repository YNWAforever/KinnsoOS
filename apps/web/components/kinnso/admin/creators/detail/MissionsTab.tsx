import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailMission } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function MissionsTab({ t, missions }: { t: T; missions: CreatorDetailMission[] }) {
  if (missions.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.missionsNoData}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-edge">
          <th className="py-2 font-bold">{t.colMission}</th>
          <th className="py-2 font-bold">{t.colStatus}</th>
          <th className="py-2 font-bold">{t.colMilestones}</th>
          <th className="py-2 font-bold">{t.colSource}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {missions.map((m) => (
          <tr key={m.participantId} className="border-b border-kinnso-edge/60">
            <td className="py-2 font-bold text-kinnso-ink">{m.title}</td>
            <td className="py-2 text-kinnso-muted">{m.status}</td>
            <td className="py-2 text-kinnso-muted">
              {m.submissionsApproved}/{m.submissionsTotal}
              {m.submissionsPending > 0 ? <span className="text-kinnso-muted/70"> (+{m.submissionsPending})</span> : null}
            </td>
            <td className="py-2 text-kinnso-muted">{m.source}</td>
            <td className="py-2 text-kinnso-muted">{day(m.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default MissionsTab
