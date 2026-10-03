// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getAuthorizationContext } from '@/lib/auth/authorization-context'

type Row = Record<string, unknown> | null

function fakeSupabase(options: {
  user: { id: string } | null
  rows?: Record<string, Row>
  errors?: Record<string, unknown>
}) {
  const getUser = vi.fn(async () => ({ data: { user: options.user }, error: null }))
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data: options.rows?.[table] ?? null,
        error: options.errors?.[table] ?? null,
      }),
    }
    return builder
  })

  return {
    supabase: { auth: { getUser }, from } as never,
    getUser,
    from,
  }
}

describe('getAuthorizationContext', () => {
  it('returns anon without querying role tables when there is no session', async () => {
    const { supabase, from } = fakeSupabase({ user: null })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: null,
      role: 'anon',
      merchantId: null,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('preserves Ops precedence and retains the merchant ID when all role facts resolve', async () => {
    const { supabase, getUser } = fakeSupabase({
      user: { id: 'u1' },
      rows: {
        kinnso_ops_members: { id: 'ops-1' },
        merchant_profiles: { id: 'merchant-1' },
        creators: { status: 'active' },
      },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'ops',
      merchantId: 'merchant-1',
    })
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the Ops fact query errors even if merchant and creator facts exist', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: {
        merchant_profiles: { id: 'merchant-1' },
        creators: { status: 'active' },
      },
      errors: { kinnso_ops_members: new Error('ops read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'indeterminate',
      merchantId: null,
    })
  })

  it('fails closed when the merchant fact query errors even if a creator fact exists', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: { creators: { status: 'active' } },
      errors: { merchant_profiles: new Error('merchant read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'indeterminate',
      merchantId: null,
    })
  })

  it('fails closed when the creator fact query errors', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: { merchant_profiles: { id: 'merchant-1' } },
      errors: { creators: new Error('creator read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'indeterminate',
      merchantId: null,
    })
  })

  it('returns creator-pending for an onboarding creator with a saved handle', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: {
        creators: { status: 'onboarding' },
        creator_social_handles: { id: 'handle-1' },
      },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'creator-pending',
      merchantId: null,
    })
  })

  it('fails closed when the onboarding creator handle query errors', async () => {
    const { supabase } = fakeSupabase({
      user: { id: 'u1' },
      rows: { creators: { status: 'onboarding' } },
      errors: { creator_social_handles: new Error('handle read failed') },
    })

    await expect(getAuthorizationContext(supabase)).resolves.toEqual({
      user: { id: 'u1' },
      role: 'indeterminate',
      merchantId: null,
    })
  })
})
