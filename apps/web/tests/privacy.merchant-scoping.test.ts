/**
 * Plan 6.6 / acceptance story 16: private server rendering, the props that cross the
 * server->client boundary, and any shared cache must never carry another actor's content.
 *
 * These are host tests. The only thing mocked away is the *identity* layer
 * (`requireMerchantPage`) and the creator name lookup; the real query builders
 * (`listMerchantMissions`, `listMerchantBookings`) run against an in-memory fake
 * PostgREST client that actually applies the `.eq()` filters it is given. That matters:
 * a test that mocked `listMerchantMissions` could only prove "the page passed some
 * string", whereas this one proves the string the page passed is the *only* thing
 * standing between merchant A and merchant B's rows -- and that the rows which come
 * back are then mapped through an allowlist rather than spread into the view props.
 *
 * No database is required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/** What the SERVER-side guard derives from the session cookie. Never browser input. */
const MERCHANT_A = 'merchant-profile-A-guard-derived'
/** A second merchant whose rows live in the same tables. */
const MERCHANT_B = 'merchant-profile-B-other-actor'
/** A merchant id that exists nowhere but in attacker-controlled request input. */
const INJECTED = 'merchant-profile-INJECTED-BY-BROWSER'

/**
 * Every value an attacker can put in the URL. `params`/`searchParams` are the only
 * request-shaped inputs a Next.js page receives, so this is the complete browser
 * surface for these routes.
 */
const BROWSER_SUPPLIED = [MERCHANT_B, INJECTED] as const

/** Params/searchParams shaped to look like the page might trust them. */
function hostileParams(extra: Record<string, string> = {}) {
  return {
    locale: 'en',
    merchantId: INJECTED,
    merchant_profile_id: MERCHANT_B,
    merchantProfileId: MERCHANT_B,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Private values seeded into the RAW rows (must never reach the view props)
// ---------------------------------------------------------------------------

const PRIVATE_VALUES = [
  // raw notes
  'PRIVATE-application-note-A1',
  'PRIVATE-merchant-review-note-A1',
  'PRIVATE-submission-note-A1',
  'PRIVATE-merchant-feedback-A1',
  // receipts / proof uploads
  'https://files.test/PRIVATE-receipt-A1.jpg',
  'https://files.test/PRIVATE-booking-receipt-A1.pdf',
  // tokens
  'pi_PRIVATE_payment_intent_A1',
  'PRIVATE-access-token-A1',
  // booking / redemption codes
  'PRIVATE-booking-code-A1',
  'PRIVATE-coupon-code-A1',
  'https://redeem.test/PRIVATE-coupon-url-A1',
  // raw actor identifiers
  'creator-uuid-aaaaaaaa-1111-2222-3333-444444444444',
  'traveller.private',
] as const

/**
 * Field NAMES the plan calls private. Asserted absent from every object handed to a
 * client view. Explicitly checked here:
 *   raw notes ....... application_note, merchant_review_note, notes, merchant_feedback
 *   receipts ........ proof_urls, receipt_url, receipt_urls
 *   tokens .......... access_token, refresh_token, token, stripe_payment_intent_id
 *   booking codes ... booking_code, confirmation_code, coupon_code, coupon_url
 *   contact details . guest_email, traveler_email, contact_email, phone
 *   raw actor ids ... creator_id, user_id, traveler_user_id, merchant_profile_id
 */
const PRIVATE_KEYS = [
  'application_note',
  'merchant_review_note',
  'notes',
  'merchant_feedback',
  'proof_urls',
  'receipt_url',
  'receipt_urls',
  'access_token',
  'refresh_token',
  'token',
  'stripe_payment_intent_id',
  'booking_code',
  'confirmation_code',
  'coupon_code',
  'coupon_url',
  'guest_email',
  'traveler_email',
  'contact_email',
  'phone',
  'creator_id',
  'user_id',
  'traveler_user_id',
  'merchant_profile_id',
] as const

// ---------------------------------------------------------------------------
// Fixtures: two merchants' rows sitting in the same tables
// ---------------------------------------------------------------------------

const CREATOR_A_UUID = 'creator-uuid-aaaaaaaa-1111-2222-3333-444444444444'
const CREATOR_B_UUID = 'creator-uuid-bbbbbbbb-9999-8888-7777-666666666666'

const missionRows = [
  {
    id: 'mission-A1',
    merchant_profile_id: MERCHANT_A,
    title: 'Harbour sunset shoot',
    status: 'published',
    // Seeded even though the production select does not request some of these:
    // if the mapper ever spreads the row instead of allowlisting fields, these leak.
    coupon_code: 'PRIVATE-coupon-code-A1',
    coupon_url: 'https://redeem.test/PRIVATE-coupon-url-A1',
    paid_fee_amount: 4200,
    mission_participants: [
      {
        id: 'participant-A1',
        status: 'applied',
        creator_id: CREATOR_A_UUID,
        application_note: 'PRIVATE-application-note-A1',
        merchant_review_note: 'PRIVATE-merchant-review-note-A1',
        mission_milestone_submissions: [
          {
            id: 'submission-A1',
            status: 'submitted',
            notes: 'PRIVATE-submission-note-A1',
            merchant_feedback: 'PRIVATE-merchant-feedback-A1',
            proof_urls: ['https://files.test/PRIVATE-receipt-A1.jpg'],
            mission_social_snapshots: [{ confidence_status: 'verified_signal' }],
          },
        ],
      },
    ],
    mission_settlements: [{ id: 'settlement-A1', status: 'pending' }],
  },
  {
    id: 'mission-B1',
    merchant_profile_id: MERCHANT_B,
    title: 'RIVAL-ONLY night market crawl',
    status: 'published',
    coupon_code: 'PRIVATE-coupon-code-B1',
    coupon_url: 'https://redeem.test/PRIVATE-coupon-url-B1',
    mission_participants: [
      {
        id: 'participant-B1',
        status: 'approved',
        creator_id: CREATOR_B_UUID,
        application_note: 'PRIVATE-application-note-B1',
        merchant_review_note: 'PRIVATE-merchant-review-note-B1',
        mission_milestone_submissions: [
          {
            id: 'submission-B1',
            status: 'approved',
            notes: 'PRIVATE-submission-note-B1',
            proof_urls: ['https://files.test/PRIVATE-receipt-B1.jpg'],
            mission_social_snapshots: [{ confidence_status: 'needs_review' }],
          },
        ],
      },
    ],
    mission_settlements: [{ id: 'settlement-B1', status: 'paid' }],
  },
]

const bookingRows = [
  {
    id: 'booking-A1',
    status: 'confirmed',
    qty: 2,
    total_amount: 900,
    currency: 'HKD',
    traveler_user_id: null,
    guest_email: 'traveller.private@guest-domain.test',
    creator_id: CREATOR_A_UUID,
    created_at: '2026-07-04T00:00:00Z',
    // Seeded but not in the production select -- proves the mapper allowlists.
    booking_code: 'PRIVATE-booking-code-A1',
    stripe_payment_intent_id: 'pi_PRIVATE_payment_intent_A1',
    access_token: 'PRIVATE-access-token-A1',
    receipt_url: 'https://files.test/PRIVATE-booking-receipt-A1.pdf',
    experiences: { title: 'Harbour sunset sail', merchant_profile_id: MERCHANT_A },
    creators: { handle: 'maya', display_name: 'Maya Wanders' },
  },
  {
    id: 'booking-B1',
    status: 'completed',
    qty: 1,
    total_amount: 300,
    currency: 'HKD',
    traveler_user_id: null,
    guest_email: 'rival.guest@guest-domain.test',
    creator_id: CREATOR_B_UUID,
    created_at: '2026-07-05T00:00:00Z',
    booking_code: 'PRIVATE-booking-code-B1',
    experiences: { title: 'RIVAL-ONLY night market crawl', merchant_profile_id: MERCHANT_B },
    creators: { handle: 'rival', display_name: 'Rival Creator' },
  },
]

const TABLES: Record<string, Array<Record<string, unknown>>> = {
  missions: missionRows,
  bookings: bookingRows,
}

// ---------------------------------------------------------------------------
// Fake PostgREST client that really applies `.eq()`
// ---------------------------------------------------------------------------

type FilterCall = { table: string; column: string; value: unknown }

/** Resolves a PostgREST filter path such as `experiences.merchant_profile_id`. */
function readPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    const target = Array.isArray(node) ? node[0] : node
    if (target === null || typeof target !== 'object') return undefined
    return (target as Record<string, unknown>)[key]
  }, row)
}

type FakeResult = { data: Array<Record<string, unknown>>; error: null }

type FakeBuilder = {
  select: () => FakeBuilder
  eq: (column: string, value: unknown) => FakeBuilder
  neq: () => FakeBuilder
  not: () => FakeBuilder
  in: () => FakeBuilder
  limit: () => FakeBuilder
  order: () => Promise<FakeResult>
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>
  then: (
    onfulfilled?: (value: FakeResult) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>
}

function createFakeSupabase(filters: FilterCall[]) {
  return {
    from(table: string): FakeBuilder {
      let rows = [...(TABLES[table] ?? [])]
      const result = (): Promise<FakeResult> => Promise.resolve({ data: rows, error: null })
      const builder: FakeBuilder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters.push({ table, column, value })
          rows = rows.filter((row) => readPath(row, column) === value)
          return builder
        },
        neq: () => builder,
        not: () => builder,
        in: () => builder,
        limit: () => builder,
        order: () => result(),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (onfulfilled, onrejected) => result().then(onfulfilled, onrejected),
      }
      return builder
    },
  }
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  requireMerchantPageMock,
  createSupabaseServerClientMock,
  getCreatorPublicNamesMock,
  notFoundMock,
} = vi.hoisted(() => ({
  requireMerchantPageMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  getCreatorPublicNamesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
  useRouter: () => ({ refresh: () => {} }),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: requireMerchantPageMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))
vi.mock('@/lib/creators/queries', () => ({
  getCreatorPublicNames: getCreatorPublicNamesMock,
}))

import MerchantMissionsPage from '@/app/[locale]/merchants/dashboard/missions/page'
import MerchantMissionDetailPage from '@/app/[locale]/merchants/dashboard/missions/[missionId]/page'
import MerchantBookingsPage from '@/app/[locale]/merchants/dashboard/bookings/page'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pages are typed with an exact props shape; calling them with extra
 * request-shaped keys is the whole point of these tests, so widen the signature.
 */
type PageFn = (props: Record<string, unknown>) => Promise<unknown>

const missionsPage = MerchantMissionsPage as unknown as PageFn
const missionDetailPage = MerchantMissionDetailPage as unknown as PageFn
const bookingsPage = MerchantBookingsPage as unknown as PageFn

/** The exact props object the server hands the (client) view component. */
function viewProps<T>(element: unknown): T {
  return (element as ReactElement<T>).props
}

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out)
    return out
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key)
      collectKeys(child, out)
    }
  }
  return out
}

/** Asserts a data subtree carries no private field name, and that the scan saw something. */
function expectNoPrivateKeys(data: unknown, expectedSampleKey: string) {
  const keys = collectKeys(data)
  // Guard against a vacuous scan: if the walk found nothing, the assertions below
  // would pass against any implementation, including a leaking one.
  expect(keys.size).toBeGreaterThan(0)
  expect([...keys]).toContain(expectedSampleKey)
  expect([...keys].filter((key) => (PRIVATE_KEYS as readonly string[]).includes(key))).toEqual([])
}

/** Asserts no seeded private value appears anywhere in the serialized props. */
function expectNoPrivateValues(props: unknown, expectedSampleValue: string) {
  const serialized = JSON.stringify(props)
  // Same anti-vacuity check: prove the haystack actually contains the page's data.
  expect(serialized).toContain(expectedSampleValue)
  for (const secret of PRIVATE_VALUES) {
    expect(serialized).not.toContain(secret)
  }
}

let filters: FilterCall[]
let supabase: ReturnType<typeof createFakeSupabase>

beforeEach(() => {
  vi.clearAllMocks()
  filters = []
  supabase = createFakeSupabase(filters)
  createSupabaseServerClientMock.mockResolvedValue(supabase)
  requireMerchantPageMock.mockResolvedValue({ user: { id: 'user-A' }, merchantId: MERCHANT_A })
  getCreatorPublicNamesMock.mockResolvedValue(
    new Map([
      [CREATOR_A_UUID, { name: 'Maya Wanders', handle: 'maya' }],
      [CREATOR_B_UUID, { name: 'Rival Creator', handle: 'rival' }],
    ]),
  )
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
})

type MissionsProps = {
  missions: Array<{ id: string; title: string; participantCount: number; settlementStatus: string | null }>
}
type MissionDetailProps = {
  mission: {
    id: string
    title: string
    participants: Array<{ id: string; creatorName: string; creatorHandle?: string | null; status: string }>
    submissions: Array<{ id: string; creatorName?: string; status: string }>
  }
}
type BookingsProps = {
  bookings: Array<{ id: string; experienceTitle: string; travelerLabel: string; creatorLabel: string }>
}

// ===========================================================================
// 1. Every query is scoped by the id the GUARD returned, never by request input
// ===========================================================================

describe('merchant pages scope queries by the guard-derived merchant id', () => {
  it('filters missions by the guard merchant id while params and searchParams name someone else', async () => {
    const ui = await missionsPage({
      params: Promise.resolve(hostileParams()),
      searchParams: Promise.resolve(hostileParams()),
    })

    const missionFilters = filters.filter((f) => f.table === 'missions')
    expect(missionFilters).toEqual([
      { table: 'missions', column: 'merchant_profile_id', value: MERCHANT_A },
    ])
    for (const hostile of BROWSER_SUPPLIED) {
      expect(filters.map((f) => f.value)).not.toContain(hostile)
    }
    // The guard ran against the same request-scoped client the query used, so the
    // read happens under the caller's session rather than an unscoped client.
    expect(requireMerchantPageMock).toHaveBeenCalledWith(supabase, 'en')
    expect(viewProps<MissionsProps>(ui).missions.map((m) => m.id)).toEqual(['mission-A1'])
  })

  it('filters bookings by the guard merchant, not by a browser-supplied merchant id', async () => {
    await bookingsPage({
      params: Promise.resolve(hostileParams()),
      searchParams: Promise.resolve(hostileParams()),
    })

    expect(filters.filter((f) => f.table === 'bookings')).toEqual([
      { table: 'bookings', column: 'experiences.merchant_profile_id', value: MERCHANT_A },
    ])
    for (const hostile of BROWSER_SUPPLIED) {
      expect(filters.map((f) => f.value)).not.toContain(hostile)
    }
  })

  it('follows the guard when it resolves a different merchant, with request input held constant', async () => {
    // Run 1: guard says A.
    await missionsPage({ params: Promise.resolve(hostileParams()) })
    const firstScope = filters.filter((f) => f.table === 'missions').map((f) => f.value)

    // Run 2: identical browser input, guard now says B.
    filters.length = 0
    requireMerchantPageMock.mockResolvedValue({ user: { id: 'user-B' }, merchantId: MERCHANT_B })
    const ui = await missionsPage({ params: Promise.resolve(hostileParams()) })
    const secondScope = filters.filter((f) => f.table === 'missions').map((f) => f.value)

    // The scope is a function of the guard's answer alone: the only thing that
    // changed between the two runs was the guard, and the scope changed with it.
    expect(firstScope).toEqual([MERCHANT_A])
    expect(secondScope).toEqual([MERCHANT_B])
    expect(secondScope).not.toContain(INJECTED)
    expect(viewProps<MissionsProps>(ui).missions.map((m) => m.id)).toEqual(['mission-B1'])
  })

  it('uses the missionId from params only to pick from the already-scoped rows', async () => {
    const ui = await missionDetailPage({
      params: Promise.resolve(hostileParams({ missionId: 'mission-A1' })),
    })

    expect(filters.filter((f) => f.table === 'missions')).toEqual([
      { table: 'missions', column: 'merchant_profile_id', value: MERCHANT_A },
    ])
    expect(viewProps<MissionDetailProps>(ui).mission.id).toBe('mission-A1')
  })
})

// ===========================================================================
// 2. Merchant A never receives merchant B's rows in the props handed to the view
// ===========================================================================

describe('cross-merchant rows never reach the view props', () => {
  it('omits the other merchant\'s missions from the queue props', async () => {
    const ui = await missionsPage({ params: Promise.resolve(hostileParams()) })
    const props = viewProps<MissionsProps>(ui)

    // Sanity: merchant A's own row IS present, so the negative assertions below
    // are not passing merely because the list is empty.
    expect(props.missions).toHaveLength(1)
    expect(props.missions[0]).toMatchObject({
      id: 'mission-A1',
      title: 'Harbour sunset shoot',
      participantCount: 1,
      settlementStatus: 'pending',
    })

    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('mission-B1')
    expect(serialized).not.toContain('RIVAL-ONLY')
    expect(serialized).not.toContain('settlement-B1')
  })

  it('404s instead of rendering when the requested mission belongs to another merchant', async () => {
    await expect(
      missionDetailPage({
        params: Promise.resolve(hostileParams({ missionId: 'mission-B1' })),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFoundMock).toHaveBeenCalled()
    // It queried as A (so B's row was never fetched), and it never went on to
    // resolve B's creator identities.
    expect(filters.filter((f) => f.table === 'missions')).toEqual([
      { table: 'missions', column: 'merchant_profile_id', value: MERCHANT_A },
    ])
    expect(getCreatorPublicNamesMock).not.toHaveBeenCalled()
  })

  it('resolves only the guard merchant\'s participant creators', async () => {
    await missionDetailPage({
      params: Promise.resolve(hostileParams({ missionId: 'mission-A1' })),
    })

    expect(getCreatorPublicNamesMock).toHaveBeenCalledTimes(1)
    expect(getCreatorPublicNamesMock).toHaveBeenCalledWith([CREATOR_A_UUID])
  })

  it('omits the other merchant\'s bookings and their guests from the bookings props', async () => {
    const ui = await bookingsPage({ params: Promise.resolve(hostileParams()) })
    const props = viewProps<BookingsProps>(ui)

    expect(props.bookings).toHaveLength(1)
    expect(props.bookings[0]).toMatchObject({
      id: 'booking-A1',
      experienceTitle: 'Harbour sunset sail',
      creatorLabel: 'Maya Wanders',
    })

    const serialized = JSON.stringify(props)
    expect(serialized).not.toContain('booking-B1')
    expect(serialized).not.toContain('RIVAL-ONLY')
    expect(serialized).not.toContain('rival.guest')
  })
})

// ===========================================================================
// 3. No private field crosses into the props handed to client components
// ===========================================================================

describe('props handed to client views carry no private fields', () => {
  /**
   * Fields explicitly checked on every view below (by name AND by seeded value):
   *   raw notes ....... application_note, merchant_review_note, notes, merchant_feedback
   *   receipts ........ proof_urls, receipt_url, receipt_urls
   *   tokens .......... access_token, refresh_token, token, stripe_payment_intent_id
   *   booking codes ... booking_code, confirmation_code, coupon_code, coupon_url
   *   contact ......... guest_email, traveler_email, contact_email, phone
   *   raw actor ids ... creator_id, user_id, traveler_user_id, merchant_profile_id
   */

  it('mission queue props expose only counts and status, no notes or coupon codes', async () => {
    const ui = await missionsPage({ params: Promise.resolve(hostileParams()) })
    const props = viewProps<MissionsProps>(ui)

    expectNoPrivateKeys(props.missions, 'participantCount')
    expectNoPrivateValues(props, 'Harbour sunset shoot')
  })

  it('mission detail props expose public creator names, not raw creator ids, notes or receipts', async () => {
    const ui = await missionDetailPage({
      params: Promise.resolve(hostileParams({ missionId: 'mission-A1' })),
    })
    const props = viewProps<MissionDetailProps>(ui)

    // The page DOES read `creator_id` server-side (to resolve public names), so the
    // meaningful assertion is that the raw uuid stops at the server boundary.
    expect(props.mission.participants[0].creatorName).toBe('Maya Wanders')
    expect(props.mission.participants[0].creatorHandle).toBe('maya')
    expect(props.mission.submissions).toHaveLength(1)

    expectNoPrivateKeys(props.mission, 'creatorName')
    expectNoPrivateValues(props, 'Harbour sunset shoot')
  })

  it('bookings props mask the guest email and carry no booking code, payment token or receipt url', async () => {
    const ui = await bookingsPage({ params: Promise.resolve(hostileParams()) })
    const props = viewProps<BookingsProps>(ui)

    const label = props.bookings[0].travelerLabel
    expect(label).not.toContain('traveller.private')
    expect(label).toMatch(/^tr\*+@guest-domain\.test$/)

    expectNoPrivateKeys(props.bookings, 'travelerLabel')
    expectNoPrivateValues(props, 'Harbour sunset sail')
  })
})
