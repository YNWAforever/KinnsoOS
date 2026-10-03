// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
const { productStateMock, homeSessionsMock, testimonialsMock } = vi.hoisted(() => ({
  productStateMock: vi.fn(),
  homeSessionsMock: vi.fn(),
  testimonialsMock: vi.fn(async () => []),
}))
beforeEach(() => {
  productStateMock.mockResolvedValue({ agentLive: true, bookingLive: false, sessionsLive: false })
  homeSessionsMock.mockResolvedValue([])
  testimonialsMock.mockResolvedValue([])
  homeGuidesMock.mockResolvedValue([])
})
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
const { homeGuidesMock } = vi.hoisted(() => ({ homeGuidesMock: vi.fn(async () => [] as unknown[]) }))
vi.mock('@/lib/guides/queries', () => ({ getPublishedGuides: homeGuidesMock }))
vi.mock('@/lib/articles/queries', () => ({ searchArticles: async () => ({ items: [], total: 0, page: 1, perPage: 3 }) }))
vi.mock('@/lib/product-state', () => ({ getProductState: productStateMock }))
vi.mock('@/lib/home/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/home/queries')>()),
  getPlatformStats: async () => null,
  getPublishedTestimonials: testimonialsMock,
  getUpcomingSessions: async () => [],
  getHomeSessions: homeSessionsMock,
}))

import LocaleHome, { generateMetadata, revalidate } from '@/app/[locale]/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale] home host', () => {
  it('renders the rebuilt homepage from mocked (empty) data without filler', async () => {
    const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
    expect(screen.queryByText(en.home.sessionsHeading)).toBeNull()
  })
  // The homepage deliberately keeps the opposite contract to /explore: one band
  // of ten degrading to hidden is reasonable, and optionalQuery records it.
  // /explore must not fake an empty catalogue -- see explore.host.test.tsx.
  it('hides the guides band rather than crashing when the guides read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    homeGuidesMock.mockRejectedValueOnce(
      Object.assign(new Error('terminating connection'), { code: '57P01' }),
    )

    const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
    expect(screen.getByText(en.home.featuredEmpty)).toBeTruthy()
    // The failure is recorded, not silently swallowed.
    expect(consoleError).toHaveBeenCalledWith('optional-module-failed', expect.objectContaining({ module: 'home-guides' }))
    consoleError.mockRestore()
  })

  it('passes the resolved product state and home sessions to the view', async () => {
    productStateMock.mockResolvedValue({ agentLive: true, bookingLive: true, sessionsLive: true })
    homeSessionsMock.mockResolvedValue([{ id: 's1', slug: 'replay', title: 'Replay session', hostHandle: 'sora', startsAt: '2026-01-01T00:00:00Z' }])
    const ui = await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.home.sessionsHeading)).toBeTruthy()
    expect(screen.getByText('Replay session')).toBeTruthy()
  })

  it('loads locale-aware homepage testimonials across audience roles', async () => {
    await LocaleHome({ params: Promise.resolve({ locale: 'en' }) })
    expect(testimonialsMock).toHaveBeenCalledWith('en')
  })
  it('ISR-revalidates approximately hourly', () => {
    expect(revalidate).toBe(3600)
  })
  it('uses the updated seo.home strings', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.title).toBe(en.seo.home.title)
    expect(meta.description).toBe(en.seo.home.description)
  })
  it('404s unknown locales', async () => {
    await expect(LocaleHome({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('never 500s when searchArticles rejects', async () => {
    vi.resetModules()
    vi.doMock('@/lib/articles/queries', () => ({
      searchArticles: async () => {
        throw new Error('boom')
      },
    }))
    const { default: LocaleHomeWithFailingArticles } = await import('@/app/[locale]/page')
    const ui = await LocaleHomeWithFailingArticles({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.home.heroTitle })).toBeTruthy()
  })
})
