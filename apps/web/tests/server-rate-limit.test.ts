import { afterEach, describe, expect, it, vi } from 'vitest'

const { headersMock, createClientMock } = vi.hoisted(() => ({ headersMock: vi.fn(), createClientMock: vi.fn() }))
vi.mock('next/headers', () => ({ headers: headersMock }))
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

import { checkServerRateLimit } from '@/lib/http/server-rate-limit'

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })

describe('trusted quota boundary', () => {
  it('uses isolated service auth and the overwritten Vercel IP; ignores spoofable fallbacks', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-secret')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54421')
    headersMock.mockResolvedValue(new Headers({ 'x-vercel-forwarded-for': '198.51.100.4', 'x-forwarded-for': '203.0.113.99' }))
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    createClientMock.mockReturnValue({ rpc })
    await expect(checkServerRateLimit('agent')).resolves.toEqual({ allowed: true, failed: false })
    expect(createClientMock).toHaveBeenCalledWith('http://127.0.0.1:54421', 'test-server-secret', { auth: { persistSession: false, autoRefreshToken: false } })
    expect(rpc).toHaveBeenCalledWith('check_and_increment_agent_rate_limit', { p_ip: '198.51.100.4', p_max_requests: 20, p_window_seconds: 3600 })
  })

  it.each(['non-Vercel', 'missing trusted header', 'malformed trusted header'])('uses a shared bucket for %s', async (mode) => {
    vi.stubEnv('VERCEL', mode === 'non-Vercel' ? '' : '1')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-secret')
    const h = new Headers({ 'x-forwarded-for': '203.0.113.99', 'x-real-ip': '203.0.113.98' })
    if (mode !== 'missing trusted header') h.set('x-vercel-forwarded-for', mode === 'non-Vercel' ? '203.0.113.97' : 'victim-bucket')
    headersMock.mockResolvedValue(h)
    const rpc = vi.fn(async () => ({ data: false, error: null }))
    createClientMock.mockReturnValue({ rpc })
    await expect(checkServerRateLimit('checkout')).resolves.toEqual({ allowed: false, failed: false })
    expect(rpc).toHaveBeenCalledWith('check_and_increment_checkout_rate_limit', { p_ip: 'unknown', p_max_requests: 5, p_window_seconds: 600 })
  })

  it('fails closed before creating a client when the service key is absent', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    await expect(checkServerRateLimit('agent')).resolves.toEqual({ allowed: false, failed: true })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
