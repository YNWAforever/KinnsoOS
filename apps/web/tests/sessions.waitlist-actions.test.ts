// apps/web/tests/sessions.waitlist-actions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, rpcMock, insertMock, getClientIpMock, createServiceClientMock, serverFromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async (): Promise<{ data: { user: { id: string } | null } }> => ({
    data: { user: null },
  })),
  rpcMock: vi.fn(async (): Promise<{ data: boolean | null; error: { message: string } | null }> => ({
    data: true,
    error: null,
  })),
  insertMock: vi.fn(async (): Promise<{ error: { code?: string; message: string } | null }> => ({
    error: null,
  })),
  getClientIpMock: vi.fn(async () => '203.0.113.9'),
  createServiceClientMock: vi.fn(() => ({ from: () => ({ insert: insertMock }) })),
  serverFromMock: vi.fn(() => { throw new Error('waitlist writes must not use the request-scoped client') }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: serverFromMock,
  }),
}))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: createServiceClientMock }))

import { joinSessionWaitlistAction } from '@/lib/sessions/waitlist-actions'

beforeEach(() => {
  getUserMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: true, error: null })
  insertMock.mockReset()
  insertMock.mockResolvedValue({ error: null })
  getClientIpMock.mockClear()
  createServiceClientMock.mockClear()
  serverFromMock.mockClear()
})

describe('joinSessionWaitlistAction', () => {
  it('returns fake success without an RPC or insert when the honeypot is filled', async () => {
    const result = await joinSessionWaitlistAction('en', 'bot@example.com', 'filled')

    expect(result).toEqual({ ok: true })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('rejects an unsupported locale before rate limiting or inserting', async () => {
    const result = await joinSessionWaitlistAction('id', 'traveller@example.com')

    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before rate limiting or inserting', async () => {
    const result = await joinSessionWaitlistAction('en', 'not-an-email')

    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('uses the real client IP and the shared 10 per hour rate-limit bucket', async () => {
    await joinSessionWaitlistAction('zh-tw', 'traveller@example.com')

    expect(getClientIpMock).toHaveBeenCalledOnce()
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_rsvp_rate_limit', {
      p_ip: '203.0.113.9',
      p_max_requests: 10,
      p_window_seconds: 3600,
    })
  })

  it('returns rate_limited without constructing a privileged client when the RPC disallows', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })

    const result = await joinSessionWaitlistAction('en', 'traveller@example.com')

    expect(result).toEqual({ ok: false, error: 'rate_limited' })
    expect(insertMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('normalizes the email and inserts through the trusted service boundary', async () => {
    await joinSessionWaitlistAction('zh-hk', ' Traveller@Example.COM  ')

    expect(insertMock).toHaveBeenCalledWith({
      email: 'traveller@example.com',
      user_id: null,
      locale: 'zh-hk',
    })
    expect(createServiceClientMock).toHaveBeenCalledOnce()
    expect(serverFromMock).not.toHaveBeenCalled()
  })

  it('attaches the signed-in user id', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } })

    await joinSessionWaitlistAction('ja', 'traveller@example.com')

    expect(insertMock).toHaveBeenCalledWith({
      email: 'traveller@example.com',
      user_id: 'traveler-1',
      locale: 'ja',
    })
  })

  it('treats a unique violation as success', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } })

    await expect(joinSessionWaitlistAction('ko', 'traveller@example.com')).resolves.toEqual({ ok: true })
  })

  it('returns a private failed result when the rate-limit RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'raw rpc details' } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)

    const result = await joinSessionWaitlistAction('th', 'traveller@example.com')

    expect(result).toEqual({ ok: false, error: 'failed' })
    expect(JSON.stringify(result)).not.toContain('raw rpc details')
    expect(insertMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('returns a private failed result for non-duplicate insert errors', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '42501', message: 'raw insert details' } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)

    const result = await joinSessionWaitlistAction('zh-cn', 'traveller@example.com')

    expect(result).toEqual({ ok: false, error: 'failed' })
    expect(JSON.stringify(result)).not.toContain('raw insert details')
  })
})
