import { describe, expect, it } from 'vitest'
import {
  deriveAnalyticsHealthSummary,
  filterAnalyticsRows,
  parseAnalyticsDashboardFilters,
  toAnalyticsReportWindow,
  type AnalyticsHealthSummary,
} from '@/lib/admin/analytics-dashboard'
import type { TravellerAnalyticsReportRow } from '@/lib/admin/analytics-queries'

const healthRow = (patch: Partial<TravellerAnalyticsReportRow> = {}): TravellerAnalyticsReportRow => ({
  metricKey: 'entity_to_cta',
  locale: 'en',
  entityType: 'guide',
  bookingState: 'off',
  numerator: 2,
  denominator: 10,
  rate: 0.2,
  sampleCount: 10,
  status: 'ok',
  attributionWindowDays: 7,
  ...patch,
})

const summary = (patch: Partial<AnalyticsHealthSummary>): AnalyticsHealthSummary => ({
  status: 'available',
  returnedRows: 0,
  okRows: 0,
  insufficientRows: 0,
  observedZeroRows: 0,
  ...patch,
})

describe('parseAnalyticsDashboardFilters', () => {
  it('uses safe defaults', () => {
    expect(parseAnalyticsDashboardFilters({})).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('accepts only allowlisted values and drops arbitrary strings', () => {
    expect(parseAnalyticsDashboardFilters({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }))
      .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
    expect(parseAnalyticsDashboardFilters({ window: '30d', locale: 'DROP TABLE', entity: 'unknown', booking: 'maybe' }))
      .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('uses the first value when Next supplies a string array', () => {
    expect(parseAnalyticsDashboardFilters({ window: ['24h', '7d'], locale: ['en'] })).toMatchObject({ window: '24h', locale: 'en' })
  })
})

describe('toAnalyticsReportWindow', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('returns exact UTC ISO boundaries for both presets', () => {
    expect(toAnalyticsReportWindow({ window: '24h' }, now))
      .toEqual({ from: '2026-08-07T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
    expect(toAnalyticsReportWindow({ window: '7d' }, now))
      .toEqual({ from: '2026-08-01T12:00:00.000Z', to: '2026-08-08T12:00:00.000Z' })
  })
})

describe('filterAnalyticsRows', () => {
  const rows = [
    { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
    { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
  ] as const

  it('keeps only rows matching every selected dimension', () => {
    expect(filterAnalyticsRows([...rows], { locale: 'en', entity: 'guide', booking: 'off' })).toEqual([rows[0]])
    expect(filterAnalyticsRows([...rows], { locale: 'all', entity: 'all', booking: 'all' })).toEqual(rows)
  })
})

describe('deriveAnalyticsHealthSummary', () => {
  it('returns unavailable before inspecting rows', () => {
    expect(deriveAnalyticsHealthSummary(null, 'unavailable')).toEqual(summary({ status: 'unavailable' }))
  })

  it('keeps a successful empty filter neutral', () => {
    expect(deriveAnalyticsHealthSummary([], null)).toEqual(summary({ status: 'no_matching_rows' }))
  })

  it('prioritizes observed zero over insufficient sample', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow({ numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'observed_zero', returnedRows: 1, insufficientRows: 1, observedZeroRows: 1 }))
  })

  it('reports insufficient samples when rows are non-zero but withheld', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow({ numerator: 1, denominator: 4, sampleCount: 4, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'insufficient_sample', returnedRows: 1, insufficientRows: 1 }))
  })

  it('counts mixed rows and reports available when all rows are interpretable', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow(),
      healthRow({ numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'ok' }),
    ], null)).toEqual(summary({ status: 'available', returnedRows: 2, okRows: 2, observedZeroRows: 1 }))
  })

  it('reports insufficient when an interpretable row is mixed with a withheld row', () => {
    expect(deriveAnalyticsHealthSummary([
      healthRow(),
      healthRow({ numerator: 1, denominator: 4, sampleCount: 4, rate: null, status: 'insufficient_sample' }),
    ], null)).toEqual(summary({ status: 'insufficient_sample', returnedRows: 2, okRows: 1, insufficientRows: 1 }))
  })
})
