import {test, expect, type Page} from '@playwright/test';
const roleMarkers = ['Invite a company colleague', 'Retry invitation acceptance', 'Operations queue', 'Financial reconciliation', 'Source questions: read published sources and verification dates.'];

function downloadedScripts(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 200 && path.startsWith('/_next/static/chunks/') && path.endsWith('.js'))
      bodies.push(response.text());
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

test('U06 public search loads no connected merchant or operations panel JavaScript', async ({page, baseURL}) => {
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

test('U06 deferred role panels retain server headings, language, private cache and signed-out boundaries', async ({page}) => {
  const scripts = downloadedScripts(page);
  const routes = [
    {path: '/en/merchant', heading: 'Merchant workspace'},
    {path: '/zh-HK/ops', heading: '營運待辦'},
    {path: '/en/merchant/invitation', heading: 'Company invitation'},
    {path: '/zh-HK/ops/reconciliation', heading: '財務對帳'},
    {path: '/en/agent', heading: 'Task preview'},
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
