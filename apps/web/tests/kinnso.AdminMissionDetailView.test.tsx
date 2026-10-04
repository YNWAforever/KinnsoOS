// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MissionDetailView } from '@/components/kinnso/admin/missions/MissionDetailView'

afterEach(cleanup)

const t = en.missionsOps

const detail = {
  mission: { id: 'mission-1', title: 'Summer Coupon Push', missionSource: 'travelpayouts', missionType: 'coupon_affiliate', status: 'published', merchantProfileId: null, autoApprovePolicy: 'off' },
  participants: [{ id: 'p1', creatorId: 'creator-1', status: 'active', source: 'application', applicationNote: null, approvedAt: null }],
  milestones: [{ id: 'm1', title: 'Post proof', description: '', dueAt: null, sortOrder: 0 }],
  submissions: [{
    submissionId: 's1', missionId: 'mission-1', missionTitle: 'Summer Coupon Push', missionType: 'coupon_affiliate',
    creatorId: 'creator-1', status: 'submitted' as const, submittedAt: '2026-08-19T00:00:00Z',
    reviewDeadline: '2026-08-21T00:00:00Z', confidenceStatus: 'verified_signal' as const,
  }],
}

describe('MissionDetailView', () => {
  it('shows a travelpayouts-sourced mission (proving the analytics widening reaches here)', () => {
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} policyAction={vi.fn()} />)
    // The page heading and the (redundant, single-mission) submission row both legitimately
    // render the mission title -- assert presence, not uniqueness.
    expect(screen.getAllByText('Summer Coupon Push').length).toBeGreaterThan(0)
  })

  it('shows a submitted row with live review actions', () => {
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} policyAction={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: t.actApprove }).length).toBeGreaterThan(0)
  })

  it('calls reviewAction with approve, the submission id, and this mission\'s id when clicked', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} policyAction={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t.actApprove }))
    expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'approve', null, null, 'mission-1')
  })

  it('shows a waiting-on-creator badge instead of buttons for a revision_requested row', () => {
    const revising = {
      ...detail,
      submissions: [{ ...detail.submissions[0], status: 'revision_requested' as const }],
    }
    render(<MissionDetailView t={t as never} locale="en" detail={revising} reviewAction={vi.fn()} policyAction={vi.fn()} />)
    expect(screen.getByText(t.waitingOnCreator)).toBeTruthy()
    expect(screen.queryByRole('button', { name: t.actApprove })).toBeNull()
  })

  it('opens the reject modal, submits a reason category and free text, and calls reviewAction', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} policyAction={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()

    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'quality' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'blurry photo' } })
    fireEvent.click(screen.getByRole('button', { name: t.actApply }))

    await waitFor(() => {
      expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'reject', 'quality', 'blurry photo', 'mission-1')
    })
  })

  it('opens the request-revision modal and submits with no free text (reason text optional)', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} policyAction={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t.actRequestRevision }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox'), { target: { value: 'format' } })
    fireEvent.click(screen.getByRole('button', { name: t.actApply }))

    await waitFor(() => {
      expect(reviewAction).toHaveBeenCalledWith('en', 's1', 'request_revision', 'format', null, 'mission-1')
    })
  })

  it('keeps the Apply button disabled until a reason category is selected', () => {
    const reviewAction = vi.fn()
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} policyAction={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    const apply = screen.getByRole('button', { name: t.actApply })
    expect(apply).toHaveProperty('disabled', true)

    fireEvent.click(apply)
    expect(reviewAction).not.toHaveBeenCalled()

    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox'), { target: { value: 'other' } })
    expect(apply).toHaveProperty('disabled', false)
  })

  it('surfaces the server-returned error message instead of swallowing it', async () => {
    const reviewAction = vi.fn().mockResolvedValue({ ok: false, errors: { form: ['That submission no longer exists.'] } })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={reviewAction} policyAction={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: t.actReject }))
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox'), { target: { value: 'quality' } })
    fireEvent.click(screen.getByRole('button', { name: t.actApply }))

    expect(await screen.findByText('That submission no longer exists.')).toBeTruthy()
    // The modal stays open on failure so the ops user can retry or cancel.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('rolls the auto-approve select back to its prior value when the save fails, instead of showing a policy that never actually took effect', async () => {
    const policyAction = vi.fn().mockResolvedValue({ ok: false, errors: { form: ['Could not update the policy.'] } })
    render(<MissionDetailView t={t as never} locale="en" detail={detail} reviewAction={vi.fn()} policyAction={policyAction} />)

    const select = screen.getByLabelText(t.autoApprovePolicyLabel) as HTMLSelectElement
    expect(select.value).toBe('off')

    fireEvent.change(select, { target: { value: 'verified_signal_only' } })
    await waitFor(() => expect(screen.getByText(t.autoApprovePolicyError)).toBeTruthy())
    expect(select.value).toBe('off')
  })
})
