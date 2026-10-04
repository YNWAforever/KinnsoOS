// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { getPublicMerchants, getMerchantBySlug, getMerchantsForSitemap } from '@/lib/merchants/public-queries'

beforeEach(() => { fromMock.mockReset() })

describe('getPublicMerchants', () => {
  it('reads from merchant_public_profiles ordered newest-first, slug tiebreak', async () => {
    const order2 = vi.fn(() => Promise.resolve({
      data: [{ id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel', tagline: 'Boutique tours', city: 'Hong Kong', logo_url: null, website_url: null, created_at: '2026-07-01T00:00:00Z' }],
      error: null,
    }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })

    const rows = await getPublicMerchants()
    expect(fromMock).toHaveBeenCalledWith('merchant_public_profiles')
    expect(rows).toEqual([{
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: null, websiteUrl: null,
    }])
  })

  it('returns [] when there are no merchants yet (honest empty state)', async () => {
    const order2 = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })
    expect(await getPublicMerchants()).toEqual([])
  })
})

describe('getMerchantBySlug', () => {
  it('returns null for an unknown slug', async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    expect(await getMerchantBySlug('nope')).toBeNull()
  })

  it('maps a found row to camelCase', async () => {
    const row = { id: 'm1', slug: 'acme-travel', company_name: 'Acme Travel', tagline: 'Boutique tours', city: 'Hong Kong', logo_url: 'https://x/y.png', website_url: 'https://acme.example', created_at: '2026-07-01T00:00:00Z' }
    const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })
    const result = await getMerchantBySlug('acme-travel')
    expect(result).toEqual({
      id: 'm1', slug: 'acme-travel', companyName: 'Acme Travel', tagline: 'Boutique tours',
      city: 'Hong Kong', logoUrl: 'https://x/y.png', websiteUrl: 'https://acme.example',
    })
  })
})

describe('getMerchantsForSitemap', () => {
  it('returns slug + lastmod pairs', async () => {
    const order2 = vi.fn(() => Promise.resolve({
      data: [{ slug: 'acme-travel', created_at: '2026-07-01T00:00:00Z' }], error: null,
    }))
    const order1 = vi.fn(() => ({ order: order2 }))
    fromMock.mockReturnValue({ select: vi.fn(() => ({ order: order1 })) })
    expect(await getMerchantsForSitemap()).toEqual([{ slug: 'acme-travel', lastmod: '2026-07-01T00:00:00Z' }])
  })
})
