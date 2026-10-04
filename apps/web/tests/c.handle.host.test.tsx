// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicCreator } from '@/lib/creators/queries'

const { getCreatorMock, guidesMock, articlesMock, sessionsMock, offersMock } = vi.hoisted(() => ({
  getCreatorMock: vi.fn(),
  guidesMock: vi.fn(),
  articlesMock: vi.fn(),
  sessionsMock: vi.fn(),
  offersMock: vi.fn(),
}))

const creator: PublicCreator = {
  id: 'creator-1',
  avatarUrl: null,
  handle: 'maya',
  name: 'Maya Wanders',
  bio: 'Slow travel.',
  profile: { niches: ['Coffee'], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
}

vi.mock('@/lib/creators/queries', () => ({
  getCreatorByHandle: getCreatorMock,
  getPublishedGuidesForCreator: guidesMock,
}))
vi.mock('@/lib/articles/queries', () => ({ getPublishedArticlesForCreator: articlesMock }))
vi.mock('@/lib/sessions/public-queries', () => ({ getPublicSessionsForCreator: sessionsMock }))
vi.mock('@/lib/offers/public-queries', () => ({ listOffersForCreator: offersMock }))

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({ notFound: () => { throw notFoundError } }))

import CreatorPublicPage from '@/app/[locale]/c/[handle]/page'

beforeEach(() => {
  getCreatorMock.mockImplementation(async (handle: string) => handle === 'maya' ? creator : null)
  guidesMock.mockResolvedValue([])
  articlesMock.mockResolvedValue([])
  sessionsMock.mockResolvedValue([])
  offersMock.mockResolvedValue([])
  cleanup()
  vi.clearAllMocks()
})

describe('/[locale]/c/[handle] host', () => {
  it('renders the real profile for a known handle', async () => {
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(screen.getAllByText('@maya')[0]).toBeInTheDocument()
  })

  it('calls notFound for an unknown handle', async () => {
    await expect(
      CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'ghost' }) }),
    ).rejects.toBe(notFoundError)
  })

  it('degrades recognized creator-guide schema failures without hiding the core profile', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    guidesMock.mockRejectedValueOnce({ code: 'PGRST205', message: 'schema cache unavailable' })
    const ui = await CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeVisible()
    expect(log).toHaveBeenCalledWith('optional-module-failed', {
      module: 'creator-profile-guides',
      errorName: 'UnknownError',
    })
  })

  it('rethrows unknown enrichment failures', async () => {
    const error = new TypeError('creator guide mapper bug')
    guidesMock.mockRejectedValueOnce(error)
    await expect(CreatorPublicPage({
      params: Promise.resolve({ locale: 'en', handle: 'maya' }),
    })).rejects.toBe(error)
  })

  it('starts guides, articles, and sessions as concurrent independent enrichments', async () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((done) => { resolve = done })
      return { promise, resolve }
    }
    const guides = deferred<[]>()
    const articles = deferred<[]>()
    const sessions = deferred<[]>()
    guidesMock.mockReturnValueOnce(guides.promise)
    articlesMock.mockReturnValueOnce(articles.promise)
    sessionsMock.mockReturnValueOnce(sessions.promise)

    const pendingPage = CreatorPublicPage({ params: Promise.resolve({ locale: 'en', handle: 'maya' }) })
    await vi.waitFor(() => {
      expect(guidesMock).toHaveBeenCalledTimes(1)
      expect(articlesMock).toHaveBeenCalledTimes(1)
      expect(sessionsMock).toHaveBeenCalledTimes(1)
    })
    guides.resolve([])
    articles.resolve([])
    sessions.resolve([])
    await expect(pendingPage).resolves.toBeTruthy()
  })
})
