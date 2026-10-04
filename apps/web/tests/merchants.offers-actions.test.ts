import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OfferInput } from '@/lib/merchants/offers-validation'

const { requireMerchantActionMock, fromMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string }; merchantId: string } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'merchant-user-1' }, merchantId: 'merchant-1',
  })),
  fromMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createMerchantOfferAction, setMerchantOfferStatusAction } from '@/lib/merchants/offers-actions'

const validInput: OfferInput = {
  title: 'Free dessert with any main', terms: 'One per visitor, dine-in only',
  discountKind: 'item', discountValue: '1',
  commissionKind: 'flat', commissionValue: '20',
  validFrom: '2027-01-01T00:00:00.000Z', validTo: '2027-06-01T00:00:00.000Z',
  perVisitorLimit: '1', totalCap: '100', missionId: null,
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => { requireMerchantActionMock.mockClear(); fromMock.mockReset() })

describe('createMerchantOfferAction', () => {
  it('fails the gate for a non-merchant caller', async () => {
    requireMerchantActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Merchant access is required'] } })
    const result = await createMerchantOfferAction(validInput)
    expect(result.ok).toBe(false)
  })

  it('rejects an end date before the start date', async () => {
    const result = await createMerchantOfferAction({ ...validInput, validFrom: '2027-06-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z' })
    expect(result.ok).toBe(false)
  })

  it('inserts with merchant_profile_id from the gate, not client input', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'offer-1' }, error: null }))
    await createMerchantOfferAction(validInput)
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.merchant_profile_id).toBe('merchant-1')
  })

  it('rejects a mission_id the caller does not own', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'missions') return chain({ data: null, error: null })
      return chain({ data: { id: 'offer-1' }, error: null })
    })
    const result = await createMerchantOfferAction({ ...validInput, missionId: 'someone-elses-mission' })
    expect(result.ok).toBe(false)
  })

  it('rejects a percent discount over 100', async () => {
    const result = await createMerchantOfferAction({ ...validInput, discountKind: 'percent', discountValue: '150' })
    expect(result.ok).toBe(false)
  })

  it('rejects a percent commission over 100', async () => {
    const result = await createMerchantOfferAction({ ...validInput, commissionKind: 'percent', commissionValue: '150' })
    expect(result.ok).toBe(false)
  })
})

describe('setMerchantOfferStatusAction', () => {
  it("scopes the update to the caller's own merchant_profile_id", async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'offer-1' }, error: null }))
    await setMerchantOfferStatusAction('offer-1', 'live')
    const eqCalls = (fromMock.mock.results[0].value.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls).toContainEqual(['merchant_profile_id', 'merchant-1'])
  })
})
