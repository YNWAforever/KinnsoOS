import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ForMerchantsView } from '@/components/kinnso/pages/ForMerchantsView'
import { getPublishedTestimonials } from '@/lib/home/queries'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const revalidate = 3600

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/for-merchants', locale: locale as Locale, title: dict.seo.forMerchants.title, description: dict.seo.forMerchants.description })
}

export default async function ForMerchantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const [messages, testimonials] = await Promise.all([
    getDictionary(locale as Locale),
    getPublishedTestimonials(locale as Locale, 'merchant'),
  ])
  const { bookingLive } = resolveConfiguredProductState()
  return <ForMerchantsView locale={locale as Locale} t={messages.forMerchants} testimonials={testimonials} bookingLive={bookingLive} />
}
