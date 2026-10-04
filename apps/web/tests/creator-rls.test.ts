import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// -------------------------------------------------------------------
// Self-skip when service_role key is absent (local runs without the
// key exported). Mirrors rpc.test.ts skip pattern.
// -------------------------------------------------------------------
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const d = svcKey ? describe : describe.skip

// Two clients: anon (no auth) and service_role (admin, bypasses RLS)
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
const svc  = createClient(process.env.SUPABASE_URL!, svcKey ?? 'missing')

// Test identity — email must not collide with seed.sql or any persistent fixture
const TEST_EMAIL    = 'sp2-rls-creator@example.test'
const TEST_PASSWORD = 'Test1234!'

let userId = ''

// -------------------------------------------------------------------
d('creator schema RLS', () => {
  // ── Setup: create an auth user (triggers handle_new_user → creators row) ──
  beforeAll(async () => {
    // Delete any leftover from a previous aborted run so the test is idempotent
    const existing = await svc.auth.admin.listUsers()
    const prev = (existing.data?.users ?? []).find((u) => u.email === TEST_EMAIL)
    if (prev) {
      await svc.auth.admin.deleteUser(prev.id)
    }

    const { data, error } = await svc.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    expect(error, `createUser failed: ${error?.message}`).toBeNull()
    userId = data.user!.id
  })

  // ── Teardown: delete the auth user (cascades to all creator_* rows) ──
  afterAll(async () => {
    if (userId) {
      await svc.auth.admin.deleteUser(userId)
    }
  })

  // ────────────────────────────────────────────────────────────────────
  // 1. Bootstrap trigger creates a creators row on auth user creation
  // ────────────────────────────────────────────────────────────────────
  it('handle_new_user trigger creates a creators row on sign-up', async () => {
    const { data, error } = await svc
      .from('creators')
      .select('id, status')
      .eq('id', userId)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.id).toBe(userId)
    expect(data!.status).toBe('onboarding')
  })

  // ────────────────────────────────────────────────────────────────────
  // 2. Anon cannot read the private onboarding creator or private creator tables
  // ────────────────────────────────────────────────────────────────────
  it('anon cannot read the private onboarding creator', async () => {
    const { data, error } = await anon.from('creators').select('id').eq('id', userId)
    // Published public profiles are intentionally anon-readable. The newly
    // created onboarding row must still be filtered by RLS.
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('anon cannot read creator_social_handles', async () => {
    const { data, error } = await anon.from('creator_social_handles').select('id')
    expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(true)
  })

  it('anon cannot read creator_scan_jobs', async () => {
    const { data, error } = await anon.from('creator_scan_jobs').select('id')
    expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(true)
  })

  it('anon cannot read creator_dna', async () => {
    const { data, error } = await anon.from('creator_dna').select('id')
    expect(error === null ? (data ?? []).length === 0 : /permission denied|42501/i.test(error.message)).toBe(true)
  })

  // ────────────────────────────────────────────────────────────────────
  // 3. Owner (signed-in user) sees only their own rows
  // ────────────────────────────────────────────────────────────────────
  it('owner can read their own creators row', async () => {
    // Sign in as the created user to get a session
    const { data: session, error: signInError } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    expect(signInError).toBeNull()
    const accessToken = session.session!.access_token

    // Authenticated client using owner's JWT
    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { data, error } = await owner
      .from('creators')
      .select('id, status')
      .eq('id', userId)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(userId)

    // Sign out (cleanup session, not strictly necessary but tidy)
    await anon.auth.signOut()
  })

  it('owner can update their own display_name', async () => {
    const { data: session, error: signInError } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    expect(signInError).toBeNull()
    const accessToken = session.session!.access_token

    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { error } = await owner
      .from('creators')
      .update({ display_name: 'SP2 Test Creator' })
      .eq('id', userId)

    expect(error).toBeNull()

    // Confirm the update took effect
    const { data } = await owner.from('creators').select('display_name').eq('id', userId).single()
    expect(data!.display_name).toBe('SP2 Test Creator')

    await anon.auth.signOut()
  })

  // ────────────────────────────────────────────────────────────────────
  // 3b. Trust columns: an owner may finish onboarding, but may not moderate
  //     themselves (status out of suspended/banned, or the verified badge).
  // ────────────────────────────────────────────────────────────────────
  async function ownerClient() {
    const { data: session } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
    })
  }

  it('owner can complete onboarding themselves (onboarding → active)', async () => {
    await svc.from('creators').update({ status: 'onboarding' }).eq('id', userId)
    const owner = await ownerClient()

    const { error } = await owner.from('creators').update({ status: 'active' }).eq('id', userId)
    expect(error).toBeNull()

    const { data } = await svc.from('creators').select('status').eq('id', userId).single()
    expect(data!.status).toBe('active')
    await anon.auth.signOut()
  })

  it('owner cannot award themselves the verified badge', async () => {
    const owner = await ownerClient()

    const { error } = await owner.from('creators').update({ verified: true }).eq('id', userId)
    expect(error).not.toBeNull()

    const { data } = await svc.from('creators').select('verified').eq('id', userId).single()
    expect(data!.verified).toBe(false)
    await anon.auth.signOut()
  })

  it('a suspended owner cannot restore their own status', async () => {
    await svc.from('creators').update({ status: 'suspended' }).eq('id', userId)
    const owner = await ownerClient()

    const { error } = await owner.from('creators').update({ status: 'active' }).eq('id', userId)
    expect(error).not.toBeNull()

    const { data } = await svc.from('creators').select('status').eq('id', userId).single()
    expect(data!.status).toBe('suspended')

    // Leave the fixture active for any later assertions in this file.
    await svc.from('creators').update({ status: 'active' }).eq('id', userId)
    await anon.auth.signOut()
  })

  // ────────────────────────────────────────────────────────────────────
  // 4. creator_scan_jobs: service_role can insert; owner cannot
  // ────────────────────────────────────────────────────────────────────
  it('service_role can insert a creator_scan_jobs row', async () => {
    const { data, error } = await svc
      .from('creator_scan_jobs')
      .insert({ creator_id: userId, status: 'queued' })
      .select('id, status')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.status).toBe('queued')
  })

  it('owner cannot insert into creator_scan_jobs (no INSERT policy)', async () => {
    const { data: session } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    const accessToken = session.session!.access_token

    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    const { error } = await owner
      .from('creator_scan_jobs')
      .insert({ creator_id: userId, status: 'queued' })

    // PostgREST returns 42501 (insufficient_privilege) or a new-row-violates-policy error
    // when there is no INSERT RLS policy and RLS is enabled.
    expect(error).not.toBeNull()

    await anon.auth.signOut()
  })

  it('owner can read their own creator_scan_jobs rows', async () => {
    const { data: session } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    const accessToken = session.session!.access_token

    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    // The service_role insert in the previous test created at least one job
    const { data, error } = await owner.from('creator_scan_jobs').select('id, status')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
    expect(data!.every((r) => r.status === 'queued')).toBe(true)

    await anon.auth.signOut()
  })

  // ────────────────────────────────────────────────────────────────────
  // 5. creator_social_handles: owner CRUD works
  // ────────────────────────────────────────────────────────────────────
  it('owner can insert, read, update, and delete a creator_social_handles row', async () => {
    const { data: session } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    const accessToken = session.session!.access_token

    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    // INSERT — the bare handle, which is the only form the app ever stores:
    // validateHandle() runs raw input through normalizeHandle(), stripping a
    // leading '@' and reducing a profile URL to its last path segment, and
    // HandlesStep persists that normalized value. handleUrl() adds the '@' back
    // for display, and the scan worker re-adds it when calling YouTube.
    const { data: inserted, error: insertError } = await owner
      .from('creator_social_handles')
      .insert({ creator_id: userId, platform: 'instagram', handle: 'sp2test' })
      .select('id, handle')
      .single()

    expect(insertError).toBeNull()
    expect(inserted).not.toBeNull()
    const handleId = inserted!.id

    // SELECT — should see the row just inserted
    const { data: selected } = await owner
      .from('creator_social_handles')
      .select('id, handle')
      .eq('id', handleId)
      .single()
    expect(selected!.handle).toBe('sp2test')

    // UPDATE
    const { error: updateError } = await owner
      .from('creator_social_handles')
      .update({ handle: 'sp2test_updated' })
      .eq('id', handleId)
    expect(updateError).toBeNull()

    // DELETE
    const { error: deleteError } = await owner
      .from('creator_social_handles')
      .delete()
      .eq('id', handleId)
    expect(deleteError).toBeNull()

    // Confirm deletion
    const { data: afterDelete } = await owner
      .from('creator_social_handles')
      .select('id')
      .eq('id', handleId)
    expect((afterDelete ?? []).length).toBe(0)

    await anon.auth.signOut()
  })

  it('rejects a handle that could be read as a URL or another profile', async () => {
    // The handle is forwarded to RapidAPI as `username_or_url`, a field that
    // accepts a full profile URL — so a stored URL would scan someone else's
    // account. normalizeHandle() strips these client-side, but the browser
    // writes to PostgREST directly, so the constraint is the real boundary.
    const owner = await ownerClient()

    for (const handle of [
      'https://instagram.com/someone-else',
      'instagram.com/someone-else',
      '@sp2test',
      'has space',
      'a'.repeat(31),
      '',
    ]) {
      const { error } = await owner
        .from('creator_social_handles')
        .insert({ creator_id: userId, platform: 'instagram', handle })
        .select('id')
      expect(error, `handle ${JSON.stringify(handle)} should have been rejected`).not.toBeNull()
      expect(error!.code).toBe('23514')
    }

    await anon.auth.signOut()
  })

  // ────────────────────────────────────────────────────────────────────
  // 6. creator_dna: service_role inserts; owner can read + update final
  // ────────────────────────────────────────────────────────────────────
  it('service_role can insert a creator_dna row', async () => {
    const { data, error } = await svc
      .from('creator_dna')
      .insert({ creator_id: userId, status: 'draft', ai_draft: { tone: 'adventurous' } })
      .select('id, status, ai_draft')
      .single()

    expect(error).toBeNull()
    expect(data!.status).toBe('draft')
  })

  it('owner can read their creator_dna row and update the final field', async () => {
    const { data: session } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })
    const accessToken = session.session!.access_token

    const owner = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })

    // Read
    const { data: dnaRows, error: readError } = await owner
      .from('creator_dna')
      .select('id, status, ai_draft')
      .eq('creator_id', userId)
    expect(readError).toBeNull()
    expect((dnaRows ?? []).length).toBe(1)
    const dnaId = dnaRows![0].id

    // Update final field (status stays 'draft' so no published constraint violation)
    const { error: updateError } = await owner
      .from('creator_dna')
      .update({ final: { headline: 'My Creator Bio' } })
      .eq('id', dnaId)
    expect(updateError).toBeNull()

    await anon.auth.signOut()
  })

  it('published creator_dna without final is rejected by check constraint', async () => {
    // service_role bypasses RLS but NOT check constraints
    const { error } = await svc
      .from('creator_dna')
      .insert({ creator_id: userId, status: 'published' })
      // final is intentionally omitted → check (status <> 'published' or final is not null) fires
    expect(error).not.toBeNull()
    // Postgres error code 23514 = check_violation
    expect(error!.code).toBe('23514')
  })
})
