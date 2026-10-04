// @vitest-environment jsdom
/**
 * Automated accessibility coverage for the authenticated studio surfaces.
 *
 * The R7.10 gate (apps/e2e/specs/r7-10-accessibility.spec.ts) runs axe against
 * R7_10_ROUTES, which is nine PUBLIC routes — it never signs in, so /studio and
 * /studio/tier have had no axe run at all. R9.1 added a next-step region, a
 * directory row and a next-tier unlocks panel to exactly those pages, so this
 * closes the gap for the markup this phase introduced.
 *
 * jsdom cannot judge colour contrast (no layout, no computed paint), so that rule
 * is disabled here rather than allowed to report a false pass. Contrast on these
 * surfaces stays a manual/browser concern; everything structural — region naming,
 * heading order, list semantics, duplicate landmarks — is checked for real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import en from '@/lib/i18n/messages/en'
import type { Dna } from '@kinnso/scan'
import { computeReadiness } from '@/lib/studio/readiness'
import { progressToNext } from '@/lib/contribution/tiers'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { StudioDashboardView } from '@/components/kinnso/pages/StudioDashboardView'
import { StudioTierView } from '@/components/kinnso/pages/StudioTierView'

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

const dashboardProps = {
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
  opportunities: [],
  earnings: [],
  unreadNotificationCount: 0,
}

/** Serious/critical only — the CI gate's threshold, so this cannot be stricter
 *  than the bar the rest of the product is held to. */
async function violations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`)
}

describe('studio surfaces accessibility', () => {
  it('has no serious or critical violations on the dashboard with a next step to take', async () => {
    const { container } = render(
      <StudioDashboardView
        {...dashboardProps}
        nextAction={{ kind: 'start_earning', path: '/studio/offers' }}
        directory={{ listed: false, gaps: ['no_published_guide'] }}
      />,
    )
    expect(await violations(container)).toEqual([])
  })

  it('has no serious or critical violations on the dashboard with an unread notification badge', async () => {
    // Exercises the inbox tile's unread-count badge markup — the composed
    // aria-label on the link plus the aria-hidden numeral span.
    const { container } = render(
      <StudioDashboardView
        {...dashboardProps}
        unreadNotificationCount={3}
        nextAction={{ kind: 'start_earning', path: '/studio/offers' }}
        directory={{ listed: false, gaps: ['no_published_guide'] }}
      />,
    )
    expect(await violations(container)).toEqual([])
  })

  it('has no serious or critical violations on the dashboard with nothing outstanding', async () => {
    // The empty state renders different markup — no action link, listed copy —
    // so it is a distinct surface, not a variant of the one above.
    const { container } = render(
      <StudioDashboardView
        {...dashboardProps}
        nextAction={{ kind: 'nothing_open', path: null }}
        directory={{ listed: true, gaps: [] }}
      />,
    )
    expect(await violations(container)).toEqual([])
  })

  it('has no serious or critical violations on the tier page with an unlocks panel', async () => {
    const { container } = render(
      <StudioTierView
        t={en.tier}
        contribution={progressToNext(55)}
        events={[{ id: 'e1', eventType: 'mission_verified', points: 40, createdAt: '2026-06-20T00:00:00Z' }]}
        gatedCounts={{ rising: 1, pro: 3, elite: 0 }}
        nextUnlocks={{
          unlocks: {
            nextTier: 'pro',
            pointsForNext: 95,
            perks: [{ title: 'Lounge access', partnerName: 'Plaza Premium' }],
          },
        }}
      />,
    )
    expect(await violations(container)).toEqual([])
  })

  it('has no serious or critical violations on the tier page without a perk catalog', async () => {
    const { container } = render(
      <StudioTierView
        t={en.tier}
        contribution={progressToNext(500)}
        events={[]}
        gatedCounts={{ rising: 0, pro: 0, elite: 0 }}
        nextUnlocks={null}
      />,
    )
    expect(await violations(container)).toEqual([])
  })

  // Status conveyed as text, not colour alone (R7.10). The next step and the
  // directory row must both survive being read with no styling at all.
  it('states the next step and the directory rule in text, not colour', async () => {
    const { container } = render(
      <StudioDashboardView
        {...dashboardProps}
        nextAction={{ kind: 'start_earning', path: '/studio/offers' }}
        directory={{ listed: false, gaps: ['no_published_guide'] }}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain(en.studioDashboard.nextActionStartEarning)
    expect(text).toContain(en.studioDashboard.directoryNeedsGuide)
  })

  // Exactly one live region: two would make a screen reader announce both on
  // every update, which is why the directory row is static text.
  it('keeps a single live region on the dashboard', async () => {
    const { container } = render(
      <StudioDashboardView
        {...dashboardProps}
        nextAction={{ kind: 'start_earning', path: '/studio/offers' }}
        directory={{ listed: false, gaps: ['no_published_guide'] }}
      />,
    )
    expect(container.querySelectorAll('[role="status"]').length).toBe(1)
  })
})
