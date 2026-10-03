// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, insertMock, updateMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ insert: insertMock, update: updateMock }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createExperienceAction, setExperienceStatusAction } from '@/lib/experiences/actions'

const validInput = {
  title: 'Sunset junk boat tour',
  summary: 'Two hours on Victoria Harbour.',
  description: 'Full description.',
  city: 'Hong Kong',
  priceAmount: '480',
  currency: 'HKD',
  durationMinutes: '120',
  coverUrl: 'https://example.com/cover.jpg',
}

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  insertMock.mockReset()
  updateMock.mockReset()
})

describe('createExperienceAction', () => {
  it('rejects non-merchants before writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await createExperienceAction(validInput, { publish: false, locale: 'en' })
    expect(res.ok).toBe(false)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a draft scoped to the caller merchant with a slugged title', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'e1', slug: 'sunset-junk-boat-tour-abc123' }, error: null }) }),
    })
    const res = await createExperienceAction(validInput, { publish: false, locale: 'en' })
    expect(res.ok).toBe(true)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.merchant_profile_id).toBe('m1')
    expect(payload.status).toBe('draft')
    expect(payload.published_at).toBeNull()
    expect(payload.price_amount).toBe(480)
    expect(payload.slug).toMatch(/^sunset-junk-boat-tour-/)
  })

  it('publish=true sets status and published_at', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'e1', slug: 's' }, error: null }) }),
    })
    await createExperienceAction(validInput, { publish: true, locale: 'en' })
    const payload = insertMock.mock.calls[0][0]
    expect(payload.status).toBe('published')
    expect(typeof payload.published_at).toBe('string')
  })
})

describe('setExperienceStatusAction', () => {
  it('publishes with a published_at stamp, scoped by id AND merchant id', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const eq2 = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'e1' }, error: null }) }) }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    updateMock.mockReturnValue({ eq: eq1 })
    const res = await setExperienceStatusAction('e1', 'published', { locale: 'en' })
    expect(res.ok).toBe(true)
    expect(updateMock.mock.calls[0][0].status).toBe('published')
    expect(eq1).toHaveBeenCalledWith('id', 'e1')
    expect(eq2).toHaveBeenCalledWith('merchant_profile_id', 'm1')
  })

  it('rejects an invalid target status', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await setExperienceStatusAction('e1', 'archived' as never, { locale: 'en' })
    expect(res.ok).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
