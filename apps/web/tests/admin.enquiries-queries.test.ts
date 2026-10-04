// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { listAdminEnquiries } from '@/lib/admin/enquiries-queries'

const row = {
  id: '11111111-1111-4111-8111-111111111111', type: 'creator_collab', name: 'Visitor', email: 'visitor@example.test',
  message: 'I would like to collaborate on a city guide.', status: 'new',
  created_at: '2026-07-26T10:00:00.000Z', updated_at: '2026-07-26T10:00:00.000Z',
  target_id: '22222222-2222-4222-8222-222222222222', target_name: 'Mei', target_slug: 'mei-travels',
}

function client(data: unknown = [row], error: unknown = null) {
  const rpc = vi.fn(async (...args: unknown[]) => ({ data, error }))
  return { supabase: { rpc }, rpc }
}

describe('listAdminEnquiries', () => {
  it('uses only the narrow queue RPC with the active default filter', async () => {
    const { supabase, rpc } = client()
    await expect(listAdminEnquiries(supabase as never, { status: 'active', type: 'all' })).resolves.toEqual([{
      id: row.id, type: 'creator_collab', name: 'Visitor', email: 'visitor@example.test',
      message: row.message, status: 'new', createdAt: row.created_at, updatedAt: row.updated_at,
      targetId: row.target_id, targetName: 'Mei', targetSlug: 'mei-travels',
    }])
    expect(rpc).toHaveBeenCalledWith('admin_list_enquiries', {
      p_status_group: 'active', p_type: undefined, p_limit: 26, p_cursor_created_at: undefined, p_cursor_id: undefined,
    })
  })

  it('passes only approved enum filters to the RPC', async () => {
    const { supabase, rpc } = client([])
    await listAdminEnquiries(supabase as never, { status: 'spam', type: 'merchant_contact' })
    expect(rpc).toHaveBeenCalledWith('admin_list_enquiries', expect.objectContaining({
      p_status_group: 'spam', p_type: 'merchant_contact',
    }))
  })

  it('maps a queue failure without including row payloads in the thrown error', async () => {
    const { supabase } = client(null, { code: '42501', message: 'sensitive database detail' })
    await expect(listAdminEnquiries(supabase as never, { status: 'active', type: 'all' }))
      .rejects.toThrow('Unable to load enquiries')
  })
  it('forwards a complete keyset cursor with the bounded lookahead limit', async () => {
    const { supabase, rpc } = client([])
    await listAdminEnquiries(supabase as never, { status: 'resolved', type: 'creator_collab' }, {
      createdAt: '2026-07-26T10:00:00.000Z', id: row.id,
    })
    expect(rpc).toHaveBeenCalledWith('admin_list_enquiries', {
      p_status_group: 'resolved', p_type: 'creator_collab', p_limit: 26,
      p_cursor_created_at: '2026-07-26T10:00:00.000Z', p_cursor_id: row.id,
    })
  })
})
