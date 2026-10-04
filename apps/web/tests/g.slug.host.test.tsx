// @vitest-environment jsdom
import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
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
vi.mock('@/lib/supabase/public', () => ({ createSupabasePublicClient: vi.fn(() => ({})) }))

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
  beforeEach(() => {
    getGuideBySlugMock.mockReset()
    getGuideBySlugMock.mockResolvedValue(defaultGuide)
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
})
