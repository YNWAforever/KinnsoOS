// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CreatorInsightsView } from '@/components/kinnso/pages/CreatorInsightsView'
import en from '@/lib/i18n/messages/en'
import type { CreatorInsights } from '@/lib/insights/creator'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

const base: CreatorInsights = {
  pointsTotal: 65,
  pointsByType: { dna_scan: 10, guide_published: 15, mission_verified: 40 },
  trajectory: [{ weekStart: '2026-06-08', cumulative: 65 }],
  tier: progressToNext(65),
  guidesPublished: 1,
  guideSavesTotal: 7,
  missionsByStatus: { applied: 1, active: 1, invited: 0, rejected: 0 },
  submissionsApproved: 1,
  visitsDriven: 0,
}

describe('CreatorInsightsView', () => {
  it('renders points total, tier progress, and the trajectory chart', () => {
    render(<CreatorInsightsView t={en.insights} data={base} />)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.creatorTitle })).toBeTruthy()
    expect(screen.getByText('65')).toBeTruthy()
    expect(screen.getByRole('img', { name: en.insights.pointsTrajectory })).toBeTruthy()
    // accessibility: the shape-only sparkline has a screen-reader text fallback of the series
    expect(screen.getByText('2026-06-08: 65')).toBeTruthy()
  })

  it('shows the empty-points state when the creator has zero points', () => {
    render(<CreatorInsightsView t={en.insights} data={{ ...base, pointsTotal: 0,
      pointsByType: { dna_scan: 0, guide_published: 0, mission_verified: 0 }, trajectory: [] }} />)
    expect(screen.getByText(en.insights.creatorEmptyPoints)).toBeTruthy()
  })

  it('shows the empty-missions state when there is no mission activity', () => {
    render(<CreatorInsightsView t={en.insights} data={{ ...base,
      missionsByStatus: { applied: 0, active: 0, invited: 0, rejected: 0 }, submissionsApproved: 0 }} />)
    expect(screen.getByText(en.insights.creatorEmptyMissions)).toBeTruthy()
  })
})
