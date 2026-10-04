import type { ActionFailure } from '@/lib/admin/result'
import { formError } from '@/lib/admin/result'

export interface OfferInput {
  title: string
  terms: string
  discountKind: 'percent' | 'amount' | 'item'
  discountValue: string
  commissionKind: 'flat' | 'percent'
  commissionValue: string
  validFrom: string
  validTo: string
  perVisitorLimit: string
  totalCap: string
  missionId: string | null
}

export interface ParsedOfferInput {
  title: string
  terms: string
  discountKind: 'percent' | 'amount' | 'item'
  discountValue: number
  commissionKind: 'flat' | 'percent'
  commissionValue: number
  validFrom: string
  validTo: string
  perVisitorLimit: number
  totalCap: number | null
  missionId: string | null
}

export type OfferValidationResult = { ok: true; parsed: ParsedOfferInput } | ActionFailure

export function validateOfferInput(input: OfferInput): OfferValidationResult {
  const title = input.title.trim()
  const terms = input.terms.trim()
  if (title.length < 1 || title.length > 120) return formError('Title must be 1-120 characters')
  if (terms.length < 1 || terms.length > 1000) return formError('Terms must be 1-1000 characters')

  const discountValue = Number(input.discountValue)
  if (!Number.isFinite(discountValue) || discountValue <= 0) return formError('Discount value must be a positive number')

  const commissionValue = Number(input.commissionValue)
  if (!Number.isFinite(commissionValue) || commissionValue <= 0) return formError('Commission value must be a positive number')

  if (input.discountKind === 'percent' && discountValue > 100) return formError('Percent discount cannot exceed 100')
  if (input.commissionKind === 'percent' && commissionValue > 100) return formError('Percent commission cannot exceed 100')

  const validFrom = new Date(input.validFrom)
  const validTo = new Date(input.validTo)
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) return formError('Valid dates are required')
  if (validTo <= validFrom) return formError('End date must be after start date')

  const perVisitorLimit = Number(input.perVisitorLimit)
  if (!Number.isInteger(perVisitorLimit) || perVisitorLimit <= 0) return formError('Per-visitor limit must be a positive whole number')

  let totalCap: number | null = null
  if (input.totalCap.trim() !== '') {
    totalCap = Number(input.totalCap)
    if (!Number.isInteger(totalCap) || totalCap <= 0) return formError('Total cap must be a positive whole number')
  }

  return {
    ok: true,
    parsed: {
      title, terms, discountKind: input.discountKind, discountValue,
      commissionKind: input.commissionKind, commissionValue,
      validFrom: validFrom.toISOString(), validTo: validTo.toISOString(),
      perVisitorLimit, totalCap, missionId: input.missionId,
    },
  }
}
