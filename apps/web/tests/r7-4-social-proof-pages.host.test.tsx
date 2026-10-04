// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { testimonialsMock } = vi.hoisted(() => ({ testimonialsMock: vi.fn(async () => []) }))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/home/queries', () => ({ getPublishedTestimonials: testimonialsMock }))
vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: () => ({ bookingLive: false }) }))

import ForCreatorsPage, { revalidate as creatorsRevalidate } from '@/app/[locale]/for-creators/page'
import ForMerchantsPage, { revalidate as merchantsRevalidate } from '@/app/[locale]/for-merchants/page'

beforeEach(() => vi.clearAllMocks())

describe('R7.4 audience testimonial pages', () => {
  it('requests only creator-tagged testimonials', async () => {
    await ForCreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(testimonialsMock).toHaveBeenCalledWith('en', 'creator')
  })

  it('requests only merchant-tagged testimonials', async () => {
    await ForMerchantsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(testimonialsMock).toHaveBeenCalledWith('en', 'merchant')
  })

  it('revalidates both audience pages approximately hourly', () => {
    expect(creatorsRevalidate).toBe(3600)
    expect(merchantsRevalidate).toBe(3600)
  })
})