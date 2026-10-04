import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { SessionListItem } from '@/lib/sessions/types'
import { TicketCard } from '@/components/kinnso/MarketPassport'

const statusLabel = (t: Messages['studioSessions'], status: SessionListItem['status']) => ({
  scheduled: t.statusScheduled, live: t.statusLive, ended: t.statusEnded, cancelled: t.statusCancelled,
}[status])

export function MySessionsView({ locale, t, sessions }: { locale: Locale; t: Messages['studioSessions']; sessions: SessionListItem[] }) {
  const p = (path: string) => `/${locale}${path}`
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <main>
      <section className="k-container py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.listPill}</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.listHeading}</h1>
            <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.listSubtitle}</p>
          </div>
          <Link href={p('/studio/sessions/new')} className="k-btn-primary inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> {t.newButton}
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="mt-10 rounded-lg bg-kinnso-cream2 p-8 text-center">
            <h2 className="text-xl font-bold text-kinnso-ink">{t.emptyTitle}</h2>
            <p className="mt-2 text-kinnso-muted">{t.emptyBody}</p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-4">
            {sessions.map((s) => (
              <TicketCard key={s.id} as="li" className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-kinnso-ink">{s.title}</p>
                  <p className="text-sm text-kinnso-muted">{dateTimeFmt.format(new Date(s.startsAt))}</p>
                </div>
                <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{statusLabel(t, s.status)}</span>
                <Link href={p(`/studio/sessions/${s.id}/edit`)} className="k-btn-ghost text-sm">{t.edit}</Link>
              </TicketCard>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default MySessionsView
