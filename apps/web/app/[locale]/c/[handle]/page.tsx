import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import { getCreatorByHandle, getPublishedGuidesForCreator } from '@/lib/creators/queries'
import { listOffersForCreator } from '@/lib/offers/public-queries'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'
import { claimOfferAction } from '@/lib/offers/actions'
import { buildCreatorMetadata, SITE_URL } from '@/lib/seo/metadata'
import { getPublishedArticlesForCreator } from '@/lib/articles/queries'
import { getPublicSessionsForCreator } from '@/lib/sessions/public-queries'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { optionalEnrichmentQuery } from '@/lib/resilience/optional'
import { creatorProfileJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { AnalyticsEntityView } from '@/components/kinnso/analytics/AnalyticsEntityView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}): Promise<Metadata> {
  const { locale, handle } = await params
  if (!isLocale(locale)) return {}
  const creator = await getCreatorByHandle(handle)
  if (!creator) return { title: 'Creator not found', robots: { index: false, follow: false } }
  return buildCreatorMetadata({ handle, locale: locale as Locale, name: creator.name, bio: creator.bio })
}

/**
 * /[locale]/c/[handle] — real public creator profile (no gate).
 * Reads the public projection on `creators` via the anon client (public-read
 * RLS scopes to active + published). Renders qualitative DNA + platform
 * presence + published guides only — no private DNA, no fabricated metrics.
 */
export default async function CreatorPublicPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}) {
  const { locale, handle } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creator = await getCreatorByHandle(handle)
  if (!creator) notFound()
  const canonical = `${SITE_URL}/${locale}/c/${handle}`
  const [guides, articles, sessions, offers] = await Promise.all([
    optionalEnrichmentQuery('creator-profile-guides', () => getPublishedGuidesForCreator(creator.id), []),
    optionalEnrichmentQuery('creator-profile-articles', () => getPublishedArticlesForCreator(creator.handle, locale as Locale), []),
    optionalEnrichmentQuery('creator-profile-sessions', () => getPublicSessionsForCreator(creator.id), []),
    optionalEnrichmentQuery('creator-profile-offers', () => listOffersForCreator(createSupabasePublicClient(), creator.id), []),
  ])
  const ld = [
    creatorProfileJsonLd({
      name: creator.name, handle: creator.handle, url: canonical,
      bio: creator.bio, niches: creator.profile.niches,
    }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.creators.title, url: `${SITE_URL}/${locale}/creators` },
      { name: creator.name, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <AnalyticsEntityView locale={locale as Locale} routeKey="creator_profile" entityType="creator" entityId={creator.id} />
      <CreatorProfileView creator={{ ...creator, guides }} locale={locale as Locale} t={messages.creatorProfile}
        enquiry={messages.enquiry}
        related={messages.destinations}
        articles={articles}
        sessions={sessions}
        offers={offers}
        offerClaim={{ onClaim: claimOfferAction, messages: messages.offerClaim }}
      />
    </>
  )
}
