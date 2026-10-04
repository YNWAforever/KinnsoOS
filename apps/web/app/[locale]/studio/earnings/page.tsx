import { notFound } from 'next/navigation'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCreatorEarningsSummary, getCreatorPayoutBatches } from '@/lib/missions/earnings-summary'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Params = Promise<{ locale: string }>

export default async function StudioEarningsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc)

  const [data, payoutBatches] = await Promise.all([
    getCreatorEarningsSummary(supabase),
    getCreatorPayoutBatches(supabase),
  ])

  return <StudioEarningsView t={messages.studioEarnings} locale={loc} data={data} payoutBatches={payoutBatches} />
}
