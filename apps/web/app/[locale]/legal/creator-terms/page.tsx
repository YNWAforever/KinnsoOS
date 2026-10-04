import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorTermsView } from '@/components/kinnso/pages/CreatorTermsView'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/legal/creator-terms', locale: locale as Locale, title: dict.seo.terms.title, description: dict.seo.terms.description })
}

export default async function CreatorTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  return <CreatorTermsView locale={locale as Locale} t={messages.creatorTerms} />
}
