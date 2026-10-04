// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

const events = [
  { id: 'e1', eventType: 'mission_verified' as const, points: 40, createdAt: '2026-06-20T00:00:00Z' },
  { id: 'e2', eventType: 'guide_published' as const, points: 15, createdAt: '2026-06-19T00:00:00Z' },
]

const gatedCounts = { rising: 1, pro: 3, elite: 0 } as const

describe('StudioTierView', () => {
  it('renders current tier, all four tiers, and points history', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} gatedCounts={gatedCounts} nextUnlocks={null} />)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(screen.getByText('All tiers')).toBeTruthy()
    // all four ladder labels present (Pro/Elite also appear in the unlocks section)
    expect(screen.getByText('Seed')).toBeTruthy()
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Elite').length).toBeGreaterThan(0)
    // history rows by event label
    expect(screen.getByText('Mission verified')).toBeTruthy()
    expect(screen.getByText('Guide published')).toBeTruthy()
  })

  it('shows the empty history state when there are no events', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(0)} events={[]} gatedCounts={{ rising: 0, pro: 0, elite: 0 }} nextUnlocks={null} />)
    expect(
      screen.getByText('No points yet — publish a guide or complete a mission to get started.'),
    ).toBeTruthy()
  })

  it('renders the what-you-unlock section with per-tier mission counts', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} gatedCounts={gatedCounts} nextUnlocks={null} />)
    expect(screen.getByText(en.tier.unlocksHeading)).toBeTruthy()
    expect(screen.getByText('3', { exact: false })).toBeTruthy()
    expect(screen.getByText(en.tier.unlocksHelp)).toBeTruthy()
  })

  // The perk catalog is decoration on this page, not its subject: an unreadable
  // RPC must cost the panel, never the tier numbers.
  it('omits the unlocks panel entirely when the perk catalog is unavailable', () => {
    render(<StudioTierView t={en.tier} contribution={progressToNext(55)} events={events} gatedCounts={gatedCounts} nextUnlocks={null} />)
    expect(screen.queryByRole('region', { name: en.tier.nextUnlocksHeading })).toBeNull()
  })

  it('names each perk gated at the next tier with its partner', () => {
    render(
      <StudioTierView
        t={en.tier}
        contribution={progressToNext(55)}
        events={events}
        gatedCounts={gatedCounts}
        nextUnlocks={{
          unlocks: {
            nextTier: 'pro',
            pointsForNext: 95,
            perks: [
              { title: 'Lounge access', partnerName: 'Plaza Premium' },
              { title: 'HK$100 credit', partnerName: 'Klook' },
            ],
          },
        }}
      />,
    )
    const panel = screen.getByRole('region', { name: en.tier.nextUnlocksHeading })
    expect(panel.textContent).toContain('95 pts to Pro unlocks:')
    expect(panel.textContent).toContain('Lounge access')
    expect(panel.textContent).toContain('Plaza Premium')
    expect(panel.textContent).toContain('HK$100 credit')
  })

  it('states an empty next tier plainly instead of leaving a bare heading', () => {
    render(
      <StudioTierView
        t={en.tier}
        contribution={progressToNext(55)}
        events={events}
        gatedCounts={gatedCounts}
        nextUnlocks={{ unlocks: { nextTier: 'pro', pointsForNext: 95, perks: [] } }}
      />,
    )
    const panel = screen.getByRole('region', { name: en.tier.nextUnlocksHeading })
    expect(panel.textContent).toContain('No perks are gated at Pro right now.')
  })

  it('tells a top-tier creator there is nothing above, without a points figure', () => {
    render(
      <StudioTierView
        t={en.tier}
        contribution={progressToNext(500)}
        events={events}
        gatedCounts={gatedCounts}
        nextUnlocks={{ unlocks: null }}
      />,
    )
    const panel = screen.getByRole('region', { name: en.tier.nextUnlocksHeading })
    expect(panel.textContent).toContain('Elite is the top tier')
    expect(panel.textContent).not.toContain('pts to')
  })
})
