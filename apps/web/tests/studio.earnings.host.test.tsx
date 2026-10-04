// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { creatorPageGateMock, getUserMock, summaryMock, batchesMock } = vi.hoisted(() => ({
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'creator-1' } } })),
  summaryMock: vi.fn(async () => ({ missions: [], bookings: [], tracked: [], totals: [] })),
  batchesMock: vi.fn(async () => []),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: creatorPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}))
vi.mock('@/lib/missions/earnings-summary', () => ({
  getCreatorEarningsSummary: summaryMock,
  getCreatorPayoutBatches: batchesMock,
}))

import StudioEarningsPage from '@/app/[locale]/studio/earnings/page'

beforeEach(() => {
  vi.clearAllMocks()
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-1' } })
  getUserMock.mockResolvedValue({ data: { user: { id: 'creator-1' } } })
  summaryMock.mockResolvedValue({ missions: [], bookings: [], tracked: [], totals: [] })
  batchesMock.mockResolvedValue([])
})

describe('/studio/earnings host', () => {
  it('notFounds an unknown locale', async () => {
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
    expect(batchesMock).not.toHaveBeenCalled()
  })

  it('redirects an anonymous visitor to sign-in', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    expect(summaryMock).not.toHaveBeenCalled()
    expect(batchesMock).not.toHaveBeenCalled()
  })

  it('notFounds a non-creator and never reads earnings', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(summaryMock).not.toHaveBeenCalled()
    expect(batchesMock).not.toHaveBeenCalled()
  })

  it('loads the summary for an active creator', async () => {
    await StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(summaryMock).toHaveBeenCalledTimes(1)
    expect(batchesMock).toHaveBeenCalledTimes(1)
  })

  it('propagates an RPC failure instead of rendering an empty page', async () => {
    summaryMock.mockRejectedValue(new Error('forbidden'))
    await expect(StudioEarningsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('forbidden')
  })
})
