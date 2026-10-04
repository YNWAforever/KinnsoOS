import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUserMock, rpcMock, insertMock, createServiceClientMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
  insertMock: vi.fn(async () => ({ error: null })),
  createServiceClientMock: vi.fn(() => ({ from: () => ({ insert: insertMock }) })),
}))
vi.mock('@/lib/http/client-ip', () => ({ getClientIp: async () => '203.0.113.9' }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: createServiceClientMock }))

import { joinSessionWaitlistAction } from '@/lib/sessions/waitlist-actions'

beforeEach(() => {
  getUserMock.mockClear()
  rpcMock.mockClear()
  insertMock.mockClear()
  createServiceClientMock.mockClear()
})

describe('session waitlist service construction order', () => {
  it('constructs the privileged client once and only after SSR getUser for allowed input', async () => {
    await expect(joinSessionWaitlistAction('en', ' Traveller@Example.COM ')).resolves.toEqual({ ok: true })
    expect(getUserMock).toHaveBeenCalledOnce()
    expect(createServiceClientMock).toHaveBeenCalledOnce()
    expect(getUserMock.mock.invocationCallOrder[0]).toBeLessThan(createServiceClientMock.mock.invocationCallOrder[0])
    expect(insertMock).toHaveBeenCalledWith({ email: 'traveller@example.com', user_id: null, locale: 'en' })
  })
})
