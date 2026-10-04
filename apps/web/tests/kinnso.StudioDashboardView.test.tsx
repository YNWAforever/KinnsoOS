// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import type { Dna } from '@kinnso/scan'
import { computeReadiness } from '@/lib/studio/readiness'
import { progressToNext } from '@/lib/contribution/tiers'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { StudioDashboardView } from '@/components/kinnso/pages/StudioDashboardView'

afterEach(cleanup)

const dna: Dna = {
  bio: 'Tokyo on foot.',
  niches: ['Travel'],
  content_pillars: ['City walks'],
  tone: ['calm'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] },
  platforms: [{ platform: 'instagram', followers: 27400, verified: false }],
  languages: ['en'],
}

const baseProps = {
  locale: 'en' as const,
  t: en.studioDashboard,
  studioHomeT: en.studioHome,
  progressT: en.onboarding.progressStep,
  creatorId: 'creator-1',
  name: 'May',
  dna,
  lastScanned: '2026-06-21T00:00:00Z',
  readiness: computeReadiness({
    handles: [{ platform: 'instagram' as const }],
    guidesCount: 0,
    dnaUpdatedAtIso: '2026-06-21T00:00:00Z',
    now: new Date('2026-06-22T00:00:00Z'),
  }),
  platforms: ['instagram' as const],
  missingPlatforms: ['youtube' as const, 'threads' as const],
  activeJobId: null,
  contribution: progressToNext(0),
  tierT: en.tier,
  nextAction: { kind: 'publish_guide' as const, path: '/studio/guides/new' },
  directory: { listed: true, gaps: [] },
  unreadNotificationCount: 0,
}

describe('StudioDashboardView', () => {
  it('greets the creator and shows the empty opportunities + earnings states', () => {
    render(<StudioDashboardView {...baseProps} opportunities={[]} earnings={[]} />)
    expect(screen.getByText('Welcome back, May')).toBeTruthy()
    expect(screen.getByText(en.studioDashboard.statusActive)).toBeTruthy()
    expect(screen.getByText(en.studioDashboard.opportunitiesEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioDashboard.earningsEmpty)).toBeTruthy()
    // checklist + quick links present
    expect(screen.getByTestId('readiness')).toBeTruthy()
    expect(screen.getByText(en.studioHome.scanTitle)).toBeTruthy()
  })

  it('renders opportunity previews and earnings totals when present', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[{ id: 'm1', title: 'Stay at Hotel X', kind: 'mission' }]}
        earnings={[{ currency: 'HKD', paid: 1200, pending: 300 }]}
      />,
    )
    expect(screen.getByText('Stay at Hotel X')).toBeTruthy()
    expect(screen.getByText(/HKD/)).toBeTruthy()
    expect(screen.queryByText(en.studioDashboard.opportunitiesEmpty)).toBeNull()
  })

  it('deep-links a mission opportunity to its detail page and an offer to /studio/offers', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[
          { id: 'm1', title: 'Stay at Hotel X', kind: 'mission' },
          { id: 'o9', title: 'Klook affiliate', kind: 'offer' },
        ]}
        earnings={[]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Stay at Hotel X' }).getAttribute('href')).toBe('/en/studio/missions/m1')
    expect(screen.getByRole('link', { name: 'Klook affiliate' }).getAttribute('href')).toBe('/en/studio/offers')
  })

  it('renders the tier progress card', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[]}
        earnings={[]}
        contribution={progressToNext(55)}
        tierT={en.tier}
      />,
    )
    expect(screen.getByText(en.tier.cardTitle)).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy()
  })

  it('shows the single next step above the checklist, with a link', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[]}
        earnings={[]}
        nextAction={{ kind: 'start_earning', path: '/studio/offers' }}
      />,
    )
    const section = screen.getByRole('region', { name: en.studioDashboard.nextActionHeading })
    expect(section).toBeTruthy()
    expect(screen.getByText(en.studioDashboard.nextActionStartEarning)).toBeTruthy()
    // Conveyed as text with a status role, not colour alone.
    expect(screen.getByRole('status').textContent).toContain(
      en.studioDashboard.nextActionStartEarning,
    )
    const cta = screen.getByRole('link', { name: en.studioDashboard.nextActionCta })
    expect(cta.getAttribute('href')).toBe('/en/studio/offers')
  })

  it('states plainly when nothing is open, and offers no link', () => {
    render(
      <StudioDashboardView
        {...baseProps}
        opportunities={[]}
        earnings={[]}
        nextAction={{ kind: 'nothing_open', path: null }}
      />,
    )
    expect(screen.getByText(en.studioDashboard.nextActionNothingOpen)).toBeTruthy()
    expect(screen.queryByRole('link', { name: en.studioDashboard.nextActionCta })).toBeNull()
  })
})
