// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
let pathname = '/en/admin'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { AdminShell } from '@/components/kinnso/admin/AdminShell'
import { AdminDashboardView } from '@/components/kinnso/admin/AdminDashboardView'

describe('AdminShell', () => {
  it('renders the nav links with correct hrefs and the children', () => {
    render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
    expect((screen.getByRole('link', { name: en.admin.navDashboard }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin')
    expect((screen.getByRole('link', { name: en.admin.navPerks }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/perks')
    expect((screen.getByRole('link', { name: en.admin.navUsers }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/users')
    expect((screen.getByRole('link', { name: en.admin.navCreators }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/creators')
    expect((screen.getByRole('link', { name: en.admin.navTestimonials }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/testimonials')
    expect((screen.getByRole('link', { name: en.admin.navEnquiries }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/enquiries')
    expect((screen.getByRole('link', { name: en.admin.navAnalytics }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/admin/analytics')
    expect(screen.getByText('child-content')).toBeTruthy()
  })

  it('highlights only the exact enquiries route', () => {
    pathname = '/en/admin/enquiries'
    render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
    expect(screen.getByRole('link', { name: en.admin.navEnquiries }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: en.admin.navDashboard }).getAttribute('aria-current')).toBeNull()
  })

  it('highlights the analytics route', () => {
    pathname = '/en/admin/analytics'
    render(<AdminShell locale="en" t={en.admin}><p>child-content</p></AdminShell>)
    expect(screen.getByRole('link', { name: en.admin.navAnalytics }).getAttribute('aria-current')).toBe('page')
  })
})

describe('AdminDashboardView', () => {
  it('renders the overview counts', () => {
    render(<AdminDashboardView t={en.admin} overview={{ creators: 5, merchants: 2, ops: 1, perksActive: 3, perksTotal: 4, redemptions: 7 }} />)
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText(en.admin.statCreators)).toBeTruthy()
  })
})
