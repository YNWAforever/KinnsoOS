import { describe, expect, it } from 'vitest'
import {
  validateMissionDraft,
  validatePartnerLinkRequest,
  validateSubmission,
} from '@/lib/missions/validation'
import type {
  MissionDraftInput,
  PartnerLinkRequest,
} from '@/lib/missions/types'

const base: MissionDraftInput = {
  missionSource: 'merchant',
  missionType: 'coupon_affiliate',
  visibility: 'open',
  title: 'Tokyo ramen coupon campaign',
  summary: 'Share the spring ramen coupon with travel food followers.',
  couponCode: 'RAMEN10',
  couponUrl: 'https://example.com/ramen',
  affiliateCommissionRate: 12,
  kinnsoCommissionRate: 4,
  creatorCommissionRate: 8,
  paidFeeAmount: null,
  paidFeeCurrency: null,
  affiliateNetworkProgramId: null,
  minTier: null,
  maxReceiptsPerCreator: null,
  milestones: [{ title: 'Share coupon post', description: 'Post one IG reel or Threads post.' }],
  deliverables: [],
  requirements: [],
  dos: [],
  donts: [],
  keyMessages: [],
  referenceLinks: [],
  effort: null,
}

describe('mission validation', () => {
  it('accepts a merchant coupon affiliate mission with coupon and commission terms', () => {
    expect(validateMissionDraft(base)).toEqual({ ok: true, errors: {} })
  })

  it('rejects merchant coupon missions without coupon terms', () => {
    const result = validateMissionDraft({ ...base, couponCode: '', couponUrl: '' })
    expect(result.ok).toBe(false)
    expect(result.errors.couponCode).toContain('required')
    expect(result.errors.couponUrl).toContain('required')
  })

  it('rejects non-finite merchant commission values', () => {
    const result = validateMissionDraft({
      ...base,
      affiliateCommissionRate: Number.NaN,
      kinnsoCommissionRate: Infinity,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateCommissionRate).toContain('non-negative')
    expect(result.errors.kinnsoCommissionRate).toContain('non-negative')
  })

  it('rejects non-number runtime commission values', () => {
    const result = validateMissionDraft({
      ...base,
      affiliateCommissionRate: '12' as unknown as number,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateCommissionRate).toContain('non-negative')
  })

  it('accepts Travelpayouts missions without merchant coupon fields', () => {
    const result = validateMissionDraft({
      ...base,
      missionSource: 'travelpayouts',
      affiliateNetworkProgramId: 'program-1',
      couponCode: null,
      couponUrl: null,
      milestones: [],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects paid missions without a paid fee and at least one milestone', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'paid',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: null,
      paidFeeCurrency: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('required')
    expect(result.errors.milestones).toContain('at least one')
  })

  it('rejects non-finite paid fee values', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'paid',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: Infinity,
      paidFeeCurrency: 'HKD',
      milestones: [{ title: 'Publish deliverable', description: 'Post one creator deliverable.' }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('non-negative')
  })

  it('accepts a receipt_cashback mission with a valid per-receipt amount and no milestone', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'receipt_cashback',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: 50,
      paidFeeCurrency: 'HKD',
      maxReceiptsPerCreator: 3,
      milestones: [],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects a receipt_cashback mission with no per-receipt amount', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'receipt_cashback',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: null,
      paidFeeCurrency: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.paidFeeAmount).toContain('required')
    // receipt_cashback's milestone is auto-created by a DB trigger at insert time, so unlike
    // paid/hybrid missions an empty milestones array must not be rejected.
    expect(result.errors.milestones).toBeUndefined()
  })

  it('does not require coupon or commission fields for receipt_cashback missions', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'receipt_cashback',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: 50,
      paidFeeCurrency: 'HKD',
      milestones: [],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('rejects a non-positive-integer max_receipts_per_creator on a receipt_cashback mission', () => {
    const result = validateMissionDraft({
      ...base,
      missionType: 'receipt_cashback',
      couponCode: null,
      couponUrl: null,
      affiliateCommissionRate: null,
      kinnsoCommissionRate: null,
      creatorCommissionRate: null,
      paidFeeAmount: 50,
      paidFeeCurrency: 'HKD',
      maxReceiptsPerCreator: 0,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.maxReceiptsPerCreator).toContain('positive-integer')
  })

  it('rejects Travelpayouts missions without an affiliate network program ID', () => {
    const result = validateMissionDraft({
      ...base,
      missionSource: 'travelpayouts',
      affiliateNetworkProgramId: '',
      couponCode: null,
      couponUrl: null,
      milestones: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.affiliateNetworkProgramId).toContain('required')
  })

  it('rejects partner link generation without an active participant', () => {
    const request: PartnerLinkRequest = {
      programStatus: 'active',
      participantStatus: 'applied',
      originalUrl: 'https://booking.example/hotel',
    }
    const result = validatePartnerLinkRequest(request)
    expect(result.ok).toBe(false)
    expect(result.errors.participantStatus).toContain('active')
  })

  it('rejects partner link generation without an absolute HTTPS URL', () => {
    for (const originalUrl of ['abc', '/relative', 'http://example.com']) {
      const result = validatePartnerLinkRequest({
        programStatus: 'active',
        participantStatus: 'active',
        originalUrl,
      })
      expect(result.ok).toBe(false)
      expect(result.errors.originalUrl).toContain('https')
    }
  })

  it('accepts a draft with valid http(s) reference links', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['https://example.com/brand-guide', 'http://example.com/logo.png'],
    })
    expect(result).toEqual({ ok: true, errors: {} })
  })

  it('accepts a draft with no reference links at all', () => {
    expect(validateMissionDraft({ ...base, referenceLinks: [] })).toEqual({ ok: true, errors: {} })
  })

  it('rejects a draft with a non-URL reference link', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['https://example.com/brand-guide', 'not a url'],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.referenceLinks).toContain('url')
  })

  it('rejects a reference link with a non-http(s) scheme', () => {
    const result = validateMissionDraft({
      ...base,
      referenceLinks: ['ftp://example.com/file'],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.referenceLinks).toContain('url')
  })
})

describe('validateSubmission', () => {
  it('accepts a valid Instagram proof URL with notes', () => {
    expect(validateSubmission({ proofUrl: 'https://www.instagram.com/p/Cabc123/', notes: 'live now' }))
      .toEqual({ ok: true, errors: {} })
  })
  it('requires a proof URL', () => {
    const r = validateSubmission({ proofUrl: '  ' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('required')
  })
  it('rejects a non-http URL', () => {
    const r = validateSubmission({ proofUrl: 'ftp://example.com/x' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('url')
  })
  it('rejects an unsupported platform URL', () => {
    const r = validateSubmission({ proofUrl: 'https://www.tiktok.com/@u/video/123' })
    expect(r.ok).toBe(false)
    expect(r.errors.proofUrl).toContain('unsupported')
  })
  it('accepts a YouTube proof URL', () => {
    expect(validateSubmission({ proofUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).ok).toBe(true)
  })
  it('rejects notes longer than 1000 chars', () => {
    const r = validateSubmission({ proofUrl: 'https://instagram.com/p/x', notes: 'a'.repeat(1001) })
    expect(r.ok).toBe(false)
    expect(r.errors.notes).toContain('too_long')
  })
})
