import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000
const svc = createClient(url, svcKey ?? 'missing')
const anon = createClient(url, anonKey)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!waitlist'
const insertedEmails: string[] = []
let authenticatedUserId = ''

d('R7.5 session waitlist trusted write boundary (live Postgres)', () => {
  beforeAll(async () => {
    const created = await svc.auth.admin.createUser({
      email: `r75-waitlist-${runId}@example.test`,
      password,
      email_confirm: true,
    })
    expect(created.error, `createUser failed: ${created.error?.message}`).toBeNull()
    authenticatedUserId = created.data.user!.id
  }, hookTimeout)

  afterAll(async () => {
    if (insertedEmails.length > 0) await svc.from('session_waitlist').delete().in('email', insertedEmails)
    if (authenticatedUserId) await svc.auth.admin.deleteUser(authenticatedUserId)
  }, hookTimeout)

  it('denies a direct anonymous Data API insert', async () => {
    const email = `r75-anon-${runId}@example.test`
    const { error } = await anon.from('session_waitlist').insert({ email, user_id: null, locale: 'en' })
    expect(error).not.toBeNull()
  }, testTimeout)

  it('denies a direct authenticated Data API insert', async () => {
    const signedIn = await anon.auth.signInWithPassword({
      email: `r75-waitlist-${runId}@example.test`,
      password,
    })
    expect(signedIn.error, `sign-in failed: ${signedIn.error?.message}`).toBeNull()
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${signedIn.data.session!.access_token}` } },
    })
    const email = `r75-auth-${runId}@example.test`
    const { error } = await authed.from('session_waitlist').insert({ email, user_id: authenticatedUserId, locale: 'en' })
    expect(error).not.toBeNull()
  }, testTimeout)

  it('allows only the server-held service role to append, and retains the unique-email idempotency constraint', async () => {
    const email = `r75-service-${runId}@example.test`
    const first = await svc.from('session_waitlist').insert({ email, user_id: null, locale: 'en' })
    expect(first.error).toBeNull()
    insertedEmails.push(email)

    const duplicate = await svc.from('session_waitlist').insert({ email, user_id: null, locale: 'en' })
    expect(duplicate.error?.code).toBe('23505')
  }, testTimeout)
})
