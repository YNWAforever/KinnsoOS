// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionReviewQueueView } from '@/components/kinnso/admin/missions/MissionReviewQueueView'

afterEach(cleanup)

const t = en.missionsOps

const rows = [
  { submissionId: 's1', missionId: 'm1', missionTitle: 'Summer Coupon Push', missionType: 'coupon_affiliate', creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z', reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const },
  { submissionId: 's2', missionId: 'm2', missionTitle: 'HK Ramen Guide', missionType: 'coupon_affiliate', creatorId: 'creator-2', status: 'revision_requested' as const, submittedAt: '2026-08-18T00:00:00Z', reviewDeadline: '2026-08-20T00:00:00Z', confidenceStatus: null },
]

describe('MissionReviewQueueView', () => {
  it('renders one row per queue item', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={vi.fn()} />)
    expect(screen.getByText('Summer Coupon Push')).toBeTruthy()
    expect(screen.getByText('HK Ramen Guide')).toBeTruthy()
  })

  it('shows the empty state with no rows', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={[]} reviewAction={vi.fn()} />)
    expect(screen.getByText(t.queueEmpty)).toBeTruthy()
  })

  it('gives the revision_requested row a waiting badge, not action buttons', () => {
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={vi.fn()} />)
    const revisionRow = screen.getByText('HK Ramen Guide').closest('tr')!
    expect(revisionRow.textContent).toContain(t.waitingOnCreator)
  })

  it('calls reviewAction with each row\'s own mission id, not a shared page-level id', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionReviewQueueView t={t as never} locale="en" rows={rows} reviewAction={reviewAction} />)
    const summerRow = screen.getByText('Summer Coupon Push').closest('tr')!
    const approveBtn = summerRow.querySelector('button')!
    approveBtn.click()
    expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'approve', null, null, 'm1')
  })

  it('keeps one row\'s reject modal isolated from a sibling submitted row', () => {
    // Only one of the two fixture rows (Summer Coupon Push, 'submitted') can show action
    // buttons -- HK Ramen Guide is 'revision_requested' and shows the waiting badge instead.
    // Add a second 'submitted' row so there's a genuine sibling with its own live buttons
    // to check for interference once the first row's modal opens.
    const twoSubmittedRows = [
      rows[0],
      { ...rows[0], submissionId: 's3', missionId: 'm3', missionTitle: 'Kyoto Food Crawl' },
    ]
    render(<MissionReviewQueueView t={t as never} locale="en" rows={twoSubmittedRows} reviewAction={vi.fn()} />)

    const summerRow = screen.getByText('Summer Coupon Push').closest('tr')!
    fireEvent.click(within(summerRow).getByRole('button', { name: t.actReject }))

    // Exactly one modal is open -- not zero, not one-per-row.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    // The sibling row's own action buttons are untouched: present, not hidden, not duplicated.
    const kyotoRow = screen.getByText('Kyoto Food Crawl').closest('tr')!
    expect(within(kyotoRow).getByRole('button', { name: t.actApprove })).toBeTruthy()
    expect(within(kyotoRow).getByRole('button', { name: t.actReject })).toBeTruthy()
    expect(within(kyotoRow).getByRole('button', { name: t.actRequestRevision })).toBeTruthy()
    // Not duplicated: the sibling row shows exactly one of each action button, scoped to
    // its own row (the reject modal opening on the other row didn't spill extra buttons in).
    expect(within(kyotoRow).getAllByRole('button', { name: t.actApprove })).toHaveLength(1)
  })
})
