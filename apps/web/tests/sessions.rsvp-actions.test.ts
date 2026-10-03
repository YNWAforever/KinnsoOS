// apps/web/tests/sessions.rsvp-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUserMock, rpcMock, insertMock, selectSessionMock, getClientIpMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } })),
  rpcMock: vi.fn(async (): Promise<{ data: boolean | null; error: { message: string } | null }> => ({ data: true, error: null })),
  insertMock: vi.fn(async (): Promise<{ error: { code: string; message: string } | null }> => ({ error: null })),
  selectSessionMock: vi.fn(async (): Promise<{ data: { status: string } | null; error: { message: string } | null }> => ({
    data: { status: 'scheduled' }, error: null,
  })),
  getClientIpMock: vi.fn(async () => '203.0.113.5'),
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: (table: string) => (
      table === 'community_sessions'
        ? { select: () => ({ eq: () => ({ maybeSingle: selectSessionMock }) }) }
        : { insert: insertMock }
    ),
  }),
}))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))

import { rsvpToSessionAction } from '@/lib/sessions/rsvp-actions'

beforeEach(() => {
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: true, error: null })
  insertMock.mockReset()
  insertMock.mockResolvedValue({ error: null })
  selectSessionMock.mockReset()
  selectSessionMock.mockResolvedValue({ data: { status: 'scheduled' }, error: null })
  getClientIpMock.mockClear()
})

describe('rsvpToSessionAction', () => {
  it('returns a fake success without inserting when the honeypot is filled', async () => {
    const result = await rsvpToSessionAction('sess-1', 'bot@example.com', 'filled')
    expect(result).toEqual({ ok: true })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without inserting or rate-limit-checking', async () => {
    const result = await rsvpToSessionAction('sess-1', 'not-an-email')
    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('checks the rate limit with the real client IP before inserting', async () => {
    await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_rsvp_rate_limit', {
      p_ip: '203.0.113.5', p_max_requests: 10, p_window_seconds: 3600,
    })
  })

  it('returns rate_limited and never inserts when the RPC disallows', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'rate_limited' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts with user_id: null for an anon caller', async () => {
    await rsvpToSessionAction('sess-1', 'Traveller@Example.com  ')
    expect(insertMock).toHaveBeenCalledWith({ session_id: 'sess-1', email: 'traveller@example.com', user_id: null })
  })

  it('inserts with the signed-in user_id when the caller is authenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })
    await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(insertMock).toHaveBeenCalledWith({ session_id: 'sess-1', email: 'traveller@example.com', user_id: 'traveler-1' })
  })

  it('treats a unique-violation (23505) as success, not a failure', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: true })
  })

  it('returns failed on any other insert error', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '23503', message: 'fk violation' } })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'failed' })
  })

  it('rejects and does not insert when the target session has been cancelled', async () => {
    selectSessionMock.mockResolvedValueOnce({ data: { status: 'cancelled' }, error: null })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'cancelled' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects when the target session does not exist', async () => {
    selectSessionMock.mockResolvedValueOnce({ data: null, error: null })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'cancelled' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('checks the session status before inserting for a scheduled/live/ended session', async () => {
    await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(selectSessionMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalled()
  })

  it('returns failed and does not insert when the session status lookup itself errors', async () => {
    selectSessionMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await rsvpToSessionAction('sess-1', 'traveller@example.com')
    expect(result).toEqual({ ok: false, error: 'failed' })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
