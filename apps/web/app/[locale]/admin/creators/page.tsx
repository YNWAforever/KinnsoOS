import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getCreatorsOverview } from '@/lib/admin/creators-queries'
import { CreatorsOverviewView } from '@/components/kinnso/admin/creators/CreatorsOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CreatorsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate before any data access: Next renders layout + page in parallel, so the
  // layout's gate does not precede this page's fetch. Match the sibling admin pages.
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getCreatorsOverview(supabase)
  return <CreatorsOverviewView t={messages.creators} locale={loc} overview={overview} />
}
