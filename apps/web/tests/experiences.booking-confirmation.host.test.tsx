// apps/web/tests/experiences.booking-confirmation.host.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookingConfirmation } from '@/lib/experiences/booking-confirmation-queries'

const { getBookingByCheckoutSessionMock } = vi.hoisted(() => ({
  getBookingByCheckoutSessionMock: vi.fn<(sessionId: string) => Promise<BookingConfirmation | null>>(),
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/experiences/booking-confirmation-queries', () => ({
  getBookingByCheckoutSession: getBookingByCheckoutSessionMock,
}))

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))

const { hasReviewForBookingMock } = vi.hoisted(() => ({ hasReviewForBookingMock: vi.fn(async () => false) }))
vi.mock('@/lib/reviews/queries', () => ({ hasReviewForBooking: hasReviewForBookingMock }))

import BookingConfirmationPage from '@/app/[locale]/experiences/[slug]/booked/page'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('BookingConfirmationPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(
      BookingConfirmationPage({
        params: Promise.resolve({ locale: 'xx', slug: 'sunset-tour' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('notFound')
  })

  it('renders the not-found state when there is no session_id', async () => {
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByText(en.booking.notFoundTitle)).toBeTruthy()
    expect(getBookingByCheckoutSessionMock).not.toHaveBeenCalled()
  })

  it('renders the not-found state when the checkout session resolves no booking', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue(null)
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.notFoundTitle)).toBeTruthy()
  })

  it('renders the pending-payment state with a refresh link containing the encoded session_id', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'pending_payment', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_abc/123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.pendingTitle)).toBeTruthy()
    const refreshLink = screen.getByRole('link', { name: en.booking.refreshCta })
    expect(refreshLink.getAttribute('href')).toBe(
      `/en/experiences/sunset-tour/booked?session_id=${encodeURIComponent('cs_test_abc/123')}`,
    )
  })

  it('renders the confirmed state with experience title, qty, and formatted total', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'confirmed', qty: 3, totalAmount: 1440, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.confirmedTitle)).toBeTruthy()
    expect(screen.getByText('Sunset junk boat tour')).toBeTruthy()
    expect(screen.getByText(`${en.booking.summaryQtyLabel}: 3`)).toBeTruthy()
    expect(screen.getByText(`${en.booking.summaryTotalLabel}: HKD 1,440`)).toBeTruthy()
  })

  it('renders the completed state with experience title, qty, and formatted total', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.completedTitle)).toBeTruthy()
    expect(screen.getByText(en.booking.completedBody)).toBeTruthy()
    expect(screen.getByText('Sunset junk boat tour')).toBeTruthy()
    expect(screen.getByText(`${en.booking.summaryQtyLabel}: 2`)).toBeTruthy()
    expect(screen.getByText(`${en.booking.summaryTotalLabel}: HKD 960`)).toBeTruthy()
    expect(screen.queryByText(en.booking.confirmedTitle)).toBeNull()
  })

  it('shows the review form on the completed branch for the real signed-in traveler on the booking', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: 'u1', experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByRole('button', { name: en.reviews.submitCta })).toBeTruthy()
  })

  it('hides the review form for a guest booking (no travelerUserId) even if someone is signed in', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.queryByRole('button', { name: en.reviews.submitCta })).toBeNull()
  })

  it('shows "already reviewed" instead of the form when hasReviewForBooking is true', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'completed', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: 'u1', experienceId: 'e1', guideId: null,
    })
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    hasReviewForBookingMock.mockResolvedValueOnce(true)
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.reviews.alreadyReviewed)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.reviews.submitCta })).toBeNull()
  })

  it('renders the cancelled state without a booking summary and without the confirmed copy', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'cancelled', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.cancelledTitle)).toBeTruthy()
    expect(screen.getByText(en.booking.cancelledBody)).toBeTruthy()
    // Regression test for the fallthrough bug: a cancelled booking must never
    // show the "confirmedTitle"/"confirmedBody" success copy.
    expect(screen.queryByText(en.booking.confirmedTitle)).toBeNull()
    expect(screen.queryByText(en.booking.confirmedBody)).toBeNull()
    expect(screen.queryByText('Sunset junk boat tour')).toBeNull()
  })

  it('renders the refunded state without a booking summary and without the confirmed copy', async () => {
    getBookingByCheckoutSessionMock.mockResolvedValue({
      bookingId: 'b1', status: 'refunded', qty: 2, totalAmount: 960, currency: 'HKD',
      experienceTitle: 'Sunset junk boat tour', experienceSlug: 'sunset-tour',
      travelerUserId: null, experienceId: 'e1', guideId: null,
    })
    const el = await BookingConfirmationPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ session_id: 'cs_test_123' }),
    })
    render(el)
    expect(screen.getByText(en.booking.refundedTitle)).toBeTruthy()
    expect(screen.getByText(en.booking.refundedBody)).toBeTruthy()
    // Regression test for the fallthrough bug: a refunded booking must never
    // show the "confirmedTitle"/"confirmedBody" success copy.
    expect(screen.queryByText(en.booking.confirmedTitle)).toBeNull()
    expect(screen.queryByText(en.booking.confirmedBody)).toBeNull()
    expect(screen.queryByText('Sunset junk boat tour')).toBeNull()
  })
})
