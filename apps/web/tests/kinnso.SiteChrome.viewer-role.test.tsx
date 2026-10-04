// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { rows, from, getUser, onAuthStateChange } = vi.hoisted(() => {
  const rows: {
    ops: { id: string } | null
    merchant: { id: string } | null
    creator: { status: string } | null
    handle: { id: string } | null
  } = {
    ops: null,
    merchant: null,
    creator: null,
    handle: null,
  }
  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u1' } },
    error: null,
  }))
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }))
  const from = vi.fn((table: string) => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({
      data:
        table === 'kinnso_ops_members' ? rows.ops
        : table === 'merchant_profiles' ? rows.merchant
        : table === 'creators' ? rows.creator
        : table === 'creator_social_handles' ? rows.handle
        : null,
      error: null,
    }))
    return builder
  })
  return { rows, from, getUser, onAuthStateChange }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/articles',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser, onAuthStateChange },
    from,
  }),
}))

import { SiteChrome } from '@/components/kinnso/SiteChrome'
import en from '@/lib/i18n/messages/en'

afterEach(() => {
  cleanup()
  rows.ops = null
  rows.merchant = null
  rows.creator = null
  rows.handle = null
  vi.clearAllMocks()
})

describe('SiteChrome live viewer-role integration', () => {
  it('carries an onboarding creator with a saved handle into the pending Navbar CTA', async () => {
    rows.creator = { status: 'onboarding' }
    rows.handle = { id: 'handle-1' }

    render(
      <SiteChrome
        locale="en"
        sessionsLive
        bookingLive={false}
        dashboardLabel={en.admin.navDashboard}
        nav={en.nav}
        footer={en.footer}
        analytics={en.analytics}
      >
        <div>PAGE_BODY</div>
      </SiteChrome>,
    )

    const pending = await screen.findByRole('link', { name: en.nav.ctaPending })
    expect(pending.getAttribute('href')).toBe('/en/creators/apply')
    expect(screen.queryByRole('link', { name: en.nav.signUp })).toBeNull()
    expect(from).toHaveBeenCalledWith('creator_social_handles')
  })
})
