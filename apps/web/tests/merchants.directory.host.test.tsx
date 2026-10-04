// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getPublicMerchantsMock } = vi.hoisted(() => ({ getPublicMerchantsMock: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/merchants/public-queries', () => ({ getPublicMerchants: getPublicMerchantsMock }))

import MerchantsDirectoryPage from '@/app/[locale]/merchants/page'

afterEach(cleanup)

describe('MerchantsDirectoryPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('shows the honest empty state when there are no merchants', async () => {
    getPublicMerchantsMock.mockResolvedValue([])
    const el = await MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/No merchants yet/i)).toBeTruthy()
  })

  it('renders a merchant card linking to /m/[slug]', async () => {
    getPublicMerchantsMock.mockResolvedValue([{
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: 'https://picsum.photos/logo.jpg', websiteUrl: null,
    }])
    const el = await MerchantsDirectoryPage({ params: Promise.resolve({ locale: 'en' }) })
    const { container } = render(el)
    expect(screen.getByRole('heading', { level: 2, name: 'Acme Travel' })).toBeTruthy()
    const link = screen.getByRole('link', { name: /Acme Travel/i })
    expect(link.getAttribute('href')).toBe('/en/m/acme-travel')
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })
})
