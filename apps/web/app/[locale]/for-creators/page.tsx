import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ForCreatorsView } from '@/components/kinnso/pages/ForCreatorsView'
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
  return buildPageMetadata({ path: '/for-creators', locale: locale as Locale, title: dict.seo.forCreators.title, description: dict.seo.forCreators.description })
}

export default async function ForCreatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const [messages, testimonials] = await Promise.all([
    getDictionary(locale as Locale),
    getPublishedTestimonials(locale as Locale, 'creator'),
  ])
  const { bookingLive } = resolveConfiguredProductState()
  return <ForCreatorsView locale={locale as Locale} t={messages.forCreators} testimonials={testimonials} bookingLive={bookingLive} />
}
