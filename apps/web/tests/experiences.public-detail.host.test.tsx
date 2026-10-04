// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'

const { resolveConfiguredProductStateMock, joinFeatureInterestActionMock, getExperienceBySlugMock, listPublicAvailabilityMock, getUserMock, createSupabaseServerClientMock, createCheckoutSessionActionMock } = vi.hoisted(() => ({
  resolveConfiguredProductStateMock: vi.fn(),
  joinFeatureInterestActionMock: vi.fn(),
  getExperienceBySlugMock: vi.fn(),
  listPublicAvailabilityMock: vi.fn(async (): Promise<PublicAvailability[]> => []),
  getUserMock: vi.fn(async () => ({ data: { user: null as { email: string; id?: string } | null } })),
  createSupabaseServerClientMock: vi.fn(),
  createCheckoutSessionActionMock: vi.fn(),
}))
vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: resolveConfiguredProductStateMock }))
vi.mock('@/lib/feature-interest/actions', () => ({ joinFeatureInterestAction: joinFeatureInterestActionMock }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/experiences/public-queries', () => ({
  getExperienceBySlug: getExperienceBySlugMock,
  listPublishedExperiencesForMerchant: vi.fn(),
}))
vi.mock('@/lib/experiences/public-availability-queries', () => ({
  listPublicAvailability: listPublicAvailabilityMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: vi.fn(() => ({})) }))
vi.mock('@/lib/experiences/booking-actions', () => ({
  createCheckoutSessionAction: createCheckoutSessionActionMock,
}))

const { isExperienceSavedMock } = vi.hoisted(() => ({ isExperienceSavedMock: vi.fn(async () => false) }))
vi.mock('@/lib/saves/experience-queries', () => ({ isExperienceSaved: isExperienceSavedMock }))

const { getExperienceRatingAggregateMock, listPublishedReviewsForExperienceMock } = vi.hoisted(() => ({
  getExperienceRatingAggregateMock: vi.fn(async (): Promise<{ average: number; count: number } | null> => null),
  listPublishedReviewsForExperienceMock: vi.fn(async (): Promise<Array<{ id: string; rating: number; body: string | null; createdAt: string }>> => []),
}))
vi.mock('@/lib/reviews/queries', () => ({
  getExperienceRatingAggregate: getExperienceRatingAggregateMock,
  listPublishedReviewsForExperience: listPublishedReviewsForExperienceMock,
}))

import ExperiencePublicPage from '@/app/[locale]/experiences/[slug]/page'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

beforeEach(() => {
  resolveConfiguredProductStateMock.mockReset()
  resolveConfiguredProductStateMock.mockReturnValue({ agentLive: true, bookingLive: true })
  joinFeatureInterestActionMock.mockReset()
  joinFeatureInterestActionMock.mockResolvedValue({ ok: true })
  getExperienceBySlugMock.mockReset()
  listPublicAvailabilityMock.mockReset()
  listPublicAvailabilityMock.mockResolvedValue([])
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: null } })
  createSupabaseServerClientMock.mockReset()
  createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock } })
  createCheckoutSessionActionMock.mockReset()
  isExperienceSavedMock.mockReset()
  isExperienceSavedMock.mockResolvedValue(false)
  getExperienceRatingAggregateMock.mockReset()
  getExperienceRatingAggregateMock.mockResolvedValue(null)
  listPublishedReviewsForExperienceMock.mockReset()
  listPublishedReviewsForExperienceMock.mockResolvedValue([])
})

describe('ExperiencePublicPage', () => {
  it('exports request rendering and no static param generator', async () => {
    const route = await import('@/app/[locale]/experiences/[slug]/page')
    expect(route.dynamic).toBe('force-dynamic')
    expect((route as Record<string, unknown>).generateStaticParams).toBeUndefined()
  })

  it('still renders primary experience content when all secondary queries fail', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    listPublicAvailabilityMock.mockRejectedValueOnce(new Error('availability unavailable'))
    createSupabaseServerClientMock.mockRejectedValueOnce(new Error('auth unavailable'))
    getExperienceRatingAggregateMock.mockRejectedValueOnce(new Error('rating unavailable'))
    listPublishedReviewsForExperienceMock.mockRejectedValueOnce(new Error('reviews unavailable'))
    const route = await import('@/app/[locale]/experiences/[slug]/page')
    const el = await route.default({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Sunset junk boat tour' })).toBeTruthy()
    expect(screen.getByText(en.booking.noAvailability)).toBeTruthy()
  })
  it('notFound for an invalid locale', async () => {
    await expect(
      ExperiencePublicPage({ params: Promise.resolve({ locale: 'xx', slug: 'sunset-tour' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('notFound')
  })

  it('notFound for an unknown slug', async () => {
    getExperienceBySlugMock.mockResolvedValue(null)
    await expect(
      ExperiencePublicPage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('notFound')
  })

  it('renders the experience with merchant attribution, price, and the real booking widget', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: 'https://picsum.photos/e.jpg', publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    const { container } = render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Sunset junk boat tour' })).toBeTruthy()
    const merchantLinks = screen.getAllByRole('link', { name: /Acme Travel/i })
    expect(merchantLinks.every((l) => l.getAttribute('href') === '/en/m/acme-travel')).toBe(true)
    expect(screen.queryByText(/Booking opens soon/i)).toBeNull()
    expect(screen.getByRole('button', { name: /book now/i })).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('picsum.photos')
  })

  it('hides the guest-email field end-to-end when the viewer is signed in', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    getUserMock.mockResolvedValueOnce({ data: { user: { email: 'traveler@example.com' } } })
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.queryByLabelText(en.booking.guestEmailLabel)).toBeNull()
    expect(screen.getByText(en.booking.submitCta)).toBeTruthy()
  })

  it('renders the no-availability state when there are no upcoming dates', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByText(/No upcoming dates yet/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /book now/i })).toBeNull()
  })

  it('includes Product/Offer JSON-LD when an open date exists', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: 'https://cdn.kinnso.ai/test/experience.jpg', publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"@type":"Product"')
    expect(ld).toContain('https://cdn.kinnso.ai/test/experience.jpg')
  })

  it('emits an OutOfStock Product/Offer when the availability query fails closed', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    listPublicAvailabilityMock.mockRejectedValueOnce(new Error('availability unavailable'))

    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    const { container } = render(el)
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''

    expect(ld).toContain('"@type":"Product"')
    expect(ld).toContain('"availability":"https://schema.org/OutOfStock"')
  })
  it('renders Booking interest capture and an OutOfStock Offer when Booking is OFF', async () => {
    resolveConfiguredProductStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])

    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ src: 'guide', guideSlug: 'kyoto-tea' }),
    })
    render(el)

    expect(resolveConfiguredProductStateMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: en.featureInterest.submitBooking })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /book now/i })).toBeNull()
    expect(screen.queryByLabelText(en.booking.selectDateLabel)).toBeNull()
    expect(screen.queryByLabelText(en.booking.qtyLabel)).toBeNull()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"@type":"Product"')
    expect(ld).toContain('"availability":"https://schema.org/OutOfStock"')

    fireEvent.change(screen.getByLabelText(en.featureInterest.emailLabel), { target: { value: 'traveller@example.com' } })
    fireEvent.submit(screen.getByRole('form', { name: en.featureInterest.submitBooking }))
    await vi.waitFor(() => expect(joinFeatureInterestActionMock).toHaveBeenCalledOnce())
    expect(createCheckoutSessionActionMock).not.toHaveBeenCalled()
  })
  it('emits an OutOfStock Product/Offer when there is no availability', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"@type":"Product"')
    expect(ld).toContain('"availability":"https://schema.org/OutOfStock"')
  })

  it('threads src/guideSlug query params from searchParams down to the checkout action', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    getUserMock.mockResolvedValueOnce({ data: { user: { email: 'traveler@example.com' } } })
    createCheckoutSessionActionMock.mockResolvedValue({ ok: true, checkoutUrl: 'https://x' })

    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({ src: 'guide', guideSlug: 'kyoto-tea' }),
    })
    render(el)

    fireEvent.click(screen.getByRole('button', { name: /book now/i }))
    await vi.waitFor(() => {
      expect(createCheckoutSessionActionMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ sourceSurface: 'guide', guideSlug: 'kyoto-tea' }),
      )
    })
  })

  it('shows the save button (anon: "Sign in to save") and omits aggregateRating when there are no reviews', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('aggregateRating')
  })

  it('shows the real save state and rating for a signed-in viewer with published reviews', async () => {
    getExperienceBySlugMock.mockResolvedValue({
      id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: 'Two hours on the harbour.',
      description: 'Full description.', city: 'Hong Kong', priceAmount: 480, currency: 'HKD',
      durationMinutes: 120, coverUrl: null, publishedAt: '2026-07-01T00:00:00Z', savesCount: 42,
      merchant: { slug: 'acme-travel', companyName: 'Acme Travel' },
    })
    listPublicAvailabilityMock.mockResolvedValue([{ id: 'a1', date: '2026-08-01', remaining: 4 }])
    getUserMock.mockResolvedValueOnce({ data: { user: { email: 'traveler@example.com', id: 'u1' } } })
    isExperienceSavedMock.mockResolvedValueOnce(true)
    getExperienceRatingAggregateMock.mockResolvedValueOnce({ average: 5, count: 1 })
    listPublishedReviewsForExperienceMock.mockResolvedValueOnce([
      { id: 'r1', rating: 5, body: 'Amazing sunset', createdAt: '2026-07-01T00:00:00Z' },
    ])
    const el = await ExperiencePublicPage({
      params: Promise.resolve({ locale: 'en', slug: 'sunset-tour' }),
      searchParams: Promise.resolve({}),
    })
    render(el)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByText('Amazing sunset')).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"aggregateRating"')
  })
})
