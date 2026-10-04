import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  productStateMock,
  indexableCategoryLocalesMock,
} = vi.hoisted(() => ({
  productStateMock: vi.fn(),
  indexableCategoryLocalesMock: vi.fn(),
}))

vi.mock('@/lib/product-state', () => ({
  resolveConfiguredProductState: productStateMock,
}))
vi.mock('@/lib/articles/queries', () => ({
  searchArticles: vi.fn(),
  getIndexableCategoryLocales: indexableCategoryLocalesMock,
}))

import { generateMetadata as hubMetadata } from '@/app/[locale]/articles/page'
import { generateMetadata as categoryMetadata } from '@/app/[locale]/articles/[category]/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  productStateMock.mockReturnValue({ bookingLive: false })
  indexableCategoryLocalesMock.mockResolvedValue(['en', 'zh-hk'])
})

describe('/articles metadata state', () => {
  it('uses marketplace title and waitlist-safe description when booking is off', async () => {
    const metadata = await hubMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })
    expect(metadata.title).toBe(en.seo.articles.title)
    expect(metadata.description).toBe(
      en.seo.articles.descriptionBookingWaitlist,
    )
    expect(metadata.description).not.toMatch(/brand missions|affiliate|copilot/i)
    expect(metadata.description).not.toMatch(/bookable/i)
  })

  it('uses the booking-live description only when booking is live', async () => {
    productStateMock.mockReturnValue({ bookingLive: true })
    const metadata = await hubMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })
    expect(metadata.description).toBe(
      en.seo.articles.descriptionBookingLive,
    )
    expect(metadata.description).toMatch(/bookable/i)
  })

  it('noindexes an empty locale/category and advertises only populated locales', async () => {
    const metadata = await categoryMetadata({
      params: Promise.resolve({ locale: 'ja', category: 'dining' }),
    })
    expect((metadata.robots as { index: boolean }).index).toBe(false)
    expect(Object.keys(
      metadata.alternates?.languages as Record<string, string>,
    ).sort()).toEqual(['en', 'x-default', 'zh-hk'])
  })

  it('uses the first genuine locale for a non-English-only category requested from a noindex locale', async () => {
    indexableCategoryLocalesMock.mockResolvedValueOnce(['ja'])
    const metadata = await categoryMetadata({
      params: Promise.resolve({ locale: 'zh-cn', category: 'dining' }),
    })
    expect((metadata.robots as { index: boolean }).index).toBe(false)
    const languages = metadata.alternates?.languages as Record<string, string>
    expect(Object.keys(languages).sort()).toEqual(['ja', 'x-default'])
    expect(languages['x-default']).toMatch(
      /\/ja\/articles\/dining$/,
    )
  })

  it('emits no x-default alternate for a category with no genuine locales', async () => {
    indexableCategoryLocalesMock.mockResolvedValueOnce([])
    const metadata = await categoryMetadata({
      params: Promise.resolve({ locale: 'zh-cn', category: 'dining' }),
    })
    expect((metadata.robots as { index: boolean }).index).toBe(false)
    expect(metadata.alternates?.languages).toEqual({})
  })
})
