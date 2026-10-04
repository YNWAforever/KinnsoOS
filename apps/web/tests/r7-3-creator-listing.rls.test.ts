import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { resolveR73LocalLiveConfig } from './helpers/r7-3-local-live-config'

const liveConfig = resolveR73LocalLiveConfig(process.env)
const d = liveConfig ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000

// Fail closed: generic Supabase credentials never construct a client. The
// dedicated opt-in and loopback URL validation happen inside the resolver first.
const svc = liveConfig ? createClient(liveConfig.url, liveConfig.serviceRoleKey) : null

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_production_honesty.sql'))
const migrationSql = migrationFile ? readFileSync(join(migrationsDir, migrationFile), 'utf8') : ''
const recomputeSql = migrationSql.match(/update public\.guides g[\s\S]*?;\r?\n/)?.[0] ?? ''

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!r73'
const ownerEmail = `r7-3-listing-owner-${runId}@example.test`
const opsEmail = `r7-3-listing-ops-${runId}@example.test`

let ownerId = ''
let opsUserId = ''
let opsMemberId = ''
let guideId = ''

async function authedClient(email: string) {
  if (!liveConfig) throw new Error('R7.3 local live-test config is not enabled')
  const anon = createClient(liveConfig.url, liveConfig.anonKey)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull()
  return createClient(liveConfig.url, liveConfig.anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

async function runPsql(sql: string) {
  if (!liveConfig) throw new Error('R7.3 local live-test config is not enabled')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      liveConfig.dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ])
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `psql exited with code ${code}`))
    })
    child.stdin.end(sql)
  })
}

d('R7.3 creator listing boundary (explicit local Postgres only)', () => {
  const localSvc = svc!

  beforeAll(async () => {
    expect(recomputeSql).toContain('update public.guides g')

    const ownerUser = await localSvc.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
    expect(ownerUser.error, `create owner failed: ${ownerUser.error?.message}`).toBeNull()
    ownerId = ownerUser.data.user!.id

    const opsUser = await localSvc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
    expect(opsUser.error, `create ops failed: ${opsUser.error?.message}`).toBeNull()
    opsUserId = opsUser.data.user!.id

    const opsMember = await localSvc
      .from('kinnso_ops_members')
      .insert({ user_id: opsUserId, display_name: 'R7.3 Listing Ops', status: 'active' })
      .select('id')
      .single()
    expect(opsMember.error).toBeNull()
    opsMemberId = opsMember.data!.id

    const guide = await localSvc
      .from('guides')
      .insert({
        creator_id: ownerId,
        creator_handle: 'r73listingowner',
        creator_name: 'R7.3 Listing Owner',
        slug: `r7-3-listing-guide-${runId}`,
        title: 'R7.3 Listing Recompute Guide',
        summary: 'Live local verification for recompute and the preserved saves trigger.',
        cover_url: null,
        city: 'Hong Kong',
        status: 'draft',
        saves_count: 17,
      })
      .select('id')
      .single()
    expect(guide.error).toBeNull()
    guideId = guide.data!.id

    const seededSave = await localSvc
      .from('guide_saves')
      .insert({ guide_id: guideId, traveler_user_id: ownerId })
      .select('id')
      .single()
    expect(seededSave.error).toBeNull()
  }, hookTimeout)

  afterAll(async () => {
    if (guideId) await localSvc.from('guides').delete().eq('id', guideId)
    if (ownerId) await localSvc.from('ops_audit_log').delete().eq('entity_id', ownerId)
    if (opsMemberId) await localSvc.from('kinnso_ops_members').delete().eq('id', opsMemberId)
    if (ownerId) await localSvc.auth.admin.deleteUser(ownerId)
    if (opsUserId) await localSvc.auth.admin.deleteUser(opsUserId)
  }, hookTimeout)

  it('denies owner listing overrides while preserving normal owner edits', async () => {
    const owner = await authedClient(ownerEmail)

    const denied = await owner.from('creators').update({ is_listed: true }).eq('id', ownerId)
    expect(denied.error).not.toBeNull()

    const normalUpdate = await owner.from('creators').update({ display_name: 'Owner Edit' }).eq('id', ownerId)
    expect(normalUpdate.error).toBeNull()

    const creator = await localSvc.from('creators').select('display_name, is_listed').eq('id', ownerId).single()
    expect(creator.error).toBeNull()
    expect(creator.data).toEqual(expect.objectContaining({ display_name: 'Owner Edit', is_listed: false }))
  }, testTimeout)

  it('denies an active ops creator a direct listing update on their own row', async () => {
    const ops = await authedClient(opsEmail)
    const denied = await ops.from('creators').update({ is_listed: true }).eq('id', opsUserId)
    expect(denied.error).not.toBeNull()

    const opsCreator = await localSvc
      .from('creators')
      .select('is_listed')
      .eq('id', opsUserId)
      .single()
    expect(opsCreator.error).toBeNull()
    expect(opsCreator.data?.is_listed).toBe(false)
  }, testTimeout)

  it('allows an active ops user to set listing state and writes the audit event', async () => {
    const ops = await authedClient(opsEmail)
    const allowed = await ops.rpc('admin_set_creator_listed', {
      p_id: ownerId,
      p_is_listed: true,
      p_reason: 'Approved for launch cohort',
    })
    expect(allowed.error).toBeNull()

    const creator = await localSvc.from('creators').select('is_listed').eq('id', ownerId).single()
    expect(creator.data?.is_listed).toBe(true)

    const audit = await localSvc.from('ops_audit_log').select('action, reason, metadata').eq('entity_id', ownerId)
    expect(audit.error).toBeNull()
    expect(audit.data).toContainEqual(expect.objectContaining({ action: 'listing.set' }))

    const detail = await ops.rpc('admin_creator_detail', { p_creator_id: ownerId })
    expect(detail.error).toBeNull()
    expect((detail.data as { creator?: { is_listed?: boolean } } | null)?.creator?.is_listed).toBe(true)
  }, testTimeout)

  it('recomputes drift from real guide_saves and preserves trigger updates from that baseline', async () => {
    const before = await localSvc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(before.error).toBeNull()
    expect(before.data!.saves_count).toBe(18)

    await runPsql(recomputeSql)

    const afterRecompute = await localSvc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(afterRecompute.error).toBeNull()
    expect(afterRecompute.data!.saves_count).toBe(1)

    const ops = await authedClient(opsEmail)
    const inserted = await ops
      .from('guide_saves')
      .insert({ guide_id: guideId, traveler_user_id: opsUserId })
      .select('id')
      .single()
    expect(inserted.error).toBeNull()

    const afterInsert = await localSvc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(afterInsert.data!.saves_count).toBe(2)

    const deleted = await ops.from('guide_saves').delete().eq('id', inserted.data!.id)
    expect(deleted.error).toBeNull()

    const afterDelete = await localSvc.from('guides').select('saves_count').eq('id', guideId).single()
    expect(afterDelete.data!.saves_count).toBe(1)
  }, testTimeout)
})
