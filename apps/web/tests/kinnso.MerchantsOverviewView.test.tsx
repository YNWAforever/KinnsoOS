// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/merchants' }))

import { MerchantsOverviewView } from '@/components/kinnso/admin/merchants/MerchantsOverviewView'
import type { MerchantsOverview } from '@/lib/admin/merchants-queries'

const overview: MerchantsOverview = {
  kpis: { total: 9, byStatus: { active: 6, paused: 2, suspended: 1, archived: 0 }, byTier: { free: 5, growth: 4 },
    newInPeriod: 2, newPrevPeriod: 1, missionsLive: 3, settlementsPending: 4, owed: [], settled: [] },
  signups: [{ day: '2026-06-29', count: 2 }],
  missionsCreated: [{ day: '2026-06-29', count: 3 }],
  leaderboard: [{ id: 'm1', companyName: 'Acme', tier: 'growth', missionsCount: 5, creatorsEngaged: 3 }],
  atRisk: [{ id: 'm2', companyName: 'Idle Co', reason: 'growth_idle' }],
  recentActivity: [],
}

describe('MerchantsOverviewView', () => {
  it('renders KPIs, leaderboard, and a localized at-risk reason', () => {
    render(<MerchantsOverviewView t={en.merchantsOps} locale="en" overview={overview} />)
    expect(screen.getByText('9')).toBeTruthy()           // total KPI
    expect(screen.getByText('Acme')).toBeTruthy()        // leaderboard row
    expect(screen.getByText('Growth tier, no live missions')).toBeTruthy() // at-risk reason mapped
    expect(screen.getByText(en.merchantsOps.title)).toBeTruthy()
  })
  it('shows empty states when lists are empty', () => {
    render(<MerchantsOverviewView t={en.merchantsOps} locale="en" overview={{ ...overview, leaderboard: [], atRisk: [], recentActivity: [] }} />)
    expect(screen.getByText(en.merchantsOps.leaderboardEmpty)).toBeTruthy()
    expect(screen.getByText(en.merchantsOps.atRiskEmpty)).toBeTruthy()
    expect(screen.getByText(en.merchantsOps.activityEmpty)).toBeTruthy()
  })
})
