// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { SubmissionQueueRow } from '@/components/kinnso/admin/missions/SubmissionQueueRow'
import type { ReviewQueueRow } from '@/lib/admin/mission-review-queries'

afterEach(cleanup)

const t = en.missionsOps

const baseRow: ReviewQueueRow = {
  submissionId: 's1',
  missionId: 'mission-1',
  missionTitle: 'Receipt Push',
  missionType: 'receipt_cashback',
  creatorId: 'creator-1',
  status: 'submitted',
  submittedAt: '2026-08-19T00:00:00Z',
  reviewDeadline: '2026-08-21T00:00:00Z',
  confidenceStatus: 'verified_signal',
}

/** Renders a single row inside a real <table><tbody> -- SubmissionQueueRow returns <tr>
 * fragments, which React (and RTL) are happiest hosting inside their real parent tags. */
function renderRow(row: ReviewQueueRow, reviewAction = vi.fn()) {
  return render(
    <table>
      <tbody>
        <SubmissionQueueRow t={t} locale="en" row={row} reviewAction={reviewAction} />
      </tbody>
    </table>,
  )
}

describe('SubmissionQueueRow reason-category taxonomy (R12.2 Task 4 UI gap)', () => {
  it('shows the receipt taxonomy for a receipt_cashback submission, not the original five', () => {
    renderRow(baseRow)
    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const dialog = screen.getByRole('dialog')
    const select = within(dialog).getByRole('combobox')

    const optionLabels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(optionLabels).toEqual([
      t.reasonCategoryPlaceholder,
      t.reasonUnreadable,
      t.reasonWrongVenue,
      t.reasonDuplicate,
      t.reasonAmountUnclear,
      t.reasonOther,
    ])
    // The original R11.0 taxonomy must NOT be reachable here -- those DB values would be
    // rejected by admin_review_submission for a receipt_cashback submission.
    expect(optionLabels).not.toContain(t.reasonFormat)
    expect(optionLabels).not.toContain(t.reasonKeyMessage)
    expect(optionLabels).not.toContain(t.reasonCompliance)
    expect(optionLabels).not.toContain(t.reasonQuality)
  })

  it('shows the original five-option taxonomy for a non-receipt_cashback submission, unchanged', () => {
    renderRow({ ...baseRow, missionType: 'coupon_affiliate' })
    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const dialog = screen.getByRole('dialog')
    const select = within(dialog).getByRole('combobox')

    const optionLabels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(optionLabels).toEqual([
      t.reasonCategoryPlaceholder,
      t.reasonFormat,
      t.reasonKeyMessage,
      t.reasonCompliance,
      t.reasonQuality,
      t.reasonOther,
    ])
    // The receipt-only taxonomy must NOT leak into a non-receipt mission's dropdown.
    expect(optionLabels).not.toContain(t.reasonUnreadable)
    expect(optionLabels).not.toContain(t.reasonWrongVenue)
    expect(optionLabels).not.toContain(t.reasonDuplicate)
    expect(optionLabels).not.toContain(t.reasonAmountUnclear)
  })

  it('also applies the receipt taxonomy to request_revision, not just reject', () => {
    renderRow(baseRow)
    fireEvent.click(screen.getByRole('button', { name: t.actRequestRevision }))
    const dialog = screen.getByRole('dialog')
    const optionLabels = within(dialog).getByRole('combobox').querySelectorAll('option')
    expect(Array.from(optionLabels).map((o) => o.textContent)).toContain(t.reasonWrongVenue)
  })

  it('falls back to the original taxonomy when missionType is unknown/null (safe default)', () => {
    renderRow({ ...baseRow, missionType: null })
    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const dialog = screen.getByRole('dialog')
    const optionLabels = Array.from(within(dialog).getByRole('combobox').querySelectorAll('option')).map((o) => o.textContent)
    expect(optionLabels).toContain(t.reasonFormat)
    expect(optionLabels).not.toContain(t.reasonUnreadable)
  })

  it('submits a rejection for a receipt_cashback submission with a receipt-taxonomy reason, and the RPC-bound action receives the exact reason value', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    renderRow(baseRow, reviewAction)

    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'wrong_venue' } })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Different merchant on the receipt' } })
    fireEvent.click(within(dialog).getByRole('button', { name: t.actApply }))

    await waitFor(() => {
      expect(reviewAction).toHaveBeenCalledWith(
        'en',
        's1',
        'reject',
        'wrong_venue',
        'Different merchant on the receipt',
        'mission-1',
      )
    })
  })
})
