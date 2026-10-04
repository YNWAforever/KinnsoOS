import GuideCard from '@/components/kinnso/GuideCard'
import { getGuidesForRegions, getGuideOverridesForArticle } from '@/lib/guides/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** "Planning a trip here?" — embeds up to 3 matching guide cards in an article
 *  (master spec §5 cross-links, R1 heuristic tier + D-R6C-1 editorial overrides).
 *  Editorial overrides (pinned by guides ops for this article) are shown first,
 *  then remaining slots are filled with the regions/city heuristic matches, with
 *  any heuristic match already covered by a pinned guide deduped out. Renders
 *  nothing without a match on either tier. */
export async function ArticleGuideLinks({ locale, regions, articleId, t }: {
  locale: Locale; regions: string[]; articleId: string; t: Messages['article']
}) {
  const [overrides, heuristic] = await Promise.all([
    getGuideOverridesForArticle(articleId),
    getGuidesForRegions(regions),
  ])
  const pinnedSlugs = new Set(overrides.map((g) => g.slug))
  const guides = [...overrides, ...heuristic.filter((g) => !pinnedSlugs.has(g.slug))].slice(0, 3)
  if (guides.length === 0) return null
  return (
    <aside aria-labelledby="article-guide-links" className="k2-hairline mt-10 pt-8">
      <p className="k2-eyebrow">{t.guidesNearbyEyebrow}</p>
      <h2 id="article-guide-links" className="k2-display mt-3 text-2xl font-semibold text-kinnso-ink">{t.guidesNearbyHeading}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((g) => <GuideCard key={g.slug} g={g} locale={locale} />)}
      </div>
    </aside>
  )
}
