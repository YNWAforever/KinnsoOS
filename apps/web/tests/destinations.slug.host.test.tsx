// apps/web/tests/destinations.slug.host.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const {
  getDestinationBySlugMock, getGuidesForRegionsMock, getSessionsForDestinationMock,
  getExperiencesForCitiesMock, searchArticlesMock, getProductStateMock,
} = vi.hoisted(() => ({
  getDestinationBySlugMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination | null> => null),
  getGuidesForRegionsMock: vi.fn(async (): Promise<import('@/lib/guides/types').Guide[]> => []),
  getSessionsForDestinationMock: vi.fn(async (): Promise<import('@/lib/sessions/public-queries').PublicSession[]> => []),
  getExperiencesForCitiesMock: vi.fn(async (): Promise<import('@/lib/experiences/public-queries').PublicExperience[]> => []),
  searchArticlesMock: vi.fn(async (): Promise<import('@/lib/articles/queries').SearchResult> => ({ items: [], total: 0, page: 1, perPage: 6 })),
  getProductStateMock: vi.fn(async (): Promise<import('@/lib/product-state-config').ProductState> => ({
    agentLive: true, bookingLive: true, sessionsLive: false,
  })),
}))
vi.mock('@/lib/destinations/queries', () => ({ getDestinationBySlug: getDestinationBySlugMock }))
vi.mock('@/lib/guides/queries', () => ({ getGuidesForRegions: getGuidesForRegionsMock }))
vi.mock('@/lib/sessions/public-queries', () => ({ getSessionsForDestination: getSessionsForDestinationMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCities: getExperiencesForCitiesMock }))
vi.mock('@/lib/articles/queries', () => ({ searchArticles: searchArticlesMock }))
vi.mock('@/lib/product-state', () => ({ getProductState: getProductStateMock }))

import DestinationDetailPage, { generateMetadata } from '@/app/[locale]/destinations/[slug]/page'
import en from '@/lib/i18n/messages/en'
import zhHk from '@/lib/i18n/messages/zh-hk'

const destination = {
  slug: 'tokyo', name: 'Tokyo', heroImageUrl: null,
  description: 'Neon nights and quiet shrines.', matchTerms: ['Tokyo', 'Edo'],
  guideCount: 1, experienceCount: 1, latestPublishedAt: '2026-07-19T00:00:00.000Z',
}

beforeEach(() => {
  getDestinationBySlugMock.mockReset().mockResolvedValue(null)
  getGuidesForRegionsMock.mockReset().mockResolvedValue([])
  getSessionsForDestinationMock.mockReset().mockResolvedValue([])
  getExperiencesForCitiesMock.mockReset().mockResolvedValue([])
  searchArticlesMock.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, perPage: 6 })
  getProductStateMock.mockReset().mockResolvedValue({ agentLive: true, bookingLive: true, sessionsLive: false })
})

describe('/[locale]/destinations/[slug] detail host', () => {
  it('404s when the destination does not exist', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(null)
    await expect(
      DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'nowhere' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the destination hero and its guides', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getGuidesForRegionsMock.mockResolvedValueOnce([
      { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://x/kyoto.jpg', city: 'Tokyo', saves: 3, creatorHandle: 'teafan' },
    ])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Kyoto Tea Houses/ }).getAttribute('href')).toBe('/en/g/kyoto-tea')
  })

  it('renders the hero image when the destination has one', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce({ ...destination, heroImageUrl: 'https://x/tokyo-hero.jpg' })
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('img', { name: 'Tokyo' }).getAttribute('src')).toBe('https://x/tokyo-hero.jpg')
  })

  it('renders no hero image when the destination has none', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.queryByRole('img', { name: 'Tokyo' })).toBeNull()
  })

  it('renders upcoming sessions linking to their detail page only when sessions are live', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getProductStateMock.mockResolvedValueOnce({ agentLive: true, bookingLive: true, sessionsLive: true })
    getSessionsForDestinationMock.mockResolvedValueOnce([{
      id: 's1', slug: 'tokyo-ramen-ama', title: 'Tokyo ramen AMA', description: 'Ask away.',
      type: 'ask_a_creator', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled',
      host: { handle: 'sora', displayName: 'Sora' },
    }])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(getSessionsForDestinationMock).toHaveBeenCalledWith(['Tokyo', 'Edo'])
    expect(screen.getByRole('link', { name: /Tokyo ramen AMA/ }).getAttribute('href')).toBe('/en/sessions/tokyo-ramen-ama')
  })

  it('does not query or render sessions while the product surface is hidden', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getSessionsForDestinationMock.mockResolvedValueOnce([{
      id: 's1', slug: 'hidden-session', title: 'Hidden session', description: 'Not public yet.',
      type: 'destination_briefing', startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: 45,
      embedUrl: null, replayUrl: null, destinationTags: ['Tokyo'], status: 'scheduled', host: null,
    }])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(getSessionsForDestinationMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: en.destinations.sessionsHeading })).toBeNull()
    expect(screen.queryByText('Hidden session')).toBeNull()
  })

  it('hides guides, experiences, articles, and sessions when they are empty', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.queryByRole('heading', { name: en.destinations.guidesHeading })).toBeNull()
    expect(screen.queryByRole('heading', { name: en.destinations.experiencesHeading })).toBeNull()
    expect(screen.queryByRole('heading', { name: en.destinations.articlesHeading })).toBeNull()
    expect(screen.queryByRole('heading', { name: en.destinations.sessionsHeading })).toBeNull()
    expect(screen.queryByText(en.destinations.emptyGuides)).toBeNull()
    expect(screen.queryByText(en.destinations.emptyExperiences)).toBeNull()
    expect(screen.queryByText(en.destinations.emptySessions)).toBeNull()
  })

  it('renders the destination experiences section', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getExperiencesForCitiesMock.mockResolvedValueOnce([
      {
        id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
        city: 'Tokyo', priceAmount: 12000, currency: 'JPY', durationMinutes: null, coverUrl: null,
        publishedAt: '2026-07-01T00:00:00Z', savesCount: 5, merchant: { slug: '', companyName: '' },
      },
    ])
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(screen.getByRole('link', { name: /Sunset junk boat tour/ }).getAttribute('href')).toBe('/en/experiences/sunset-tour')
  })

  it('queries destination aliases and renders published articles in a localized section', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    searchArticlesMock.mockResolvedValueOnce({
      items: [{
        url: 'tokyo-ramen', category: 'destination', thumbnails: ['https://x/ramen.jpg'], rating: null,
        published_at: '2026-07-01T00:00:00Z', edit_at: null, title: 'Tokyo ramen guide', summary: 'The best bowls.',
      }],
      total: 1, page: 1, perPage: 6,
    })
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'en', slug: 'tokyo' }) })
    render(ui)
    expect(searchArticlesMock).toHaveBeenCalledWith({ locale: 'en', q: 'Tokyo OR Edo', page: 1, perPage: 6 })
    expect(screen.getByRole('heading', { name: en.destinations.articlesHeading })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tokyo ramen guide' }).getAttribute('href')).toBe('/en/articles/destinations/tokyo-ramen')
  })

  it('uses localized destination metadata copy when no curated description exists', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce({ ...destination, description: null })
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'zh-hk', slug: 'tokyo' }) })
    expect(metadata.title).toBe('Tokyo')
    expect(metadata.description).toBe(zhHk.destinations.metadataDescription('Tokyo'))
  })

  it('emits an ItemList containing only rendered resources with canonical localized URLs', async () => {
    getDestinationBySlugMock.mockResolvedValueOnce(destination)
    getProductStateMock.mockResolvedValueOnce({ agentLive: true, bookingLive: true, sessionsLive: true })
    getGuidesForRegionsMock.mockResolvedValueOnce([
      { slug: 'tokyo-ramen', title: 'Tokyo ramen guide', cover: null, city: 'Tokyo', saves: 1, creatorHandle: 'sora' },
    ])
    searchArticlesMock.mockResolvedValueOnce({
      items: [
        { url: 'night-trains', category: 'destination', thumbnails: [], rating: null, published_at: null, edit_at: null, title: 'Tokyo night trains', summary: null },
        { url: 'legacy', category: 'promotion', thumbnails: [], rating: null, published_at: null, edit_at: null, title: 'Unroutable legacy story', summary: null },
      ],
      total: 2, page: 1, perPage: 6,
    })
    const ui = await DestinationDetailPage({ params: Promise.resolve({ locale: 'zh-hk', slug: 'tokyo' }) })
    const { container } = render(ui)
    const blocks = JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? '[]') as Array<Record<string, unknown>>
    const itemList = blocks.find((block) => block['@type'] === 'ItemList') as { itemListElement: Array<Record<string, unknown>> }
    expect(itemList.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Tokyo ramen guide', url: 'https://www.kinnso.ai/zh-hk/g/tokyo-ramen' },
      { '@type': 'ListItem', position: 2, name: 'Tokyo night trains', url: 'https://www.kinnso.ai/zh-hk/articles/destinations/night-trains' },
    ])
  })
})
