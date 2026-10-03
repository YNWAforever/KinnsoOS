import { describe, it, expect } from 'vitest'
import {
  isCreatorStatus, validateReason, validateBulkIds, normalizeDirectoryParams,
  isSettlementStatus, isLegStatus,
  type CreatorStatus,
} from '@/lib/admin/creators-validation'

describe('settlement validation guards', () => {
  it('accepts every overall settlement status', () => {
    for (const s of ['not_started', 'pending', 'partially_paid', 'paid', 'disputed']) {
      expect(isSettlementStatus(s)).toBe(true)
    }
  })
  it('rejects unknown overall statuses', () => {
    expect(isSettlementStatus('refunded')).toBe(false)
    expect(isSettlementStatus('')).toBe(false)
  })
  it('accepts only pending/paid leg statuses', () => {
    expect(isLegStatus('pending')).toBe(true)
    expect(isLegStatus('paid')).toBe(true)
    expect(isLegStatus('partially_paid')).toBe(false)
  })
})

describe('isCreatorStatus', () => {
  it('accepts the four lifecycle states', () => {
    for (const s of ['onboarding', 'active', 'suspended', 'banned']) expect(isCreatorStatus(s)).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isCreatorStatus('deleted')).toBe(false)
    expect(isCreatorStatus('')).toBe(false)
  })
})

describe('validateReason', () => {
  it('returns null for a non-empty trimmed reason', () => {
    expect(validateReason('spam account')).toBeNull()
  })
  it('returns an error key for empty/whitespace', () => {
    expect(validateReason('   ')).toBe('reason_required')
    expect(validateReason('')).toBe('reason_required')
  })
  it('returns an error key when too long (>500)', () => {
    expect(validateReason('x'.repeat(501))).toBe('reason_too_long')
  })
})

describe('validateBulkIds', () => {
  it('accepts 1..100 ids', () => {
    expect(validateBulkIds(['a'])).toBeNull()
    expect(validateBulkIds(Array.from({ length: 100 }, (_, i) => String(i)))).toBeNull()
  })
  it('rejects empty or >100', () => {
    expect(validateBulkIds([])).toBe('bad_bulk')
    expect(validateBulkIds(Array.from({ length: 101 }, (_, i) => String(i)))).toBe('bad_bulk')
  })
})

describe('normalizeDirectoryParams', () => {
  it('parses search params into typed RPC inputs', () => {
    const p = normalizeDirectoryParams({ q: 'mia', status: 'active,suspended', tier: 'pro', dna: 'published', verified: 'true' })
    expect(p).toEqual({
      search: 'mia', statuses: ['active', 'suspended'], tiers: ['pro'],
      dna: 'published', verified: true,
    })
  })
  it('drops empty/invalid filters', () => {
    const p = normalizeDirectoryParams({ q: '', status: '', tier: undefined, dna: 'bogus', verified: 'maybe' })
    expect(p).toEqual({ search: undefined, statuses: undefined, tiers: undefined, dna: undefined, verified: undefined })
  })
})
