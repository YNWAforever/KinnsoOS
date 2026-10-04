import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface TravellerAnalyticsReportRow {
  metricKey: string
  locale: string
  entityType: string | null
  bookingState: string
  numerator: number
  denominator: number
  rate: number | null
  sampleCount: number
  status: string
  attributionWindowDays: number
}

export interface TravellerAnalyticsReport {
  from: string
  to: string
  timezone: 'UTC'
  attributionWindowDays: 7
  rows: TravellerAnalyticsReportRow[]
}

export interface TravellerAnalyticsReportWindow {
  from: string
  to: string
}

/**
 * Maps the ops-gated aggregate RPC into a stable, raw-identifier-free API shape.
 * SQL function names and argument spellings intentionally stay inside this adapter.
 */
export async function getTravellerAnalyticsReport(
  supabase: Client,
  window: TravellerAnalyticsReportWindow,
): Promise<TravellerAnalyticsReport> {
  const { data, error } = await supabase.rpc('admin_traveller_analytics_report', {
    p_window_start: window.from,
    p_window_end: window.to,
  })
  if (error) throw error

  return {
    ...window,
    timezone: 'UTC',
    attributionWindowDays: 7,
    rows: (data ?? []).map((row) => ({
      metricKey: row.metric_key,
      locale: row.locale,
      entityType: row.entity_type,
      bookingState: row.booking_state,
      numerator: Number(row.numerator),
      denominator: Number(row.denominator),
      rate: row.rate === null ? null : Number(row.rate),
      sampleCount: Number(row.sample_count),
      status: row.status,
      attributionWindowDays: Number(row.attribution_window_days),
    })),
  }
}
