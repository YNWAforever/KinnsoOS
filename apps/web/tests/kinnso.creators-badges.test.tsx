// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StatusBadge, TierBadge, VerifiedBadge } from '@/components/kinnso/admin/creators/badges'

afterEach(cleanup)

describe('creator badges', () => {
  it('StatusBadge renders the localized label for each status', () => {
    render(<StatusBadge status="suspended" t={en.creators} />)
    expect(screen.getByText(en.creators.statusSuspended)).toBeTruthy()
  })
  it('StatusBadge falls back to the raw value for an unknown status', () => {
    render(<StatusBadge status="mystery" t={en.creators} />)
    expect(screen.getByText('mystery')).toBeTruthy()
  })
  it('TierBadge renders the localized tier label', () => {
    render(<TierBadge tier="pro" t={en.creators} />)
    expect(screen.getByText(en.creators.tierPro)).toBeTruthy()
  })
  it('VerifiedBadge renders only when verified', () => {
    const { container } = render(<VerifiedBadge verified={false} t={en.creators} />)
    expect(container.textContent).toBe('')
    cleanup()
    render(<VerifiedBadge verified t={en.creators} />)
    expect(screen.getByText(en.creators.verified)).toBeTruthy()
  })
})
