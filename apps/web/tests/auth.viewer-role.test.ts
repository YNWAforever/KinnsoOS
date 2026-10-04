// apps/web/tests/auth.viewer-role.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { resolveViewerRole } from '@/lib/auth/viewer-role'

type Row = Record<string, unknown> | null

function fakeSupabase(opts: {
  user: { id: string } | null
  ops?: Row
  merchant?: Row
  creator?: Row
  handle?: Row
  handleError?: Error
  errors?: Record<string, unknown>
  getUser?: ReturnType<typeof vi.fn>
}) {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data:
          table === 'kinnso_ops_members' ? (opts.ops ?? null)
          : table === 'merchant_profiles' ? (opts.merchant ?? null)
          : table === 'creators' ? (opts.creator ?? null)
          : table === 'creator_social_handles' ? (opts.handle ?? null)
          : null,
        error:
          table === 'creator_social_handles'
            ? (opts.handleError ?? opts.errors?.[table] ?? null)
            : (opts.errors?.[table] ?? null),
      }),
    }
    return builder
  }
  return {
    auth: {
      getUser: opts.getUser ?? vi.fn(async () => ({ data: { user: opts.user } })),
    },
    from,
  } as never
}

describe('resolveViewerRole', () => {
  it('returns anon when there is no session', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: null }))
    expect(role).toBe('anon')
  })

  it('returns ops for an active ops member, even with a merchant profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, ops: { id: 'ops1' }, merchant: { id: 'm1' } }),
    )
    expect(role).toBe('ops')
  })

  it('returns merchant for a user with a merchant profile', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' }, merchant: { id: 'm1' } }))
    expect(role).toBe('merchant')
  })

  it('uses a verified user id without a second auth lookup', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null } }))
    const supabase = fakeSupabase({
      user: null,
      merchant: { id: 'm1' },
      getUser,
    })

    const role = await resolveViewerRole(supabase, 'u1')

    expect(role).toBe('merchant')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('returns creator for a user with an active creator profile', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'active' } }),
    )
    expect(role).toBe('creator')
  })

  it('returns traveler for a user whose creator profile is still onboarding', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({ user: { id: 'u1' }, creator: { status: 'onboarding' } }),
    )
    expect(role).toBe('traveler')
  })

  it('returns creator-pending for an onboarding creator with a saved handle', async () => {
    const role = await resolveViewerRole(
      fakeSupabase({
        user: { id: 'u1' },
        creator: { status: 'onboarding' },
        handle: { id: 'handle-1' },
      }),
    )
    expect(role).toBe('creator-pending')
  })

  it('fails closed when the onboarding creator handle query errors', async () => {
    await expect(
      resolveViewerRole(
        fakeSupabase({
          user: { id: 'u1' },
          creator: { status: 'onboarding' },
          handleError: new Error('handle read failed'),
        }),
      ),
    ).rejects.toThrow('Unable to determine authorization context')
  })

  it('returns traveler for a user with no creators row at all', async () => {
    const role = await resolveViewerRole(fakeSupabase({ user: { id: 'u1' } }))
    expect(role).toBe('traveler')
  })

  it('rejects with a generic authorization-context error when role facts are indeterminate', async () => {
    await expect(
      resolveViewerRole(
        fakeSupabase({
          user: { id: 'u1' },
          errors: { creators: new Error('creator read failed') },
        }),
      ),
    ).rejects.toThrow('Unable to determine authorization context')
  })
})
