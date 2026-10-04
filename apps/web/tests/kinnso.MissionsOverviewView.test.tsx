// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/missions' }))

import { MissionsOverviewView } from '@/components/kinnso/admin/missions/MissionsOverviewView'

const t = en.missionsOps

describe('MissionsOverviewView', () => {
  it('renders KPI values and an at-risk row', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
          missionsCreated: [], submissionsReviewed: [],
          atRisk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
        }}
        attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }}
      />,
    )
    expect(screen.getByText('6')).toBeTruthy()
    expect(screen.getByText('Tokyo Winter Stays Showcase')).toBeTruthy()
    expect(screen.getByText(t.reasonStalledSubmissions)).toBeTruthy()
  })

  it('shows the empty-state copy when nothing is at risk', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 0, byStatus: {}, byType: {}, byVisibility: {}, openForApplications: 0, submissionsAwaitingReview: 0 },
          missionsCreated: [], submissionsReviewed: [], atRisk: [],
        }}
        attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }}
      />,
    )
    expect(screen.getByText('Nothing at risk right now')).toBeTruthy()
  })

  it('links the submissions-awaiting-review KPI card to the review queue', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
          missionsCreated: [], submissionsReviewed: [], atRisk: [],
        }}
        attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }}
      />,
    )
    const link = screen.getByRole('link', { name: new RegExp(t.kpiSubmissionsAwaitingReview) })
    expect(link.getAttribute('href')).toBe('/en/admin/missions/review')
    expect(within(link).getByText('2')).toBeTruthy()
    expect(within(link).getByText(t.viewQueue)).toBeTruthy()
  })

  it('renders the overdue-reviews list, or its empty state when nothing is overdue', () => {
    const base = {
      t, locale: 'en' as const,
      overview: {
        kpis: { total: 0, byStatus: {}, byType: {}, byVisibility: {}, openForApplications: 0, submissionsAwaitingReview: 0 },
        missionsCreated: [], submissionsReviewed: [], atRisk: [],
      },
    }
    const { rerender } = render(
      <MissionsOverviewView {...base} attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }} />,
    )
    expect(screen.getByText(t.attentionOverdueEmpty)).toBeTruthy()

    rerender(
      <MissionsOverviewView
        {...base}
        attention={{
          overdueReviews: [{ submissionId: 's1', missionId: 'm1', missionTitle: 'Overdue Kyoto Push', creatorId: 'c1', reviewDeadline: '2026-08-01T00:00:00Z' }],
          atRiskMissions: [],
          redemptionVelocity: [],
        }}
      />,
    )
    expect(screen.getByText('Overdue Kyoto Push')).toBeTruthy()
    expect(screen.queryByText(t.attentionOverdueEmpty)).toBeNull()
  })

  // /admin/missions/[missionId] was reachable by no link anywhere in the product,
  // even though mission-review-actions revalidates it after every decision: ops
  // could act on a submission but never open the mission it belonged to. The
  // at-risk list is the way in, so the link is pinned here.
  it('links each at-risk mission to its own detail page', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="en"
        overview={{
          kpis: { total: 6, byStatus: { published: 4 }, byType: {}, byVisibility: {}, openForApplications: 4, submissionsAwaitingReview: 2 },
          missionsCreated: [], submissionsReviewed: [],
          atRisk: [{ id: 'm1', title: 'Tokyo Winter Stays Showcase', merchantName: 'Sunrise Stays HK', reason: 'stalled_submissions' }],
        }}
        attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }}
      />,
    )

    const link = screen.getByRole('link', { name: 'Tokyo Winter Stays Showcase' })
    expect(link.getAttribute('href')).toBe('/en/admin/missions/m1')
  })

  it('prefixes the at-risk detail link with the active locale', () => {
    render(
      <MissionsOverviewView
        t={t}
        locale="zh-hk"
        overview={{
          kpis: { total: 1, byStatus: {}, byType: {}, byVisibility: {}, openForApplications: 0, submissionsAwaitingReview: 0 },
          missionsCreated: [], submissionsReviewed: [],
          atRisk: [{ id: 'm2', title: 'Osaka Ramen Trail', merchantName: null, reason: 'stalled_submissions' }],
        }}
        attention={{ overdueReviews: [], atRiskMissions: [], redemptionVelocity: [] }}
      />,
    )

    expect(screen.getByRole('link', { name: 'Osaka Ramen Trail' }).getAttribute('href'))
      .toBe('/zh-hk/admin/missions/m2')
  })
})
