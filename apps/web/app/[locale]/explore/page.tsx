import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { ExploreView } from '@/components/kinnso/pages/ExploreView'
import { getPublishedGuides } from '@/lib/guides/queries'
import { getPublishedDestinations } from '@/lib/destinations/queries'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/explore', locale: locale as Locale, title: dict.seo.explore.title, description: dict.seo.explore.description })
}

export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const [guides, destinations] = await Promise.all([
    getPublishedGuides(),
    getPublishedDestinations(),
  ])
  return (
    <ExploreView
      locale={locale as Locale}
      t={messages.explore}
      guides={guides}
      destinations={destinations}
    />
  )
}
