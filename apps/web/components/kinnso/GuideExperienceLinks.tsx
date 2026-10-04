import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import { getExperiencesForCity } from '@/lib/experiences/public-queries'
import { optionalQuery } from '@/lib/resilience/optional'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** Guides have no reverse cross-link today (D-R3-7, sibling of ArticleExperienceLinks
 *  on the article page) — this is a wholly new slot, keyed on the guide's own city.
 *  The CTA carries this guide's slug through the query string so the eventual booking
 *  can attribute back to its creator (re-resolved server-side in
 *  createCheckoutSessionAction — see D-R3C-3).
 *
 *  Gotcha: this (like ArticleExperienceLinks) is an async Server Component nested as
 *  plain JSX — Next.js resolves that fine in production, but a jsdom+testing-library
 *  host test that renders the WHOLE page cannot (react-dom's client renderer doesn't
 *  support nested async function components). If a future test does that for the
 *  article route, mock this component's sibling the same way
 *  apps/web/tests/g.slug.host.test.tsx mocks this one. */
export async function GuideExperienceLinks({ locale, city, guideSlug, t }: {
  locale: Locale; city: string; guideSlug: string; t: Messages['article']
}) {
  const experiences = await optionalQuery('guide-experience-links', () => getExperiencesForCity(city), [])
  if (experiences.length === 0) return null
  const hrefQuery = `src=guide&guideSlug=${encodeURIComponent(guideSlug)}`
  return (
    <div className="mt-6 rounded-lg bg-white p-6">
      <p className="k2-eyebrow">{t.experiencesNearbyEyebrowWaitlist}</p>
      <h2 className="k2-display mt-3 text-lg font-semibold text-kinnso-ink">{t.experiencesNearbyHeadingWaitlist}</h2>
      <div className="mt-5 grid gap-4">
        {experiences.map((exp) => (
          <ExperienceLinkCard key={exp.id} locale={locale} experience={exp} hrefQuery={hrefQuery} />
        ))}
      </div>
    </div>
  )
}
