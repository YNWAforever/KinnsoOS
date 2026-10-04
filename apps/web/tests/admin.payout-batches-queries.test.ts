import { describe, expect, it, vi } from 'vitest'
import { getPayoutBatches } from '@/lib/admin/payout-batches-queries'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) }
}

const raw = [
  {
    id: 'b1', creator_id: 'c1', creator_name: 'May Chan', currency: 'HKD', amount: '1500.00',
    status: 'pending', target_at: '2026-08-23T00:00:00Z', created_at: '2026-08-16T00:00:00Z',
    paid_at: null, cancelled_at: null,
  },
]

describe('getPayoutBatches', () => {
  it('maps rows and coerces the numeric amount', async () => {
    const supabase = client(raw)
    const result = await getPayoutBatches(supabase as never)
    expect(result).toEqual([
      {
        id: 'b1', creatorId: 'c1', creatorName: 'May Chan', currency: 'HKD', amount: 1500,
        status: 'pending', targetAt: '2026-08-23T00:00:00Z', createdAt: '2026-08-16T00:00:00Z',
        paidAt: null, cancelledAt: null,
      },
    ])
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_payout_batches', { p_status: null })
  })

  it('forwards a status filter', async () => {
    const supabase = client([])
    await getPayoutBatches(supabase as never, 'paid')
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_payout_batches', { p_status: 'paid' })
  })

  it('returns an empty array for null data', async () => {
    const supabase = client(null)
    expect(await getPayoutBatches(supabase as never)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getPayoutBatches(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})
