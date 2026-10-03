// apps/web/tests/admin.sessions-queries.test.ts
import { describe, it, expect, vi } from 'vitest'
import { listAllSessions, listSessionRsvps, listCreatorsForHostPicker } from '@/lib/admin/sessions-queries'

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finalValue).then(resolve)
  return builder
}

describe('listAllSessions', () => {
  it('orders by starts_at descending and includes cancelled rows (ops sees everything)', async () => {
    const sessionsChain = chain({ data: [], error: null })
    const supabase = { from: vi.fn(() => sessionsChain) }
    await listAllSessions(supabase as never)
    expect(sessionsChain.order).toHaveBeenCalledWith('starts_at', { ascending: false })
  })

  it('throws on a real error rather than silently returning []', async () => {
    const supabase = { from: vi.fn(() => chain({ data: null, error: new Error('boom') })) }
    await expect(listAllSessions(supabase as never)).rejects.toThrow()
  })
})

describe('listSessionRsvps', () => {
  it('filters to the given session id', async () => {
    const rsvpChain = chain({ data: [], error: null })
    const supabase = { from: vi.fn(() => rsvpChain) }
    await listSessionRsvps(supabase as never, 'sess-1')
    expect(rsvpChain.eq).toHaveBeenCalledWith('session_id', 'sess-1')
  })
})

describe('listCreatorsForHostPicker', () => {
  it('returns id/handle/display_name for the ops host-picker dropdown', async () => {
    const creatorsChain = chain({ data: [{ id: 'c1', handle: 'sora', display_name: 'Sora' }], error: null })
    const supabase = { from: vi.fn(() => creatorsChain) }
    const result = await listCreatorsForHostPicker(supabase as never)
    expect(result).toEqual([{ id: 'c1', handle: 'sora', displayName: 'Sora' }])
  })
})
