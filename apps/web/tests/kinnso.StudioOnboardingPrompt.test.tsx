// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StudioOnboardingPrompt from '@/components/kinnso/StudioOnboardingPrompt'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('StudioOnboardingPrompt', () => {
  it('renders the empty-state heading and a CTA linking to the locale wizard', () => {
    render(<StudioOnboardingPrompt t={en.studio} locale="en" />)
    expect(screen.getByText(en.studio.noDnaHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.noDnaBody)).toBeTruthy()
    const cta = screen.getByRole('link', { name: en.studio.noDnaCta })
    expect(cta.getAttribute('href')).toBe('/en/creator')
  })

  it('builds the wizard href from the given locale', () => {
    render(<StudioOnboardingPrompt t={en.studio} locale="ja" />)
    expect(screen.getByRole('link', { name: en.studio.noDnaCta }).getAttribute('href')).toBe('/ja/creator')
  })
})
