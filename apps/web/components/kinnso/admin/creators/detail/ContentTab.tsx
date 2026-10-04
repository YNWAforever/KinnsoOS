import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetailContent } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function ContentTab({ t, content }: { t: T; content: CreatorDetailContent[] }) {
  if (content.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.contentNoData}</p>
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-kinnso-muted">
        <tr className="border-b border-kinnso-edge">
          <th className="py-2 font-bold">{t.colTitle}</th>
          <th className="py-2 font-bold">{t.colStatusContent}</th>
          <th className="py-2 font-bold">{t.colSaves}</th>
          <th className="py-2 font-bold">{t.colJoined}</th>
        </tr>
      </thead>
      <tbody>
        {content.map((g) => (
          <tr key={g.id} className="border-b border-kinnso-edge/60">
            <td className="py-2 font-bold text-kinnso-ink">{g.title}</td>
            <td className="py-2 text-kinnso-muted">{g.status}</td>
            <td className="py-2 text-kinnso-muted">{g.savesCount}</td>
            <td className="py-2 text-kinnso-muted">{day(g.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default ContentTab
