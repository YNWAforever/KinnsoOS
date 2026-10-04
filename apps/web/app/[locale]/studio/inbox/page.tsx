import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorPage } from '@/lib/admin/guard'
import { getNotifications } from '@/lib/notifications/queries'
import { markNotificationReadAction } from '@/lib/notifications/actions'
import { StudioInboxView } from '@/components/kinnso/pages/StudioInboxView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function StudioInboxPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc)

  const notifications = await getNotifications(supabase)

  return (
    <StudioInboxView
      t={messages.notifications}
      locale={loc}
      notifications={notifications}
      markReadAction={markNotificationReadAction}
    />
  )
}
