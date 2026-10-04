import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantDashboardHomeView } from '@/components/kinnso/pages/MerchantDashboardHomeView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantDashboardHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  return <MerchantDashboardHomeView locale={loc} t={messages.merchantDashboard} />
}
