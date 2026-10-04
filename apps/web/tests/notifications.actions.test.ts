import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: deviates from the plan's originally-sketched test, which mocked only
// '@/lib/supabase/server' with a minimal `from` stub and expected
// requireCreatorAction to work off of it directly. In reality
// requireCreatorAction (lib/admin/guard.ts) calls resolveViewerRole
// (lib/auth/viewer-role.ts), which issues its own `.from(...).select(...)`
// role-lookup queries (kinnso_ops_members / merchant_profiles / creators)
// that a minimal `{ update: ... }` stub can't satisfy -- it throws
// "supabase.from(...).select is not a function". The established fix in this
// codebase (see apps/web/tests/sessions.studio-actions.test.ts) is to mock
// '@/lib/admin/guard' directly instead of simulating the real role-resolution
// query chain, which is what this test does. The `from` mock also follows
// that same file's `chain()` builder pattern (vi.fn()-based, not plain
// closures) so tests can assert exactly which columns/values reached
// .update()/.eq() -- a plain-closure chain can't see whether the
// defense-in-depth `.eq('creator_id', ...)` filter is still present.
const { fromMock, requireCreatorActionMock, revalidatePathMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireCreatorActionMock: vi.fn(async (): Promise<
    { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }
  > => ({ ok: true, user: { id: 'c1' } })),
  revalidatePathMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: requireCreatorActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))

import { markNotificationReadAction } from '@/lib/notifications/actions'

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['update', 'eq', 'select']) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => {
  fromMock.mockReset()
  requireCreatorActionMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'c1' } })
  revalidatePathMock.mockClear()
})

describe('markNotificationReadAction', () => {
  it('succeeds for a signed-in creator', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'n1' }, error: null }))
    const res = await markNotificationReadAction('en', 'n1')
    expect(res).toEqual({ ok: true, id: 'n1' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/studio/inbox')
  })

  it('scopes the update to the gated creator (id and creator_id eq)', async () => {
    const writeChain = chain({ data: { id: 'n1' }, error: null })
    fromMock.mockReturnValue(writeChain)
    await markNotificationReadAction('en', 'n1')
    const eqMock = writeChain.eq as ReturnType<typeof vi.fn>
    expect(eqMock).toHaveBeenNthCalledWith(1, 'id', 'n1')
    expect(eqMock).toHaveBeenNthCalledWith(2, 'creator_id', 'c1')
  })

  it('fails when signed out', async () => {
    requireCreatorActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Sign in is required'] } })
    const res = await markNotificationReadAction('en', 'n1')
    expect(res.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('fails when no row matches (stale id, already deleted, or wrong creator)', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }))
    const res = await markNotificationReadAction('en', 'n1')
    expect(res.ok).toBe(false)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
