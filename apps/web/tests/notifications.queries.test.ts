import { describe, expect, it, vi } from 'vitest'
import { getNotifications, getUnreadNotificationCount } from '@/lib/notifications/queries'

function client(raw: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data: raw, error })) }
}

const raw = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

describe('getNotifications', () => {
  it('maps rows through unchanged (RPC already returns camelCase)', async () => {
    const supabase = client(raw)
    const result = await getNotifications(supabase as never)
    expect(result).toEqual(raw)
    expect(supabase.rpc).toHaveBeenCalledWith('notifications_mine')
  })

  it('returns an empty array for null data', async () => {
    const supabase = client(null)
    expect(await getNotifications(supabase as never)).toEqual([])
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getNotifications(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})

describe('getUnreadNotificationCount', () => {
  it('returns the RPC value directly', async () => {
    const supabase = client(3)
    expect(await getUnreadNotificationCount(supabase as never)).toBe(3)
    expect(supabase.rpc).toHaveBeenCalledWith('notifications_unread_count')
  })

  it('returns 0 for null data', async () => {
    const supabase = client(null)
    expect(await getUnreadNotificationCount(supabase as never)).toBe(0)
  })

  it('propagates an RPC error', async () => {
    const supabase = client(null, { message: 'forbidden' })
    await expect(getUnreadNotificationCount(supabase as never)).rejects.toEqual({ message: 'forbidden' })
  })
})
