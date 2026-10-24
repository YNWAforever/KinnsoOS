// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'

afterEach(cleanup)

const { browserUserMock } = vi.hoisted(() => ({
  browserUserMock: vi.fn(async (): Promise<{
    data: { user: { id: string } | null }
    error: { name: string; status?: number } | null
  }> => ({ data: { user: null }, error: { name: 'AuthSessionMissingError' } })),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ auth: { getUser: browserUserMock } }),
}))

// Typed against the real outcome union so a failure case carrying `reason` is
// assignable; inferring from the success default narrows it to { ok; guideId }.
type GuideUnsaveOutcome =
  | { ok: true; guideId: string }
  | { ok: false; reason: 'auth' | 'failed'; errors: Record<string, string[]> }

const { unsaveGuideActionMock } = vi.hoisted(() => ({
  unsaveGuideActionMock: vi.fn(async (): Promise<GuideUnsaveOutcome> => ({ ok: true, guideId: 'g1' })),
}))
vi.mock('@/lib/saves/guide-actions', () => ({ unsaveGuideAction: unsaveGuideActionMock }))

type ExperienceUnsaveOutcome =
  | { ok: true; experienceId: string }
  | { ok: false; reason: 'auth' | 'failed'; errors: Record<string, string[]> }

const { unsaveExperienceActionMock } = vi.hoisted(() => ({
  unsaveExperienceActionMock: vi.fn(async (): Promise<ExperienceUnsaveOutcome> => ({ ok: true, experienceId: 'e1' })),
}))
vi.mock('@/lib/saves/experience-actions', () => ({ unsaveExperienceAction: unsaveExperienceActionMock }))

const { submitReviewActionMock } = vi.hoisted(() => ({
  submitReviewActionMock: vi.fn(async () => ({ ok: true, bookingId: 'b1' })),
}))
vi.mock('@/lib/reviews/actions', () => ({ submitReviewAction: submitReviewActionMock }))

const t = {
  title: 'Your trips',
  empty: 'No bookings yet — once you book an experience, it’ll show up here.',
  colExperience: 'Experience',
  colMerchant: 'Merchant',
  colQty: 'Qty',
  colStatus: 'Status',
  colAmount: 'Amount',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
  bookedOnLabel: 'Booked on',
  savedGuidesTitle: 'Saved guides',
  savedGuidesEmpty: "You haven't saved any guides yet.",
  savedExperiencesTitle: 'Saved experiences',
  savedExperiencesEmpty: "You haven't saved any experiences yet.",
  reviewCta: 'Leave a review',
  reviewedLabel: 'Reviewed',
  unsaveFailed: 'That did not remove it. Please try again.',
  unsaveSignIn: 'Sign in to finish removing',
}

const reviewsT = {
  formHeading: 'Leave a review', ratingLabel: 'Rating', bodyLabel: 'Your review (optional)',
  bodyPlaceholder: 'Tell other travellers about your experience…', submitCta: 'Submit review',
  submittingCta: 'Submitting…', submitted: 'Thanks for your review!',
  alreadyReviewed: 'You already reviewed this booking.', genericError: 'Something went wrong. Please try again.',
  ratingAverageLabel: '{average} out of 5', countLabel: '{count} reviews', emptyState: 'No reviews yet.',
  anonymousReviewer: 'A KINNSO traveller',
}

const baseBooking = {
  id: 'b1',
  experienceTitle: 'Hidden Waterfall Hike',
  experienceSlug: 'hidden-waterfall-hike',
  merchantName: 'Sunrise Stays HK',
  status: 'confirmed' as const,
  qty: 2,
  totalAmount: 900,
  currency: 'HKD',
  bookingDate: '2026-08-01',
  createdAt: '2026-07-04T00:00:00Z',
  experienceId: 'e1',
  guideId: null,
  reviewId: null,
}

describe('TravelerTripsView', () => {
  it('exposes a stable fragment target for saved traveller content', () => {
    render(
      <TravelerTripsView
        locale="en"
        t={t}
        reviewsT={reviewsT}
        savesLabel="saves"
        bookings={[]}
        savedGuides={[]}
        savedExperiences={[]}
      />,
    )
    expect(document.getElementById('saved')).toBeTruthy()
  })
  it('renders the empty state', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
  })

  it('renders a booking row', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[baseBooking]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Sunrise Stays HK')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Hidden Waterfall Hike' })
    expect(link.getAttribute('href')).toBe('/en/experiences/hidden-waterfall-hike')
  })

  it('renders a booking row with a null bookingDate: falls back to "Booked on <createdAt>"', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[{ ...baseBooking, id: 'b2', status: 'pending_payment', bookingDate: null }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByText(/Booked on/)).toBeInTheDocument()
  })

  it('renders plain text (not a link) when experienceSlug is empty', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[{ ...baseBooking, id: 'b3', experienceSlug: '', experienceTitle: 'Now-Unlisted Tour' }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Now-Unlisted Tour')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Now-Unlisted Tour' })).toBeNull()
  })

  it('shows a "Leave a review" CTA for a completed booking with no review, and opens the form on click', async () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[{ ...baseBooking, id: 'b4', status: 'completed', reviewId: null }]} savedGuides={[]} savedExperiences={[]} />)
    const cta = screen.getByRole('button', { name: 'Leave a review' })
    fireEvent.click(cta)
    expect(screen.getByRole('button', { name: reviewsT.submitCta })).toBeInTheDocument()
  })

  it('shows "Reviewed" (no CTA) for a completed booking that already has a reviewId', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[{ ...baseBooking, id: 'b5', status: 'completed', reviewId: 'r1' }]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText('Reviewed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leave a review' })).toBeNull()
  })

  it('shows neither a CTA nor "Reviewed" for a non-completed booking', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[baseBooking]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.queryByRole('button', { name: 'Leave a review' })).toBeNull()
    expect(screen.queryByText('Reviewed')).toBeNull()
  })

  it('shows the empty state for both Saved sections when nothing is saved', () => {
    render(<TravelerTripsView locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]} savedGuides={[]} savedExperiences={[]} />)
    expect(screen.getByText("You haven't saved any guides yet.")).toBeInTheDocument()
    expect(screen.getByText("You haven't saved any experiences yet.")).toBeInTheDocument()
  })

  it('renders a saved guide as a real GuideCard and removes it from the list on unsave', async () => {
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]}
        savedGuides={[{ guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' } }]}
        savedExperiences={[]}
      />,
    )
    const guideHeading = screen.getByRole('heading', { level: 3, name: 'Kyoto Tea Houses' })
    expect(guideHeading.closest('a')).toHaveAttribute('href', '/en/g/kyoto-tea')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(unsaveGuideActionMock).toHaveBeenCalledWith('en', 'g1'))
    await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Kyoto Tea Houses' })).toBeNull())
  })

  it('renders a saved experience as a real ExperienceCard and removes it from the list on unsave', async () => {
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]} savedGuides={[]}
        savedExperiences={[{ experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3 }]}
      />,
    )
    const experienceLink = screen.getByRole('link', { name: /Sunset junk boat tour/ })
    expect(experienceLink).toHaveAttribute('href', '/en/experiences/sunset-tour')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(unsaveExperienceActionMock).toHaveBeenCalledWith('en', 'e1'))
    await waitFor(() => expect(screen.queryByRole('link', { name: /Sunset junk boat tour/ })).toBeNull())
  })

  it('keeps the saved guide and reports the failure when the unsave is rejected', async () => {
    // A rejected unsave used to change nothing on screen: the card stayed and no
    // message appeared, so the click read as broken rather than as "not removed".
    unsaveGuideActionMock.mockResolvedValueOnce({ ok: false, reason: 'failed', errors: { form: ['Guide could not be removed'] } })
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]}
        savedGuides={[{ guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' } }]}
        savedExperiences={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(t.unsaveFailed)
    expect(screen.getByRole('heading', { level: 3, name: 'Kyoto Tea Houses' })).toBeInTheDocument()
  })

  it('offers a sign-in link when the session lapsed before an unsave could be confirmed', async () => {
    unsaveExperienceActionMock.mockResolvedValueOnce({ ok: false, reason: 'auth', errors: { form: ['Sign in is required'] } })
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]} savedGuides={[]}
        savedExperiences={[{ experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3 }]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(t.unsaveFailed)
    expect(screen.getByRole('link', { name: t.unsaveSignIn })).toHaveAttribute('href', '/en/sign-in?next=%2Fen%2Ftrips')
    expect(screen.getByRole('link', { name: /Sunset junk boat tour/ })).toBeInTheDocument()
  })

  for (const kind of ['guide', 'experience'] as const) {
    it(`checks the session when the ${kind} action rejects before returning an auth outcome`, async () => {
      browserUserMock.mockClear()
      const action = kind === 'guide' ? unsaveGuideActionMock : unsaveExperienceActionMock
      action.mockRejectedValueOnce(new Error('The proxy returned a sign-in page'))
      browserUserMock.mockResolvedValueOnce({
        data: { user: null }, error: { name: 'AuthSessionMissingError' },
      })
      render(
        <TravelerTripsView
          locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]}
          savedGuides={kind === 'guide' ? [{
            guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: null, city: 'Kyoto', saves: 5, creatorHandle: 'teafan' },
          }] : []}
          savedExperiences={kind === 'experience' ? [{
            experienceId: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', city: 'Hong Kong', priceAmount: 480, currency: 'HKD', coverUrl: null, savesCount: 3,
          }] : []}
        />,
      )
      fireEvent.click(screen.getByRole('button'))
      expect(await screen.findByRole('link', { name: t.unsaveSignIn })).toHaveAttribute('href', '/en/sign-in?next=%2Fen%2Ftrips')
      if (kind === 'guide') expect(screen.getByRole('heading', { name: 'Kyoto Tea Houses' })).toBeInTheDocument()
      else expect(screen.getByRole('link', { name: /Sunset junk boat tour/ })).toBeInTheDocument()
    })
  }

  it('keeps a signed-in transport failure distinct from a missing session', async () => {
    browserUserMock.mockClear()
    unsaveGuideActionMock.mockRejectedValueOnce(new Error('Transport down'))
    browserUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })
    render(
      <TravelerTripsView
        locale="en" t={t} reviewsT={reviewsT} savesLabel="saves" bookings={[]} savedExperiences={[]}
        savedGuides={[{ guideId: 'g1', guide: { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: null, city: 'Kyoto', saves: 5, creatorHandle: 'teafan' } }]}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.unsaveFailed)
    await waitFor(() => expect(browserUserMock).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: t.unsaveSignIn })).toBeNull()
  })
})
