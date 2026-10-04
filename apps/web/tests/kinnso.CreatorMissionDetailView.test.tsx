// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(async () => ({ error: 'unconfigured' as const })),
  retryVerification: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
    }),
  }),
}))

import { CreatorMissionDetailView } from '@/components/kinnso/pages/CreatorMissionDetailView'
import type { CreatorMissionDetail, MilestoneRow } from '@/lib/missions/detail'
import type { KinnsoActionResult } from '@/components/kinnso/action-result'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const baseMilestone: MilestoneRow = {
  id: 'a', title: 'Main reel', description: 'A reel', dueAt: '2026-07-02T00:00:00Z',
  state: 'none', signal: null, submissionId: null, proofUrl: null, notes: null,
  merchantFeedback: null, canSubmit: false, verification: null,
}

const base: CreatorMissionDetail = {
  id: 'm1', title: 'Summer in Shibuya', summary: 'Make a reel.', missionSource: 'merchant',
  missionType: 'paid', status: 'published', compensation: 'HKD 5000', couponCode: null, couponUrl: null,
  partnerLinks: [], participantId: null, participantStatus: null, cta: 'apply',
  milestones: [baseMilestone], maxReceiptsPerCreator: null, receiptSubmissions: [],
  deliverables: [], requirements: [], dos: [], donts: [], keyMessages: [], referenceLinks: [], effort: null,
}

function activeMissionWithMilestone(
  milestoneOverrides: Partial<MilestoneRow> = {},
): CreatorMissionDetail {
  return {
    ...base,
    id: 'm1',
    cta: 'active',
    participantId: 'p1',
    participantStatus: 'active',
    milestones: [{
      ...baseMilestone,
      id: 'ms1',
      title: 'Post a reel',
      description: 'A reel',
      canSubmit: false,
      state: 'none',
      ...milestoneOverrides,
    }],
  }
}

function activeReceiptMission(overrides: Partial<CreatorMissionDetail> = {}): CreatorMissionDetail {
  return {
    ...base,
    id: 'm1',
    missionType: 'receipt_cashback',
    cta: 'active',
    participantId: 'p1',
    participantStatus: 'active',
    milestones: [],
    maxReceiptsPerCreator: null,
    receiptSubmissions: [],
    ...overrides,
  }
}

const render1 = (
  mission: CreatorMissionDetail,
  props: Partial<{
    onJoin: () => KinnsoActionResult | Promise<KinnsoActionResult>
    onApply: (n: string) => KinnsoActionResult | Promise<KinnsoActionResult>
    onSubmitMilestone: (input: { milestoneId: string; proofUrl: string; notes: string }) => Promise<{ ok: true; submissionId: string } | { ok: false; errors?: Record<string, string[]> }>
  }> = {},
) =>
  render(
    <CreatorMissionDetailView
      locale="en"
      t={en.missionDetail}
      mission={mission}
      onJoin={props.onJoin ?? vi.fn()}
      onApply={props.onApply ?? vi.fn()}
      onSubmitMilestone={props.onSubmitMilestone ?? vi.fn(async () => ({ ok: false as const }))}
    />,
  )

describe('CreatorMissionDetailView', () => {
  it('renders a back link to the missions list', () => {
    render1(base)
    const link = screen.getByRole('link', { name: new RegExp(en.missionDetail.back) })
    expect(link.getAttribute('href')).toBe('/en/studio/missions')
  })

  it('shows the join button for a coupon mission and calls onJoin', () => {
    const onJoin = vi.fn()
    render1({ ...base, missionType: 'coupon_affiliate', cta: 'join' }, { onJoin })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.join }))
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('shows the apply note + button and calls onApply with the note', () => {
    const onApply = vi.fn()
    render1(base, { onApply })
    fireEvent.change(screen.getByLabelText(en.missionDetail.applyNoteLabel), { target: { value: 'I fit because…' } })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.apply }))
    expect(onApply).toHaveBeenCalledWith('I fit because…')
  })

  it('shows the awaiting notice for an applied participant and no apply button', () => {
    render1({ ...base, participantStatus: 'applied', cta: 'awaiting' })
    expect(screen.getByText(en.missionDetail.awaitingTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.apply })).toBeNull()
  })

  it('renders the milestone list for an active participant', () => {
    render1({
      ...base, participantId: 'p1', participantStatus: 'active', cta: 'active',
      milestones: [
        { id: 'a', title: 'Main reel', description: 'A reel', dueAt: null, state: 'submitted', signal: 'verified_signal', submissionId: 'sub1', proofUrl: null, notes: null, merchantFeedback: null, canSubmit: false, verification: null },
        { id: 'b', title: 'Wrap-up', description: '', dueAt: null, state: 'none', signal: null, submissionId: null, proofUrl: null, notes: null, merchantFeedback: null, canSubmit: false, verification: null },
      ],
    })
    expect(screen.getByText('Main reel')).toBeTruthy()
    expect(screen.getByText('Wrap-up')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.milestonesHeading)).toBeTruthy()
  })

  it('renders a submit form for a submittable milestone and calls onSubmitMilestone', async () => {
    const onSubmitMilestone = vi.fn(async () => ({ ok: true as const, submissionId: 'sub-1' }))
    const mission = activeMissionWithMilestone({ canSubmit: true, state: 'none' })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={onSubmitMilestone}
      />,
    )
    fireEvent.change(screen.getByLabelText(en.missionDetail.proofUrlLabel), {
      target: { value: 'https://www.instagram.com/p/Cabc/' },
    })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.submitMilestone }))
    await waitFor(() => expect(onSubmitMilestone).toHaveBeenCalledWith({
      milestoneId: mission.milestones[0].id, proofUrl: 'https://www.instagram.com/p/Cabc/', notes: '',
    }))
  })

  it('shows merchant feedback and a Resubmit button when revision was requested', () => {
    const mission = activeMissionWithMilestone({ canSubmit: true, state: 'revision_requested', merchantFeedback: 'Add the coupon code' })
    render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
    expect(screen.getByText('Add the coupon code')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.missionDetail.resubmitMilestone })).toBeTruthy()
  })

  it('does not render a form once approved', () => {
    const mission = activeMissionWithMilestone({ canSubmit: false, state: 'approved' })
    render(<CreatorMissionDetailView locale="en" t={en.missionDetail} mission={mission} onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} />)
    expect(screen.queryByLabelText(en.missionDetail.proofUrlLabel)).toBeNull()
  })
})

describe('CreatorMissionDetailView — receipt_cashback repeatable submissions', () => {
  it('shows the receipt-submission view (not the fixed checklist) for a receipt_cashback mission', () => {
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={activeReceiptMission()}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={vi.fn()}
      />,
    )
    expect(screen.getByText(en.missionDetail.receiptsHeading)).toBeTruthy()
    expect(screen.queryByText(en.missionDetail.milestonesHeading)).toBeNull()
  })

  it('shows the ORIGINAL fixed-checklist view unchanged for every other mission type', () => {
    for (const missionType of ['coupon_affiliate', 'hybrid', 'paid'] as const) {
      const mission = { ...activeMissionWithMilestone({ canSubmit: true, state: 'none' }), missionType }
      const { unmount } = render(
        <CreatorMissionDetailView
          locale="en" t={en.missionDetail} mission={mission}
          onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={vi.fn()}
        />,
      )
      expect(screen.getByText(en.missionDetail.milestonesHeading)).toBeTruthy()
      expect(screen.getByText('Post a reel')).toBeTruthy()
      expect(screen.queryByText(en.missionDetail.receiptsHeading)).toBeNull()
      unmount()
    }
  })

  it('shows a clear cap-reached message and disables further submission once the cap is hit', () => {
    const mission = activeReceiptMission({
      maxReceiptsPerCreator: 2,
      receiptSubmissions: [
        { id: 's1', status: 'approved', proofUrls: ['u1'], notes: null, submittedAt: '2026-08-01T00:00:00Z', rejectionReason: null },
        { id: 's2', status: 'submitted', proofUrls: ['u2'], notes: null, submittedAt: '2026-08-02T00:00:00Z', rejectionReason: null },
      ],
    })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={vi.fn()}
      />,
    )
    expect(screen.getByText(en.missionDetail.receiptCapReached)).toBeTruthy()
    expect(screen.queryByLabelText(en.missionDetail.receiptProofUrlLabel)).toBeNull()
    expect(screen.queryByRole('button', { name: en.missionDetail.submitReceipt })).toBeNull()
  })

  it("shows a rejected receipt's reason from the receipt-specific taxonomy", () => {
    const mission = activeReceiptMission({
      receiptSubmissions: [
        { id: 's1', status: 'rejected', proofUrls: ['u1'], notes: null, submittedAt: '2026-08-01T00:00:00Z', rejectionReason: 'wrong_venue' },
      ],
    })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={vi.fn()}
      />,
    )
    expect(screen.getByText(en.missionDetail.receiptReasonWrongVenue)).toBeTruthy()
  })

  it('clears the upload form and appends to the submission history on a successful submission', async () => {
    const onSubmitReceipt = vi.fn(async () => ({ ok: true as const, submissionId: 'new-sub' }))
    const mission = activeReceiptMission({ receiptSubmissions: [] })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={onSubmitReceipt}
      />,
    )
    expect(screen.getByText(en.missionDetail.receiptSubmissionsEmpty)).toBeTruthy()

    const input = screen.getByLabelText(en.missionDetail.receiptProofUrlLabel) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/receipt.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.submitReceipt }))

    await waitFor(() => expect(onSubmitReceipt).toHaveBeenCalledWith({ proofUrl: 'https://example.com/receipt.jpg' }))
    await waitFor(() => expect(input.value).toBe(''))
    expect(screen.queryByText(en.missionDetail.receiptSubmissionsEmpty)).toBeNull()
  })

  it('shows a friendly error and does not clear the form when submission fails', async () => {
    const onSubmitReceipt = vi.fn(async () => ({ ok: false as const, errors: { form: ["You've reached the receipt limit for this mission"] } }))
    const mission = activeReceiptMission({ receiptSubmissions: [] })
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail} mission={mission}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()} onSubmitReceipt={onSubmitReceipt}
      />,
    )
    const input = screen.getByLabelText(en.missionDetail.receiptProofUrlLabel) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/receipt.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: en.missionDetail.submitReceipt }))

    await waitFor(() => expect(screen.getByText("You've reached the receipt limit for this mission")).toBeTruthy())
    expect(input.value).toBe('https://example.com/receipt.jpg')
  })
})

describe('CreatorMissionDetailView tier lock', () => {
  it('shows the locked notice and hides join when lockedTier is set', () => {
    const onJoin = vi.fn()
    render(
      <CreatorMissionDetailView
        locale="en"
        t={en.missionDetail}
        mission={{ ...base, missionType: 'coupon_affiliate', cta: 'join' }}
        onJoin={onJoin}
        onApply={vi.fn()}
        onSubmitMilestone={vi.fn(async () => ({ ok: false as const }))}
        lockedTier="pro"
        gating={{ locked: en.missions.locked, lockedHelp: en.missions.lockedHelp }}
      />,
    )
    expect(screen.getByText(en.missions.locked)).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missionDetail.join })).toBeNull()
    expect(onJoin).not.toHaveBeenCalled()
  })
})

describe('CreatorMissionDetailView — brief richness sections', () => {
  it('renders each populated brief richness section with a heading', () => {
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail}
        mission={{
          ...base,
          deliverables: ['Instagram Reel', 'Blog post'],
          requirements: ['Tag @merchant'],
          dos: ['Show the storefront'],
          donts: ['Do not disparage competitors'],
          keyMessages: ['Family-friendly staycation'],
          referenceLinks: ['https://merchant.test/brand-guide'],
          effort: 'medium',
        }}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()}
      />,
    )
    expect(screen.getByText(en.missionDetail.deliverablesHeading)).toBeTruthy()
    expect(screen.getByText('Instagram Reel')).toBeTruthy()
    expect(screen.getByText('Blog post')).toBeTruthy()
    expect(screen.getByText(en.missionDetail.requirementsHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.dosHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.dontsHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.keyMessagesHeading)).toBeTruthy()
    expect(screen.getByText(en.missionDetail.referenceLinksHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://merchant.test/brand-guide' })).toHaveAttribute(
      'href', 'https://merchant.test/brand-guide',
    )
    expect(screen.getByText(en.missionDetail.effortBadgeLabel('medium'))).toBeTruthy()
  })

  it('renders no brief richness sections when every field is empty', () => {
    render(
      <CreatorMissionDetailView
        locale="en" t={en.missionDetail}
        mission={base}
        onJoin={vi.fn()} onApply={vi.fn()} onSubmitMilestone={vi.fn()}
      />,
    )
    expect(screen.queryByText(en.missionDetail.deliverablesHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.requirementsHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.dosHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.dontsHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.keyMessagesHeading)).toBeNull()
    expect(screen.queryByText(en.missionDetail.referenceLinksHeading)).toBeNull()
  })
})
