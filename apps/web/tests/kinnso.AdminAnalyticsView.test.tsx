// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { AdminAnalyticsView } from '@/components/kinnso/admin/analytics/AdminAnalyticsView'
import type { AnalyticsHealthSummary } from '@/lib/admin/analytics-dashboard'

afterEach(cleanup)

const filters = { window: '7d' as const, locale: 'all' as const, entity: 'all' as const, booking: 'all' as const }
const report = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-08T00:00:00.000Z',
  timezone: 'UTC' as const,
  attributionWindowDays: 7 as const,
  rows: [
    { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
    { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
  ],
}

const health: AnalyticsHealthSummary = {
  status: 'available',
  returnedRows: 2,
  okRows: 1,
  insufficientRows: 1,
  observedZeroRows: 0,
}

describe('AdminAnalyticsView', () => {
  it('renders active window/filter links and the aggregate table', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} health={health} />)
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow7d }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow24h }).getAttribute('href')).toContain('window=24h')
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: en.admin.analyticsMetric })).toBeTruthy()
  })

  it('shows a rate only for ok rows and explains insufficient samples', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} health={health} />)
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText(en.admin.analyticsInsufficientSample)).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders generic unavailable and zero-data copy without raw identifiers', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={null} error="unavailable" health={{ ...health, status: 'unavailable', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(en.admin.analyticsUnavailable)
    expect(screen.queryByText('journey-id')).toBeNull()
  })

  it('renders an explicit empty state when the aggregate adapter returns no rows', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{ ...report, rows: [] }} error={null} health={{ ...health, status: 'no_matching_rows', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 }} />)
    expect(screen.getAllByText(en.admin.analyticsEmpty)).toHaveLength(2)
  })

  it('preserves every current query value when a filter control changes one value', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={{ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }} report={report} error={null} health={health} />)
    expect(screen.getByRole('link', { name: en.admin.analyticsWindow7d }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=7d&locale=zh-hk&entity=experience&booking=on')
    expect(screen.getByRole('link', { name: 'en' }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=en&entity=experience&booking=on')
    expect(screen.getByRole('link', { name: en.admin.analyticsEntityGuide }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=zh-hk&entity=guide&booking=on')
    expect(screen.getByRole('link', { name: en.admin.analyticsBookingOff }).getAttribute('href'))
      .toBe('/en/admin/analytics?window=24h&locale=zh-hk&entity=experience&booking=off')
  })

  it('keeps observed-zero aggregate rows and their honest sample-floor cells visible', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], numerator: 0, denominator: 0, sampleCount: 0, rate: null, status: 'insufficient_sample' }],
    }} error={null} health={{ ...health, status: 'observed_zero', okRows: 0, insufficientRows: 1, observedZeroRows: 1 }} />)
    expect(screen.getAllByText(en.admin.analyticsObservedZero)).toHaveLength(2)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText(en.admin.analyticsInsufficientSample)).toBeTruthy()
    expect(within(screen.getByRole('table')).getAllByText('0')).toHaveLength(2)
  })

  it('renders a localized neutral value for valid dimensionless rows', () => {
    expect(en.admin.analyticsNotApplicable).toBe('—')
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], entityType: null }],
    }} error={null} health={health} />)
    expect(screen.getByText(en.admin.analyticsNotApplicable)).toBeTruthy()
    expect(screen.queryByText(en.admin.analyticsMetricUnknown)).toBeNull()
  })

  it('groups filters with visible labels and uniquely named reset links', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={report} error={null} health={health} />)
    expect(screen.getByRole('group', { name: en.admin.analyticsWindow })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsLocale })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsEntityType })).toBeTruthy()
    expect(screen.getByRole('group', { name: en.admin.analyticsBookingState })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsLocale}: ${en.admin.analyticsAll}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsEntityType}: ${en.admin.analyticsAll}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: `${en.admin.analyticsBookingState}: ${en.admin.analyticsAll}` })).toBeTruthy()
  })

  it('maps untrusted aggregate dimensions to localized unknown copy without rendering raw identifiers', () => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={{
      ...report,
      rows: [{ ...report.rows[0], metricKey: 'journey-id', locale: 'account-id', entityType: 'event-id', bookingState: 'raw-metadata' }],
    }} error={null} health={health} />)
    expect(screen.getAllByText(en.admin.analyticsMetricUnknown)).toHaveLength(4)
    expect(screen.queryByText('journey-id')).toBeNull()
    expect(screen.queryByText('account-id')).toBeNull()
    expect(screen.queryByText('event-id')).toBeNull()
    expect(screen.queryByText('raw-metadata')).toBeNull()
  })

  it.each([
    ['available', health, 'status', en.admin.analyticsHealthAvailable, en.admin.analyticsOk],
    ['no matching rows', { ...health, status: 'no_matching_rows', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 }, 'status', en.admin.analyticsHealthNoMatching, en.admin.analyticsEmpty],
    ['observed zero', { ...health, status: 'observed_zero', okRows: 0, insufficientRows: 1, observedZeroRows: 2 }, 'status', en.admin.analyticsHealthObservedZero, en.admin.analyticsObservedZero],
    ['insufficient sample', { ...health, status: 'insufficient_sample' }, 'status', en.admin.analyticsHealthInsufficient, en.admin.analyticsInsufficientSample],
    ['unavailable', { ...health, status: 'unavailable', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 }, 'alert', en.admin.analyticsHealthUnavailable, `${en.admin.analyticsUnavailable} ${en.admin.analyticsRetry}`],
  ] as const)('renders %s measurement health as a labelled region with state explanation and counts', (_name, summary, role, expectedStatus, expectedDescription) => {
    render(<AdminAnalyticsView locale="en" t={en.admin} filters={filters} report={role === 'alert' ? null : report} error={role === 'alert' ? 'unavailable' : null} health={summary} />)
    const healthRegion = screen.getByRole('region', { name: en.admin.analyticsHealthTitle })

    expect(within(healthRegion).getByRole(role)).toHaveTextContent(en.admin.analyticsHealthStatus)
    expect(within(healthRegion).getByRole(role)).toHaveTextContent(expectedStatus)
    expect(within(healthRegion).getByText(expectedDescription, { selector: '#analytics-health-description' })).toBeTruthy()
    expect(within(healthRegion).getByText(en.admin.analyticsHealthReturnedRows)).toBeTruthy()
    expect(within(healthRegion).getByText(en.admin.analyticsHealthOkRows)).toBeTruthy()
    expect(within(healthRegion).getByText(en.admin.analyticsHealthInsufficientRows)).toBeTruthy()
    expect(within(healthRegion).getByText(en.admin.analyticsHealthObservedZeroRows)).toBeTruthy()
    expect(within(healthRegion).getAllByRole('definition').map((definition) => definition.textContent)).toEqual([
      String(summary.returnedRows),
      String(summary.okRows),
      String(summary.insufficientRows),
      String(summary.observedZeroRows),
    ])
    expect(screen.queryAllByRole('alert')).toHaveLength(role === 'alert' ? 1 : 0)
  })
})
