import { describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}))

vi.mock('@supabase/supabase-js', () => ({}))

import { listMerchantBookings, listMyBookings, listOpsBookingSettlements } from '@/lib/bookings/queries'

function chainable(result: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order', 'in']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('listMerchantBookings', () => {
  it('maps a null creator to the "Direct" label and masks the guest email', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 'b1',
            status: 'confirmed',
            qty: 2,
            total_amount: 900,
            currency: 'HKD',
            traveler_user_id: null,
            guest_email: 'traveler@example.com',
            creator_id: null,
            created_at: '2026-07-04T00:00:00Z',
            experiences: { title: 'Hidden Waterfall Hike' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMerchantBookings(supabaseMock as never, 'merchant-profile-1')

    expect(rows[0].creatorLabel).toBe('Direct')
    // maskGuestEmail('traveler@example.com') -> first 2 chars of the local part,
    // asterisks padding out the rest of the local-part length, then the untouched domain.
    expect(rows[0].travelerLabel).toBe('tr******@example.com')
    expect(rows[0].travelerLabel).not.toBe('traveler@example.com')
    expect(rows[0].experienceTitle).toBe('Hidden Waterfall Hike')
  })

  it('labels the traveler with the creator display name, or handle if no display name, when a creator is attached', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 'b2',
            status: 'completed',
            qty: 1,
            total_amount: 450,
            currency: 'HKD',
            traveler_user_id: 'user-1',
            guest_email: null,
            creator_id: 'creator-1',
            created_at: '2026-07-03T00:00:00Z',
            experiences: { title: 'Night Market Food Tour' },
            creators: { handle: 'foodie_hana', display_name: 'Hana' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMerchantBookings(supabaseMock as never, 'merchant-profile-1')

    expect(rows[0].creatorLabel).toBe('Hana')
    expect(rows[0].travelerLabel).toBe('user-1')
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))

    await expect(listMerchantBookings(supabaseMock as never, 'merchant-profile-1')).rejects.toThrow('boom')
  })
})

describe('listMyBookings', () => {
  it('maps merchant_profiles.company_name to merchantName', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't1',
            status: 'confirmed',
            qty: 1,
            total_amount: 300,
            currency: 'HKD',
            created_at: '2026-07-04T00:00:00Z',
            experiences: {
              title: 'Hidden Waterfall Hike',
              slug: 'hidden-waterfall-hike',
              merchant_profiles: { company_name: 'Lantau Adventures Ltd' },
            },
            experience_availability: { date: '2026-08-01' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].merchantName).toBe('Lantau Adventures Ltd')
    expect(rows[0].experienceSlug).toBe('hidden-waterfall-hike')
    expect(rows[0].bookingDate).toBe('2026-08-01')
  })

  it('falls back bookingDate to null when experience_availability is not joinable', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't2',
            status: 'pending_payment',
            qty: 2,
            total_amount: 600,
            currency: 'HKD',
            created_at: '2026-07-03T00:00:00Z',
            experiences: {
              title: 'Night Market Food Tour',
              slug: 'night-market-food-tour',
              merchant_profiles: { company_name: 'Kowloon Eats Co' },
            },
            experience_availability: null,
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].bookingDate).toBeNull()
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))

    await expect(listMyBookings(supabaseMock as never, 'traveler-1')).rejects.toThrow('boom')
  })

  it('maps experience_id, guide_id, and a joined review id onto the row', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't3',
            status: 'completed',
            qty: 1,
            total_amount: 480,
            currency: 'HKD',
            created_at: '2026-06-01T00:00:00Z',
            experience_id: 'e1',
            guide_id: 'g1',
            experiences: { title: 'Sunset Tour', slug: 'sunset-tour', merchant_profiles: { company_name: 'Acme Travel' } },
            experience_availability: null,
            reviews: { id: 'r1' },
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].experienceId).toBe('e1')
    expect(rows[0].guideId).toBe('g1')
    expect(rows[0].reviewId).toBe('r1')
  })

  it('maps a missing review embed to reviewId: null', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 't4',
            status: 'confirmed',
            qty: 1,
            total_amount: 300,
            currency: 'HKD',
            created_at: '2026-06-02T00:00:00Z',
            experience_id: 'e2',
            guide_id: null,
            experiences: { title: 'City Walk', slug: 'city-walk', merchant_profiles: { company_name: 'Kowloon Eats Co' } },
            experience_availability: null,
            reviews: null,
          },
        ],
        error: null,
      }),
    )

    const rows = await listMyBookings(supabaseMock as never, 'traveler-1')

    expect(rows[0].guideId).toBeNull()
    expect(rows[0].reviewId).toBeNull()
  })
})

describe('listOpsBookingSettlements', () => {
  it('maps experienceTitle through the doubly-nested bookings -> experiences embed', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 's1',
            booking_id: 'b1',
            status: 'paid',
            merchant_payout_status: 'paid',
            merchant_payout_amount: 720,
            creator_commission_status: 'pending',
            creator_commission_amount: 90,
            kinnso_commission_status: 'paid',
            kinnso_commission_amount: 90,
            currency: 'HKD',
            bookings: { experiences: { title: 'Hidden Waterfall Hike' } },
          },
        ],
        error: null,
      }),
    )

    const rows = await listOpsBookingSettlements(supabaseMock as never)

    expect(rows[0].experienceTitle).toBe('Hidden Waterfall Hike')
    expect(rows[0].bookingId).toBe('b1')
  })

  it('passes through null creator commission fields for a direct booking, not coerced to 0/empty string', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({
        data: [
          {
            id: 's2',
            booking_id: 'b2',
            status: 'pending',
            merchant_payout_status: 'pending',
            merchant_payout_amount: 810,
            creator_commission_status: null,
            creator_commission_amount: null,
            kinnso_commission_status: 'pending',
            kinnso_commission_amount: 90,
            currency: 'HKD',
            bookings: { experiences: { title: 'Direct Booking Experience' } },
          },
        ],
        error: null,
      }),
    )

    const rows = await listOpsBookingSettlements(supabaseMock as never)

    expect(rows[0].creatorCommissionStatus).toBeNull()
    expect(rows[0].creatorCommissionAmount).toBeNull()
    expect(rows[0].creatorCommissionAmount).not.toBe(0)
    expect(rows[0].creatorCommissionStatus).not.toBe('')
  })

  it('throws instead of swallowing a Supabase error', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: null, error: new Error('boom') }))

    await expect(listOpsBookingSettlements(supabaseMock as never)).rejects.toThrow('boom')
  })
})
