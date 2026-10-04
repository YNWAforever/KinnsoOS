// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TravellerAnalyticsReport } from '@/lib/admin/analytics-queries'

const { opsPageGateMock, getUserMock, reportMock, viewMock } = vi.hoisted(() => ({
  opsPageGateMock: vi.fn(async () => ({ user: { id: 'ops1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  reportMock: vi.fn<() => Promise<TravellerAnalyticsReport>>(async () => ({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z',
    timezone: 'UTC' as const,
    attributionWindowDays: 7 as const,
    rows: [],
  })),
  viewMock: vi.fn((...args: unknown[]) => {
    void args
    return <div data-testid="analytics-view" />
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: opsPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/lib/admin/analytics-queries', () => ({ getTravellerAnalyticsReport: reportMock }))
vi.mock('@/components/kinnso/admin/analytics/AdminAnalyticsView', () => ({ AdminAnalyticsView: viewMock }))

import AdminAnalyticsPage from '@/app/[locale]/admin/analytics/page'

beforeEach(() => {
  opsPageGateMock.mockResolvedValue({ user: { id: 'ops1' } })
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
  reportMock.mockResolvedValue({
    from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z', timezone: 'UTC', attributionWindowDays: 7, rows: [],
  })
})
afterEach(() => vi.clearAllMocks())

describe('/admin/analytics host', () => {
  it('redirects anonymous users and 404s non-ops before the report query', async () => {
    opsPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    opsPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('defaults to 7d and passes normalized rows to the view', async () => {
    const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect(reportMock).toHaveBeenCalledWith(expect.anything(), { from: expect.any(String), to: expect.any(String) })
    expect((ui as { props: { filters: unknown } }).props.filters).toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('uses 24h and allowlisted dimensions while coercing invalid values', async () => {
    const allowlistedUi = await AdminAnalyticsPage({
      params: Promise.resolve({ locale: 'zh-hk' }),
      searchParams: Promise.resolve({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' }),
    })
    expect((allowlistedUi as { props: { filters: unknown } }).props.filters)
      .toEqual({ window: '24h', locale: 'zh-hk', entity: 'experience', booking: 'on' })
    const coercedUi = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ window: '30d', locale: 'DROP TABLE' }) })
    expect((coercedUi as { props: { filters: unknown } }).props.filters)
      .toEqual({ window: '7d', locale: 'all', entity: 'all', booking: 'all' })
  })

  it('derives health from the filtered aggregate rows passed to the view', async () => {
    reportMock.mockResolvedValueOnce({
      from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z', timezone: 'UTC', attributionWindowDays: 7,
      rows: [
        { metricKey: 'entity_to_cta', locale: 'en', entityType: 'guide', bookingState: 'off', numerator: 2, denominator: 10, rate: 0.2, sampleCount: 10, status: 'ok', attributionWindowDays: 7 },
        { metricKey: 'entity_to_cta', locale: 'zh-hk', entityType: 'experience', bookingState: 'on', numerator: 1, denominator: 4, rate: null, sampleCount: 4, status: 'insufficient_sample', attributionWindowDays: 7 },
      ],
    })

    const ui = await AdminAnalyticsPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ locale: 'en' }),
    })

    expect((ui as { props: { health: unknown } }).props.health).toEqual({
      status: 'available', returnedRows: 1, okRows: 1, insufficientRows: 0, observedZeroRows: 0,
    })
  })

  it('passes a generic unavailable state when the aggregate query fails', async () => {
    reportMock.mockRejectedValueOnce(new Error('database internals'))
    const ui = await AdminAnalyticsPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect((ui as { props: { error: string; report: unknown; health: unknown } }).props).toMatchObject({
      error: 'unavailable',
      report: null,
      health: { status: 'unavailable', returnedRows: 0, okRows: 0, insufficientRows: 0, observedZeroRows: 0 },
    })
  })
})
