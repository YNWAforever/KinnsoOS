import { spawn } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET,
  PROFILE_ENQUIRIES_LOCAL_OPT_IN,
  profileEnquiryRateBucketHash,
  tryResolveProfileEnquiriesLocalConfig,
} from '../profile-enquiries-local'
import { cleanupOwnedEnquiries } from '../profile-enquiries-cleanup'

// This journey provisions auth users, writes enquiries and shells into the Supabase
// Postgres container, so it runs only under playwright.profile-enquiries.config.ts against
// an explicitly opted-in local stack. Any other environment must SKIP: a throw at module
// scope aborts Playwright's collection pass, which silently reduces the whole run to zero
// tests instead of disabling this one file. The placeholder below keeps module evaluation
// inert — the file-scope test.skip disables every test here, so nothing ever dials it.
const resolved = tryResolveProfileEnquiriesLocalConfig(process.env)
const OPT_IN_ABSENT = 'profile-enquiries-opt-in-absent'
const local = resolved ?? {
  baseURL: 'http://127.0.0.1:3000',
  supabaseUrl: 'http://127.0.0.1:54321',
  anonKey: OPT_IN_ABSENT,
  serviceRoleKey: OPT_IN_ABSENT,
  dbContainer: OPT_IN_ABSENT,
}
const svc = createClient(local.supabaseUrl, local.serviceRoleKey)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = `E2e!${runId}aA`
const visitorIp = '203.0.113.77'
const creatorEmail = `r77-e2e-creator-${runId}@example.test`
const merchantEmail = `r77-e2e-merchant-${runId}@example.test`
const opsEmail = `r77-e2e-ops-${runId}@example.test`
const creatorName = `R7.7 E2E Creator ${runId}`
const merchantName = `R7.7 E2E Merchant ${runId}`
const creatorHandle = `r77-e2e-creator-${runId}`
const merchantSlug = `r77-e2e-merchant-${runId}`
const creatorVisitorEmail = `r77-e2e-visitor-creator-${runId}@example.test`
const merchantVisitorEmail = `r77-e2e-visitor-merchant-${runId}@example.test`
const creatorMessage = `Creator collaboration Playwright ${runId}`
const merchantMessage = `Merchant contact Playwright ${runId}`
const resolutionReason = `Resolved in Playwright ${runId}`

let creatorId = ''
let merchantUserId = ''
let merchantProfileId = ''
let opsUserId = ''
let opsMemberId = ''
const enquiryIds: string[] = []

async function fillEnquiry(page: Page, email: string, message: string) {
  await page.getByLabel('Name').fill('R7.7 E2E visitor')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Message').fill(message)
  await page.getByRole('button', { name: 'Send enquiry' }).click()
}

async function signInAsOps(page: Page, email: string, currentPassword: string) {
  await page.goto('/en/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(currentPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/en\/studio/, { timeout: 30_000 })
}

async function runPsql(sql: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', local.dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'])
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `psql exited with code ${code}`)))
    child.stdin.end(sql)
  })
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function cleanup(errors: string[], label: string, operation: () => PromiseLike<unknown>) {
  try {
    const result = await operation()
    if (typeof result === 'object' && result !== null && 'error' in result && result.error) errors.push(`${label}: ${errorText(result.error)}`)
  } catch (error) {
    errors.push(`${label}: ${errorText(error)}`)
  }
}

test.describe.configure({ mode: 'serial' })

test.skip(
  resolved === null,
  `${PROFILE_ENQUIRIES_LOCAL_OPT_IN}=1 and complete loopback Supabase credentials are required; `
  + 'run this journey through playwright.profile-enquiries.config.ts.',
)

test.beforeAll(async () => {
  // Guards the fixture setup independently of how the runner treats hooks for a fully
  // skipped file: nothing in this suite may touch a database it did not validate.
  if (!resolved) return

  await runPsql(`
    delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';
    select vault.create_secret(
      '${PROFILE_ENQUIRIES_LOCAL_DUMMY_SECRET}',
      'r7_7_enquiry_submission_hmac',
      'R7.7 Playwright local-only dummy secret',
      null::uuid
    );
  `)

  const creator = await svc.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })
  expect(creator.error).toBeNull()
  creatorId = creator.data.user!.id

  const merchant = await svc.auth.admin.createUser({ email: merchantEmail, password, email_confirm: true })
  expect(merchant.error).toBeNull()
  merchantUserId = merchant.data.user!.id

  const ops = await svc.auth.admin.createUser({ email: opsEmail, password, email_confirm: true })
  expect(ops.error).toBeNull()
  opsUserId = ops.data.user!.id

  const creatorUpdate = await svc.from('creators').update({
    display_name: creatorName,
    status: 'active',
    handle: creatorHandle,
    public_profile: { platforms: [] },
  }).eq('id', creatorId).select('id').single()
  expect(creatorUpdate.error).toBeNull()
  expect(creatorUpdate.data?.id, 'the Auth trigger must bootstrap the updated creator fixture').toBe(creatorId)

  // A successful UPDATE with no selected row can affect zero records. Confirm
  // the actual public projection before waiting on a page that may be a 404.
  const anonymous = createClient(local.supabaseUrl, local.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const publicCreator = await anonymous.from('creators')
    .select('id, handle, display_name, public_profile')
    .eq('handle', creatorHandle).eq('status', 'active').single()
  expect(publicCreator.error, 'the isolated anonymous creator projection must be readable').toBeNull()
  expect(publicCreator.data?.id).toBe(creatorId)
  expect(publicCreator.data?.display_name).toBe(creatorName)

  const merchantProfile = await svc.from('merchant_profiles').insert({
    user_id: merchantUserId,
    company_name: merchantName,
    contact_email: merchantEmail,
    status: 'active',
    slug: merchantSlug,
  }).select('id').single()
  expect(merchantProfile.error).toBeNull()
  merchantProfileId = merchantProfile.data!.id

  const opsMember = await svc.from('kinnso_ops_members').insert({
    user_id: opsUserId,
    display_name: `R7.7 E2E Ops ${runId}`,
    status: 'active',
  }).select('id').single()
  expect(opsMember.error).toBeNull()
  opsMemberId = opsMember.data!.id
})

test.afterAll(async () => {
  if (!resolved) return

  const errors: string[] = []
  const ownedCleanup = await cleanupOwnedEnquiries(
    (emails) => svc.from('enquiries').select('id').in('email', emails),
    [creatorVisitorEmail, merchantVisitorEmail],
    enquiryIds,
    (ids) => svc.from('ops_audit_log').delete().eq('entity_type', 'enquiry').in('entity_id', ids),
    (ids) => svc.from('enquiries').delete().in('id', ids),
  )
  errors.push(...ownedCleanup.errors)
  const rateBucketHash = profileEnquiryRateBucketHash(visitorIp)
  await cleanup(errors, 'enquiry rate bucket', () => svc.from('enquiry_rate_limits').delete().eq('ip_hash', rateBucketHash))
  await cleanup(errors, 'verify enquiry rate bucket absent', async () => {
    const remaining = await svc.from('enquiry_rate_limits').select('ip_hash').eq('ip_hash', rateBucketHash).maybeSingle()
    return {
      error: remaining.error
        ?? (remaining.data ? new Error('run-owned enquiry rate bucket still exists after cleanup') : null),
    }
  })
  if (merchantProfileId) await cleanup(errors, 'merchant profile', () => svc.from('merchant_profiles').delete().eq('id', merchantProfileId))
  if (opsMemberId) await cleanup(errors, 'ops member', () => svc.from('kinnso_ops_members').delete().eq('id', opsMemberId))
  for (const userId of [creatorId, merchantUserId, opsUserId]) {
    if (userId) await cleanup(errors, `auth user ${userId}`, () => svc.auth.admin.deleteUser(userId))
  }
  await cleanup(errors, 'Vault dummy secret', () => runPsql("delete from vault.secrets where name = 'r7_7_enquiry_submission_hmac';"))
  if (errors.length) throw new Error(`R7.7 Playwright cleanup failed: ${errors.join(' | ')}`)
})

test('visitor enquiries flow into the authenticated ops queue', async ({ page }) => {
  test.setTimeout(120_000)
  await page.context().setExtraHTTPHeaders({ 'x-vercel-forwarded-for': visitorIp })

  const creatorResponse = await page.goto(`/en/c/${creatorHandle}`)
  expect(creatorResponse?.status(), 'the public creator route must render before enquiry submission').toBe(200)
  await page.getByRole('button', { name: `Work with ${creatorName}` }).click()
  await page.getByLabel('Name').fill('R7.7 E2E visitor')
  await page.getByLabel('Email').fill(creatorVisitorEmail)
  await page.getByLabel('Message').fill(creatorMessage)
  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 2, y: 2 } })
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: `Work with ${creatorName}` }).click()
  await expect(page.getByLabel('Email')).toHaveValue(creatorVisitorEmail)
  await expect(page.getByLabel('Message')).toHaveValue(creatorMessage)
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await expect(page.getByRole('heading', { name: 'Enquiry sent' })).toBeVisible()

  await page.goto(`/en/m/${merchantSlug}`)
  await page.getByRole('button', { name: 'Contact this merchant' }).click()
  await fillEnquiry(page, merchantVisitorEmail, merchantMessage)
  await expect(page.getByRole('heading', { name: 'Enquiry sent' })).toBeVisible()

  await expect.poll(async () => {
    const result = await svc.from('enquiries').select('id').in('email', [creatorVisitorEmail, merchantVisitorEmail])
    if (result.error) throw result.error
    return result.data?.length ?? 0
  }).toBe(2)
  const enquiries = await svc.from('enquiries').select('id, type').in('email', [creatorVisitorEmail, merchantVisitorEmail])
  expect(enquiries.error).toBeNull()
  enquiryIds.push(...(enquiries.data ?? []).map((row) => row.id))

  await signInAsOps(page, opsEmail, password)
  await page.goto('/en/admin/enquiries')
  const creatorCard = page.locator('article').filter({ hasText: creatorMessage })
  const merchantCard = page.locator('article').filter({ hasText: merchantMessage })
  await expect(creatorCard).toBeVisible()
  await expect(merchantCard).toBeVisible()
  await expect(creatorCard).toContainText('Creator collaboration')
  await expect(merchantCard).toContainText('Merchant contact')
  await expect(creatorCard).toContainText('New')
  await expect(merchantCard).toContainText('New')
  await expect(creatorCard.getByRole('link', { name: creatorName })).toHaveAttribute('href', `/en/c/${creatorHandle}`)
  await expect(merchantCard.getByRole('link', { name: merchantName })).toHaveAttribute('href', `/en/m/${merchantSlug}`)

  await creatorCard.getByLabel('Reason').fill(resolutionReason)
  await creatorCard.getByRole('button', { name: 'Mark resolved' }).click()
  await expect(page.locator('article').filter({ hasText: creatorMessage })).toBeHidden()
  await page.getByRole('link', { name: 'Resolved' }).click()
  const resolvedCreatorCard = page.locator('article').filter({ hasText: creatorMessage })
  await expect(resolvedCreatorCard).toBeVisible()
  await expect(resolvedCreatorCard).toContainText('Resolved')

  const creatorEnquiryId = enquiries.data!.find((row) => row.type === 'creator_collab')!.id
  await expect.poll(async () => {
    const result = await svc.from('ops_audit_log').select('action, reason, metadata').eq('entity_type', 'enquiry').eq('entity_id', creatorEnquiryId).maybeSingle()
    if (result.error) throw result.error
    return result.data
  }).toMatchObject({ action: 'status.resolved', reason: resolutionReason, metadata: { from: 'new', to: 'resolved' } })
})
