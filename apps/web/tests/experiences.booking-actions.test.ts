// apps/web/tests/experiences.booking-actions.test.ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { resolveConfiguredProductStateMock, createSupabaseServerClientMock, validateCheckoutInputMock, getStripeClientMock, getUserMock, fromMock, rpcMock, getExperienceByIdMock, getClientIpMock, sessionsCreateMock, sessionsExpireMock, getGuideBySlugMock } = vi.hoisted(() => ({
  resolveConfiguredProductStateMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  validateCheckoutInputMock: vi.fn(),
  getStripeClientMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getExperienceByIdMock: vi.fn(),
  getClientIpMock: vi.fn(),
  sessionsCreateMock: vi.fn(),
  sessionsExpireMock: vi.fn(),
  getGuideBySlugMock: vi.fn(),
}))

vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: resolveConfiguredProductStateMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))
vi.mock('@/lib/experiences/booking-validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/experiences/booking-validation')>()
  return {
    ...actual,
    validateCheckoutInput: (...args: Parameters<typeof actual.validateCheckoutInput>) => {
      validateCheckoutInputMock(...args)
      return actual.validateCheckoutInput(...args)
    },
  }
})
vi.mock('@/lib/experiences/public-queries', () => ({ getExperienceById: getExperienceByIdMock }))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: getStripeClientMock,
  toStripeAmount: (amount: number) => Math.round(amount * 100),
}))
vi.mock('@/lib/guides/queries', () => ({ getGuideBySlug: getGuideBySlugMock }))

import { createCheckoutSessionAction } from '@/lib/experiences/booking-actions'

const experience = {
  id: 'exp1', slug: 'tokyo-crawl', title: 'Tokyo Crawl', summary: null, description: null,
  city: 'Tokyo', priceAmount: 1200, currency: 'HKD', durationMinutes: 180, coverUrl: null,
  publishedAt: null, merchant: { slug: 'sunrise', companyName: 'Sunrise Stays HK' },
}
const openAvailability = { id: 'avail1', capacity: 10, booked_count: 2, status: 'open', date: '2999-01-01' }

beforeEach(() => {
  resolveConfiguredProductStateMock.mockReset()
  resolveConfiguredProductStateMock.mockReturnValue({ agentLive: true, bookingLive: true })
  createSupabaseServerClientMock.mockReset()
  createSupabaseServerClientMock.mockResolvedValue({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })
  validateCheckoutInputMock.mockReset()
  getStripeClientMock.mockReset()
  getStripeClientMock.mockReturnValue({
    checkout: { sessions: { create: sessionsCreateMock, expire: sessionsExpireMock } },
  })
  getUserMock.mockReset()
  fromMock.mockReset()
  rpcMock.mockReset()
  getExperienceByIdMock.mockReset()
  getClientIpMock.mockReset()
  sessionsCreateMock.mockReset()
  sessionsExpireMock.mockReset()
  getGuideBySlugMock.mockReset()
  getClientIpMock.mockResolvedValue('1.2.3.4')
  rpcMock.mockResolvedValue({ data: true, error: null })
  getExperienceByIdMock.mockResolvedValue(experience)
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.kinnso.ai'
})

function mockAvailabilityLookup(row: unknown) {
  fromMock.mockReturnValueOnce({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
  })
}

it('returns a stable failure synchronously before any checkout work when Booking is OFF', async () => {
  resolveConfiguredProductStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'traveler@example.com' } } })
  mockAvailabilityLookup(openAvailability)
  sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
  fromMock.mockReturnValueOnce({ insert: () => Promise.resolve({ error: null }) })

  const resultPromise = createCheckoutSessionAction(
    'exp1',
    { availabilityId: 'avail1', qty: '1' },
    { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' },
  )

  const resolverCallsBeforeAwait = resolveConfiguredProductStateMock.mock.calls.length
  const result = await resultPromise
  expect(resolverCallsBeforeAwait).toBe(1)
  expect(resolveConfiguredProductStateMock).toHaveBeenCalledOnce()
  expect(result).toEqual({ ok: false, errors: { form: ['Something went wrong. Please try again.'] } })
  expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
  expect(getUserMock).not.toHaveBeenCalled()
  expect(validateCheckoutInputMock).not.toHaveBeenCalled()
  expect(getClientIpMock).not.toHaveBeenCalled()
  expect(rpcMock).not.toHaveBeenCalled()
  expect(getExperienceByIdMock).not.toHaveBeenCalled()
  expect(fromMock).not.toHaveBeenCalled()
  expect(getGuideBySlugMock).not.toHaveBeenCalled()
  expect(getStripeClientMock).not.toHaveBeenCalled()
  expect(sessionsCreateMock).not.toHaveBeenCalled()
  expect(sessionsExpireMock).not.toHaveBeenCalled()
})

describe('createCheckoutSessionAction (signed-in traveler)', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'traveler@example.com' } } })
  })

  it('rejects invalid input before touching rate limiting or Stripe', async () => {
    const res = await createCheckoutSessionAction('exp1', { availabilityId: '', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('rejects when rate limited', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('rejects when the availability row is not found', async () => {
    mockAvailabilityLookup(null)
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects a closed date', async () => {
    mockAvailabilityLookup({ ...openAvailability, status: 'closed' })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects a past date', async () => {
    mockAvailabilityLookup({ ...openAvailability, date: '2000-01-01' })
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('rejects when qty exceeds remaining capacity', async () => {
    mockAvailabilityLookup({ ...openAvailability, capacity: 3, booked_count: 2 }) // remaining = 1
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '2' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('creates a Stripe session and a pending_payment booking, returning the checkout URL', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '2' }, { locale: 'en' })

    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'traveler@example.com',
        line_items: [
          expect.objectContaining({
            quantity: 2,
            price_data: expect.objectContaining({ currency: 'hkd', unit_amount: 120000 }),
          }),
        ],
      }),
    )
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'experience_page', creator_id: null, guide_id: null }),
    )
    expect(getGuideBySlugMock).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: true, checkoutUrl: 'https://checkout.stripe.com/cs_123' })
  })

  it('attributes source_surface: article with no creator/guide ids', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'article' },
    )

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'article', creator_id: null, guide_id: null }),
    )
    expect(getGuideBySlugMock).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('accepts sourceSurface "agent" and passes it straight through with no attribution lookup', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'agent' },
    )

    expect(getGuideBySlugMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'agent', creator_id: null, guide_id: null }),
    )
    expect(res.ok).toBe(true)
  })

  it('attributes source_surface: guide to the real creator/guide ids resolved from a published guide slug', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    getGuideBySlugMock.mockResolvedValue({ id: 'g1', creatorId: 'c1' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' },
    )

    expect(getGuideBySlugMock).toHaveBeenCalledWith('kyoto-tea')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'guide', creator_id: 'c1', guide_id: 'g1' }),
    )
    expect(res.ok).toBe(true)
  })

  it('degrades to experience_page/null when the guide slug does not resolve to a real published guide', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    getGuideBySlugMock.mockResolvedValue(null)
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'guide', guideSlug: 'nonexistent' },
    )

    expect(getGuideBySlugMock).toHaveBeenCalledWith('nonexistent')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'experience_page', creator_id: null, guide_id: null }),
    )
    expect(res.ok).toBe(true)
  })

  it('degrades to experience_page/null rather than failing the checkout when the guide lookup itself throws', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    getGuideBySlugMock.mockRejectedValue(new Error('network blip'))
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' },
    )

    expect(getGuideBySlugMock).toHaveBeenCalledWith('kyoto-tea')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'experience_page', creator_id: null, guide_id: null }),
    )
    expect(res.ok).toBe(true)
  })

  it('degrades to experience_page/null for an unrecognized sourceSurface value', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '2' },
      { locale: 'en', sourceSurface: 'not-a-real-value' },
    )

    expect(getGuideBySlugMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source_surface: 'experience_page', creator_id: null, guide_id: null }),
    )
    expect(res.ok).toBe(true)
  })

  it('expires the Stripe session and returns a failure if the booking insert fails', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/cs_123' })
    fromMock.mockReturnValueOnce({ insert: () => Promise.resolve({ error: { message: 'boom' } }) })

    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })

    expect(res.ok).toBe(false)
    expect(sessionsExpireMock).toHaveBeenCalledWith('cs_123')
  })
})

describe('createCheckoutSessionAction (guest)', () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: null } })
  })

  it('requires a guest email', async () => {
    const res = await createCheckoutSessionAction('exp1', { availabilityId: 'avail1', qty: '1' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(sessionsCreateMock).not.toHaveBeenCalled()
  })

  it('creates a booking with guest_email and no traveler_user_id', async () => {
    mockAvailabilityLookup(openAvailability)
    sessionsCreateMock.mockResolvedValue({ id: 'cs_456', url: 'https://checkout.stripe.com/cs_456' })
    const insertMock = vi.fn(() => Promise.resolve({ error: null }))
    fromMock.mockReturnValueOnce({ insert: insertMock })

    const res = await createCheckoutSessionAction(
      'exp1',
      { availabilityId: 'avail1', qty: '1', guestEmail: 'guest@example.com' },
      { locale: 'en' },
    )

    expect(res.ok).toBe(true)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        traveler_user_id: null,
        guest_email: 'guest@example.com',
        source_surface: 'experience_page',
        creator_id: null,
        guide_id: null,
      }),
    )
  })
})
