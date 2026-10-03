import type { TravellerAnalyticsReportRow, TravellerAnalyticsReportWindow } from './analytics-queries'
import { isLocale, type Locale } from '@/lib/i18n/config'

export const ANALYTICS_WINDOWS = ['24h', '7d'] as const
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number]
export type AnalyticsLocaleFilter = 'all' | Locale
export const ANALYTICS_ENTITIES = ['guide', 'experience', 'creator', 'article'] as const
export type AnalyticsEntityFilter = 'all' | (typeof ANALYTICS_ENTITIES)[number]
export const ANALYTICS_BOOKING_STATES = ['off', 'on'] as const
export type AnalyticsBookingFilter = 'all' | (typeof ANALYTICS_BOOKING_STATES)[number]

export interface AnalyticsDashboardFilters {
  window: AnalyticsWindow
  locale: AnalyticsLocaleFilter
  entity: AnalyticsEntityFilter
  booking: AnalyticsBookingFilter
}

const first = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const isWindow = (value: string | undefined): value is AnalyticsWindow => value === '24h' || value === '7d'
const isEntity = (value: string | undefined): value is AnalyticsEntityFilter => value === 'all' || (value !== undefined && (ANALYTICS_ENTITIES as readonly string[]).includes(value))
const isBooking = (value: string | undefined): value is AnalyticsBookingFilter => value === 'all' || value === 'off' || value === 'on'

export function parseAnalyticsDashboardFilters(raw: Record<string, string | string[] | undefined>): AnalyticsDashboardFilters {
  const window = first(raw.window)
  const locale = first(raw.locale)
  const entity = first(raw.entity)
  const booking = first(raw.booking)
  return {
    window: isWindow(window) ? window : '7d',
    locale: locale === 'all' || (locale !== undefined && isLocale(locale)) ? locale as AnalyticsLocaleFilter : 'all',
    entity: isEntity(entity) ? entity : 'all',
    booking: isBooking(booking) ? booking : 'all',
  }
}

export function toAnalyticsReportWindow(filters: Pick<AnalyticsDashboardFilters, 'window'>, now = new Date()): TravellerAnalyticsReportWindow {
  const durationMs = filters.window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return { from: new Date(now.getTime() - durationMs).toISOString(), to: now.toISOString() }
}

export function filterAnalyticsRows(rows: TravellerAnalyticsReportRow[], filters: Pick<AnalyticsDashboardFilters, 'locale' | 'entity' | 'booking'>): TravellerAnalyticsReportRow[] {
  return rows.filter((row) =>
    (filters.locale === 'all' || row.locale === filters.locale)
    && (filters.entity === 'all' || row.entityType === filters.entity)
    && (filters.booking === 'all' || row.bookingState === filters.booking),
  )
}

export const ANALYTICS_HEALTH_STATUSES = [
  'unavailable',
  'no_matching_rows',
  'observed_zero',
  'insufficient_sample',
  'available',
] as const

export type AnalyticsHealthStatus = (typeof ANALYTICS_HEALTH_STATUSES)[number]

export interface AnalyticsHealthSummary {
  status: AnalyticsHealthStatus
  returnedRows: number
  okRows: number
  insufficientRows: number
  observedZeroRows: number
}

const emptyHealthSummary = (status: AnalyticsHealthStatus): AnalyticsHealthSummary => ({
  status,
  returnedRows: 0,
  okRows: 0,
  insufficientRows: 0,
  observedZeroRows: 0,
})

export function deriveAnalyticsHealthSummary(
  rows: TravellerAnalyticsReportRow[] | null,
  error: 'unavailable' | null,
): AnalyticsHealthSummary {
  if (error !== null || rows === null) return emptyHealthSummary('unavailable')

  const returnedRows = rows.length
  const okRows = rows.filter((row) => row.status === 'ok').length
  const insufficientRows = rows.filter((row) => row.status === 'insufficient_sample').length
  const observedZeroRows = rows.filter((row) => row.numerator === 0 && row.denominator === 0).length
  const counts = { returnedRows, okRows, insufficientRows, observedZeroRows }

  if (returnedRows === 0) return { status: 'no_matching_rows', ...counts }
  if (observedZeroRows === returnedRows) return { status: 'observed_zero', ...counts }
  if (insufficientRows > 0) return { status: 'insufficient_sample', ...counts }
  return { status: 'available', ...counts }
}
