// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getMyMerchantApplication } from '@/lib/merchants/application-queries'

function fakeSupabase(row: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: row, error }),
            }),
          }),
        }),
      }),
    }),
  } as never
}

describe('getMyMerchantApplication', () => {
  it('returns null when the user has never applied', async () => {
    const result = await getMyMerchantApplication(fakeSupabase(null), 'u1')
    expect(result).toBeNull()
  })

  it('maps the most recent application row', async () => {
    const row = {
      id: 'app1', status: 'pending', company_name: 'Acme', decision_reason: null, created_at: '2026-07-03T00:00:00Z',
    }
    const result = await getMyMerchantApplication(fakeSupabase(row), 'u1')
    expect(result).toEqual({
      id: 'app1', status: 'pending', companyName: 'Acme', decisionReason: null, createdAt: '2026-07-03T00:00:00Z',
    })
  })

  it('propagates query errors instead of swallowing them', async () => {
    await expect(getMyMerchantApplication(fakeSupabase(null, { message: 'boom' }), 'u1')).rejects.toBeTruthy()
  })
})
