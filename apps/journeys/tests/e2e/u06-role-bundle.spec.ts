import {test, expect, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {createClient} from '@supabase/supabase-js';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
loadEnvFile('.env.test');
const target = verifyTestTarget();
const roleMarkers = ['Invite a company colleague', 'Retry invitation acceptance', 'Operations queue', 'Financial reconciliation', 'Source questions: read published sources and verification dates.', 'Drafts are private. Published versions can be adopted into traveller trips.'];

function downloadedScripts(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && path.startsWith('/_next/static/chunks/') && path.endsWith('.js'))
      bodies.push(response.text());
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

test('U06 public search defers private role-workspace JavaScript', async ({page, baseURL}) => {
  expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
  const scripts = downloadedScripts(page);
  const response = await page.goto('/en');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.getByLabel('Destination or interest', {exact: true}).fill('Kyoto');
  await page.getByRole('button', {name: 'Find guides', exact: true}).click();
  await page.waitForURL('**/en/explore?q=Kyoto');
  await expect(page.getByLabel('City (exact name)', {exact: true})).toBeVisible();
  const javascript = await scripts();
  expect(javascript.length).toBeGreaterThan(1000);
  for (const marker of roleMarkers)
    expect(javascript.includes(marker), `Public navigation must defer ${marker}`).toBe(false);
});

test('U06 logout while an agent chunk is held cannot restore signed-in controls', async ({page, baseURL}) => {
  test.setTimeout(60000);
  expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
  const admin = createClient(target.apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});
  const email = `synthetic-lazy-account-${randomUUID()}@example.test`, password = `Synthetic!${randomUUID()}`;
  const created = await admin.auth.admin.createUser({email, password, email_confirm: true});
  expect(created.error).toBeNull();
  const actorId = created.data.user!.id;
  let release!: () => void, held = false;
  const released = new Promise<void>(resolve => {release = resolve;});
  let logoutPage: Page | undefined;
  try {
    await page.goto('/en/sign-in?next=/en/me');
    await page.getByLabel('Email', {exact: true}).fill(email);
    await page.getByLabel('Password', {exact: true}).fill(password);
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.waitForURL(url => url.pathname === '/en/me');
    await expect(page.getByRole('heading', {name: 'Your Kinnso account', exact: true})).toBeVisible();
    expect((await page.request.get('/api/trips')).status()).toBe(200);
    await page.route('**/_next/static/chunks/*.js', async route => {
      const response = await route.fetch();
      if (!held && (await response.text()).includes(roleMarkers[4])) {
        held = true;
        await released;
      }
      await route.fulfill({response});
    });
    await page.goto('/en/agent', {waitUntil: 'commit'});
    await expect.poll(() => held, {timeout: 10000}).toBe(true);
    // Witness real broadcasts without forwarding them or changing product state.
    await page.evaluate(() => {
      const witness = window as unknown as {lazyLogoutCount: number; lazyLogoutChannel: BroadcastChannel};
      witness.lazyLogoutCount = 0;
      witness.lazyLogoutChannel = new BroadcastChannel('kinnso-account-lifecycle');
      witness.lazyLogoutChannel.onmessage = event => {if (event.data?.ownerId === null) witness.lazyLogoutCount++;};
    });
    logoutPage = await page.context().newPage();
    logoutPage.setDefaultTimeout(10000);
    logoutPage.setDefaultNavigationTimeout(15000);
    await logoutPage.goto('/en/me', {waitUntil: 'domcontentloaded'});
    await logoutPage.getByRole('button', {name: 'Sign out', exact: true}).click();
    await logoutPage.waitForURL('**/en/sign-in*');
    await expect.poll(() => page.evaluate(() => (window as unknown as {lazyLogoutCount: number}).lazyLogoutCount)).toBeGreaterThanOrEqual(2);
    const denied = await page.request.get('/api/trips');
    expect(denied.status()).toBe(401);
    release();
    await page.waitForLoadState('networkidle');
    const panel = page.locator('section.k-page').filter({has: page.getByRole('heading', {name: 'Task preview', exact: true})}).first();
    if (await panel.getByLabel('Query', {exact: true}).count()) {
      await panel.getByLabel('Query', {exact: true}).fill('Synthetic query after completed logout');
      await expect(panel.getByRole('button', {name: 'Read sources and preview', exact: true})).toBeDisabled();
    }
    await expect(panel.getByRole('link', {name: 'Sign in', exact: true})).toBeVisible();
    await expect(panel.getByLabel('Query', {exact: true})).toHaveCount(0);
    // Reauthentication of the same identity supplies fresh server authority.
    await panel.getByRole('link', {name: 'Sign in', exact: true}).click();
    await page.getByLabel('Email', {exact: true}).fill(email);
    await page.getByLabel('Password', {exact: true}).fill(password);
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.waitForURL(url => url.pathname === '/en/agent');
    await expect(panel.getByLabel('Query', {exact: true})).toBeVisible();
    await panel.getByLabel('Query', {exact: true}).fill('Synthetic query after reauthentication');
    await expect(panel.getByRole('button', {name: 'Read sources and preview', exact: true})).toBeEnabled();
    expect((await page.request.get('/api/trips')).status()).toBe(200);
  } finally {
    release();
    const removed = await admin.auth.admin.deleteUser(actorId);
    expect(removed.error).toBeNull();
    await page.unrouteAll({behavior: 'ignoreErrors'}).catch(() => {});
    await page.evaluate(() => (window as unknown as {lazyLogoutChannel?: BroadcastChannel}).lazyLogoutChannel?.close()).catch(() => {});
    await logoutPage?.close().catch(() => {});
  }
});

test('U06 deferred role panels retain server headings, language, private cache and signed-out boundaries', async ({page}) => {
  const scripts = downloadedScripts(page);
  const routes = [
    {path: '/en/merchant', heading: 'Merchant workspace'},
    {path: '/zh-HK/ops', heading: '營運待辦'},
    {path: '/en/merchant/invitation', heading: 'Company invitation'},
    {path: '/zh-HK/ops/reconciliation', heading: '財務對帳'},
    {path: '/en/agent', heading: 'Task preview'},
    {path: '/zh-HK/studio/guides/new', heading: '你的創作工作室'},
  ];
  for (const route of routes) {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toContain('private');
    expect(response?.headers()['cache-control']).toContain('no-store');
    expect(await response!.text()).toContain(route.heading);
    await expect(page.getByRole('heading', {level: 1, name: route.heading, exact: true})).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  await expect(page.getByRole('button', {name: 'Review invitation', exact: true})).toHaveCount(0);
  const javascript = await scripts();
  for (const marker of roleMarkers)
    expect(javascript.includes(marker), `Selected role route must load ${marker}`).toBe(true);
});
