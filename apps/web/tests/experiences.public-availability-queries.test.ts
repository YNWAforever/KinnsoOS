// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ from: fromMock }),
}))

import { listPublicAvailability } from '@/lib/experiences/public-availability-queries'

beforeEach(() => fromMock.mockReset())

describe('listPublicAvailability', () => {
  it('maps rows to camelCase and computes remaining capacity', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const order = vi.fn(() => Promise.resolve({
      data: [{ id: 'a1', date: '2026-08-01', capacity: 10, booked_count: 3 }],
      error: null,
    }))
    const gte = vi.fn(() => ({ order }))
    const eq2 = vi.fn(() => ({ gte }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    fromMock.mockReturnValue({ select })

    const rows = await listPublicAvailability('exp1')

    expect(fromMock).toHaveBeenCalledWith('experience_availability')
    expect(eq1).toHaveBeenCalledWith('experience_id', 'exp1')
    expect(eq2).toHaveBeenCalledWith('status', 'open')
    expect(gte).toHaveBeenCalledWith('date', today)
    expect(rows).toEqual([{ id: 'a1', date: '2026-08-01', remaining: 7 }])
  })

  it('clamps remaining to zero rather than going negative', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const order = vi.fn(() => Promise.resolve({
      data: [{ id: 'a1', date: '2026-08-01', capacity: 5, booked_count: 5 }],
      error: null,
    }))
    const gte = vi.fn(() => ({ order }))
    const eq2 = vi.fn(() => ({ gte }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    fromMock.mockReturnValue({ select })

    const rows = await listPublicAvailability('exp1')

    expect(fromMock).toHaveBeenCalledWith('experience_availability')
    expect(eq1).toHaveBeenCalledWith('experience_id', 'exp1')
    expect(eq2).toHaveBeenCalledWith('status', 'open')
    expect(gte).toHaveBeenCalledWith('date', today)
    expect(rows[0].remaining).toBe(0)
  })

  it('propagates errors', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const order = vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }))
    const gte = vi.fn(() => ({ order }))
    const eq2 = vi.fn(() => ({ gte }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    fromMock.mockReturnValue({ select })

    await expect(listPublicAvailability('exp1')).rejects.toBeTruthy()

    expect(fromMock).toHaveBeenCalledWith('experience_availability')
    expect(eq1).toHaveBeenCalledWith('experience_id', 'exp1')
    expect(eq2).toHaveBeenCalledWith('status', 'open')
    expect(gte).toHaveBeenCalledWith('date', today)
  })
})
