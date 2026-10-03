// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const { getExperiencesForCityMock } = vi.hoisted(() => ({ getExperiencesForCityMock: vi.fn() }))
vi.mock('@/lib/experiences/public-queries', () => ({ getExperiencesForCity: getExperiencesForCityMock }))

import { GuideExperienceLinks } from '@/components/kinnso/GuideExperienceLinks'
import en from '@/lib/i18n/messages/en'

const experience = (slug: string) => ({
  id: slug, slug, title: `Experience ${slug}`, summary: null, description: null, city: 'Kyoto',
  priceAmount: 3000, currency: 'JPY', durationMinutes: null, coverUrl: null, publishedAt: null,
  merchant: { slug: 'm', companyName: 'M' },
})

describe('GuideExperienceLinks', () => {
  it('renders nothing when no experiences match the city', async () => {
    getExperiencesForCityMock.mockResolvedValue([])
    const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })

  it('renders cards linking with ?src=guide&guideSlug=<the current guide>', async () => {
    getExperiencesForCityMock.mockResolvedValue([experience('a')])
    const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
    render(jsx)
    const link = screen.getByRole('link', { name: /Experience a/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/a?src=guide&guideSlug=kyoto-tea')
  })

  it('renders nothing when the cross-link query rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getExperiencesForCityMock.mockRejectedValueOnce(new Error('cross-link unavailable'))
    const jsx = await GuideExperienceLinks({ locale: 'en', city: 'Kyoto', guideSlug: 'kyoto-tea', t: en.article })
    const { container } = render(jsx)
    expect(container.innerHTML).toBe('')
  })
})
