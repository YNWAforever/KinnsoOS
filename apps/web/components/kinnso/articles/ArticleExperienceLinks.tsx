import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity, getExperienceOverridesForArticle } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Ready to book?" — sibling to ArticleGuideLinks, same regions heuristic (D-R3-7)
 *  + D-R6C-1 editorial overrides. Editorial overrides (pinned by experiences ops for
 *  this article) are shown first, then remaining slots are filled by the first
 *  region with any heuristic match (one-shot-then-stop, no merge across regions),
 *  with any heuristic match already covered by a pinned experience deduped out.
 *  Dedupes on `id` here (not `slug` as in ArticleGuideLinks) because PublicExperience
 *  carries an id and the override table keys on experience_id, whereas Guide has no
 *  id field to key on. Renders nothing without a match on either tier. */
export async function ArticleExperienceLinks({ locale, regions, articleId, t, bookingLive }: {
  locale: Locale; regions: string[]; articleId: string; t: Messages['article']; bookingLive: boolean
}) {
  const [overrides, heuristic] = await Promise.all([
    getExperienceOverridesForArticle(articleId),
    (async () => {
      for (const region of regions) {
        const matches = await getExperiencesForCity(region)
        if (matches.length > 0) return matches
      }
      return [] as Awaited<ReturnType<typeof getExperiencesForCity>>
    })(),
  ])
  const pinnedIds = new Set(overrides.map((e) => e.id))
  const experiences = [...overrides, ...heuristic.filter((e) => !pinnedIds.has(e.id))].slice(0, 3)
  if (experiences.length === 0) return null
  return (
    <aside aria-labelledby="article-experience-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{bookingLive ? t.experiencesNearbyEyebrowLive : t.experiencesNearbyEyebrowWaitlist}</p>
      <h2 id="article-experience-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{bookingLive ? t.experiencesNearbyHeadingLive : t.experiencesNearbyHeadingWaitlist}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery="src=article" />
        ))}
      </div>
    </aside>
  )
}
