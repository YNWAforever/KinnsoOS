// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AnalyticsConsentBanner } from '@/components/kinnso/analytics/AnalyticsConsentBanner'

const t = {
  title: 'Help improve KINNSO',
  description: 'Allow privacy-preserving measurement to improve journeys.',
  accept: 'Accept measurement',
  decline: 'Decline',
  changePreference: 'Change measurement preference',
}

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE', 'production')
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('11111111-1111-4111-8111-111111111111') })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('offers an accessible, non-modal consent choice and a preference action after accepting', () => {
    render(<AnalyticsConsentBanner locale="en" t={t} />)

    expect(screen.getByRole('dialog', { name: t.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.accept })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.decline })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: t.accept }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.changePreference })).toBeInTheDocument()
  })

  it('does not render when measurement is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE', 'disabled')
    const { container } = render(<AnalyticsConsentBanner locale="en" t={t} />)
    expect(container).toBeEmptyDOMElement()
  })
})
