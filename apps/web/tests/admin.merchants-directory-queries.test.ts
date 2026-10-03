import { describe, it, expect, vi, beforeEach } from 'vitest'
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
import { listMerchantsDirectory } from '@/lib/admin/merchants-queries'
const client = { rpc: rpcMock } as never
beforeEach(() => rpcMock.mockReset())

describe('listMerchantsDirectory', () => {
  it('forwards filters + keyset cursor and maps rows', async () => {
    rpcMock.mockResolvedValue({ data: [
      { id: 'm1', company_name: 'Acme', status: 'active', tier: 'growth', created_at: '2026-06-30T00:00:00Z' },
    ], error: null })
    const res = await listMerchantsDirectory(client, { search: 'ac', statuses: ['active'], tiers: ['growth'], limit: 25 })
    expect(rpcMock).toHaveBeenCalledWith('admin_search_merchants', expect.objectContaining({
      p_search: 'ac', p_statuses: ['active'], p_tiers: ['growth'], p_limit: 26, p_cursor_created_at: null, p_cursor_id: null,
    }))
    expect(res.rows[0]).toEqual({ id: 'm1', companyName: 'Acme', status: 'active', tier: 'growth', createdAt: '2026-06-30T00:00:00Z' })
    expect(res.nextCursor).toBeNull()
  })
  it('sets nextCursor when a full page+1 returns and trims to the page', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ id: `m${i}`, company_name: `c${i}`, status: 'active', tier: 'free', created_at: `2026-06-${(i % 28) + 1}T00:00:00Z` }))
    rpcMock.mockResolvedValue({ data: rows, error: null })
    const res = await listMerchantsDirectory(client, { limit: 25 })
    expect(res.rows).toHaveLength(25)
    expect(res.nextCursor).toEqual({ createdAt: rows[24].created_at, id: rows[24].id })
  })
  it('throws on RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    await expect(listMerchantsDirectory(client, {})).rejects.toBeTruthy()
  })
})
