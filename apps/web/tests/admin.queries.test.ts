import { describe, it, expect } from 'vitest'
import { getAdminOverview } from '@/lib/admin/queries'

type Row = { creators: number; merchants: number; ops: number; perks_active: number; perks_total: number; redemptions: number }

/** Mocks supabase.rpc('admin_overview_counts').single() returning { data, error }. */
function client(row: Row | null, error: unknown = null) {
  return {
    rpc: () => ({
      single: async () => ({ data: row, error }),
    }),
  }
}

describe('getAdminOverview', () => {
  it('returns creators/merchants/ops counts from the admin_overview_counts RPC', async () => {
    const o = await getAdminOverview(client({ creators: 3, merchants: 2, ops: 1, perks_active: 4, perks_total: 6, redemptions: 9 }) as never)
    expect(o).toEqual({ creators: 3, merchants: 2, ops: 1, perksActive: 4, perksTotal: 6, redemptions: 9 })
  })
  it('throws when the RPC errors (no silent zeros)', async () => {
    await expect(getAdminOverview(client(null, { message: 'forbidden' }) as never)).rejects.toBeTruthy()
  })
})
