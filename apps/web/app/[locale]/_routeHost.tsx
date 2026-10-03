import { notFound } from 'next/navigation'
import { ComingSoonPage } from './_components/ComingSoonPage'
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import type { Messages } from '@/lib/i18n/messages/en'

type Params = Promise<{ locale: string }>

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function renderComingSoonPage(
  params: Params,
  getTitle: (messages: Messages) => string,
) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  return (
    <ComingSoonPage
      locale={locale as Locale}
      title={getTitle(messages)}
      t={messages.comingSoon}
    />
  )
}

export type RouteHostProps = { params: Params }
