// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/merchants/directory', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams('') }))
import { MerchantsDirectoryView } from '@/components/kinnso/admin/merchants/MerchantsDirectoryView'
import type { MerchantsDirectory } from '@/lib/admin/merchants-queries'

const noop = async () => ({ ok: true as const, id: 'm1' })
const dir: MerchantsDirectory = {
  rows: [{ id: 'm1', companyName: 'Acme Co', status: 'active', tier: 'growth', createdAt: '2026-06-30T00:00:00Z' }],
  nextCursor: null,
}
const props = { t: en.merchantsOps, locale: 'en' as const, directory: dir,
  onSetStatus: noop as never, onSetTier: noop as never, onAddNote: noop as never, onBulkSetStatus: (async () => ({ ok: true, count: 0 })) as never }

describe('MerchantsDirectoryView', () => {
  it('renders a merchant row with status + tier', () => {
    render(<MerchantsDirectoryView {...props} />)
    expect(screen.getByText('Acme Co')).toBeTruthy()
    expect(screen.getAllByText(en.merchantsOps.statusActive).length).toBeGreaterThan(0)
    expect(screen.getAllByText(en.merchantsOps.tierGrowth).length).toBeGreaterThan(0)
  })
  it('shows the empty state when no rows', () => {
    render(<MerchantsDirectoryView {...props} directory={{ rows: [], nextCursor: null }} />)
    expect(screen.getByText(en.merchantsOps.dirEmpty)).toBeTruthy()
  })
  it('links each company name to its 360 detail page', () => {
    render(<MerchantsDirectoryView {...props} />)
    const link = screen.getByRole('link', { name: 'Acme Co' })
    expect(link.getAttribute('href')).toBe('/en/admin/merchants/m1')
  })
})
