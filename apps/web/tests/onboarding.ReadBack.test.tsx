// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Dna } from '@kinnso/scan'
import { ReadBack } from '@/components/onboarding/ReadBack'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const dna: Dna = {
  bio: 'Travel creator in HK',
  niches: ['travel', 'food'],
  content_pillars: ['guides'],
  tone: ['warm'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] },
  platforms: [{ platform: 'instagram', followers: 1000, verified: false }],
  languages: ['zh-HK', 'en'],
}

function renderReadBack() {
  return render(
    <ReadBack
      dna={dna}
      t={en.dna}
      dashboardHref="/en/studio"
      signOutHref="/en/auth/sign-out"
      signOutLabel={en.onboarding.signOut}
    />,
  )
}

describe('ReadBack', () => {
  it('renders the published DNA and the sign-out link', () => {
    renderReadBack()
    expect(screen.getByText(en.dna.readBackHeading)).toBeTruthy()
    expect(screen.getByText('Travel creator in HK')).toBeTruthy()
    expect(screen.getByText('travel, food')).toBeTruthy()
    const link = screen.getByRole('link', { name: en.onboarding.signOut }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/en/auth/sign-out')
  })

  it('renders a primary CTA to the Creator Studio dashboard', () => {
    renderReadBack()
    const cta = screen.getByRole('link', { name: en.dna.enterStudio }) as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/en/studio')
  })
})
