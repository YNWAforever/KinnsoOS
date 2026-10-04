import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { MerchantsDirectoryView } from '@/components/kinnso/pages/MerchantsDirectoryView'
import { getPublicMerchants } from '@/lib/merchants/public-queries'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale as Locale)
  return buildPageMetadata({ path: '/merchants', locale: locale as Locale, title: dict.seo.merchants.title, description: dict.seo.merchants.description })
}

export default async function MerchantsDirectoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const merchants = await getPublicMerchants()
  return <MerchantsDirectoryView locale={loc} t={messages.merchantsDirectory} merchants={merchants} />
}
