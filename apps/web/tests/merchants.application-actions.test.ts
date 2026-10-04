// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const authMock = vi.fn()
const insertMock = vi.fn()
const selectMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: authMock },
    from: () => ({ insert: insertMock, select: selectMock }),
  }),
}))

import { submitMerchantApplicationAction } from '@/lib/merchants/application-actions'

const validInput = {
  companyName: 'Acme Travel',
  contactName: 'Jane Doe',
  contactEmail: 'jane@acme.example',
  websiteUrl: 'https://acme.test',
  pitch: 'We run boutique tours.',
}

beforeEach(() => {
  authMock.mockReset()
  insertMock.mockReset()
})

describe('submitMerchantApplicationAction', () => {
  it('rejects anonymous callers', async () => {
    authMock.mockResolvedValue({ data: { user: null } })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(false)
  })

  it('silently succeeds without inserting when the honeypot is filled', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await submitMerchantApplicationAction(validInput, 'filled-by-a-bot')
    expect(res.ok).toBe(true)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input without inserting', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await submitMerchantApplicationAction({ ...validInput, companyName: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.companyName).toBeTruthy()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a pending application for a valid signed-in submission', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'app1' }, error: null }) }),
    })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.id).toBe('app1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', company_name: 'Acme Travel', status: 'pending' }),
    )
  })

  it('treats a duplicate-pending unique violation as a friendly form error', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }) }),
    })
    const res = await submitMerchantApplicationAction(validInput)
    expect(res.ok).toBe(false)
  })
})
