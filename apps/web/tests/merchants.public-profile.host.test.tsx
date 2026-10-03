// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMerchantBySlugMock, listPublishedForMerchantMock, getAttributedGuidesMock, productStateMock } = vi.hoisted(() => ({
  getMerchantBySlugMock: vi.fn(),
  listPublishedForMerchantMock: vi.fn(),
  getAttributedGuidesMock: vi.fn(),
  productStateMock: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/merchants/public-queries', () => ({ getMerchantBySlug: getMerchantBySlugMock }))
vi.mock('@/lib/experiences/public-queries', () => ({ listPublishedExperiencesForMerchant: listPublishedForMerchantMock }))
vi.mock('@/lib/guides/queries', () => ({ getAttributedGuidesForMerchant: getAttributedGuidesMock }))
vi.mock('@/lib/product-state-config', () => ({ resolveConfiguredProductState: productStateMock }))

import MerchantPublicProfilePage from '@/app/[locale]/m/[slug]/page'

beforeEach(() => {
  getAttributedGuidesMock.mockResolvedValue([])
  listPublishedForMerchantMock.mockResolvedValue([])
  productStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
})
afterEach(cleanup)

describe('MerchantPublicProfilePage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'xx', slug: 'acme-travel' }) })).rejects.toThrow('notFound')
  })

  it('passes resolved booking state and keeps the core profile when optional attribution fails', async () => {
    productStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
    getMerchantBySlugMock.mockResolvedValue({ id: '123e4567-e89b-42d3-a456-426614174000', slug: 'acme-travel', companyName: 'Acme Travel', tagline: null, city: null, logoUrl: null, websiteUrl: null })
    listPublishedForMerchantMock.mockResolvedValue([])
    getAttributedGuidesMock.mockRejectedValue({ code: 'PGRST202', message: 'attribution RPC unavailable' })
    const el = await MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'acme-travel' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Travel' })).toBeTruthy()
    expect(getAttributedGuidesMock).toHaveBeenCalledWith('123e4567-e89b-42d3-a456-426614174000')
    expect(screen.queryByRole('heading', { name: 'Featured in guides' })).not.toBeInTheDocument()
  })

  it('rethrows unknown merchant attribution failures', async () => {
    const error = new TypeError('attribution mapper bug')
    getMerchantBySlugMock.mockResolvedValue({ id: '123e4567-e89b-42d3-a456-426614174000', slug: 'acme-travel', companyName: 'Acme Travel', tagline: null, city: null, logoUrl: null, websiteUrl: null })
    getAttributedGuidesMock.mockRejectedValueOnce(error)
    await expect(MerchantPublicProfilePage({
      params: Promise.resolve({ locale: 'en', slug: 'acme-travel' }),
    })).rejects.toBe(error)
  })

  it('notFound for an unknown slug', async () => {
    getMerchantBySlugMock.mockResolvedValue(null)
    await expect(MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'nope' }) })).rejects.toThrow('notFound')
  })

  it('renders the merchant identity and an honest empty state with no experiences', async () => {
    getMerchantBySlugMock.mockResolvedValue({
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: 'https://picsum.photos/logo.jpg', websiteUrl: 'https://acme.example',
    })
    listPublishedForMerchantMock.mockResolvedValue([])
    const el = await MerchantPublicProfilePage({ params: Promise.resolve({ locale: 'en', slug: 'acme-travel' }) })
    const { container } = render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Travel' })).toBeTruthy()
    expect(screen.getByText(/No experiences published yet/i)).toBeTruthy()
    const website = screen.getByRole('link', { name: /Website/i })
    expect(website.getAttribute('href')).toBe('https://acme.example')
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })
})
