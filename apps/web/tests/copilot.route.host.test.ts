import { describe, it, expect, vi, beforeEach } from 'vitest'

const { streamTextMock, getUserMock, roleMock, tierMock, countMock, appendMock, configuredMock, dnaRow } = vi.hoisted(() => ({
  streamTextMock: vi.fn(() => ({ toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'creator-1' } } })),
  roleMock: vi.fn(async () => 'creator'),
  tierMock: vi.fn(async () => 'rising'),
  countMock: vi.fn(async () => 0),
  appendMock: vi.fn(async () => {}),
  configuredMock: vi.fn(() => true),
  dnaRow: {
    bio: 'b', niches: ['japan'], content_pillars: ['food'], tone: ['warm'],
    audience: { top_locales: ['en'] }, platforms: [], languages: ['en'],
  },
}))

vi.mock('ai', () => ({
  streamText: streamTextMock,
  stepCountIs: (n: number) => n,
  convertToModelMessages: (m: unknown) => m,
}))
vi.mock('@/lib/copilot/config', () => ({ isCopilotConfigured: configuredMock }))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/contribution/queries', () => ({ getCreatorStoredTier: tierMock }))
vi.mock('@/lib/copilot/queries', () => ({ countUserMessagesToday: countMock, appendMessage: appendMock }))
vi.mock('@/lib/copilot/tools/n8n', () => ({ makeN8nTool: () => ({ __tool: true }) }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { final: dnaRow } }) }) }) }),
  }),
}))

import { POST } from '@/app/api/copilot/route'

function req(body: unknown) {
  return new Request('http://localhost/api/copilot', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  streamTextMock.mockClear(); roleMock.mockResolvedValue('creator')
  tierMock.mockResolvedValue('rising'); countMock.mockResolvedValue(0)
  configuredMock.mockReturnValue(true)
})

describe('POST /api/copilot', () => {
  it('401s an unauthenticated request', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(401)
  })

  it('403s a non-creator', async () => {
    roleMock.mockResolvedValueOnce('merchant')
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(403)
  })

  it('429s when the daily limit is reached', async () => {
    countMock.mockResolvedValueOnce(999)
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en' }))
    expect(res.status).toBe(429)
  })

  it('streams for an in-limit creator and passes a DNA system prompt', async () => {
    const res = await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'ideas?' }] }], locale: 'en' }))
    expect(res.status).toBe(200)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { system: string; tools: Record<string, unknown> }
    expect(arg.system).toContain('japan')
    expect(Object.keys(arg.tools)).toContain('n8n') // rising unlocks the tool
  })

  it('omits the n8n tool for seed creators', async () => {
    tierMock.mockResolvedValueOnce('seed')
    await POST(req({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }], locale: 'en' }))
    const arg = (streamTextMock.mock.calls[0] as unknown[])[0] as { tools: Record<string, unknown> }
    expect(Object.keys(arg.tools)).toHaveLength(0)
  })

  it('503s when the gateway is unconfigured', async () => {
    configuredMock.mockReturnValueOnce(false)
    const res = await POST(req({ messages: [], locale: 'en' }))
    expect(res.status).toBe(503)
  })
})
