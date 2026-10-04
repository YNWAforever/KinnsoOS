import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMerchantsOverview } from '@/lib/admin/merchants-queries'
import { MerchantsOverviewView } from '@/components/kinnso/admin/merchants/MerchantsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getMerchantsOverview(supabase)
  return <MerchantsOverviewView t={messages.merchantsOps} locale={loc} overview={overview} />
}
