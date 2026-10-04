import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Integration test — verifies that the Plan 1a SECURITY DEFINER trigger
 * automatically creates a `creators` row when a new auth.users row is inserted.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS + auth.admin access).
 * Skips cleanly when the key is absent (shared hosted project / local dev).
 */

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const d = svcKey ? describe : describe.skip

// Service-role client — bypasses RLS.
const svc = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  svcKey ?? 'missing',
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// Track created user ids so we clean up after the test.
const createdUserIds: string[] = []

d('creators row creation trigger', () => {
  afterAll(async () => {
    // Clean up: delete the test user from auth.users.
    // This will also cascade-delete (or be handled by) the creators row
    // depending on the FK on_delete policy defined in Plan 1a.
    for (const id of createdUserIds) {
      await svc.auth.admin.deleteUser(id)
    }
  })

  it('creates a creators row automatically when auth.users row is inserted', async () => {
    // Create a real auth user via admin API (equivalent to a sign-up).
    const email = `trigger-test-${Date.now()}@kinnso-test.example`
    const { data: userData, error: createError } = await svc.auth.admin.createUser({
      email,
      password: 'TestPass1234!',
      email_confirm: true, // skip email verification for the test
    })

    expect(createError).toBeNull()
    expect(userData.user).not.toBeNull()

    const userId = userData.user!.id
    createdUserIds.push(userId)

    // The trigger should have fired synchronously (AFTER INSERT).
    // Query the creators row using the service-role client (bypasses RLS).
    const { data: creator, error: selectError } = await svc
      .from('creators')
      .select('id, status')
      .eq('id', userId)
      .single()

    expect(selectError).toBeNull()
    expect(creator).not.toBeNull()
    expect(creator!.id).toBe(userId)
    // The trigger sets status = 'onboarding' by default (Plan 1a schema).
    expect(creator!.status).toBe('onboarding')
  })

  it('does not expose the creators row to anon (RLS)', async () => {
    // Create a second test user.
    const email = `trigger-rls-test-${Date.now()}@kinnso-test.example`
    const { data: userData } = await svc.auth.admin.createUser({
      email,
      password: 'TestPass1234!',
      email_confirm: true,
    })
    const userId = userData.user!.id
    createdUserIds.push(userId)

    // Anon client cannot read another user's creators row (RLS: owner-only).
    const anon = createClient(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data } = await anon
      .from('creators')
      .select('id')
      .eq('id', userId)

    // RLS should return an empty array (not an error; just no rows).
    expect(data ?? []).toHaveLength(0)
  })
})
