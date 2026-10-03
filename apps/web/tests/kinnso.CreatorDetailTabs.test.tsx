// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ProfileDnaTab } from '@/components/kinnso/admin/creators/detail/ProfileDnaTab'
import { MissionsTab } from '@/components/kinnso/admin/creators/detail/MissionsTab'
import { EarningsTab } from '@/components/kinnso/admin/creators/detail/EarningsTab'
import { ContentTab } from '@/components/kinnso/admin/creators/detail/ContentTab'
import { ModerationTab } from '@/components/kinnso/admin/creators/detail/ModerationTab'
import type { CreatorDetail } from '@/lib/admin/creators-queries'
import type { AuditEntry } from '@/lib/admin/audit'

afterEach(cleanup)
const t = en.creators

const detail: CreatorDetail = {
  creator: { id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true, isListed: false, bio: 'Hi', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  contribution: { points: 320, tier: 'pro', tierUpdatedAt: null },
  dna: { id: 'd1', status: 'published', model: 'gpt', draftReadyAt: null, updatedAt: '2026-06-05T00:00:00Z' },
  scan: { id: 'j1', status: 'completed', error: null, startedAt: null, completedAt: '2026-06-04T00:00:00Z', createdAt: '2026-06-04T00:00:00Z' },
  socials: [{ platform: 'instagram', handle: 'mia', url: 'https://ig/mia' }],
  missions: [{ participantId: 'p1', missionId: 'm1', title: 'Tokyo eats', status: 'active', source: 'applied', approvedAt: null, createdAt: '2026-06-02T00:00:00Z', submissionsTotal: 3, submissionsApproved: 1, submissionsPending: 2 }],
  settlements: [{ id: 's1', missionTitle: 'Tokyo eats', status: 'pending', creatorPayoutStatus: 'pending', creatorCommissionAmount: 120.5, currency: 'HKD', createdAt: '2026-06-03T00:00:00Z' }],
  pointsEvents: [{ id: 'e1', eventType: 'guide_published', points: 50, createdAt: '2026-06-06T00:00:00Z' }],
  content: [{ id: 'g1', title: 'Best ramen', slug: 'best-ramen', status: 'published', savesCount: 12, publishedAt: '2026-06-07T00:00:00Z', createdAt: '2026-06-06T00:00:00Z' }],
}
const empty: CreatorDetail = { ...detail, contribution: null, dna: null, scan: null, socials: [], missions: [], settlements: [], pointsEvents: [], content: [] }

describe('Creator detail tabs', () => {
  it('ProfileDnaTab shows DNA, scan, socials', () => {
    render(<ProfileDnaTab t={t} detail={detail} />)
    expect(screen.getByText(t.secDna)).toBeTruthy()
    expect(screen.getByText('instagram')).toBeTruthy()
  })
  it('ProfileDnaTab shows empty states', () => {
    render(<ProfileDnaTab t={t} detail={empty} />)
    expect(screen.getByText(t.dnaNoData)).toBeTruthy()
    expect(screen.getByText(t.socialsNoData)).toBeTruthy()
  })
  it('MissionsTab lists missions', () => {
    render(<MissionsTab t={t} missions={detail.missions} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })
  it('MissionsTab shows empty state', () => {
    render(<MissionsTab t={t} missions={[]} />)
    expect(screen.getByText(t.missionsNoData)).toBeTruthy()
  })
  it('EarningsTab shows total points and a settlement amount', () => {
    render(<EarningsTab t={t} contribution={detail.contribution} settlements={detail.settlements} pointsEvents={detail.pointsEvents} />)
    expect(screen.getByText(t.totalPoints)).toBeTruthy()
    expect(screen.getByText(/120\.5/)).toBeTruthy()
    expect(screen.getByText('HKD')).toBeTruthy()
  })
  it('ContentTab lists guides', () => {
    render(<ContentTab t={t} content={detail.content} />)
    expect(screen.getByText('Best ramen')).toBeTruthy()
  })
  it('ModerationTab lists audit entries and shows empty state', () => {
    const entries: AuditEntry[] = [{ id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend', reason: 'spam', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]
    const { rerender } = render(<ModerationTab t={t} entries={entries} />)
    expect(screen.getByText('status.suspend')).toBeTruthy()
    expect(screen.getByText('spam')).toBeTruthy()
    rerender(<ModerationTab t={t} entries={[]} />)
    expect(screen.getByText(t.auditNoData)).toBeTruthy()
  })
})
