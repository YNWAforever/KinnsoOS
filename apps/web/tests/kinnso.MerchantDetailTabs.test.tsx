// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ProfileTab } from '@/components/kinnso/admin/merchants/detail/ProfileTab'
import { MissionsTab } from '@/components/kinnso/admin/merchants/detail/MissionsTab'
import { CreatorsTab } from '@/components/kinnso/admin/merchants/detail/CreatorsTab'
import { BillingTab } from '@/components/kinnso/admin/merchants/detail/BillingTab'
import { ModerationTab } from '@/components/kinnso/admin/merchants/detail/ModerationTab'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'
import type { AuditEntry } from '@/lib/admin/audit'

afterEach(cleanup)
const t = en.merchantsOps

const detail: MerchantDetail = {
  profile: { id: 'm1', companyName: 'Acme Co', contactName: 'Pat', contactEmail: 'pat@acme.test', websiteUrl: 'https://acme.test', status: 'active', tier: 'growth', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-20T00:00:00Z' },
  missions: [{ id: 'mi1', title: 'Tokyo eats', status: 'live', visibility: 'public', participantsCount: 4, milestonesTotal: 3, milestonesApproved: 1, createdAt: '2026-06-02T00:00:00Z' }],
  creators: { engaged: [{ creatorId: 'c1', displayName: 'Mia', handle: 'mia', participantStatus: 'active' }], savedCount: 7 },
  billing: {
    settlements: [{ id: 's1', missionTitle: 'Tokyo eats', status: 'pending', creatorPayoutStatus: 'pending', kinnsoCommissionStatus: 'pending', affiliateCommissionStatus: null, currency: 'HKD', creatorPayoutAmount: 120.5, updatedAt: '2026-06-03T00:00:00Z' }],
    owed: [{ currency: 'HKD', amount: 120.5 }, { currency: 'JPY', amount: 9000 }],
    settled: [{ currency: 'HKD', amount: 50 }],
  },
}
const empty: MerchantDetail = { ...detail, profile: { ...detail.profile, contactName: null, contactEmail: null }, missions: [], creators: { engaged: [], savedCount: 0 }, billing: { settlements: [], owed: [], settled: [] } }

describe('Merchant detail tabs', () => {
  it('ProfileTab shows ops-only contact PII', () => {
    render(<ProfileTab t={t} profile={detail.profile} />)
    expect(screen.getByText('pat@acme.test')).toBeTruthy()
    expect(screen.getByText('Pat')).toBeTruthy()
  })
  it('ProfileTab shows the no-contact empty state', () => {
    render(<ProfileTab t={t} profile={empty.profile} />)
    expect(screen.getByText(t.noContact)).toBeTruthy()
  })
  it('MissionsTab lists missions and milestone progress', () => {
    render(<MissionsTab t={t} missions={detail.missions} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
    expect(screen.getByText('1/3')).toBeTruthy()
  })
  it('MissionsTab shows empty state', () => {
    render(<MissionsTab t={t} missions={[]} />)
    expect(screen.getByText(t.missionsEmpty)).toBeTruthy()
  })
  it('CreatorsTab lists engaged creators and the saved count', () => {
    render(<CreatorsTab t={t} creators={detail.creators} />)
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText(/7/)).toBeTruthy()
  })
  it('BillingTab is read-only: renders settlement + per-currency money, no buttons', () => {
    const { container } = render(<BillingTab t={t} billing={detail.billing} />)
    expect(screen.getByText('Tokyo eats')).toBeTruthy()
    expect(screen.getByText('JPY')).toBeTruthy() // second currency never collapsed
    expect(screen.getByText(t.billingReadonly)).toBeTruthy()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
  })
  it('ModerationTab lists audit entries and shows empty state', () => {
    const entries: AuditEntry[] = [{ id: 'a1', entityType: 'merchant', entityId: 'm1', action: 'status.paused', reason: 'review', metadata: {}, createdAt: '2026-06-10T00:00:00Z' }]
    const { rerender } = render(<ModerationTab t={t} entries={entries} />)
    expect(screen.getByText('status.paused')).toBeTruthy()
    expect(screen.getByText('review')).toBeTruthy()
    rerender(<ModerationTab t={t} entries={[]} />)
    expect(screen.getByText(t.auditEmpty)).toBeTruthy()
  })
})
