import { beforeEach, describe, expect, it, vi } from 'vitest'

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }))
vi.mock('next/headers', () => ({ headers: headersMock }))

import { getClientIp } from '@/lib/http/client-ip'

beforeEach(() => headersMock.mockReset())

describe('getClientIp trusted Vercel identity', () => {
  it('prefers x-vercel-forwarded-for when a conflicting x-forwarded-for is present', async () => {
    headersMock.mockResolvedValue(new Headers({
      'x-vercel-forwarded-for': '198.51.100.7',
      'x-forwarded-for': '203.0.113.250, 10.0.0.1',
      'x-real-ip': '203.0.113.251',
    }))

    await expect(getClientIp()).resolves.toBe('198.51.100.7')
  })
})
