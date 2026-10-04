import { notFound } from 'next/navigation'
import { AdminAnalyticsView } from '@/components/kinnso/admin/analytics/AdminAnalyticsView'
import { deriveAnalyticsHealthSummary, filterAnalyticsRows, parseAnalyticsDashboardFilters, toAnalyticsReportWindow } from '@/lib/admin/analytics-dashboard'
import { getTravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import { requireOpsPage } from '@/lib/admin/guard'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminAnalyticsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ locale: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const filters = parseAnalyticsDashboardFilters(await searchParams)
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)

  let report: Awaited<ReturnType<typeof getTravellerAnalyticsReport>> | null = null
  let error: 'unavailable' | null = null

  try {
    const result = await getTravellerAnalyticsReport(supabase, toAnalyticsReportWindow(filters))
    report = { ...result, rows: filterAnalyticsRows(result.rows, filters) }
  } catch {
    error = 'unavailable'
  }

  const health = deriveAnalyticsHealthSummary(report?.rows ?? null, error)

  return <AdminAnalyticsView locale={loc} t={messages.admin} filters={filters} report={report} error={error} health={health} />
}
