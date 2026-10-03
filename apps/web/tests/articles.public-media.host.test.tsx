// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getArticleDetailMock, getIndexableArticleLocalesMock, searchArticlesMock } = vi.hoisted(() => ({
  getArticleDetailMock: vi.fn(),
  getIndexableArticleLocalesMock: vi.fn(),
  searchArticlesMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/articles/queries', () => ({
  getArticleDetail: getArticleDetailMock,
  searchArticles: searchArticlesMock,
  getIndexableArticleLocales: getIndexableArticleLocalesMock,
  getIndexableCategoryLocales: vi.fn(async () => ['en']),
  getYouMayLike: vi.fn(async () => []),
  getStaticArticleParams: vi.fn(async () => []),
}))
vi.mock('@/lib/i18n/dictionaries', () => ({
  getDictionary: vi.fn(async () => ({
    breadcrumb: { home: 'Home', articles: 'Articles' },
    categories: { destinations: 'Destinations', dining: 'Dining', shopping: 'Shopping' },
    article: {
      by: 'By', fallbackNotice: 'Fallback', faqTitle: 'FAQ',
      youMayLike: 'You may like', tableOfContents: 'Contents',
    },
  })),
}))
vi.mock('@/components/ArticleBlockRenderer', () => ({ ArticleBlockRenderer: () => null }))
vi.mock('@/components/kinnso/articles/ArticleGuideLinks', () => ({ ArticleGuideLinks: () => null }))
vi.mock('@/components/kinnso/articles/ArticleExperienceLinks', () => ({ ArticleExperienceLinks: () => null }))
vi.mock('@/components/ArticleToc', () => ({ ArticleToc: () => null }))
vi.mock('@/components/ViewPing', () => ({ ViewPing: () => null }))

import ArticleDetailPage, { generateMetadata } from '@/app/[locale]/articles/[category]/[url]/page'
import ArticlesHubPage from '@/app/[locale]/articles/page'

const baseArticle = {
  id: 'a1',
  url: 'kyoto-tea',
  slug: 'kyoto-tea',
  category: 'destination',
  thumbnails: [] as string[],
  authors: [],
  regions: [],
  tag_slugs: [],
  rating: null,
  views: 0,
  published_at: '2026-06-01T00:00:00Z',
  end_at: null,
  edit_at: null,
  is_coupon: false,
  translation: {
    title: 'Kyoto Tea',
    content: [],
    summary: 'Tea houses.',
    meta_title: null,
    meta_description: null,
    og_image: null as string | null,
    faq_title: null,
    locale: 'en',
  },
  faqs: [],
  author: null,
}

const params = Promise.resolve({ locale: 'en', category: 'destinations', url: 'kyoto-tea' })

beforeEach(() => {
  getArticleDetailMock.mockResolvedValue(baseArticle)
  getIndexableArticleLocalesMock.mockResolvedValue(['en'])
  searchArticlesMock.mockResolvedValue({ items: [] })
})
afterEach(cleanup)

describe('article route media behavior', () => {
  it('withholds FAQ schema for a fallback translation while preserving visible FAQs and its language', async () => {
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      translation: { ...baseArticle.translation, locale: 'ja' },
      faqs: [{ question: 'Where?', answer: 'Kyoto.' }],
    })
    getIndexableArticleLocalesMock.mockResolvedValue(['ja'])

    const { container, getByText } = render(await ArticleDetailPage({ params }))
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''

    expect(ld).toContain('"inLanguage":"ja"')
    expect(ld).not.toContain('"@type":"FAQPage"')
    expect(getByText('Where?')).toBeTruthy()
    expect(getByText('Kyoto.')).toBeTruthy()
  })

  it('keeps an indexable current canonical while x-default uses the first preferred genuine locale', async () => {
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      translation: { ...baseArticle.translation, locale: 'ja' },
    })
    getIndexableArticleLocalesMock.mockResolvedValue(['ja', 'zh-tw'])

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: 'ja', category: 'destinations', url: 'kyoto-tea',
      }),
    })
    expect(new URL(String(metadata.alternates?.canonical)).pathname).toBe(
      '/ja/articles/destinations/kyoto-tea',
    )
    const languages = metadata.alternates?.languages as Record<string, string>
    expect(Object.keys(languages).sort()).toEqual(['ja', 'x-default', 'zh-tw'])
    expect(new URL(languages['x-default']).pathname).toBe(
      '/zh-tw/articles/destinations/kyoto-tea',
    )
  })

  it('omits invalid media from metadata, JSON-LD, and rendered image src', async () => {
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      thumbnails: ['https://picsum.photos/article.jpg'],
      translation: { ...baseArticle.translation, og_image: 'http://cdn.kinnso.ai/og.jpg' },
    })

    const metadata = await generateMetadata({ params })
    expect((metadata.openGraph as { images: string[] }).images).toEqual([])

    const { container } = render(await ArticleDetailPage({ params }))
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).not.toContain('picsum.photos')
    expect(container.innerHTML).not.toContain('picsum.photos')
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
  })

  it('uses approved CDN media in metadata, JSON-LD, and the detail hero', async () => {
    const thumbnail = 'https://cdn.kinnso.ai/test/article.jpg'
    const ogImage = 'https://cdn.kinnso.ai/test/article-og.jpg'
    getArticleDetailMock.mockResolvedValue({
      ...baseArticle,
      thumbnails: [thumbnail],
      translation: { ...baseArticle.translation, og_image: ogImage },
    })

    const metadata = await generateMetadata({ params })
    expect((metadata.openGraph as { images: string[] }).images).toEqual([ogImage])

    const { container } = render(await ArticleDetailPage({ params }))
    const ld = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? ''
    expect(ld).toContain(thumbnail)
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
    expect(container.querySelector('img')).toBeTruthy()
  })
})

describe('article hub categories', () => {
  it('renders populated categories without rendering empty category headings', async () => {
    searchArticlesMock.mockImplementation(async ({ category }: { category: string }) => ({
      items: category === 'destination'
        ? [{ url: 'kyoto-tea', title: 'Kyoto Tea', thumbnails: [], summary: 'Tea houses.' }]
        : [],
    }))

    const { getByRole, queryByRole } = render(await ArticlesHubPage({ params: Promise.resolve({ locale: 'en' }) }))

    expect(getByRole('heading', { name: 'Destinations' })).toBeTruthy()
    expect(getByRole('link', { name: 'Kyoto Tea' })).toBeTruthy()
    expect(queryByRole('heading', { name: 'Dining' })).toBeNull()
    expect(queryByRole('heading', { name: 'Shopping' })).toBeNull()
  })
})
