import Link from 'next/link'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'

/**
 * Shared card for the embedded experience CTAs (D-R3-7): article and guide
 * pages both render a small grid of these. Same markup as the /m/[slug]
 * experiences grid (PublicMerchantProfileView) for visual consistency.
 */
export function ExperienceLinkCard({ locale, experience, hrefQuery }: {
  locale: Locale
  experience: PublicExperience
  hrefQuery: string
}) {
  return (
    <Link
      href={`/${locale}/experiences/${experience.slug}?${hrefQuery}`}
      className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange"
    >
      <h3 className="k2-display text-lg font-semibold text-kinnso-ink">{experience.title}</h3>
      <p className="mt-2 text-sm text-kinnso-ink/70">
        {experience.city} · {experience.currency} {experience.priceAmount.toLocaleString()}
      </p>
    </Link>
  )
}

export default ExperienceLinkCard
