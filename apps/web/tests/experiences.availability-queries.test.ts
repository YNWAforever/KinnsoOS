// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { listExperienceAvailability } from '@/lib/experiences/availability-queries'

function fakeSupabase(rows: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: rows, error }) }),
      }),
    }),
  } as never
}

const row = { id: 'a1', date: '2026-08-01', capacity: 10, booked_count: 2, status: 'open' }

describe('listExperienceAvailability', () => {
  it('maps snake_case rows to camelCase', async () => {
    const rows = await listExperienceAvailability(fakeSupabase([row]), 'exp1')
    expect(rows).toEqual([{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 2, status: 'open' }])
  })

  it('propagates errors', async () => {
    await expect(listExperienceAvailability(fakeSupabase([], { message: 'boom' }), 'exp1')).rejects.toBeTruthy()
  })
})
