import { beforeEach, describe, expect, it, vi } from 'vitest'

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }))
vi.mock('next/headers', () => ({ headers: headersMock }))

import { getClientIp } from '@/lib/http/client-ip'

beforeEach(() => headersMock.mockReset())

describe('getClientIp Vercel proxy contract', () => {
  it('uses the first Vercel x-forwarded-for hop', async () => {
    headersMock.mockResolvedValue(new Headers({
      'x-forwarded-for': '203.0.113.8, 10.0.0.1',
      'x-real-ip': '198.51.100.2',
    }))
    await expect(getClientIp()).resolves.toBe('203.0.113.8')
  })

  it('falls back to x-real-ip and then the shared unknown bucket', async () => {
    headersMock.mockResolvedValueOnce(new Headers({ 'x-real-ip': '198.51.100.2' }))
    await expect(getClientIp()).resolves.toBe('198.51.100.2')
    headersMock.mockResolvedValueOnce(new Headers())
    await expect(getClientIp()).resolves.toBe('unknown')
  })
})
