import { test, expect, type Page } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { verifyTestTarget } from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, global: { fetch: boundedFetch } });
const ok = async (promise: PromiseLike<any>) => { const r = await promise; expect(r.error).toBeNull(); return r.data; };
async function signIn(page: Page, email: string, password: string, actorId: string) {
  page.setDefaultTimeout(10_000); page.setDefaultNavigationTimeout(15_000);
  await page.goto('/en/sign-in?next=/en/merchant');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/en/merchant');
  await expect(page.getByRole('heading', { name: 'Merchant workspace', exact: true })).toBeVisible();
  await expect(page.getByLabel('Company', { exact: true })).toBeVisible();
  await expect.poll(async () => { const r = await page.request.get('/api/session', { timeout: 10_000 }); const b = await r.json(); return r.ok() && b.ok && b.data?.id === actorId; }, { timeout: 15_000, message: 'Browser session must identify the signed-in synthetic merchant' }).toBe(true);
}

test('U04 owner publishes and reviews; scoped clerk corrects invalid percentage amount and redemption replays exactly once', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
  const users: string[] = [], companies: string[] = [], offers: string[] = [];
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  let failed = false;
  async function actor(creator = false) {
    const email = `synthetic-u04-${randomUUID()}@example.test`, password = `Synthetic!${randomUUID()}`;
    const user = (await ok(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user;
    users.push(user.id);
    if (creator) await ok(admin.from('creators').update({ status: 'active' }).eq('id', user.id));
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { fetch: boundedFetch } });
    await ok(client.auth.signInWithPassword({ email, password }));
    return { id: user.id, email, password, client };
  }
  try {
    const owner = await actor(), secondOwner = await actor(), clerk = await actor(), creator = await actor(true), visitor = await actor();
    for (const [user, name] of [[owner, 'Synthetic U04 company A'], [secondOwner, 'Synthetic U04 company B']] as const) {
      companies.push((await ok(admin.from('merchant_profiles').insert({ user_id: user.id, company_name: name, contact_email: user.email }).select('id').single())).id);
    }
    const command = (client: typeof owner.client, merchantId: string, value: object) => ok(client.rpc('apply_kinnso_merchant_command', { p_merchant_id: merchantId, p_request_id: randomUUID(), p_command: value }));
    await command(secondOwner.client, companies[1], { type: 'setMember', userId: owner.id, role: 'marketing', branchIds: [], active: true });
    await signIn(page, owner.email, owner.password, owner.id);
    await page.getByLabel('Company', { exact: true }).selectOption(companies[0]);
    await page.getByLabel('Branch name', { exact: true }).fill('Synthetic U04 main branch');
    await page.getByRole('button', { name: 'Create branch', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved on the server.' })).toBeVisible();
    const workspace = await ok(owner.client.rpc('get_kinnso_merchant_workspace', { p_merchant_id: companies[0] }));
    const branch = workspace.branches.find((b: any) => b.name === 'Synthetic U04 main branch');
    expect(branch).toBeTruthy();
    await page.getByLabel('Brief title', { exact: true }).fill('Synthetic U04 published brief');
    await page.getByLabel('Brief description', { exact: true }).fill('Authored synthetic promotion reviewed through the real merchant workspace.');
    await page.getByLabel('Coupon code', { exact: true }).fill('U04PROMO');
    await page.getByLabel('Coupon URL', { exact: true }).fill('https://example.test/u04');
    for (const name of ['Affiliate commission rate', 'Platform commission rate', 'Creator commission rate']) await page.getByLabel(name, { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Publish promotion brief', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic U04 published brief', exact: true })).toBeVisible();
    const missions = await ok(admin.from('missions').select('id,status').eq('merchant_profile_id', companies[0]));
    expect(missions).toHaveLength(1); expect(missions[0].status).toBe('published');
    const application = await ok(admin.from('mission_participants').insert({ mission_id: missions[0].id, creator_id: creator.id, status: 'applied', source: 'open_join', application_note: 'Synthetic application for browser review' }).select('id').single());
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await page.getByRole('button', { name: 'Approve application', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Approve application', exact: true })).toHaveCount(0);
    expect((await ok(admin.from('mission_participants').select('status').eq('id', application.id).single())).status).toBe('active');

    await page.getByLabel('Brief title', { exact: true }).fill('Draft belongs only to A');
    await page.getByLabel('Brief description', { exact: true }).fill('Private draft A');
    await page.getByLabel('Coupon code', { exact: true }).fill('DRAFT_A');
    await page.getByLabel('Company', { exact: true }).selectOption(companies[1]);
    await expect(page.getByLabel('Brief title', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Brief description', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Coupon code', { exact: true })).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Synthetic U04 published brief', exact: true })).toHaveCount(0);
    await page.getByLabel('Company', { exact: true }).selectOption(companies[0]);
    await expect(page.getByLabel('Brief title', { exact: true })).toHaveValue('');
    await command(owner.client, companies[0], { type: 'setMember', userId: clerk.id, role: 'clerk', branchIds: [branch.id], active: true });
    const otherBranch = randomUUID();
    await command(owner.client, companies[0], { type: 'createBranch', id: otherBranch, name: 'Synthetic U04 alternative branch' });
    const offer = await ok(admin.from('merchant_offers').insert({ merchant_profile_id: companies[0], title: 'Synthetic percentage offer', terms: 'Owned browser fixture', discount_kind: 'percent', discount_value: 10, commission_kind: 'percent', commission_value: 5, valid_from: new Date(Date.now() - 3600000).toISOString(), valid_to: new Date(Date.now() + 86400000).toISOString(), status: 'live' }).select('id').single());
    offers.push(offer.id);
    const code = randomUUID();
    const claim = await ok(admin.from('offer_claims').insert({ offer_id: offer.id, creator_id: creator.id, visitor_user_id: visitor.id, claim_token_hash: createHash('sha256').update(code).digest('hex'), source_surface: 'profile', expires_at: new Date(Date.now() + 3600000).toISOString(), status: 'active' }).select('id').single());
    const clerkContext = await browser.newContext({ baseURL }); contexts.push(clerkContext);
    const clerkPage = await clerkContext.newPage();
    await signIn(clerkPage, clerk.email, clerk.password, clerk.id);
    await expect(clerkPage.getByRole('heading', { name: 'Redeem at this branch', exact: true })).toBeVisible();
    await expect(clerkPage.getByRole('heading', { name: 'Create coupon promotion brief', exact: true })).toHaveCount(0);
    await clerkPage.getByLabel('Visitor redemption code', { exact: true }).fill(code);
    const invalidResponse = clerkPage.waitForResponse(r => r.url().endsWith('/api/merchant/redeem') && r.request().method() === 'POST');
    await clerkPage.getByRole('button', { name: 'Confirm redemption', exact: true }).click();
    const invalid = await invalidResponse;
    expect(invalid.status()).toBe(400); expect((await invalid.json()).code).toBe('INVALID');
    await expect(clerkPage.getByRole('main').getByRole('alert')).toContainText('Check the entered details');
    await expect(clerkPage.getByLabel('Amount spent, required for percentage offers', { exact: true })).toBeEnabled();
    await expect(clerkPage.getByRole('button', { name: 'Retry the same request', exact: true })).toHaveCount(0);
    await clerkPage.getByLabel('Amount spent, required for percentage offers', { exact: true }).fill('200');
    const successResponse = clerkPage.waitForResponse(r => r.url().endsWith('/api/merchant/redeem') && r.request().method() === 'POST');
    await clerkPage.getByRole('button', { name: 'Confirm redemption', exact: true }).click();
    const success = await successResponse; expect(success.ok()).toBe(true);
    const receipt = await success.json(), request = success.request().postDataJSON();
    await expect(clerkPage.getByRole('status').filter({ hasText: 'Redemption recorded.' })).toBeVisible();
    // Same-origin browser replay uses the exact successful command/request identity.
    const replay = await clerkPage.evaluate(async body => { const r = await fetch('/api/merchant/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) }); return { status: r.status, body: await r.json() }; }, request);
    expect(replay.status).toBe(200); expect(replay.body).toEqual(receipt);
    const redemptions = await ok(admin.from('offer_redemptions').select('id,amount_spent,kinnso_branch_id').eq('offer_claim_id', claim.id));
    expect(redemptions).toHaveLength(1); expect(Number(redemptions[0].amount_spent)).toBe(200); expect(redemptions[0].kinnso_branch_id).toBe(branch.id);
    expect((await ok(admin.from('merchant_offers').select('redeemed_count').eq('id', offer.id).single())).redeemed_count).toBe(1);
    await expect(clerkPage.getByText('Recorded outcome state', { exact: false })).toHaveCount(1);
    // Remove access to the branch containing this outcome, while retaining company membership.
    await command(owner.client, companies[0], { type: 'setMember', userId: clerk.id, role: 'clerk', branchIds: [otherBranch], active: true });
    await clerkPage.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await expect(clerkPage.getByText('No recorded redemptions in your scope.', { exact: true })).toBeVisible();
    await expect(clerkPage.getByLabel('Redemption branch', { exact: true })).toHaveValue(otherBranch);
    await command(owner.client, companies[0], { type: 'setMember', userId: clerk.id, role: 'clerk', branchIds: [otherBranch], active: false });
    await clerkPage.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await expect(clerkPage.getByRole('main').getByRole('alert')).toContainText('Your current company or branch access');
    await expect(clerkPage.getByRole('heading', { name: 'Recorded outcomes in your branch scope', exact: true })).toHaveCount(0);
    await expect(clerkPage.getByRole('heading', { name: 'Redeem at this branch', exact: true })).toHaveCount(0);
  } catch (error) { failed = true; throw error; } finally {
    const errors: string[] = [];
    const clean = async (label: string, operation: () => PromiseLike<unknown>) => { try { await operation(); } catch { errors.push(label); } };
    for (const context of contexts) await clean('clerk context', () => context.close());
    for (const id of companies) await clean('redemptions', () => ok(admin.from('offer_redemptions').delete().eq('merchant_profile_id', id)));
    if (offers.length) await clean('claims', () => ok(admin.from('offer_claims').delete().in('offer_id', offers)));
    for (const id of companies) await clean('merchant', () => ok(admin.from('merchant_profiles').delete().eq('id', id)));
    for (const id of users) await clean('synthetic auth user', () => ok(admin.auth.admin.deleteUser(id)));
    if (errors.length) { testInfo.annotations.push({ type: 'cleanup failures', description: errors.join(', ') }); await testInfo.attach('u04-cleanup-failures', { body: JSON.stringify(errors), contentType: 'application/json' }).catch(() => {}); if (!failed) throw new Error('Synthetic cleanup failed: ' + errors.join(', ')); }
  }
});
