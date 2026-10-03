import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, createServerClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createServerClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: createServerClientMock }))

import { rateAgentMessageAction } from '@/lib/agent/actions'

beforeEach(() => {
  rpcMock.mockReset()
  createServerClientMock.mockReset()
  createServerClientMock.mockResolvedValue({ rpc: rpcMock })
})

describe('rateAgentMessageAction', () => {
  it('calls rate_agent_message with the message id, rating, and anonSessionId', async () => {
    rpcMock.mockResolvedValue({ error: null })
    const result = await rateAgentMessageAction('msg-1', 'up', 'sess-1')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('rate_agent_message', {
      p_message_id: 'msg-1', p_rating: 'up', p_anon_session_id: 'sess-1',
    })
  })

  it('passes null for anonSessionId when signed in (no session id available)', async () => {
    rpcMock.mockResolvedValue({ error: null })
    await rateAgentMessageAction('msg-1', 'down', null)
    expect(rpcMock).toHaveBeenCalledWith('rate_agent_message', {
      p_message_id: 'msg-1', p_rating: 'down', p_anon_session_id: null,
    })
  })

  it('returns ok:false on an RPC error, without throwing', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'forbidden' } })
    const result = await rateAgentMessageAction('msg-1', 'up', 'sess-1')
    expect(result.ok).toBe(false)
  })
})
