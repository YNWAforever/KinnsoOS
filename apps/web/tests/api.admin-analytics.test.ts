import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createSupabaseServerClientMock, getUserMock, resolveViewerRoleMock, getTravellerAnalyticsReportMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
  resolveViewerRoleMock: vi.fn(),
  getTravellerAnalyticsReportMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('@/lib/auth/viewer-role', () => ({
  resolveViewerRole: resolveViewerRoleMock,
}))

vi.mock('@/lib/admin/analytics-queries', () => ({
  getTravellerAnalyticsReport: getTravellerAnalyticsReportMock,
}))

import { GET } from '@/app/api/admin/analytics/route'

const report = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-08T00:00:00.000Z',
  timezone: 'UTC' as const,
  attributionWindowDays: 7 as const,
  rows: [],
}

function request(query = '') {
  return new Request(`http://kinnso.test/api/admin/analytics${query}`)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T12:00:00.000Z'))
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops-user' } } })
  resolveViewerRoleMock.mockResolvedValue('ops')
  getTravellerAnalyticsReportMock.mockResolvedValue(report)
  createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('GET /api/admin/analytics', () => {
  it('uses a default seven-day UTC window for an authenticated ops user', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(resolveViewerRoleMock).toHaveBeenCalledWith(expect.anything(), 'ops-user')
    expect(getTravellerAnalyticsReportMock).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-08-01T12:00:00.000Z',
      to: '2026-08-08T12:00:00.000Z',
    })
    await expect(response.json()).resolves.toEqual(report)
  })

  it('returns 401 without resolving a role or querying aggregates when signed out', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const response = await GET(request())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(resolveViewerRoleMock).not.toHaveBeenCalled()
    expect(getTravellerAnalyticsReportMock).not.toHaveBeenCalled()
  })

  it('returns 403 without querying aggregates for a non-ops user', async () => {
    resolveViewerRoleMock.mockResolvedValue('traveler')

    const response = await GET(request())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' })
    expect(getTravellerAnalyticsReportMock).not.toHaveBeenCalled()
  })

  it('rejects a requested window larger than seven days before the aggregate RPC', async () => {
    const response = await GET(request('?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-08T00%3A00%3A00.001Z'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_window' })
    expect(getTravellerAnalyticsReportMock).not.toHaveBeenCalled()
  })

  it('does not expose an aggregate backend error', async () => {
    getTravellerAnalyticsReportMock.mockRejectedValue(new Error('database internals'))

    const response = await GET(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'unavailable' })
  })
})
