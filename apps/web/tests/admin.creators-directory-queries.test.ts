import { describe, it, expect, vi } from 'vitest'
import { listCreatorsDirectory } from '@/lib/admin/creators-queries'

const rows = [
  { id: 'c1', display_name: 'Mia', handle: 'mia', status: 'active', verified: true, tier: 'pro', dna_status: 'published', contribution_points: 320, created_at: '2026-06-28T10:00:00Z' },
  { id: 'c2', display_name: null, handle: 'lee', status: 'suspended', verified: false, tier: null, dna_status: null, contribution_points: 0, created_at: '2026-06-27T10:00:00Z' },
]

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn(async () => ({ data, error })) }
}

describe('listCreatorsDirectory', () => {
  it('maps rows to camelCase and forwards filters to the RPC', async () => {
    const c = client(rows)
    const out = await listCreatorsDirectory(c as never, { search: 'm', statuses: ['active'], tiers: ['pro'], dna: 'published', verified: true, limit: 2 })
    expect(c.rpc).toHaveBeenCalledWith('admin_search_creators', {
      p_search: 'm', p_statuses: ['active'], p_tiers: ['pro'], p_dna: 'published',
      p_verified: true, p_limit: 2, p_cursor_created_at: null, p_cursor_id: null,
    })
    expect(out.rows[0]).toEqual({
      id: 'c1', displayName: 'Mia', handle: 'mia', status: 'active', verified: true,
      tier: 'pro', dnaStatus: 'published', contributionPoints: 320, createdAt: '2026-06-28T10:00:00Z',
    })
  })
  it('sets nextCursor when a full page is returned, null otherwise', async () => {
    const full = await listCreatorsDirectory(client(rows) as never, { limit: 2 })
    expect(full.nextCursor).toEqual({ createdAt: '2026-06-27T10:00:00Z', id: 'c2' })
    const partial = await listCreatorsDirectory(client([rows[0]]) as never, { limit: 2 })
    expect(partial.nextCursor).toBeNull()
  })
  it('passes the cursor through for the next page', async () => {
    const c = client([])
    await listCreatorsDirectory(c as never, { limit: 2, cursor: { createdAt: '2026-06-27T10:00:00Z', id: 'c2' } })
    expect(c.rpc).toHaveBeenCalledWith('admin_search_creators', expect.objectContaining({
      p_cursor_created_at: '2026-06-27T10:00:00Z', p_cursor_id: 'c2',
    }))
  })
  it('throws when the RPC errors (no silent empty)', async () => {
    await expect(listCreatorsDirectory(client(null, { message: 'forbidden' }) as never, {})).rejects.toBeTruthy()
  })
})
