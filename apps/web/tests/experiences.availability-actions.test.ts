// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, fromMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ from: fromMock }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addAvailabilityDateAction, closeAvailabilityDateAction } from '@/lib/experiences/availability-actions'

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  fromMock.mockReset()
})

describe('addAvailabilityDateAction', () => {
  it('rejects a non-merchant caller before touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await addAvailabilityDateAction('exp1', { date: 'not-a-date', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.date).toBeTruthy()
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns a friendly error when the experience is not owned by the caller', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })

  it('inserts a new availability row for an owned experience', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'exp1' }, error: null }) }) }) }),
      })
      .mockReturnValueOnce({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'avail1' }, error: null }) }) }),
      })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.id).toBe('avail1')
  })

  it('maps a duplicate-date unique violation to a friendly message', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'exp1' }, error: null }) }) }) }),
      })
      .mockReturnValueOnce({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }) }) }),
      })
    const res = await addAvailabilityDateAction('exp1', { date: '2026-08-01', capacity: '10' }, { locale: 'en' })
    expect(res.ok).toBe(false)
  })
})

describe('closeAvailabilityDateAction', () => {
  it('rejects a non-merchant caller before touching the database', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('closes an owned availability row', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'avail1' }, error: null }) }) }) }) }),
    })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(true)
  })

  it('returns a friendly error when RLS blocks the update (not owned)', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    fromMock.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
    })
    const res = await closeAvailabilityDateAction('exp1', 'avail1', { locale: 'en' })
    expect(res.ok).toBe(false)
  })
})
