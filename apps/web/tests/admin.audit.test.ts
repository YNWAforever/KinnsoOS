import { describe, it, expect } from 'vitest'
import { listAudit, listRecentAudit } from '@/lib/admin/audit'

type Row = {
  id: string; entity_type: string; entity_id: string; action: string
  reason: string | null; metadata: Record<string, unknown>; created_at: string
}

/** Mocks the supabase query builder chain used by the audit readers. */
function client(rows: Row[] | null, error: unknown = null) {
  const calls: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    select() { return builder },
    eq(col: string, val: unknown) { calls[col] = val; return builder },
    order() { return builder },
    async limit() { return { data: rows, error } },
  }
  return { from: (t: string) => { calls.from = t; return builder }, _calls: calls }
}

const row: Row = {
  id: 'a1', entity_type: 'creator', entity_id: 'c1', action: 'status.suspend',
  reason: 'spam', metadata: { from: 'active', to: 'suspended' }, created_at: '2026-06-28T00:00:00Z',
}

describe('listAudit', () => {
  it('maps rows to camelCase AuditEntry objects', async () => {
    const out = await listAudit(client([row]) as never, 'creator', 'c1')
    expect(out).toEqual([{
      id: 'a1', entityType: 'creator', entityId: 'c1', action: 'status.suspend',
      reason: 'spam', metadata: { from: 'active', to: 'suspended' }, createdAt: '2026-06-28T00:00:00Z',
    }])
  })
  it('returns [] when the table is empty', async () => {
    expect(await listAudit(client([]) as never, 'creator', 'c1')).toEqual([])
  })
  it('throws when the query errors (no silent empty)', async () => {
    await expect(listAudit(client(null, { message: 'boom' }) as never, 'creator', 'c1')).rejects.toBeTruthy()
  })
})

describe('listRecentAudit', () => {
  it('maps the cross-entity feed rows', async () => {
    const out = await listRecentAudit(client([row]) as never, 'creator', 5)
    expect(out[0].action).toBe('status.suspend')
  })
})
