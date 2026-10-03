// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { CreatorsLandingView } from '@/components/kinnso/pages/CreatorsLandingView'
import type { CreatorSummary } from '@/lib/creators/queries'

afterEach(cleanup)

const creators: CreatorSummary[] = [
  { handle: 'maya', name: 'Maya Wanders', bio: 'Slow travel.', niches: ['Coffee'], guideCount: 3 },
]

describe('CreatorsLandingView (directory-first)', () => {
  it('renders a card per real creator linking to the profile', () => {
    const { container } = render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={creators} />)
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(screen.getAllByText('Maya Wanders').length).toBeGreaterThan(0)
    const link = screen.getByRole('link', { name: new RegExp(en.creatorsLanding.viewProfile, 'i') })
    expect(link.getAttribute('href')).toBe('/en/c/maya')
    expect(screen.getByText('3 Guides')).toBeInTheDocument()
  })

  it('shows the honest empty state when there are no creators', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={[]} />)
    expect(screen.getByText(en.creatorsLanding.directoryEmpty)).toBeInTheDocument()
  })

  it('keeps an apply CTA to sign-up', () => {
    render(<CreatorsLandingView locale="en" t={en.creatorsLanding} creators={creators} />)
    const applyLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/en/sign-up')
    expect(applyLinks.length).toBeGreaterThan(0)
  })
})
