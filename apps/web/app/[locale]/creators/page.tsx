import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'
import { getPublicCreators } from '@/lib/creators/queries'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/creators', locale: locale as Locale, title: dict.seo.creators.title, description: dict.seo.creators.description })
}

export default async function CreatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const creators = await getPublicCreators()
  return <CreatorsLandingView locale={locale as Locale} t={messages.creatorsLanding} creators={creators} />
}
