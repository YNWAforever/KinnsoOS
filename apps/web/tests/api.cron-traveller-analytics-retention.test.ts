// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, createServiceClientMock } = vi.hoisted(() => {
  const rpcMock = vi.fn(async () => ({
    data: null,
    error: null as { code: string; details: string | null; hint: string | null; message: string } | null,
  }))
  const createServiceClientMock = vi.fn(() => ({ rpc: rpcMock }))
  return { rpcMock, createServiceClientMock }
})

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: createServiceClientMock,
}))

import { GET } from '@/app/api/cron/traveller-analytics-retention/route'

const makeReq = (bearer?: string) =>
  new Request('http://x/api/cron/traveller-analytics-retention', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  rpcMock.mockResolvedValue({ data: null, error: null })
  createServiceClientMock.mockReturnValue({ rpc: rpcMock })
})

describe('GET /api/cron/traveller-analytics-retention', () => {
  it("401s without the Authorization: Bearer <CRON_SECRET> header (Vercel Cron's real invocation shape)", async () => {
    const res = await GET(makeReq())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' })
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('401s with the wrong secret', async () => {
    const res = await GET(makeReq('wrong'))

    expect(res.status).toBe(401)
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('invokes the service-role purge function and returns generic success', async () => {
    const res = await GET(makeReq('s3cret'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(createServiceClientMock).toHaveBeenCalledOnce()
    expect(rpcMock).toHaveBeenCalledWith('purge_traveller_analytics_events')
  })

  it('returns a generic 500 without exposing database details when the purge RPC fails', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '42501', details: 'secret database detail', hint: null, message: 'permission denied' },
    })

    const res = await GET(makeReq('s3cret'))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ ok: false, error: 'retention failed' })
    expect(JSON.stringify(body)).not.toContain('secret database detail')
    expect(JSON.stringify(body)).not.toContain('permission denied')
  })

  it('returns a generic 500 when creating or calling the service client throws', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('service key should never reach the response')
    })

    const res = await GET(makeReq('s3cret'))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ ok: false, error: 'retention failed' })
    expect(JSON.stringify(body)).not.toContain('service key')
  })
})
