import type { Messages } from '@/lib/i18n/messages/en'
import type { AuditEntry } from '@/lib/admin/audit'

type T = Messages['creators']
const day = (s: string) => s.slice(0, 10)

export function ModerationTab({ t, entries }: { t: T; entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="py-6 text-sm text-kinnso-muted">{t.auditNoData}</p>
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl border border-kinnso-edge p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-kinnso-ink">{e.action}</span>
            <span className="shrink-0 text-kinnso-muted">{day(e.createdAt)}</span>
          </div>
          {e.reason ? <p className="mt-1 text-kinnso-muted">{e.reason}</p> : null}
        </li>
      ))}
    </ul>
  )
}

export default ModerationTab
