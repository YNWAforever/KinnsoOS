import { describe, it, expect, vi } from 'vitest'
import { listAdminUsers } from '@/lib/admin/users-queries'

function clientWith(map: Record<string, { data: unknown; error: unknown }>) {
  return { rpc: vi.fn((name: string) => Promise.resolve(map[name])) } as never
}

describe('listAdminUsers', () => {
  it('returns the three lists from their RPCs', async () => {
    const c = clientWith({
      admin_list_creators: { data: [{ id: 'c1', display_name: 'A', handle: 'a', status: 'active', created_at: 't' }], error: null },
      admin_list_merchants: { data: [{ id: 'm1', company_name: 'M', contact_email: 'e', status: 'active', tier: 'growth', created_at: 't' }], error: null },
      admin_list_ops: { data: [{ id: 'o1', user_id: 'u1', display_name: 'O', status: 'active', created_at: 't' }], error: null },
    })
    const r = await listAdminUsers(c)
    expect(r.creators).toHaveLength(1)
    expect(r.merchants[0].company_name).toBe('M')
    expect(r.merchants[0].tier).toBe('growth')
    expect('contact_email' in r.merchants[0]).toBe(false)
    expect(r.ops[0].display_name).toBe('O')
  })
  it('throws when a list RPC errors (no silent empty)', async () => {
    const c = clientWith({
      admin_list_creators: { data: null, error: { message: 'forbidden' } },
      admin_list_merchants: { data: [], error: null },
      admin_list_ops: { data: [], error: null },
    })
    await expect(listAdminUsers(c)).rejects.toBeTruthy()
  })
})
