// apps/web/components/kinnso/pages/DestinationDetailView.tsx
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import GuideCard from '@/components/kinnso/GuideCard'
import SessionCard from '@/components/kinnso/SessionCard'
import ExperienceCard, { type ExperienceCardData } from '@/components/kinnso/ExperienceCard'
import { ArticleCard } from '@/components/ArticleCard'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale, UrlCategory } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export interface DestinationArticle {
  url: string
  category: UrlCategory
  title: string
  thumbnail?: string
  summary: string | null
}

export function DestinationDetailView({
  locale, t, destination, guides, experiences, articles, sessions, savesLabel,
}: {
  locale: Locale
  t: Messages['destinations']
  destination: Destination
  guides: Guide[]
  experiences: ExperienceCardData[]
  articles: DestinationArticle[]
  sessions: PublicSession[]
  savesLabel: string
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div className="w-full">
          {destination.heroImageUrl ? (
            <img
              src={destination.heroImageUrl}
              alt={destination.name}
              width={1200}
              height={500}
              className="mb-8 aspect-[21/9] w-full rounded-[4px] object-cover"
            />
          ) : null}
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{destination.name}</h1>
          {destination.description ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{destination.description}</p>
          ) : null}
        </div>
      </SectionShell>

      {guides.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.guidesHeading}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} savesLabel={savesLabel} />)}
          </div>
        </SectionShell>
      ) : null}

      {experiences.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.experiencesHeading}</h2>
          <div className="mt-8 grid gap-4">
            {experiences.map((e) => (
              <ExperienceCard key={e.slug} experience={e} locale={locale} savesLabel={savesLabel} />
            ))}
          </div>
        </SectionShell>
      ) : null}

      {articles.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.articlesHeading}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard
                key={`${article.category}/${article.url}`}
                href={`/${locale}/articles/${article.category}/${article.url}`}
                title={article.title}
                thumbnail={article.thumbnail}
                summary={article.summary}
              />
            ))}
          </div>
        </SectionShell>
      ) : null}

      {sessions.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.sessionsHeading}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {sessions.map((s) => <SessionCard key={s.id} locale={locale} session={s} />)}
          </div>
        </SectionShell>
      ) : null}
    </div>
  )
}

export default DestinationDetailView
