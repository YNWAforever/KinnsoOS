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

async function editableRoute(page:Page){
 await openNewDraft(page);const id=randomUUID();
 const payload={title:'Synthetic editable route',city:'Kyoto',summary:'Local isolated creator editor fixture',content:{days:[0,2].map(offset=>({offset,title:`Authored ${offset}`,stops:[{title:'Same stop',description:'First',placeId:null,startMinuteOfDay:0,durationMinutes:30},{title:'Same stop',description:'Second',placeId:null,startMinuteOfDay:1439,durationMinutes:20}]}))}};
 const result=await page.request.put('/api/creator/guides/'+id,{headers:{Origin:'http://127.0.0.1:3495'},data:{expectedRevision:0,requestId:randomUUID(),payload}});expect(result.ok()).toBe(true);
 await page.goto('/en/studio/guides/'+id+'/edit');await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue(payload.title);return{id,payload};
}

test('a rejected private save keeps input and waits for explicit correction or retry',async({page})=>{
 const {id}=await editableRoute(page);let attempts=0;
 await page.route('**/api/creator/guides/'+id,route=>{if(route.request().method()!=='PUT')return route.continue();attempts++;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,code:'INVALID',retryable:false})});});
 await page.getByLabel('Guide title',{exact:true}).fill('Retained after rejected save');await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByTestId('creator-editor').getByRole('alert')).toBeVisible();await page.waitForTimeout(2100);expect(attempts).toBe(1);
 await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue('Retained after rejected save');await page.unroute('**/api/creator/guides/'+id);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
});

test('the first confirmed save keeps deletion Undo in the same editor session',async({page})=>{
 await openNewDraft(page);await page.getByLabel('Guide title',{exact:true}).fill('Synthetic new empty draft');
 await page.getByRole('button',{name:'Delete stop',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.waitForURL(/\/en\/studio\/guides\/[0-9a-f-]{36}\/edit/);
 await expect(page.getByRole('button',{name:'Undo last deletion',exact:true})).toBeVisible();await page.getByRole('button',{name:'Undo last deletion',exact:true}).click();
 await expect(page.getByLabel('Stop title',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');await page.reload();await expect(page.getByLabel('Stop title',{exact:true})).toHaveValue('');
});

test('keyboard reorder keeps duplicate stop identity, gaps and focus; deletion can Undo and persist empty drafts',async({page})=>{
 const {id}=await editableRoute(page);const days=page.getByTestId('editor-day'),stops=days.first().getByTestId('editor-stop');
 await expect(stops.first().getByLabel('Start time (HH:mm, optional)',{exact:true})).toHaveValue('00:00');
 await stops.first().getByRole('button',{name:'Move stop down',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(stops.nth(1).getByLabel('Stop title',{exact:true})).toBeFocused();await expect(stops.first().getByLabel('Public description',{exact:true})).toHaveValue('Second');
 await stops.first().getByLabel('Start time (HH:mm, optional)',{exact:true}).fill('09:30');
 await days.first().getByRole('button',{name:'Move day down',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(days.nth(1).getByLabel('Day title',{exact:true})).toBeFocused();
 await expect(days.first().getByLabel('Day title',{exact:true})).toHaveValue('Authored 2');
 await days.nth(1).getByTestId('editor-stop').nth(1).getByLabel('Start time (HH:mm, optional)',{exact:true}).fill('');
 await stops.first().getByRole('button',{name:'Delete stop',exact:true}).click();await page.getByRole('button',{name:'Undo last deletion',exact:true}).click();await expect(stops).toHaveCount(2);
 await stops.first().getByRole('button',{name:'Delete stop',exact:true}).click();await stops.first().getByRole('button',{name:'Delete stop',exact:true}).click();await expect(stops).toHaveCount(0);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
 let dto=(await(await page.request.get('/api/creator/guides/'+id)).json()).data;expect(dto.payload.content.days.map((d:{offset:number})=>d.offset)).toEqual([0,2]);expect(dto.payload.content.days[0].stops).toEqual([]);expect(dto.payload.content.days[1].stops.map((s:{startMinuteOfDay:number|null})=>s.startMinuteOfDay)).toEqual([570,null]);expect(JSON.stringify(dto.payload)).not.toContain('editor-focus');
 await days.first().getByRole('button',{name:'Delete day',exact:true}).click();await days.first().getByRole('button',{name:'Delete day',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
 await page.reload();await expect(days).toHaveCount(0);await expect(page.getByText('No days. Add a day before publishing.',{exact:true})).toBeVisible();
 dto=(await(await page.request.get('/api/creator/guides/'+id)).json()).data;expect(dto.payload.content.days).toEqual([]);
});

test('new reorder during a held autosave survives its acknowledgement and persists on the next revision',async({page})=>{
 const {id}=await editableRoute(page);let release!:()=>void,committed!:()=>void,first=true;const held=new Promise<void>(r=>release=r),saved=new Promise<void>(r=>committed=r);
 await page.route('**/api/creator/guides/'+id,async route=>{if(route.request().method()!=='PUT'||!first)return route.continue();first=false;const response=await route.fetch();expect(response.ok()).toBe(true);committed();await held;await route.fulfill({response});});
 try{
  await page.getByLabel('Guide title',{exact:true}).fill('Earlier saved title');await saved;
  const days=page.getByTestId('editor-day');await days.first().getByRole('button',{name:'Move day down',exact:true}).click();await page.getByLabel('Guide title',{exact:true}).fill('Newest retained title');
  release();await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue('Newest retained title');
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
  const dto=(await(await page.request.get('/api/creator/guides/'+id)).json()).data;expect(dto.revision).toBe(3);expect(dto.payload.title).toBe('Newest retained title');expect(dto.payload.content.days[0].title).toBe('Authored 2');
 }finally{release();}
});

test('publication acknowledgement retains new draft edits and revision conflicts require explicit replacement',async({page})=>{
 const {id,payload}=await editableRoute(page);let release!:()=>void,committed!:()=>void;const held=new Promise<void>(r=>release=r),published=new Promise<void>(r=>committed=r);
 await page.route('**/api/creator/guides/'+id+'/publish',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);committed();await held;await route.fulfill({response});});
 try{
  await page.getByRole('button',{name:'Publish structured version',exact:true}).click();await published;
  await page.getByLabel('Guide title',{exact:true}).fill('New private revision');release();await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue('New private revision');
  await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText('Draft saved.');
  const guide=(await(await page.request.get('/api/guides/'+id)).json()).data;expect(guide.title).toBe(payload.title);expect(guide.version).toBe(1);
  const dto=(await(await page.request.get('/api/creator/guides/'+id)).json()).data;
  expect((await page.request.put('/api/creator/guides/'+id,{headers:{Origin:'http://127.0.0.1:3495'},data:{expectedRevision:dto.revision,requestId:randomUUID(),payload:{...dto.payload,title:'Other device revision'}}})).ok()).toBe(true);
  await page.getByLabel('Guide title',{exact:true}).fill('Conflicting local input');await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByText('Another version was saved. Review the saved draft before retrying.',{exact:true})).toBeVisible();await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue('Conflicting local input');
  await page.getByRole('button',{name:'Reload saved draft (replace this form)',exact:true}).click();await expect(page.getByLabel('Guide title',{exact:true})).toHaveValue('Other device revision');
 }finally{release();}
});

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
