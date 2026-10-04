// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en',
  useSearchParams: () => new URLSearchParams(),
}))

import Footer from '@/components/kinnso/Footer'
import { Navbar } from '@/components/kinnso/Navbar'
import HomeView from '@/components/kinnso/pages/HomeView'
import type { ViewerRole } from '@/lib/auth/viewer-role'
import en from '@/lib/i18n/messages/en'

const localeRoot = path.join(process.cwd(), 'app/[locale]')

function routeExists(parts: string[], dir = localeRoot): boolean {
  if (parts.length === 0) return fs.existsSync(path.join(dir, 'page.tsx'))
  if (!fs.existsSync(dir)) return false

  const [segment, ...rest] = parts
  const candidates = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name === segment || /^\[.+\]$/.test(entry.name))

  return candidates.some((entry) => routeExists(rest, path.join(dir, entry.name)))
}

function isImplementedLocalRoute(href: string): boolean {
  const url = new URL(href, 'https://example.test')
  const [locale, ...parts] = url.pathname.split('/').filter(Boolean)
  if (locale !== 'en') return false
  return routeExists(parts)
}

function collectInternalLinks(ui: React.ReactElement): string[] {
  const { container, unmount } = render(ui)
  const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => href !== null)
  unmount()
  return hrefs
}

describe('front-of-house route parity', () => {
  it('keeps shell and homepage internal links backed by an app route', () => {
    const roles: ViewerRole[] = ['anon', 'creator', 'creator-pending', 'merchant', 'traveler', 'ops']
    const hrefs = new Set<string>()

    roles.forEach((role) => {
      collectInternalLinks(<Navbar locale="en" role={role} sessionsLive dashboardLabel={en.admin.navDashboard} t={en.nav} />).forEach((href) => hrefs.add(href))
    })
    collectInternalLinks(<Footer locale="en" bookingLive={false} t={en.footer} />).forEach((href) => hrefs.add(href))
    collectInternalLinks(
      <HomeView locale="en" t={en.home} featureInterest={en.featureInterest} productState={{ agentLive: true, bookingLive: false, sessionsLive: true }} guides={[]} stats={null} testimonials={[]} articles={[]} sessions={[]} />,
    ).forEach((href) => hrefs.add(href))

    const missing = Array.from(hrefs).filter((href) => !isImplementedLocalRoute(href))
    expect(missing).toEqual([])
  })
})
