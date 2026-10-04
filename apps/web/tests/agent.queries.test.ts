import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appendAgentMessage, getAgentMessages } from '@/lib/agent/queries'

const state = vi.hoisted(() => ({ lastInsert: null as unknown, rows: [] as unknown[], filters: [] as Array<[string, unknown]> }))

function makeClient() {
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: unknown) => { state.lastInsert = v; return Promise.resolve({ error: null }) },
    eq: (col: string, val: unknown) => { state.filters.push([col, val]); return b },
    order: () => b,
    limit: () => Promise.resolve({ data: state.rows }),
  }
  return { from: () => b }
}

beforeEach(() => { state.lastInsert = null; state.rows = []; state.filters = [] })

describe('appendAgentMessage', () => {
  it('inserts a traveler_user_id-keyed row when signed in', async () => {
    await appendAgentMessage(makeClient() as never, { travelerUserId: 'u1' }, 'user', 'hi')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: 'u1', anon_session_id: null, role: 'user', content: 'hi' })
  })

  it('inserts an anon_session_id-keyed row when anon', async () => {
    await appendAgentMessage(makeClient() as never, { anonSessionId: 'session-1' }, 'assistant', 'hello')
    expect(state.lastInsert).toMatchObject({ traveler_user_id: null, anon_session_id: 'session-1', role: 'assistant', content: 'hello' })
  })

  it('throws a descriptive error when the insert fails', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) }
    await expect(appendAgentMessage(client as never, { travelerUserId: 'u1' }, 'user', 'hi')).rejects.toThrow(/appendAgentMessage failed/)
  })
})

describe('getAgentMessages', () => {
  it('returns rows', async () => {
    state.rows = [{ id: 'm1', role: 'user', content: 'hi', created_at: 't' }]
    const out = await getAgentMessages(makeClient() as never, 'traveler-1')
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('hi')
  })

  it('filters by traveler_user_id', async () => {
    await getAgentMessages(makeClient() as never, 'traveler-1')
    expect(state.filters).toContainEqual(['traveler_user_id', 'traveler-1'])
  })

  it('sorts oldest-first and puts the user prompt before its assistant reply on created_at ties', async () => {
    // Deliberately unsorted; a plain .reverse() would yield the wrong order here.
    state.rows = [
      { id: 'x', role: 'user', content: 'q', created_at: '2026-01-01T00:00:01Z' },
      { id: 'y', role: 'assistant', content: 'reply', created_at: '2026-01-01T00:00:02Z' },
      { id: 'z', role: 'assistant', content: 'a', created_at: '2026-01-01T00:00:01Z' },
    ]
    const out = await getAgentMessages(makeClient() as never, 'traveler-1')
    expect(out.map((m) => m.content)).toEqual(['q', 'a', 'reply'])
  })

  it('returns an empty array when there are no rows', async () => {
    state.rows = []
    const out = await getAgentMessages(makeClient() as never, 'traveler-1')
    expect(out).toEqual([])
  })
})
