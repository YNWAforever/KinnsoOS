import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecentMessages, appendMessage, countUserMessagesToday, archiveThread } from '@/lib/copilot/queries'

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  count: 0,
  lastInsert: null as unknown,
  lastUpdate: null as unknown,
  filters: [] as Array<[string, unknown]>,
  countFilters: [] as Array<[string, unknown]>,
}))

function makeClient() {
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: unknown) => { state.lastInsert = v; return Promise.resolve({ error: null }) },
    update: (v: unknown) => { state.lastUpdate = v; return b },
    eq: (col: string, val: unknown) => { state.filters.push([col, val]); return b },
    gte: (col: string, val: unknown) => { state.filters.push([col, val]); return b },
    order: () => b,
    limit: () => Promise.resolve({ data: state.rows }),
  }
  // count head-select resolves after chaining eq/gte; captures args for assertion
  const countB: Record<string, unknown> = {
    select: () => countB,
    eq: (col: string, val: unknown) => { state.countFilters.push([col, val]); return countB },
    gte: (col: string, val: unknown) => { state.countFilters.push([col, val]); return Promise.resolve({ count: state.count }) },
  }
  return {
    from: (table: string) => {
      void table
      // archiveThread chains update().eq().eq() and must resolve; getRecentMessages chains to limit();
      // countUserMessagesToday chains select(head)->eq->gte. Use a permissive builder.
      return {
        ...b,
        select: (_cols?: unknown, opts?: { head?: boolean }) => (opts?.head ? countB : b),
        update: (v: unknown) => {
          state.lastUpdate = v
          const u: Record<string, unknown> = {
            eq: (col: string, val: unknown) => { state.filters.push([col, val]); return u },
            then: (r: (x: unknown) => void) => r({ error: null }),
          }
          return u
        },
      }
    },
  }
}

beforeEach(() => { state.rows = []; state.count = 0; state.lastInsert = null; state.lastUpdate = null; state.filters = []; state.countFilters = [] })

describe('copilot queries', () => {
  it('getRecentMessages returns rows', async () => {
    state.rows = [{ id: 'm1', role: 'user', content: 'hi', created_at: 't' }]
    const out = await getRecentMessages(makeClient() as never, 'c1')
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('hi')
  })

  it('getRecentMessages filters to archived=false', async () => {
    state.rows = []
    await getRecentMessages(makeClient() as never, 'c1')
    expect(state.filters).toContainEqual(['archived', false])
  })

  it('getRecentMessages sorts oldest-first and puts the user prompt before its assistant reply on created_at ties', async () => {
    // Deliberately unsorted; a plain .reverse() would yield the wrong order here.
    state.rows = [
      { id: 'x', role: 'user', content: 'q', created_at: '2026-01-01T00:00:01Z' },
      { id: 'y', role: 'assistant', content: 'reply', created_at: '2026-01-01T00:00:02Z' },
      { id: 'z', role: 'assistant', content: 'a', created_at: '2026-01-01T00:00:01Z' },
    ]
    const out = await getRecentMessages(makeClient() as never, 'c1')
    expect(out.map((m) => m.content)).toEqual(['q', 'a', 'reply'])
  })

  it('appendMessage inserts the creator_id, role and content', async () => {
    await appendMessage(makeClient() as never, 'c1', 'assistant', 'hello')
    expect(state.lastInsert).toMatchObject({ creator_id: 'c1', role: 'assistant', content: 'hello' })
  })

  it('countUserMessagesToday returns the count', async () => {
    state.count = 7
    expect(await countUserMessagesToday(makeClient() as never, 'c1')).toBe(7)
  })

  it('countUserMessagesToday filters by creatorId, user role, and UTC midnight — but NOT by archived (quota survives New chat)', async () => {
    state.count = 3
    const before = new Date()
    const expectedStartIso = new Date(Date.UTC(before.getUTCFullYear(), before.getUTCMonth(), before.getUTCDate())).toISOString()
    await countUserMessagesToday(makeClient() as never, 'c1')
    // creator_id and role=user must be eq filters
    expect(state.countFilters).toContainEqual(['creator_id', 'c1'])
    expect(state.countFilters).toContainEqual(['role', 'user'])
    // archived MUST NOT be a filter — the daily cap is a cost ceiling that a "New chat"
    // (which archives the thread) must not be able to reset.
    expect(state.countFilters).not.toContainEqual(['archived', false])
    // the gte filter must be the UTC-midnight ISO string
    const gteEntry = state.countFilters.find(([col]) => col === 'created_at')
    expect(gteEntry).toBeDefined()
    expect(gteEntry![1]).toBe(expectedStartIso)
  })

  it('archiveThread sets archived true', async () => {
    await archiveThread(makeClient() as never, 'c1')
    expect(state.lastUpdate).toEqual({ archived: true })
  })
})
