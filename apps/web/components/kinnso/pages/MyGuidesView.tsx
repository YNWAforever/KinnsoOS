import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { GuideListItem } from '@/lib/guides/types'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'

export function MyGuidesView({
  locale,
  t,
  guides,
}: {
  locale: Locale
  t: Messages['studioGuides']
  guides: GuideListItem[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <main>
      <section className="k-container py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.listPill}</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.listHeading}</h1>
            <p className="mt-3 max-w-2xl text-lg text-kinnso-muted">{t.listSubtitle}</p>
          </div>
          <Link href={p('/studio/guides/new')} className="k-btn-primary inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> {t.newButton}
          </Link>
        </div>

        {guides.length === 0 ? (
          <div className="mt-10 rounded-lg bg-kinnso-cream2 p-8 text-center">
            <h2 className="text-xl font-bold text-kinnso-ink">{t.emptyTitle}</h2>
            <p className="mt-2 text-kinnso-muted">{t.emptyBody}</p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-4">
            {guides.map((g) => (
              <TicketCard key={g.id} as="li" className="flex items-center gap-4 p-4">
                <EntityMedia
                  src={g.cover}
                  title={g.title}
                  location={g.city}
                  sizes="96px"
                  className="h-16 w-24 shrink-0 rounded-md [&_[data-media-placeholder=true]>span]:hidden [&_[data-media-placeholder=true]]:p-0"
                  imageClassName="object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-kinnso-ink">{g.title}</p>
                  <p className="text-sm text-kinnso-muted">{g.city}</p>
                </div>
                <span
                  className={`k-pill ${g.status === 'published' ? 'bg-kinnso-orange/20 text-kinnso-ink' : 'bg-kinnso-cream2 text-kinnso-ink'}`}
                >
                  {g.status === 'published' ? t.statusPublished : t.statusDraft}
                </span>
                <Link href={p(`/studio/guides/${g.id}/edit`)} className="k-btn-ghost text-sm">
                  {t.edit}
                </Link>
              </TicketCard>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default MyGuidesView
