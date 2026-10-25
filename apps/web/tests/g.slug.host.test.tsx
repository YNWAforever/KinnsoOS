// @vitest-environment jsdom
import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(()=>{cleanup();vi.unstubAllEnvs()})
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const { defaultGuide, getGuideBySlugMock } = vi.hoisted(() => {
  const defaultGuide = {
    id: 'g1',
    slug: 'kyoto-tea',
    title: 'Kyoto Tea Houses',
    cover: 'https://example.com/kyoto.jpg',
    city: 'Kyoto',
    saves: 5,
    creatorHandle: 'teafan',
    creatorName: 'Tea Fan',
    creatorId: 'c1',
    summary: 'Lovely tea houses.',
    publishedAt: '2026-06-02T00:00:00Z',
    source: 'db',
  }
  return { defaultGuide, getGuideBySlugMock: vi.fn(async (): Promise<typeof defaultGuide | null> => defaultGuide) }
})
vi.mock('@/lib/guides/queries', () => ({ getGuideBySlug: getGuideBySlugMock }))

const { getUserMock, createSupabaseServerClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  createSupabaseServerClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: createSupabaseServerClientMock }))
const { rpcMock, guideRpc } = vi.hoisted(() => {
  const guideRpc: { current: { data: unknown; error: unknown } } = {
    current: { data: null, error: { message: 'unset' } },
  }
  const rpcMock = vi.fn(async (fn: string) => {
    if (fn === 'list_offers_for_creator') return { data: [], error: null }
    if (fn === 'kinnso_guide') return guideRpc.current
    return { data: null, error: { message: 'unexpected rpc' } }
  })
  return { rpcMock, guideRpc }
})
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: vi.fn(() => ({ rpc: rpcMock })),
}))

function itineraryPayload(id: string) {
  return {
    kind: 'itinerary',
    id,
    title: 'Kyoto Tea Houses',
    destinationId: null,
    version: 2,
    publishedAt: '2026-10-20T10:00:00.000Z',
    creator: { id: 'c1', name: 'Tea Fan', handle: 'teafan' },
    days: [{
      id: '22222222-2222-4222-8222-222222222222',
      offset: 0,
      title: 'Tea day',
      stops: [{
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Matcha stop',
        description: 'Public description',
        placeId: null,
        position: 0,
        startMinuteOfDay: null,
        durationMinutes: null,
        source: null,
        travellerNote: 'PRIVATE note',
      }],
    }],
    verifiedAt: '2020-01-01',
    authorLocale: 'zh-HK',
  }
}

const { isGuideSavedMock } = vi.hoisted(() => ({ isGuideSavedMock: vi.fn(async () => false) }))
vi.mock('@/lib/saves/guide-queries', () => ({ isGuideSaved: isGuideSavedMock }))

const { getGuideRatingAggregateMock, listPublishedReviewsForGuideMock } = vi.hoisted(() => ({
  getGuideRatingAggregateMock: vi.fn(async (): Promise<{ average: number; count: number } | null> => null),
  listPublishedReviewsForGuideMock: vi.fn(async (): Promise<Array<{ id: string; rating: number; body: string | null; createdAt: string }>> => []),
}))
vi.mock('@/lib/reviews/queries', () => ({
  getGuideRatingAggregate: getGuideRatingAggregateMock,
  listPublishedReviewsForGuide: listPublishedReviewsForGuideMock,
}))

// GuideExperienceLinks is an async Server Component -- react-dom's client renderer
// (used by this jsdom+@testing-library/react host test) cannot render a nested async
// function component directly. Stub it to a synchronous no-op (unchanged from before).
vi.mock('@/components/kinnso/GuideExperienceLinks', () => ({
  GuideExperienceLinks: () => null,
}))

describe('/[locale]/g/[slug] host', () => {
  it('connects a structured itinerary to its approved private planning preview',async()=>{
    const id='11111111-1111-4111-8111-111111111111'
    getGuideBySlugMock.mockResolvedValueOnce({...defaultGuide,id})
    guideRpc.current={data:itineraryPayload(id),error:null}
    vi.stubEnv('KINNSO_JOURNEYS_ORIGIN','https://planner.example')
    vi.stubEnv('KINNSO_APPROVED_JOURNEYS_ORIGIN','https://planner.example')
    const route=await import('@/app/[locale]/g/[slug]/page')
    render(await route.default({params:Promise.resolve({locale:'en',slug:defaultGuide.slug})}))
    expect(screen.getByText('Structured itinerary')).toBeTruthy()
    expect(screen.getByRole('heading',{level:3,name:'Tea day'})).toBeTruthy()
    expect(screen.getByRole('heading',{level:4,name:'Matcha stop'})).toBeTruthy()
    expect(screen.queryByRole('heading',{name:'Invented stop'})).toBeNull()
    expect(document.body.innerHTML).not.toContain('PRIVATE note')
    const href=new URL(screen.getByRole('link',{name:'Plan from this guide'}).getAttribute('href')!)
    expect(href.origin+href.pathname).toBe(`https://planner.example/en/g/${id}`)
    expect(href.searchParams.get('adopt')).toBe('1')
    expect(href.searchParams.get('flow')).toMatch(/^[0-9a-f-]{36}$/)
  })
  beforeEach(() => {
    getGuideBySlugMock.mockReset()
    getGuideBySlugMock.mockResolvedValue(defaultGuide)
    guideRpc.current = {
      data: {
        kind: 'summary',
        id: defaultGuide.id,
        title: defaultGuide.title,
        summary: defaultGuide.summary,
        destinationId: null,
        days: [{ title: 'Invented day', stops: [{ title: 'Invented stop' }] }],
        verifiedAt: '2020-01-01',
        authorLocale: 'zh-HK',
      },
      error: null,
    }
    getUserMock.mockReset()
    getUserMock.mockResolvedValue({ data: { user: null } })
    createSupabaseServerClientMock.mockReset()
    createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock } })
    isGuideSavedMock.mockReset()
    isGuideSavedMock.mockResolvedValue(false)
    getGuideRatingAggregateMock.mockReset()
    getGuideRatingAggregateMock.mockResolvedValue(null)
    listPublishedReviewsForGuideMock.mockReset()
    listPublishedReviewsForGuideMock.mockResolvedValue([])
  })

  it('exports request rendering and no static param generator', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    expect(route.dynamic).toBe('force-dynamic')
    expect((route as Record<string, unknown>).generateStaticParams).toBeUndefined()
  })

  it('notFounds an unknown guide slug', async () => {
    getGuideBySlugMock.mockResolvedValueOnce(null)
    const route = await import('@/app/[locale]/g/[slug]/page')
    await expect(route.default({ params: Promise.resolve({ locale: 'en', slug: 'missing' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('still renders primary guide content when all secondary queries fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createSupabaseServerClientMock.mockRejectedValueOnce(new Error('auth unavailable'))
    getGuideRatingAggregateMock.mockRejectedValueOnce(new Error('rating unavailable'))
    listPublishedReviewsForGuideMock.mockRejectedValueOnce(new Error('reviews unavailable'))
    const route = await import('@/app/[locale]/g/[slug]/page')
    render(await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
    expect(screen.getByText('No reviews yet.')).toBeTruthy()
  })
  it('renders a known guide and links the author to /c/[handle]', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })

    const { container } = render(ui)

    expect(screen.getByRole('heading', { level: 1, name: 'Kyoto Tea Houses' })).toBeTruthy()
    expect(screen.getByText('Reading summary — no structured itinerary')).toBeTruthy()
    expect(screen.getByText('Lovely tea houses.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Plan from this guide' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Invented stop' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Invented day' })).toBeNull()
    expect(document.body.innerHTML).not.toContain('adopt=1')
    expect(screen.getByRole('link', { name: '@teafan' }).getAttribute('href')).toBe('/en/c/teafan')
    expect(document.querySelector('.k2-eyebrow')?.textContent).toBe('Kyoto')
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"datePublished":"2026-06-02T00:00:00Z"')
    expect(ld).toContain('"dateModified":"2026-06-02T00:00:00Z"')
    expect(ld).not.toContain('example.com/kyoto.jpg')
    expect(screen.queryByText('5')).toBeNull()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('example.com/kyoto.jpg')
  })

  it('includes an approved CDN cover in guide JSON-LD', async () => {
    const approvedCover = 'https://cdn.kinnso.ai/test/guide.jpg'
    getGuideBySlugMock.mockResolvedValueOnce({ ...defaultGuide, cover: approvedCover })
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })

    render(ui)

    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain(approvedCover)
  })

  it('shows the save button (anon: "Sign in to save") and omits aggregateRating JSON-LD when there are no reviews', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('aggregateRating')
  })

  it('shows the real save state and rating for a signed-in viewer with published reviews', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    isGuideSavedMock.mockResolvedValueOnce(true)
    getGuideRatingAggregateMock.mockResolvedValueOnce({ average: 4.5, count: 2 })
    listPublishedReviewsForGuideMock.mockResolvedValueOnce([
      { id: 'r1', rating: 5, body: 'Loved it', createdAt: '2026-07-01T00:00:00Z' },
    ])
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
    expect(screen.getByText('Loved it')).toBeTruthy()
    const ld = document.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain('"aggregateRating"')
    expect(ld).toContain('"ratingValue":4.5')
  })

  it('does not present a signed-in viewer as unsaved when the saved-state read fails', async () => {
    // Degrading the saved-state read to `false` told a viewer who may well have
    // saved this guide that they had not — an explicit, wrong claim.
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    isGuideSavedMock.mockRejectedValueOnce(new Error('read failed'))
    const route = await import('@/app/[locale]/g/[slug]/page')
    const ui = await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) })
    render(ui)
    expect(screen.getByRole('button', { name: 'Saved status could not be checked. Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('shows the zh-HK summary boundary without an adopt control', async () => {
    const route = await import('@/app/[locale]/g/[slug]/page')
    render(await route.default({ params: Promise.resolve({ locale: 'zh-hk', slug: 'kyoto-tea' }) }))
    const source = screen.getByRole('complementary', { name: '攻略來源' })
    expect(source).toHaveTextContent('閱讀摘要 — 未提供結構化行程')
    expect(source).toHaveTextContent('內容原文語言')
    expect(source).toHaveTextContent('地點查核日期')
    expect(source).toHaveTextContent('未記錄')
    expect(screen.getByText('這是摘要攻略，未提供可套用的結構化行程。')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '用這篇攻略規劃行程' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Invented stop' })).toBeNull()
    expect(document.body.innerHTML).not.toContain('adopt=1')
    expect(document.body.innerHTML).not.toContain('PRIVATE note')
  })

  it('does not adopt or invent stops when the published guide contract cannot be read', async () => {
    guideRpc.current = { data: null, error: { message: 'guide_not_found' } }
    const route = await import('@/app/[locale]/g/[slug]/page')
    render(await route.default({ params: Promise.resolve({ locale: 'en', slug: 'kyoto-tea' }) }))
    expect(screen.getByRole('status')).toHaveTextContent('Guide source could not be confirmed. This page does not list stops or offer an adopt action.')
    expect(screen.queryByText('Reading summary — no structured itinerary')).toBeNull()
    expect(screen.queryByText('Structured itinerary')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Plan from this guide' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Invented stop' })).toBeNull()
  })
})
