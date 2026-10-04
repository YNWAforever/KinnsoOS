import type {
  MissionDraftInput,
  PartnerLinkRequest,
  ValidationErrors,
  ValidationResult,
} from '@/lib/missions/types'
import { parseProofUrl } from '@/lib/missions/proof-url'

const isBlank = (value: string | null | undefined) => value == null || value.trim() === ''

const addError = (errors: ValidationErrors, field: string, error: string) => {
  errors[field] = [...(errors[field] ?? []), error]
}

const isNonNegativeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const validateNonNegative = (
  errors: ValidationErrors,
  field: string,
  value: unknown,
  required = false,
) => {
  if (value == null) {
    if (required) addError(errors, field, 'required')
    return
  }

  if (!isNonNegativeNumber(value)) addError(errors, field, 'non-negative')
}

const resultFrom = (errors: ValidationErrors): ValidationResult =>
  Object.keys(errors).length === 0 ? { ok: true, errors: {} } : { ok: false, errors }

const isAbsoluteHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const isAbsoluteHttpUrl = (value: string) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const validateMissionDraft = (input: MissionDraftInput): ValidationResult => {
  const errors: ValidationErrors = {}

  if (isBlank(input.title)) addError(errors, 'title', 'required')
  if (isBlank(input.summary)) addError(errors, 'summary', 'required')

  if (
    input.missionSource === 'merchant' &&
    input.missionType !== 'paid' &&
    input.missionType !== 'receipt_cashback'
  ) {
    if (isBlank(input.couponCode)) addError(errors, 'couponCode', 'required')
    if (isBlank(input.couponUrl)) addError(errors, 'couponUrl', 'required')
    validateNonNegative(errors, 'affiliateCommissionRate', input.affiliateCommissionRate, true)
    validateNonNegative(errors, 'kinnsoCommissionRate', input.kinnsoCommissionRate, true)
    validateNonNegative(errors, 'creatorCommissionRate', input.creatorCommissionRate, true)
  }

  if (input.missionSource === 'travelpayouts') {
    if (input.missionType !== 'coupon_affiliate') addError(errors, 'missionType', 'coupon_affiliate')
    if (isBlank(input.affiliateNetworkProgramId)) {
      addError(errors, 'affiliateNetworkProgramId', 'required')
    }
  }

  if (
    input.missionType === 'paid' ||
    input.missionType === 'hybrid' ||
    input.missionType === 'receipt_cashback'
  ) {
    validateNonNegative(errors, 'paidFeeAmount', input.paidFeeAmount, true)
    if (isBlank(input.paidFeeCurrency)) addError(errors, 'paidFeeCurrency', 'required')
  }

  // receipt_cashback missions get their single repeatable milestone auto-created by a DB
  // trigger at mission-insert time (see
  // supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql), so unlike
  // paid/hybrid missions the merchant is never asked to enter one here.
  if (input.missionType === 'paid' || input.missionType === 'hybrid') {
    if (input.milestones.length === 0) addError(errors, 'milestones', 'at least one')
  }

  if (input.referenceLinks.some((link) => !isAbsoluteHttpUrl(link))) {
    addError(errors, 'referenceLinks', 'url')
  }

  if (input.missionType === 'receipt_cashback' && input.maxReceiptsPerCreator != null) {
    if (!Number.isInteger(input.maxReceiptsPerCreator) || input.maxReceiptsPerCreator < 1) {
      addError(errors, 'maxReceiptsPerCreator', 'positive-integer')
    }
  }

  return resultFrom(errors)
}

export const validatePartnerLinkRequest = (input: PartnerLinkRequest): ValidationResult => {
  const errors: ValidationErrors = {}

  if (input.programStatus !== 'active') addError(errors, 'programStatus', 'active')
  if (input.participantStatus !== 'active') addError(errors, 'participantStatus', 'active')
  if (isBlank(input.originalUrl)) {
    addError(errors, 'originalUrl', 'required')
  } else if (!isAbsoluteHttpsUrl(input.originalUrl)) {
    addError(errors, 'originalUrl', 'https')
  }

  return resultFrom(errors)
}

export const validateSubmission = (input: { proofUrl: string; notes?: string | null }): ValidationResult => {
  const errors: ValidationErrors = {}
  const url = (input.proofUrl ?? '').trim()

  if (isBlank(url)) {
    addError(errors, 'proofUrl', 'required')
  } else if (!/^https?:\/\//i.test(url)) {
    addError(errors, 'proofUrl', 'url')
  } else if (!parseProofUrl(url)) {
    addError(errors, 'proofUrl', 'unsupported')
  }

  if ((input.notes ?? '').length > 1000) {
    addError(errors, 'notes', 'too_long')
  }

  return resultFrom(errors)
}

// Receipt-cashback proof is a photo of a purchase receipt (see
// receiptProofUrlLabel/Placeholder, 'Receipt photo URL' / 'https://...', in
// lib/i18n/messages) -- unlike a milestone's content-post proof, it is never a link to an
// Instagram/Threads/YouTube post, so it deliberately does NOT reuse validateSubmission's
// parseProofUrl shape check: that check would reject every legitimate receipt-photo host
// (camera-roll upload services, image CDNs, etc.) since none of them are social platforms.
// It keeps the same non-blank + https?:// scheme checks validateSubmission applies before
// its parseProofUrl step, which is exactly what's needed to catch a whitespace-only or
// plain-garbage-text "proof" before it reaches the submit_receipt RPC.
export const validateReceiptProof = (input: { proofUrl: string }): ValidationResult => {
  const errors: ValidationErrors = {}
  const url = (input.proofUrl ?? '').trim()

  if (isBlank(url)) {
    addError(errors, 'proofUrl', 'required')
  } else if (!/^https?:\/\//i.test(url)) {
    addError(errors, 'proofUrl', 'url')
  }

  return resultFrom(errors)
}
