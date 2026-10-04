// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const { getPublishedDestinationsMock } = vi.hoisted(() => ({
  getPublishedDestinationsMock: vi.fn(async (): Promise<import('@/lib/destinations/queries').Destination[]> => []),
}))
vi.mock('@/lib/destinations/queries', () => ({ getPublishedDestinations: getPublishedDestinationsMock }))

import DestinationsPage, { generateMetadata } from '@/app/[locale]/destinations/page'
import { MARKETING_PATHS } from '@/lib/seo/routes'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/destinations host', () => {
  it('renders honest destination inventory on linked cards', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([
      {
        slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: 'Neon nights.', matchTerms: ['Tokyo'],
        guideCount: 1, experienceCount: 2, latestPublishedAt: '2026-07-19T00:00:00.000Z',
      },
    ])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.destinations.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Tokyo/ }).getAttribute('href')).toBe('/en/destinations/tokyo')
    expect(screen.getByText('1 guide')).toBeTruthy()
    expect(screen.getByText('2 experiences')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Tokyo/ }).textContent).toContain('1 guide · 2 experiences')
    expect(document.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
  })

  it('omits zero inventory counts from destination cards', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([
      {
        slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: null, matchTerms: ['Tokyo'],
        guideCount: 0, experienceCount: 0, latestPublishedAt: null,
      },
    ])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.queryByText(/0 guides?/)).toBeNull()
    expect(screen.queryByText(/0 experiences?/)).toBeNull()
  })

  it('renders only experiences when guide inventory is zero', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([{ slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: null, matchTerms: ['Tokyo'], guideCount: 0, experienceCount: 2, latestPublishedAt: null }])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const card = screen.getByRole('link', { name: /Tokyo/ })
    expect(within(card).getByText('2 experiences')).toBeTruthy()
    expect(within(card).queryByText(/guides?/)).toBeNull()
    expect(card.textContent).not.toContain(' · ')
  })

  it('renders only guides when experience inventory is zero', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([{ slug: 'tokyo', name: 'Tokyo', heroImageUrl: null, description: null, matchTerms: ['Tokyo'], guideCount: 2, experienceCount: 0, latestPublishedAt: null }])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    const card = screen.getByRole('link', { name: /Tokyo/ })
    expect(within(card).getByText('2 guides')).toBeTruthy()
    expect(within(card).queryByText(/experiences?/)).toBeNull()
    expect(card.textContent).not.toContain(' · ')
  })

  it('shows the empty state when there are no published destinations', async () => {
    getPublishedDestinationsMock.mockResolvedValueOnce([])
    const ui = await DestinationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.destinations.empty)).toBeTruthy()
  })

  it('is indexable and listed in MARKETING_PATHS', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    expect(MARKETING_PATHS).toContain('/destinations')
  })

  it('404s unknown locales', async () => {
    await expect(DestinationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
