import { notFound, redirect } from 'next/navigation'
import { isLocale, LOCALES } from '@/lib/i18n/config'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function FeedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  // /feed and /explore render the same published-guides data; /explore is canonical.
  redirect(`/${locale}/explore`)
}
