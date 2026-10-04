import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorPage } from '@/lib/admin/guard'
import { getCreatorInsights } from '@/lib/insights/creator'
import { CreatorInsightsView } from '@/components/kinnso/pages/CreatorInsightsView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioInsightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc: Locale = isLocale(locale) ? (locale as Locale) : 'en'

  const supabase = await createSupabaseServerClient()
  await requireCreatorPage(supabase, loc, 'studio')

  const messages = await getDictionary(loc)
  const data = await getCreatorInsights(supabase)
  return <CreatorInsightsView t={messages.insights} data={data} />
}
