import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMissionsOverview, getMissionAttention } from '@/lib/admin/missions-queries'
import { MissionsOverviewView } from '@/components/kinnso/admin/missions/MissionsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MissionsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const [overview, attention] = await Promise.all([
    getMissionsOverview(supabase),
    getMissionAttention(supabase),
  ])
  return <MissionsOverviewView t={messages.missionsOps} locale={loc} overview={overview} attention={attention} />
}
