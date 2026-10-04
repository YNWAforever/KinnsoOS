// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { getGuidesForRegionsMock, getGuideOverridesForArticleMock } = vi.hoisted(() => ({
  getGuidesForRegionsMock: vi.fn(),
  getGuideOverridesForArticleMock: vi.fn(),
}))
vi.mock('@/lib/guides/queries', () => ({
  getGuidesForRegions: getGuidesForRegionsMock,
  getGuideOverridesForArticle: getGuideOverridesForArticleMock,
}))

import { ArticleGuideLinks } from '@/components/kinnso/articles/ArticleGuideLinks'
import en from '@/lib/i18n/messages/en'

const guide = (slug: string) => ({
  slug, title: `Guide ${slug}`, cover: 'https://x/y.jpg', city: 'Tokyo', saves: 1, creatorHandle: 'c',
})

describe('ArticleGuideLinks', () => {
  it('renders nothing when neither overrides nor heuristic matches exist', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([])
    getGuidesForRegionsMock.mockResolvedValueOnce([])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Osaka'], articleId: 'a1', t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('shows pinned overrides first, then fills remaining slots with heuristic matches, deduped', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([guide('pinned')])
    getGuidesForRegionsMock.mockResolvedValueOnce([guide('pinned'), guide('heuristic')])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
    render(jsx)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0].textContent).toContain('Guide pinned')
    expect(links[1].textContent).toContain('Guide heuristic')
  })

  it('renders heuristic-only when there are no overrides', async () => {
    getGuideOverridesForArticleMock.mockResolvedValueOnce([])
    getGuidesForRegionsMock.mockResolvedValueOnce([guide('a'), guide('b')])
    const jsx = await ArticleGuideLinks({ locale: 'en', regions: ['Tokyo'], articleId: 'a1', t: en.article })
    render(jsx)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
