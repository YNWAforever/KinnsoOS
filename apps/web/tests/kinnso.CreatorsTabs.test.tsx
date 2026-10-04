// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsTabs } from '@/components/kinnso/admin/creators/CreatorsTabs'

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/creators/directory' }))
afterEach(cleanup)

describe('CreatorsTabs', () => {
  it('renders Overview + Directory links and marks the active one', () => {
    render(<CreatorsTabs t={en.creators} locale="en" />)
    const overview = screen.getByRole('link', { name: en.creators.tabOverview }) as HTMLAnchorElement
    const directory = screen.getByRole('link', { name: en.creators.tabDirectory }) as HTMLAnchorElement
    expect(overview.getAttribute('href')).toBe('/en/admin/creators')
    expect(directory.getAttribute('href')).toBe('/en/admin/creators/directory')
    expect(directory.getAttribute('aria-current')).toBe('page')
  })
  it('renders the Payouts tab link', () => {
    render(<CreatorsTabs t={en.creators} locale="en" />)
    const payouts = screen.getByRole('link', { name: en.creators.tabPayouts }) as HTMLAnchorElement
    expect(payouts.getAttribute('href')).toBe('/en/admin/creators/payouts')
  })
})
