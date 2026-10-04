import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { getMerchantInsights } from '@/lib/insights/merchant'
import { MerchantInsightsView } from '@/components/kinnso/pages/MerchantInsightsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantsInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale

  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, loc)

  const messages = await getDictionary(loc)
  const data = await getMerchantInsights(supabase)
  return <MerchantInsightsView t={messages.insights} data={data} />
}
