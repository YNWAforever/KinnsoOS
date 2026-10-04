// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
const mocks = vi.hoisted(() => ({
  guides: vi.fn(async () => [{ slug: 'tokyo', title: 'Tokyo', cover: null, city: 'Tokyo', saves: 0, creatorHandle: 'ada' }]),
  destinations: vi.fn(async () => [{
    slug: 'tokyo', name: 'Tokyo', matchTerms: ['東京'], guideCount: 1, experienceCount: 0,
    heroImageUrl: null, description: null, latestPublishedAt: null,
  }]),
}))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: mocks.guides }))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: mocks.destinations }))
vi.mock('@/components/kinnso/pages/ExploreView', () => ({
  ExploreView: (props: Record<string, unknown>) => {
    captured.props = props
    return <div data-testid="explore-view" />
  },
}))

import ExplorePage, { revalidate } from '@/app/[locale]/explore/page'
import ExploreLoading from '@/app/[locale]/explore/loading'

describe('/[locale]/explore host', () => {
  beforeEach(() => { captured.props = null; vi.clearAllMocks() })

  it('loads guides and canonical destinations for the static view', async () => {
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(mocks.guides).toHaveBeenCalledOnce()
    expect(mocks.destinations).toHaveBeenCalledOnce()
    expect(captured.props).toMatchObject({
      locale: 'en',
      guides: await mocks.guides.mock.results[0].value,
      destinations: await mocks.destinations.mock.results[0].value,
    })
    expect(revalidate).toBe(300)
  })

  it('passes an empty destination list through for graceful unfiltered browsing', async () => {
    mocks.destinations.mockResolvedValueOnce([])
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(captured.props?.destinations).toEqual([])
  })

  // Plan acceptance story #18: a failed live read stays an error with retry —
  // never a demo fallback and never a false empty. /explore is statically
  // regenerated every 300s across seven locales, so a swallowed failure would
  // cache a cheerful "no guides yet" catalogue for five minutes per locale.
  it('propagates a guides read failure instead of rendering an empty catalogue', async () => {
    const failure = Object.assign(new Error('terminating connection'), { code: '57P01' })
    mocks.guides.mockRejectedValueOnce(failure)

    await expect(ExplorePage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toBe(failure)
    expect(captured.props).toBeNull()
  })

  it('propagates a destinations read failure for the same reason', async () => {
    const failure = Object.assign(new Error('connection failure'), { code: '08006' })
    mocks.destinations.mockRejectedValueOnce(failure)

    await expect(ExplorePage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toBe(failure)
    expect(captured.props).toBeNull()
  })

  it('renders a true empty catalogue as empty, distinctly from a failure', async () => {
    mocks.guides.mockResolvedValueOnce([])
    render(await ExplorePage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(captured.props?.guides).toEqual([])
  })

  it('renders a labelled skeleton structure without visible copy', () => {
    const { container } = render(<ExploreLoading />)
    expect(container.querySelector('[data-explore-skeleton="true"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-guide-card-skeleton="true"]')).toHaveLength(6)
  })

  it('rejects an unknown locale', async () => {
    await expect(ExplorePage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})