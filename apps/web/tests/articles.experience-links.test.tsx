// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { getExperiencesForCityMock, getExperienceOverridesForArticleMock } = vi.hoisted(() => ({
  getExperiencesForCityMock: vi.fn(),
  getExperienceOverridesForArticleMock: vi.fn(),
}))
vi.mock('@/lib/experiences/public-queries', () => ({
  getExperiencesForCity: getExperiencesForCityMock,
  getExperienceOverridesForArticle: getExperienceOverridesForArticleMock,
}))

import { ArticleExperienceLinks } from '@/components/kinnso/articles/ArticleExperienceLinks'
import en from '@/lib/i18n/messages/en'

const experience = (slug: string) => ({
  id: slug, slug, title: `Experience ${slug}`, summary: null, description: null, city: 'Tokyo',
  priceAmount: 1000, currency: 'JPY', durationMinutes: null, coverUrl: null, publishedAt: null,
  merchant: { slug: 'm', companyName: 'M' },
})

describe('ArticleExperienceLinks', () => {
  it('renders nothing when no experiences match any region', async () => {
    getExperienceOverridesForArticleMock.mockResolvedValueOnce([])
    getExperiencesForCityMock.mockResolvedValue([])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Osaka'], articleId: 'a1', t: en.article, bookingLive: false })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('renders up to 3 experience cards from the first region with matches, linking with ?src=article', async () => {
    getExperienceOverridesForArticleMock.mockResolvedValueOnce([])
    getExperiencesForCityMock.mockResolvedValueOnce([experience('a'), experience('b')])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article, bookingLive: false })
    render(jsx)
    expect(screen.getByText(en.article.experiencesNearbyHeadingWaitlist)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Experience a/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/a?src=article')
  })

  it('shows pinned overrides first, then fills remaining slots with heuristic matches, deduped', async () => {
    getExperienceOverridesForArticleMock.mockResolvedValueOnce([experience('pinned')])
    getExperiencesForCityMock.mockResolvedValueOnce([experience('pinned'), experience('heuristic')])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article, bookingLive: false })
    render(jsx)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe('/en/experiences/pinned?src=article')
    expect(links[1].getAttribute('href')).toBe('/en/experiences/heuristic?src=article')
  })

  it('renders heuristic-only when there are no overrides', async () => {
    getExperienceOverridesForArticleMock.mockResolvedValueOnce([])
    getExperiencesForCityMock.mockResolvedValueOnce([experience('a')])
    const jsx = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article, bookingLive: false })
    render(jsx)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
  it('selects explicit OFF and ON headings without changing cards or article attribution links', async () => {
    const t = {
      ...en.article,
      experiencesNearbyEyebrowWaitlist: 'waitlist eyebrow',
      experiencesNearbyHeadingWaitlist: 'waitlist heading',
      experiencesNearbyEyebrowLive: 'live eyebrow',
      experiencesNearbyHeadingLive: 'live heading',
    }
    getExperienceOverridesForArticleMock.mockResolvedValue([])
    getExperiencesForCityMock.mockResolvedValue([experience('a'), experience('b'), experience('c'), experience('d')])

    const off = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t, bookingLive: false })
    const { unmount } = render(off)
    expect(screen.getByText(t.experiencesNearbyEyebrowWaitlist)).toBeTruthy()
    expect(screen.getByText(t.experiencesNearbyHeadingWaitlist)).toBeTruthy()
    expect(screen.queryByText(t.experiencesNearbyHeadingLive)).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('/en/experiences/a?src=article')
    unmount()

    const live = await ArticleExperienceLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t, bookingLive: true })
    render(live)
    expect(screen.getByText(t.experiencesNearbyEyebrowLive)).toBeTruthy()
    expect(screen.getByText(t.experiencesNearbyHeadingLive)).toBeTruthy()
    expect(screen.queryByText(t.experiencesNearbyHeadingWaitlist)).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('/en/experiences/a?src=article')
  })
})
