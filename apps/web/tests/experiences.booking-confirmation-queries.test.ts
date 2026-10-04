// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ rpc: rpcMock }),
}))

import { getBookingByCheckoutSession } from '@/lib/experiences/booking-confirmation-queries'

beforeEach(() => rpcMock.mockReset())

const row = {
  booking_id: 'b1', status: 'confirmed', qty: 2, total_amount: '2400.00', currency: 'HKD',
  experience_title: 'Tokyo After-Hours Izakaya Crawl', experience_slug: 'tokyo-crawl',
  traveler_user_id: 'u1', experience_id: 'e1', guide_id: 'g1',
}

describe('getBookingByCheckoutSession', () => {
  it('maps a found booking to camelCase, including travelerUserId/experienceId/guideId', async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: row, error: null }) })
    const result = await getBookingByCheckoutSession('cs_123')
    expect(result).toEqual({
      bookingId: 'b1', status: 'confirmed', qty: 2, totalAmount: 2400, currency: 'HKD',
      experienceTitle: 'Tokyo After-Hours Izakaya Crawl', experienceSlug: 'tokyo-crawl',
      travelerUserId: 'u1', experienceId: 'e1', guideId: 'g1',
    })
  })

  it('returns null when no booking matches the session id', async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })
    const result = await getBookingByCheckoutSession('cs_missing')
    expect(result).toBeNull()
  })

  it('propagates errors', async () => {
    rpcMock.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) })
    await expect(getBookingByCheckoutSession('cs_err')).rejects.toBeTruthy()
  })
})
