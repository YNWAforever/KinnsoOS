// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { requireMerchantActionMock, updateMock } = vi.hoisted(() => ({
  requireMerchantActionMock: vi.fn(),
  updateMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireMerchantAction: requireMerchantActionMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ update: updateMock }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateMerchantProfileAction } from '@/lib/merchants/profile-actions'

const validInput = {
  companyName: 'Acme Travel',
  contactName: 'Jane',
  contactEmail: 'jane@acme.example',
  websiteUrl: 'https://acme.test',
  tagline: 'Boutique tours in Hong Kong',
  city: 'Hong Kong',
  logoUrl: '',
}

beforeEach(() => {
  requireMerchantActionMock.mockReset()
  updateMock.mockReset()
})

describe('updateMerchantProfileAction', () => {
  it('rejects non-merchant callers before writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: false, errors: { form: ['Merchant access is required'] } })
    const res = await updateMerchantProfileAction('en', validInput)
    expect(res.ok).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without writing', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const res = await updateMerchantProfileAction('en', { ...validInput, companyName: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.companyName).toBeTruthy()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('updates only the granted columns, scoped to the caller profile id', async () => {
    requireMerchantActionMock.mockResolvedValue({ ok: true, user: { id: 'u1' }, merchantId: 'm1' })
    const eqSpy = vi.fn(() => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'm1' }, error: null }) }) }))
    updateMock.mockReturnValue({ eq: eqSpy })
    const res = await updateMerchantProfileAction('en', validInput)
    expect(res.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith({
      company_name: 'Acme Travel',
      contact_name: 'Jane',
      contact_email: 'jane@acme.example',
      website_url: 'https://acme.test',
      tagline: 'Boutique tours in Hong Kong',
      city: 'Hong Kong',
      logo_url: null,
    })
    expect(eqSpy).toHaveBeenCalledWith('id', 'm1')
  })
})
