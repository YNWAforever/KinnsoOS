// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { listPendingMerchantApplications, listDecidedMerchantApplications } from '@/lib/admin/merchant-applications-queries'

function fakeSupabase(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: rows, error }) }),
        in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows, error }) }) }),
      }),
    }),
  } as never
}

const row = {
  id: 'app1', user_id: 'u1', company_name: 'Acme', contact_name: 'Jane', contact_email: 'jane@acme.example',
  website_url: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
  decided_at: null, decision_reason: null, created_at: '2026-07-03T00:00:00Z',
}

describe('listPendingMerchantApplications', () => {
  it('maps snake_case rows to camelCase', async () => {
    const rows = await listPendingMerchantApplications(fakeSupabase([row]))
    expect(rows).toEqual([{
      id: 'app1', userId: 'u1', companyName: 'Acme', contactName: 'Jane', contactEmail: 'jane@acme.example',
      websiteUrl: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
      decidedAt: null, decisionReason: null, createdAt: '2026-07-03T00:00:00Z',
    }])
  })

  it('propagates errors', async () => {
    await expect(listPendingMerchantApplications(fakeSupabase([], { message: 'boom' }))).rejects.toBeTruthy()
  })
})

describe('listDecidedMerchantApplications', () => {
  it('maps rows the same way', async () => {
    const decided = { ...row, id: 'app2', status: 'approved', decided_at: '2026-07-03T01:00:00Z', decision_reason: 'looks great' }
    const rows = await listDecidedMerchantApplications(fakeSupabase([decided]))
    expect(rows[0].status).toBe('approved')
    expect(rows[0].decisionReason).toBe('looks great')
  })
})
