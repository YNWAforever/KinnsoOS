// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { StudioQuickLinks } from '@/components/kinnso/StudioQuickLinks'

afterEach(cleanup)

describe('StudioQuickLinks', () => {
  it('renders the live tools as locale-prefixed links, including the now-live inbox tile', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/en/studio/scan')
    expect(hrefs).toContain('/en/studio/missions')
    expect(hrefs).toContain('/en/studio/earnings')
    expect(hrefs).toContain('/en/studio/offers')
    expect(hrefs).toContain('/en/studio/guides')
    // Inbox is live — clickable, linking to the real feed.
    expect(hrefs).toContain('/en/studio/inbox')
    expect(screen.getByText(en.studioHome.inboxTitle)).toBeTruthy()
  })

  it('marks every tool Live now that the inbox has shipped', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    expect(screen.getAllByText(en.studioHome.liveBadge).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(en.studioHome.soonBadge).length).toBe(0)
  })

  it('renders a live Tier tile linking to /studio/tier', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const tierDesc = screen.getByText('Your contribution points and tier.')
    expect(tierDesc).toBeTruthy()
    const link = tierDesc.closest('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/en/studio/tier')
  })

  it('renders the Perks tile linking to /studio/perks', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const link = screen.getByText(en.studioHome.perksTitle).closest('a')
    expect(link?.getAttribute('href')).toBe('/en/studio/perks')
  })

  it('renders an Insights tile linking to /studio/insights', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/en/studio/insights')
  })

  it('flips the Inbox tile live and links it', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    const link = screen.getByRole('link', { name: new RegExp(en.studioHome.inboxTitle) })
    expect(link.getAttribute('href')).toBe('/en/studio/inbox')
  })

  it('shows an unread count badge when there are unread notifications', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={3} />)
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows no badge when there are zero unread notifications', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('composes a single well-formed accessible name for the inbox link instead of gluing the badge onto it', () => {
    render(<StudioQuickLinks locale="en" t={en.studioHome} unreadNotificationCount={3} />)
    const expectedLabel = `${en.studioHome.inboxTitle}, ${en.studioHome.unreadBadgeLabel.replace('{count}', '3')}`
    const link = screen.getByRole('link', { name: expectedLabel })
    expect(link.getAttribute('href')).toBe('/en/studio/inbox')
    // The visible numeral must not leak into the accessible name as a second,
    // unseparated fragment (e.g. "Live3 unread Inbox...") — it's aria-hidden,
    // and the link's own aria-label is the sole source of its accessible name.
    const badge = screen.getByText('3')
    expect(badge.getAttribute('aria-hidden')).toBe('true')
  })
})
