import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  imageResponseMock,
  getGuideBySlugMock,
  getExperienceBySlugMock,
  loadRemoteImageMock,
} = vi.hoisted(() => ({
  imageResponseMock: vi.fn(function (this: Record<string, unknown>, element: unknown, options: unknown) {
    this.element = element
    this.options = options
  }),
  getGuideBySlugMock: vi.fn(),
  getExperienceBySlugMock: vi.fn(),
  loadRemoteImageMock: vi.fn(async () => 'data:image/jpeg;base64,dGVzdA=='),
}))

vi.mock('next/og', () => ({ ImageResponse: imageResponseMock }))
vi.mock('@/lib/guides/queries', () => ({ getGuideBySlug: getGuideBySlugMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ getExperienceBySlug: getExperienceBySlugMock }))
vi.mock('@/lib/seo/og/fonts', () => ({ loadOgFonts: vi.fn(async () => []) }))
vi.mock('@/lib/seo/og/data', () => ({
  truncate: (value: string) => value,
  loadRemoteImage: loadRemoteImageMock,
}))

import GuideOgImage from '@/app/[locale]/g/[slug]/opengraph-image'
import ExperienceOgImage from '@/app/[locale]/experiences/[slug]/opengraph-image'

const guide = {
  id: 'g1', slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: null,
  city: 'Kyoto', saves: 5, creatorHandle: 'teafan',
}
const experience = {
  id: 'e1', slug: 'sunset-tour', title: 'Sunset tour', coverUrl: null,
  city: 'Hong Kong', merchant: { slug: 'acme', companyName: 'Acme' },
}

const renderedProps = (response: unknown) =>
  ((response as { element: { props: Record<string, unknown> } }).element.props)

beforeEach(() => {
  imageResponseMock.mockClear()
  loadRemoteImageMock.mockClear()
  getGuideBySlugMock.mockResolvedValue(guide)
  getExperienceBySlugMock.mockResolvedValue(experience)
})

describe('public OG media handlers', () => {
  it('keeps invalid guide and experience covers out of remote fetches', async () => {
    getGuideBySlugMock.mockResolvedValue({ ...guide, cover: 'https://picsum.photos/guide.jpg' })
    getExperienceBySlugMock.mockResolvedValue({ ...experience, coverUrl: 'http://cdn.kinnso.ai/experience.jpg' })

    const guideResponse = await GuideOgImage({ params: Promise.resolve({ locale: 'en', slug: guide.slug }) })
    const experienceResponse = await ExperienceOgImage({ params: Promise.resolve({ locale: 'en', slug: experience.slug }) })

    expect(loadRemoteImageMock).not.toHaveBeenCalled()
    expect(renderedProps(guideResponse).cover).toBeUndefined()
    expect(renderedProps(experienceResponse).cover).toBeUndefined()
  })

  it('fetches approved CDN covers and passes the inlined image to both OG cards', async () => {
    const guideCover = 'https://cdn.kinnso.ai/test/guide.jpg'
    const experienceCover = 'https://cdn.kinnso.ai/test/experience.jpg'
    getGuideBySlugMock.mockResolvedValue({ ...guide, cover: guideCover })
    getExperienceBySlugMock.mockResolvedValue({ ...experience, coverUrl: experienceCover })

    const guideResponse = await GuideOgImage({ params: Promise.resolve({ locale: 'en', slug: guide.slug }) })
    const experienceResponse = await ExperienceOgImage({ params: Promise.resolve({ locale: 'en', slug: experience.slug }) })

    expect(imageResponseMock).toHaveBeenCalledTimes(2)
    expect(loadRemoteImageMock).toHaveBeenNthCalledWith(1, guideCover)
    expect(loadRemoteImageMock).toHaveBeenNthCalledWith(2, experienceCover)
    expect(renderedProps(guideResponse).cover).toBe('data:image/jpeg;base64,dGVzdA==')
    expect(renderedProps(experienceResponse).cover).toBe('data:image/jpeg;base64,dGVzdA==')
  })

  it('preserves the typographic fallback when entities are missing', async () => {
    getGuideBySlugMock.mockResolvedValue(null)
    const response = await GuideOgImage({ params: Promise.resolve({ locale: 'en', slug: 'missing' }) })

    expect(loadRemoteImageMock).not.toHaveBeenCalled()
    expect(renderedProps(response).title).toBe('Guide')
    expect(renderedProps(response).subtitle).toBe('KINNSO')
  })
})
