// apps/web/tests/admin.sessions-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionInput } from '@/lib/sessions/types'

const { requireOpsActionMock, fromMock } = vi.hoisted(() => ({
  requireOpsActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'ops1' },
  })),
  fromMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: requireOpsActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { adminCreateSessionAction, adminSetSessionStatusAction, adminDeleteSessionAction } from '@/lib/admin/sessions-actions'

const validInput: SessionInput = {
  title: 'Merchant spotlight: Kyoto tea house', description: 'Meet the team.', type: 'merchant_spotlight',
  startsAt: '2027-02-01T10:00:00.000Z', durationMinutes: '30', embedUrl: '', replayUrl: '', destinationTags: 'Kyoto',
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => { requireOpsActionMock.mockClear(); fromMock.mockReset() })

describe('adminCreateSessionAction', () => {
  it('fails the gate for a non-ops caller', async () => {
    requireOpsActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const result = await adminCreateSessionAction('en', 'creator-9', validInput)
    expect(result.ok).toBe(false)
  })

  it('inserts with host_creator_id = the picked creator, not the ops caller', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1', slug: 'merchant-spotlight-abc' }, error: null }))
    await adminCreateSessionAction('en', 'creator-9', validInput)
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.host_creator_id).toBe('creator-9')
  })
})

describe('adminSetSessionStatusAction', () => {
  it('can cancel any session regardless of host, without an embed_url check', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1' }, error: null }))
    const result = await adminSetSessionStatusAction('en', 'sess-1', 'cancelled')
    expect(result.ok).toBe(true)
  })

  it('still refuses to go live without an embed_url', async () => {
    fromMock.mockReturnValue(chain({ data: { embed_url: null }, error: null }))
    const result = await adminSetSessionStatusAction('en', 'sess-1', 'live')
    expect(result.ok).toBe(false)
  })
})

describe('adminDeleteSessionAction', () => {
  it('deletes any session (no host scope)', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1' }, error: null }))
    const result = await adminDeleteSessionAction('en', 'sess-1')
    expect(result.ok).toBe(true)
  })
})
