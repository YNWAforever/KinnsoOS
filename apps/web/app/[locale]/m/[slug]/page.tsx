import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getMerchantBySlug } from '@/lib/merchants/public-queries'
import { listPublishedExperiencesForMerchant } from '@/lib/experiences/public-queries'
import { getAttributedGuidesForMerchant } from '@/lib/guides/queries'
import { optionalEnrichmentQuery } from '@/lib/resilience/optional'
import { resolveConfiguredProductState } from '@/lib/product-state-config'
import { buildMerchantMetadata, SITE_URL } from '@/lib/seo/metadata'
import { merchantProfileJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { PublicMerchantProfileView } from '@/components/kinnso/pages/PublicMerchantProfileView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const merchant = await getMerchantBySlug(slug)
  if (!merchant) return { title: 'Merchant not found', robots: { index: false, follow: false } }
  return buildMerchantMetadata({ slug, locale: locale as Locale, name: merchant.companyName, tagline: merchant.tagline })
}

export default async function MerchantPublicProfilePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const merchant = await getMerchantBySlug(slug)
  if (!merchant) notFound()
  const { bookingLive } = resolveConfiguredProductState()
  const [experiences, featuredGuides] = await Promise.all([
    listPublishedExperiencesForMerchant(merchant.id),
    optionalEnrichmentQuery('merchant-featured-guides', () => getAttributedGuidesForMerchant(merchant.id), []),
  ])
  const canonical = `${SITE_URL}/${locale}/m/${slug}`
  const ld = [
    merchantProfileJsonLd({ name: merchant.companyName, url: canonical, tagline: merchant.tagline, city: merchant.city }),
    breadcrumbJsonLd([
      { name: messages.breadcrumb.home, url: `${SITE_URL}/${locale}` },
      { name: messages.seo.merchants.title, url: `${SITE_URL}/${locale}/merchants` },
      { name: merchant.companyName, url: canonical },
    ]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <PublicMerchantProfileView locale={locale as Locale} t={messages.merchantProfile} enquiry={messages.enquiry} booking={messages.booking} merchant={merchant} experiences={experiences} featuredGuides={featuredGuides} bookingLive={bookingLive} />
    </>
  )
}
