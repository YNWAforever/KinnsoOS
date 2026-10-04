import { describe, it, expect, vi, beforeEach } from 'vitest'

const { streamTextMock, createSupabaseServerClientMock, getUserMock, rpcMock, getClientIpMock, configuredMock, configuredStateMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(() => ({ toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) })),
  createSupabaseServerClientMock: vi.fn(),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  getClientIpMock: vi.fn(async () => '1.2.3.4'),
  configuredMock: vi.fn(() => true),
  configuredStateMock: vi.fn(() => ({ agentLive: true, bookingLive: false })),
}))

vi.mock('ai', () => ({
  streamText: streamTextMock,
  stepCountIs: (n: number) => n,
  convertToModelMessages: (m: unknown) => m,
  tool: (def: unknown) => def,
}))
vi.mock('@/lib/agent/config', () => ({ isAgentConfigured: configuredMock }))
vi.mock('@/lib/product-state', () => ({ resolveConfiguredProductState: configuredStateMock }))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/agent/queries', () => ({ appendAgentMessage: vi.fn(async () => {}) }))
vi.mock('@/lib/agent/tools', () => ({ makeAgentTools: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import { POST } from '@/app/api/agent/route'

function req(body: unknown) {
  return new Request('http://localhost/api/agent', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  streamTextMock.mockClear()
  configuredStateMock.mockClear()
  getUserMock.mockResolvedValue({ data: { user: null } })
  rpcMock.mockResolvedValue({ data: true, error: null })
  configuredMock.mockReturnValue(true)
  configuredStateMock.mockReturnValue({ agentLive: true, bookingLive: false })
  createSupabaseServerClientMock.mockClear()
  createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser: getUserMock }, rpc: rpcMock })
})

describe('POST /api/agent', () => {
  it('returns a stable 503 before request, configuration, auth, model, tools, or persistence work when Agent is OFF', async () => {
    configuredStateMock.mockReturnValueOnce({ agentLive: false, bookingLive: false })
    const jsonMock = vi.fn(async () => ({ messages: [] }))
    const res = await POST({ json: jsonMock } as unknown as Request)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'agent_unavailable' })
    expect(jsonMock).not.toHaveBeenCalled()
    expect(configuredMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(getClientIpMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(streamTextMock).not.toHaveBeenCalled()
  })
  it('503s when the gateway is unconfigured', async () => {
    configuredMock.mockReturnValueOnce(false)
    const res = await POST(req({ messages: [], locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }))
    expect(res.status).toBe(503)
  })

  it('400s when anon and no anonSessionId is provided', async () => {
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(400)
  })

  it('429s when the IP rate limit is exceeded', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }))
    expect(res.status).toBe(429)
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('streams for an anon caller with a valid anonSessionId, rate-limit passing', async () => {
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'plan a Tokyo trip' }] }], locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('check_and_increment_agent_rate_limit', { p_ip: '1.2.3.4', p_max_requests: 20, p_window_seconds: 3600 })
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { model: string; system: string }
    expect(arg.model).toBe('anthropic/claude-haiku-4.5')
    expect(arg.system).toContain('Do not claim that an experience can be booked directly on KINNSO')
    expect(arg.system).toContain('save recommendations')
    expect(arg.system).toContain('booking opens soon')
    expect(configuredStateMock).toHaveBeenCalledTimes(1)
  })

  it('allows direct-booking language in the system prompt when Booking is ON', async () => {
    configuredStateMock.mockReturnValueOnce({ agentLive: true, bookingLive: true })
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'find a Tokyo experience' }] }], locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }))
    expect(res.status).toBe(200)
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { system: string }
    expect(arg.system).toContain('can be booked directly on KINNSO')
    expect(arg.system).not.toContain('Do not claim that an experience can be booked directly on KINNSO')
    expect(configuredStateMock).toHaveBeenCalledTimes(1)
  })

  it('streams for a signed-in traveller without requiring anonSessionId', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'traveler-1' } } } as never)
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en' }))
    expect(res.status).toBe(200)
  })

  it('400s when the anon session id is not a uuid (the column type)', async () => {
    const res = await POST(req({ messages: [], locale: 'en', anonSessionId: 'sess-1' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'missing_anon_session_id' })
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('413s — without calling the model — when too many messages are posted', async () => {
    const messages = Array.from({ length: 101 }, () => ({
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    }))
    const res = await POST(
      req({ messages, locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }),
    )
    expect(res.status).toBe(413)
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it('413s — without calling the model — when the conversation text is oversized', async () => {
    const messages = [{ role: 'user', parts: [{ type: 'text', text: 'x'.repeat(50_001) }] }]
    const res = await POST(
      req({ messages, locale: 'en', anonSessionId: '11111111-2222-4333-8444-555555555555' }),
    )
    expect(res.status).toBe(413)
    expect(streamTextMock).not.toHaveBeenCalled()
  })
})
