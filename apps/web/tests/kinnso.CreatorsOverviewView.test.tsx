// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorsOverviewView } from '@/components/kinnso/admin/creators/CreatorsOverviewView'
import type { CreatorsOverview } from '@/lib/admin/creators-queries'

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/creators' }))
afterEach(cleanup)

const overview: CreatorsOverview = {
  kpis: { total: 12, byStatus: { active: 8, suspended: 2, onboarding: 2 }, newInPeriod: 3, newPrevPeriod: 1, payoutsPending: 4 },
  signups: [{ day: '2026-06-27', count: 2 }, { day: '2026-06-28', count: 1 }],
  engagement: [{ day: '2026-06-28', points: 40 }],
  leaderboard: [{ creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' }],
  atRisk: [{ creatorId: 'c2', displayName: 'Lee', reason: 'scan_failed' }],
  recentActivity: [
    { id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-28T00:00:00Z' },
  ],
}

describe('CreatorsOverviewView', () => {
  it('renders the title, KPI values, leaderboard, at-risk, and activity', () => {
    render(<CreatorsOverviewView t={en.creators} locale="en" overview={overview} />)
    expect(screen.getByText(en.creators.title)).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()           // total
    expect(screen.getByText('8')).toBeTruthy()            // active
    expect(screen.getByText('Mia')).toBeTruthy()          // leaderboard
    expect(screen.getByText('Lee')).toBeTruthy()          // at-risk
    expect(screen.getByText(en.creators.reasonScanFailed)).toBeTruthy()
    expect(screen.getByText('status.suspend')).toBeTruthy() // activity feed
  })
  it('shows honest empty states when there is no data', () => {
    render(<CreatorsOverviewView t={en.creators} locale="en" overview={{
      kpis: { total: 0, byStatus: {}, newInPeriod: 0, newPrevPeriod: 0, payoutsPending: 0 },
      signups: [], engagement: [], leaderboard: [], atRisk: [], recentActivity: [],
    }} />)
    expect(screen.getByText(en.creators.leaderboardEmpty)).toBeTruthy()
    expect(screen.getByText(en.creators.atRiskEmpty)).toBeTruthy()
    expect(screen.getByText(en.creators.activityEmpty)).toBeTruthy()
  })
})
