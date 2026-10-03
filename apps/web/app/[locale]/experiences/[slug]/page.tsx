// apps/web/app/[locale]/experiences/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getExperienceBySlug } from '@/lib/experiences/public-queries'
import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'
import { isExperienceSaved } from '@/lib/saves/experience-queries'
import { getExperienceRatingAggregate, listPublishedReviewsForExperience } from '@/lib/reviews/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { optionalQuery, optionalValue } from '@/lib/resilience/optional'
import { buildExperienceMetadata, SITE_URL } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, experienceOfferJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { ExperiencePublicView } from '@/components/kinnso/pages/ExperiencePublicView'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'
import { AnalyticsEntityView } from '@/components/kinnso/analytics/AnalyticsEntityView'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const experience = await getExperienceBySlug(slug)
  if (!experience) return { title: 'Experience not found', robots: { index: false, follow: false } }
  const description = experience.summary ?? `${experience.city} experience hosted by ${experience.merchant.companyName}.`
  return buildExperienceMetadata({ slug, locale: locale as Locale, title: experience.title, description })
}

export default async function ExperiencePublicPage({ params, searchParams }: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale, slug } = await params
  const sp = await searchParams
  const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sourceSurface = firstOf(sp.src)
  const guideSlug = firstOf(sp.guideSlug)
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const { bookingLive } = resolveConfiguredProductState()
  const experience = await getExperienceBySlug(slug)
  if (!experience) notFound()

  const availability = await optionalQuery(
    'experience-availability',
    () => listPublicAvailability(experience.id),
    [],
  )
  const viewer = await optionalQuery('experience-viewer', async () => {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isSaved = user
      ? await optionalQuery('experience-save-state', () => isExperienceSaved(supabase, experience.id, user.id), false)
      : false
    return { user, isSaved }
  }, { user: null, isSaved: false })
  const [rating, reviews] = await Promise.all([
    optionalQuery('experience-rating', () => getExperienceRatingAggregate(createSupabasePublicClient(), experience.id), null),
    optionalQuery('experience-reviews', () => listPublishedReviewsForExperience(createSupabasePublicClient(), experience.id), []),
  ])

  const canonical = `${SITE_URL}/${locale}/experiences/${slug}`
  const hasOpenAvailability = availability.some((a) => a.remaining > 0)
  const approvedCover = isApprovedEntityMediaUrl(experience.coverUrl) ? experience.coverUrl : null
  const ld = optionalValue('experience-jsonld', () => [
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: experience.title, url: canonical },
    ]),
    experienceOfferJsonLd({
      name: experience.title,
      description:
        experience.summary ??
        experience.description ??
        `${experience.city} experience`,
      url: canonical,
      image: approvedCover,
      priceAmount: experience.priceAmount,
      currency: experience.currency,
      available: bookingLive && hasOpenAvailability,
      rating: rating ?? undefined,
    }),
  ], [])
  return (
    <>
      <JsonLd data={ld} />
      <AnalyticsEntityView locale={locale as Locale} routeKey="experience_detail" entityType="experience" entityId={experience.id} />
      <ExperiencePublicView
        locale={locale as Locale}
        t={messages.experiencePublic}
        bookingT={messages.booking}
        featureInterestT={messages.featureInterest}
        bookingLive={bookingLive}
        reviewsT={messages.reviews}
        experienceSaveT={messages.experienceSave}
        experience={experience}
        availability={availability}
        viewerEmail={viewer.user?.email ?? null}
        viewerId={viewer.user?.id ?? null}
        isSaved={viewer.isSaved}
        rating={rating}
        reviews={reviews}
        sourceSurface={sourceSurface}
        guideSlug={guideSlug}
      />
    </>
  )
}
