import { test, expect, type Page } from '@playwright/test';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyTestTarget } from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test'); verifyTestTarget();
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
let userId: string, email: string, password: string;
test.beforeEach(async () => { userId = ''; email = `synthetic-new-studio-${randomUUID()}@example.test`; password = `Author!${randomUUID()}`; const result = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(result.error).toBeNull(); userId = result.data.user!.id; });
test.afterEach(async () => { if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); });

async function openNewDraft(page: Page) {
 await page.goto('/en/sign-in?next=' + encodeURIComponent('/en/studio'));
 await page.getByLabel('Email', { exact: true }).fill(email);
 await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click();
 await page.waitForURL('**/en/studio');
 await expect(page.getByRole('heading', { name: 'Tell travellers about your work.', exact: true })
  .or(page.getByRole('heading', { name: 'Your authored guides', exact: true }))).toBeVisible();
 const confirm = page.getByRole('button', { name: 'Confirm creator profile', exact: true });
 if (await confirm.isVisible()) {
  await page.getByLabel('Bio', { exact: true }).fill('Synthetic local save recovery author');
  await page.getByLabel('I have reviewed this profile and confirm publication.', { exact: true }).check();
  await confirm.click();
  await expect(page.getByRole('link', { name: 'Create guide', exact: true })).toBeVisible();
 }
 await page.goto('/en/studio/guides/new');
 await expect(page.getByTestId('creator-editor')).toBeVisible();
}

test('draft status never reports a new unsaved guide as saved', async ({ page }) => {
 await openNewDraft(page);
 await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft not saved yet.');
 await expect(page.getByRole('button', { name: 'Publish structured version', exact: true })).toBeDisabled();
});

test('draft status distinguishes edited, saving and server-confirmed content', async ({ page }) => {
 await openNewDraft(page);
 await page.getByLabel('Guide title', { exact: true }).fill('Confirmed local draft');
 await page.getByRole('button', { name: 'Save draft', exact: true }).click();
 await page.waitForURL(/\/en\/studio\/guides\/[0-9a-f-]{36}\/edit/);
 const id = page.url().split('/').at(-2)!;
 await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
 let release!: () => void, committed!: () => void;
 const held = new Promise<void>(resolve => { release = resolve; });
 const persisted = new Promise<void>(resolve => { committed = resolve; });
 await page.route('**/api/creator/guides/' + id, async route => {
  if (route.request().method() !== 'PUT') return route.continue();
  const response = await route.fetch();
  expect(response.ok()).toBe(true);
  committed();
  await held;
  await route.fulfill({ response });
 });
 try {
  await page.getByLabel('Guide title', { exact: true }).fill('Edited local draft');
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft changes pending.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await persisted;
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Saving draft…');
  release();
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
  await page.unroute('**/api/creator/guides/' + id);
  const result = await page.request.get('/api/creator/guides/' + id);
  const draft = (await result.json()).data;
  expect(draft.revision).toBe(2);
  expect(draft.payload.title).toBe('Edited local draft');
  await page.getByLabel('Destination', { exact: true }).fill('Kyoto');
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft changes pending.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
  await page.reload();
  await expect(page.getByLabel('Guide title', { exact: true })).toHaveValue('Edited local draft');
  await expect(page.getByLabel('Destination', { exact: true })).toHaveValue('Kyoto');
 } finally { release(); }
});

test('late save acknowledgement cannot reopen an editor after client navigation', async ({ page }) => {
 await openNewDraft(page);
 let release!: () => void, committed!: () => void, acknowledged!: () => void, id = '';
 const held = new Promise<void>(resolve => { release = resolve; });
 const persisted = new Promise<void>(resolve => { committed = resolve; });
 const delivered = new Promise<void>(resolve => { acknowledged = resolve; });
 await page.route('**/api/creator/guides/*', async route => {
  if (route.request().method() !== 'PUT') return route.continue();
  id = route.request().url().split('/').at(-1)!;
  const response = await route.fetch();
  expect(response.ok()).toBe(true);
  committed();
  await held;
  await route.fulfill({ response });
  acknowledged();
 });
 try {
  await page.getByLabel('Guide title', { exact: true }).fill('Saved while leaving editor');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await persisted;
  await page.getByRole('link', { name: 'Back to guides', exact: true }).click();
  await page.waitForURL('**/en/studio/guides');
  await expect(page.getByTestId('creator-editor')).toHaveCount(0);
  const response = page.waitForResponse(r => r.url().endsWith('/api/creator/guides/' + id) && r.request().method() === 'PUT');
  release();
  await delivered;
  await response;
  // Cross a completed client render, so a late router.replace cannot hide behind the assertion.
  await page.getByRole('link', { name: 'Create guide', exact: true }).focus();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page).toHaveURL(/\/en\/studio\/guides$/);
  const result = await page.request.get('/api/creator/guides/' + id);
  const draft = (await result.json()).data;
  expect(draft.revision).toBe(1);
  expect(draft.payload.title).toBe('Saved while leaving editor');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved while leaving editor', exact: true })).toBeVisible();
 } finally { release(); }
});
test('publication rejection remains visible through edits and autosave until publication succeeds', async ({ page }) => {
 await openNewDraft(page);
 await page.getByLabel('Guide title', { exact: true }).fill('Incomplete local route');
 await page.getByRole('button', { name: 'Save draft', exact: true }).click();
 await page.waitForURL(/\/en\/studio\/guides\/[0-9a-f-]{36}\/edit/);
 const publish = page.getByRole('button', { name: 'Publish structured version', exact: true });
 await expect(publish).toBeEnabled();
 const rejected = page.waitForResponse(r => r.url().endsWith('/publish') && r.request().method() === 'POST');
 await publish.click();
 const response = await rejected;
 expect((await response.json()).code).toBe('INVALID');
 const error = page.getByText('Complete the authored route before publication. Your input is kept.', { exact: true });
 await expect(error).toBeVisible();
 await page.getByLabel('Summary', { exact: true }).fill('An unrelated summary edit cannot complete missing route stops.');
 await expect(error).toBeVisible();
 await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
 await expect(error).toBeVisible();
 await page.getByLabel('Destination', { exact: true }).fill('Kyoto');
 await page.getByLabel('Day title', { exact: true }).fill('An explicitly authored day');
 await page.getByLabel('Stop title', { exact: true }).fill('An explicitly authored square');
 await page.getByLabel('Public description', { exact: true }).fill('A description written by this local author');
 await expect(publish).toBeEnabled();
 await publish.click();
 await expect(page.getByText('Version published. Existing traveller copies stay unchanged.', { exact: true })).toBeVisible();
 await expect(error).toHaveCount(0);
});

test('creator completes manual onboarding and authors, recovers, publishes and withdraws on Journeys itself', async ({ page }) => {
 test.setTimeout(120000);
 await page.goto('/en/sign-in?next=' + encodeURIComponent('/en/studio')); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/en/studio');
 await expect(page.getByRole('heading', { name: 'Tell travellers about your work.' })).toBeVisible();
 await page.getByLabel('Bio', { exact: true }).fill('An explicitly synthetic local author profile'); await expect(page.getByRole('button', { name: 'Confirm creator profile', exact: true })).toBeDisabled();
 await page.getByLabel('I have reviewed this profile and confirm publication.', { exact: true }).check(); await page.getByRole('button', { name: 'Confirm creator profile', exact: true }).click();
 await page.getByRole('link', { name: 'Create guide', exact: true }).click(); await expect(page.getByTestId('creator-editor')).toBeVisible();
 await page.getByLabel('Guide title', { exact: true }).fill('New site creator route'); await page.getByLabel('Destination', { exact: true }).fill('Kyoto'); await page.getByLabel('Summary', { exact: true }).fill('Structured route authored on the new site'); await page.getByLabel('Day title', { exact: true }).fill('New site authored day'); await page.getByLabel('Stop title', { exact: true }).fill('New site authored square'); await page.getByLabel('Public description', { exact: true }).fill('Public description of the authored stop');
 await page.waitForURL(/\/en\/studio\/guides\/[0-9a-f-]{36}\/edit/); await expect(page.getByRole('button', { name: 'Publish structured version', exact: true })).toBeEnabled();
 const guideId = page.url().split('/').at(-2)!; await page.reload(); await expect(page.getByLabel('Stop title', { exact: true })).toHaveValue('New site authored square');
 const endpoint = '**/api/creator/guides/' + guideId + '/publish'; let requestId: string | undefined;
 await page.route(endpoint, async route => { requestId = route.request().postDataJSON().requestId; await route.fetch(); await route.abort('failed'); });
 await page.getByRole('button', { name: 'Publish structured version', exact: true }).click(); await expect(page.getByRole('button', { name: 'Retry same action', exact: true })).toBeVisible(); await expect(page.getByLabel('Stop title', { exact: true })).toHaveValue('New site authored square');
 await page.unroute(endpoint); const retry = page.waitForRequest(r => r.url().endsWith('/publish') && r.method() === 'POST'); await page.getByRole('button', { name: 'Retry same action', exact: true }).click(); expect((await retry).postDataJSON().requestId).toBe(requestId);
 await expect(page.getByText('Version published. Existing traveller copies stay unchanged.', { exact: true })).toBeVisible();
 const versions = await admin.from('guide_versions').select('version').eq('guide_id', guideId); expect(versions.data?.map(v => v.version)).toEqual([1]);
 await page.getByRole('link', { name: 'View published guide', exact: true }).click(); await expect(page.getByRole('heading', { name: 'New site authored square', exact: true })).toBeVisible();
 await page.goto('/en/studio/guides/' + guideId + '/edit'); await page.getByRole('button', { name: 'Withdraw adoption', exact: true }).click(); await expect(page.getByText('New adoptions withdrawn; traveller notes retained.', { exact: true })).toBeVisible();
 const withdrawn = await admin.from('guide_versions').select('withdrawn_at').eq('guide_id', guideId).single(); expect(withdrawn.data?.withdrawn_at).toBeTruthy();
});

test('onboarding resumes actual job states and late AI suggestions never publish or replace manual edits', async ({ page }) => {
 test.setTimeout(90000);
 const ownEmail = `synthetic-resume-${randomUUID()}@example.test`, ownPassword = `Resume!${randomUUID()}`;
 const actor = await admin.auth.admin.createUser({ email: ownEmail, password: ownPassword, email_confirm: true }); expect(actor.error).toBeNull(); const actorId = actor.data.user!.id;
 try {
  const job = await admin.from('creator_scan_jobs').insert({ creator_id: actorId, status: 'queued' }).select('id').single(); expect(job.error).toBeNull();
  await page.goto('/en/sign-in?next=' + encodeURIComponent('/en/studio')); await page.getByLabel('Email', { exact: true }).fill(ownEmail); await page.getByLabel('Password', { exact: true }).fill(ownPassword); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/en/studio');
  for (const status of ['queued', 'fetching', 'analyzing'] as const) {
   expect((await admin.from('creator_scan_jobs').update({ status }).eq('id', job.data!.id)).error).toBeNull(); await page.reload(); await expect(page.getByText(`Analysis status: ${status}.`, { exact: true })).toBeVisible();
   const result = await page.request.get('/api/creator/profile'); expect((await result.json()).data.step).toBe('progress');
  }
  await page.getByLabel('Bio', { exact: true }).fill('My manually edited profile');
  expect((await admin.from('creator_dna').insert({ creator_id: actorId, status: 'draft', ai_draft: { bio: 'Late suggested profile', niches: [], content_pillars: [], tone: [], languages: [], platforms: [], audience: {} }, scan_job_id: job.data!.id })).error).toBeNull();
  expect((await admin.from('creator_scan_jobs').update({ status: 'ready' }).eq('id', job.data!.id)).error).toBeNull(); await expect(page.getByText('Analysis status: ready.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('My manually edited profile');
  await page.reload(); await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Late suggested profile'); await expect(page.getByRole('button', { name: 'Confirm creator profile', exact: true })).toBeDisabled();
  const state = await admin.from('creators').select('status').eq('id', actorId).single(); expect(state.data?.status).toBe('onboarding');
  expect((await admin.from('creator_scan_jobs').update({ status: 'failed' }).eq('id', job.data!.id)).error).toBeNull(); await page.reload(); await expect(page.getByText('Analysis status: failed.', { exact: true })).toBeVisible();
  const failed = await page.request.get('/api/creator/profile'); const dto = (await failed.json()).data; expect(dto.step).toBe('retry'); expect(dto.retryable).toBe(true); expect(dto.scanAvailable).toBe(false);
 } finally { expect((await admin.auth.admin.deleteUser(actorId)).error).toBeNull(); }
});
