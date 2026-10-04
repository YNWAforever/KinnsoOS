import { describe, expect, it } from 'vitest'
import {
  buildMilestoneRows,
  buildReceiptSubmissions,
  missionCompensation,
  resolveParticipationCta,
  toCreatorMissionDetail,
  type MissionDetailRow,
} from '@/lib/missions/detail'

const activeRow = (overrides: Partial<MissionDetailRow> = {}): MissionDetailRow => ({
  id: 'm1', title: 'T', summary: 'S',
  mission_source: 'merchant', mission_type: 'paid', status: 'published',
  coupon_code: null, coupon_url: null,
  paid_fee_amount: 5000, paid_fee_currency: 'HKD',
  affiliate_commission_rate: null, creator_commission_rate: null, kinnso_commission_rate: null,
  affiliate_network_programs: null,
  mission_milestones: [{ id: 'ms1', title: 'Post a reel', description: 'd', due_at: null, sort_order: 0 }],
  mission_participants: [{
    id: 'p1', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null,
    mission_milestone_submissions: [{
      id: 'sub1', mission_milestone_id: 'ms1', status: 'submitted',
      proof_urls: ['https://www.instagram.com/p/Cabc/'], notes: 'note', merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z',
      mission_social_snapshots: [{ confidence_status: 'verified_signal' }],
      mission_verification_jobs: [{ id: 'job1', status: 'ready', confidence_status: 'verified_signal', created_at: '2026-06-20T00:01:00Z' }],
    }],
  }],
  affiliate_partner_links: [],
  ...overrides,
})

describe('resolveParticipationCta', () => {
  it('maps no participant to join for coupon and apply for paid/hybrid/receipt_cashback', () => {
    expect(resolveParticipationCta(null, 'coupon_affiliate')).toBe('join')
    expect(resolveParticipationCta(null, 'paid')).toBe('apply')
    expect(resolveParticipationCta(null, 'hybrid')).toBe('apply')
    expect(resolveParticipationCta(null, 'receipt_cashback')).toBe('apply')
  })
  it('maps participant statuses to ctas', () => {
    expect(resolveParticipationCta('applied', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('invited', 'paid')).toBe('awaiting')
    expect(resolveParticipationCta('active', 'paid')).toBe('active')
    expect(resolveParticipationCta('completed', 'paid')).toBe('active')
    expect(resolveParticipationCta('rejected', 'paid')).toBe('rejected')
    expect(resolveParticipationCta('cancelled', 'paid')).toBe('rejected')
  })
})

describe('buildMilestoneRows', () => {
  it('joins the latest submission per milestone, sorts by sort_order, derives state + signal', () => {
    const milestones = [
      { id: 'b', title: 'Second', description: 'd2', due_at: null, sort_order: 2 },
      { id: 'a', title: 'First', description: 'd1', due_at: '2026-07-02T00:00:00Z', sort_order: 1 },
    ]
    const submissions = [
      { id: 's1', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'verified_signal' }] },
      { id: 's2', mission_milestone_id: 'a', status: 'approved', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-22T00:00:00Z', mission_social_snapshots: [{ confidence_status: 'needs_review' }] },
    ]
    const rows = buildMilestoneRows(milestones, submissions)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ title: 'First', state: 'approved', signal: 'needs_review', dueAt: '2026-07-02T00:00:00Z' })
    expect(rows[1]).toMatchObject({ title: 'Second', state: 'none', signal: null })
  })

  it('treats null/pending/empty as no state and no signal', () => {
    const rows = buildMilestoneRows(
      [{ id: 'a', title: 'T', description: '', due_at: null, sort_order: 1 }],
      [{ id: 's', mission_milestone_id: 'a', status: 'pending', proof_urls: null, notes: null, merchant_feedback: null, submitted_at: null, mission_social_snapshots: [] }],
    )
    expect(rows[0]).toMatchObject({ state: 'none', signal: null })
    expect(buildMilestoneRows(null, null)).toEqual([])
  })
})

describe('toCreatorMissionDetail brief richness mapping', () => {
  const rowWithBrief: MissionDetailRow = {
    id: 'm1', title: 'T', summary: 'S',
    mission_source: 'merchant', mission_type: 'paid', status: 'published',
    coupon_code: null, coupon_url: null,
    paid_fee_amount: 5000, paid_fee_currency: 'HKD',
    affiliate_commission_rate: null, creator_commission_rate: null, kinnso_commission_rate: null,
    deliverables: ['Instagram Reel'], requirements: ['Tag @merchant'],
    dos: ['Show the storefront'], donts: ['Do not disparage competitors'],
    key_messages: ['Family-friendly staycation'], reference_links: ['https://merchant.test/brand-guide'],
    effort: 'medium',
    mission_milestones: [], mission_participants: [], affiliate_partner_links: [],
  }

  it('maps populated brief richness fields straight through', () => {
    const detail = toCreatorMissionDetail(rowWithBrief, 'creator-1')
    expect(detail.deliverables).toEqual(['Instagram Reel'])
    expect(detail.requirements).toEqual(['Tag @merchant'])
    expect(detail.dos).toEqual(['Show the storefront'])
    expect(detail.donts).toEqual(['Do not disparage competitors'])
    expect(detail.keyMessages).toEqual(['Family-friendly staycation'])
    expect(detail.referenceLinks).toEqual(['https://merchant.test/brand-guide'])
    expect(detail.effort).toBe('medium')
  })

  it('defaults missing/null brief richness fields to empty arrays and a null effort', () => {
    const { deliverables, requirements, dos, donts, key_messages, reference_links, effort, ...rest } = rowWithBrief
    const detail = toCreatorMissionDetail(
      { ...rest, deliverables: null, requirements: null, dos: null, donts: null, key_messages: null, reference_links: null, effort: null },
      'creator-1',
    )
    expect(detail.deliverables).toEqual([])
    expect(detail.requirements).toEqual([])
    expect(detail.dos).toEqual([])
    expect(detail.donts).toEqual([])
    expect(detail.keyMessages).toEqual([])
    expect(detail.referenceLinks).toEqual([])
    expect(detail.effort).toBeNull()
  })

  it('treats an unrecognized effort value as null rather than passing it through', () => {
    const detail = toCreatorMissionDetail({ ...rowWithBrief, effort: 'urgent' }, 'creator-1')
    expect(detail.effort).toBeNull()
  })
})

describe('missionCompensation', () => {
  it('formats paid, affiliate, and hybrid combinations', () => {
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'paid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('HKD 5000')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'hybrid', paid_fee_amount: 5000, paid_fee_currency: 'HKD', affiliate_commission_rate: 20, creator_commission_rate: 15, affiliate_network_programs: null })).toBe('HKD 5000 + Affiliate commission 15% creator / 20% total')
    expect(missionCompensation({ mission_source: 'merchant', mission_type: 'coupon_affiliate', paid_fee_amount: null, paid_fee_currency: null, affiliate_commission_rate: null, creator_commission_rate: null, affiliate_network_programs: null })).toBe('Affiliate commission')
  })
})

describe('toCreatorMissionDetail', () => {
  const base: MissionDetailRow = {
    id: 'm1', title: 'Summer', summary: 'Do stuff', mission_source: 'merchant', mission_type: 'hybrid', status: 'published',
    coupon_code: null, coupon_url: null, paid_fee_amount: 5000, paid_fee_currency: 'HKD',
    affiliate_commission_rate: 20, creator_commission_rate: 15, kinnso_commission_rate: 5,
    affiliate_network_programs: null, mission_milestones: [{ id: 'a', title: 'M1', description: '', due_at: null, sort_order: 1 }],
    mission_participants: [], affiliate_partner_links: [],
  }

  it('composes header, cta, and milestones for a non-participant', () => {
    const detail = toCreatorMissionDetail(base, 'creator-1')
    expect(detail).toMatchObject({ id: 'm1', title: 'Summer', missionType: 'hybrid', cta: 'apply', participantStatus: null, compensation: 'HKD 5000 + Affiliate commission 15% creator / 20% total' })
    expect(detail.milestones).toHaveLength(1)
  })

  it('uses the viewing creator participant for cta + milestone state', () => {
    const detail = toCreatorMissionDetail(
      { ...base, mission_participants: [
        { id: 'p-other', status: 'active', source: 'application', creator_id: 'someone-else', application_note: null, mission_milestone_submissions: [] },
        { id: 'p-mine', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null, mission_milestone_submissions: [{ id: 's', mission_milestone_id: 'a', status: 'submitted', proof_urls: ['u'], notes: null, merchant_feedback: null, submitted_at: '2026-06-20T00:00:00Z', mission_social_snapshots: [] }] },
      ] },
      'creator-1',
    )
    expect(detail).toMatchObject({ cta: 'active', participantStatus: 'active' })
    expect(detail.milestones[0]).toMatchObject({ state: 'submitted', signal: 'unavailable' })
  })

  it('resolves a receipt_cashback mission to the apply cta, not join — it is not coerced to coupon_affiliate', () => {
    const detail = toCreatorMissionDetail({ ...base, mission_type: 'receipt_cashback' }, 'creator-1')
    expect(detail).toMatchObject({ missionType: 'receipt_cashback', cta: 'apply', participantStatus: null })
  })
})

describe('toCreatorMissionDetail — submission + verification', () => {
  it('exposes participantId for the active participant', () => {
    expect(toCreatorMissionDetail(activeRow(), 'creator-1').participantId).toBe('p1')
  })
  it('maps the milestone submission, proof URL and merchant feedback', () => {
    const ms = toCreatorMissionDetail(activeRow(), 'creator-1').milestones[0]
    expect(ms.submissionId).toBe('sub1')
    expect(ms.proofUrl).toBe('https://www.instagram.com/p/Cabc/')
    expect(ms.state).toBe('submitted')
  })
  it('maps the latest verification job', () => {
    const ms = toCreatorMissionDetail(activeRow(), 'creator-1').milestones[0]
    expect(ms.verification).toEqual({ jobId: 'job1', status: 'ready', confidence: 'verified_signal' })
  })
  it('allows submit for an active participant with no submission', () => {
    const row = activeRow({
      mission_participants: [{ id: 'p1', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null, mission_milestone_submissions: [] }],
    })
    expect(toCreatorMissionDetail(row, 'creator-1').milestones[0].canSubmit).toBe(true)
  })
  it('blocks submit once approved', () => {
    const row = activeRow()
    row.mission_participants![0].mission_milestone_submissions![0].status = 'approved'
    expect(toCreatorMissionDetail(row, 'creator-1').milestones[0].canSubmit).toBe(false)
  })
})

describe('buildMilestoneRows — repeatable exclusion', () => {
  it('excludes a repeatable milestone from the fixed-checklist rows (it has its own receipt-submission UI instead)', () => {
    const milestones = [
      { id: 'a', title: 'Fixed', description: '', due_at: null, sort_order: 0, repeatable: false },
      { id: 'r', title: 'Submit a receipt', description: '', due_at: null, sort_order: 1, repeatable: true },
    ]
    const rows = buildMilestoneRows(milestones, [])
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })
})

describe('buildReceiptSubmissions', () => {
  const receiptMilestones = [
    { id: 'r', title: 'Submit a receipt', description: '', due_at: null, sort_order: 0, repeatable: true },
  ]

  it('returns every submission against the repeatable milestone, newest first (not just the latest)', () => {
    const submissions = [
      { id: 's1', mission_milestone_id: 'r', status: 'approved', proof_urls: ['u1'], notes: null, merchant_feedback: null, submitted_at: '2026-08-01T00:00:00Z' },
      { id: 's2', mission_milestone_id: 'r', status: 'submitted', proof_urls: ['u2'], notes: null, merchant_feedback: null, submitted_at: '2026-08-10T00:00:00Z' },
    ]
    const rows = buildReceiptSubmissions(receiptMilestones, submissions)
    expect(rows.map((r) => r.id)).toEqual(['s2', 's1'])
    expect(rows[1]).toMatchObject({ status: 'approved', proofUrls: ['u1'] })
  })

  it('surfaces the latest rejection reason from mission_review_events for a rejected receipt', () => {
    const submissions = [{
      id: 's1', mission_milestone_id: 'r', status: 'rejected', proof_urls: ['u1'], notes: null, merchant_feedback: 'blurry', submitted_at: '2026-08-01T00:00:00Z',
      mission_review_events: [
        { reason_category: 'wrong_venue', reason_text: 'stale', action: 'reject', created_at: '2026-08-01T09:00:00Z' },
        { reason_category: 'unreadable', reason_text: 'blurry', action: 'reject', created_at: '2026-08-02T00:00:00Z' },
      ],
    }]
    const rows = buildReceiptSubmissions(receiptMilestones, submissions)
    expect(rows[0]).toMatchObject({ status: 'rejected', rejectionReason: 'unreadable' })
  })

  it('has no rejection reason for a submitted or approved receipt', () => {
    const submissions = [{ id: 's1', mission_milestone_id: 'r', status: 'submitted', proof_urls: ['u1'], notes: null, merchant_feedback: null, submitted_at: '2026-08-01T00:00:00Z' }]
    expect(buildReceiptSubmissions(receiptMilestones, submissions)[0].rejectionReason).toBeNull()
  })

  it('returns an empty list when the mission has no repeatable milestone', () => {
    const milestones = [{ id: 'a', title: 'Fixed', description: '', due_at: null, sort_order: 0, repeatable: false }]
    expect(buildReceiptSubmissions(milestones, [{ id: 's1', mission_milestone_id: 'a', status: 'submitted', proof_urls: [], notes: null, merchant_feedback: null, submitted_at: null }])).toEqual([])
  })
})

describe('toCreatorMissionDetail — receipt_cashback', () => {
  const receiptRow: MissionDetailRow = {
    id: 'm1', title: 'Receipt mission', summary: 'S', mission_source: 'merchant', mission_type: 'receipt_cashback', status: 'published',
    coupon_code: null, coupon_url: null, paid_fee_amount: 50, paid_fee_currency: 'HKD',
    affiliate_commission_rate: null, creator_commission_rate: null, kinnso_commission_rate: null,
    affiliate_network_programs: null, max_receipts_per_creator: 5,
    mission_milestones: [{ id: 'r', title: 'Submit a receipt', description: '', due_at: null, sort_order: 0, repeatable: true }],
    mission_participants: [{
      id: 'p1', status: 'active', source: 'application', creator_id: 'creator-1', application_note: null,
      mission_milestone_submissions: [
        { id: 's1', mission_milestone_id: 'r', status: 'submitted', proof_urls: ['u1'], notes: null, merchant_feedback: null, submitted_at: '2026-08-01T00:00:00Z' },
      ],
    }],
    affiliate_partner_links: [],
  }

  it('exposes maxReceiptsPerCreator and every receipt submission, and excludes the repeatable milestone from the fixed checklist', () => {
    const detail = toCreatorMissionDetail(receiptRow, 'creator-1')
    expect(detail.maxReceiptsPerCreator).toBe(5)
    expect(detail.receiptSubmissions).toHaveLength(1)
    expect(detail.receiptSubmissions[0]).toMatchObject({ id: 's1', status: 'submitted' })
    expect(detail.milestones).toHaveLength(0)
  })

  it('defaults maxReceiptsPerCreator to null when unset', () => {
    const detail = toCreatorMissionDetail({ ...receiptRow, max_receipts_per_creator: null }, 'creator-1')
    expect(detail.maxReceiptsPerCreator).toBeNull()
  })
})
