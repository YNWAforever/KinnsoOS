// Browser check against the standalone HTTP preview, without API interception.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const require = createRequire(fileURLToPath(new URL('../../../apps/journeys/package.json', import.meta.url)));
const {chromium, expect} = require('@playwright/test');
const origin = 'http://127.0.0.1:'+(process.argv[2]??'3499');
const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1280, height: 900}});
const page = await context.newPage();
const errors = [], external = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin !== origin) {external.push(route.request().url()); return route.abort();}
  return route.continue();
});
page.on('dialog', dialog => dialog.accept());
try {
  await page.goto(origin + '/zh-HK/');
  await expect(page.getByRole('heading', {name: '下一段旅程，從一個問題開始。'})).toBeVisible();
  for (const role of ['traveller', 'creator', 'merchant']) await expect(page.locator(`[data-audience="${role}"]`)).toBeVisible();
  checks.push('Shared homepage and all three role entrances');
  await page.getByRole('button', {name: '寫 guide', exact: false}).click();
  for (const button of ['填入示例文件 D1', '填入私人示例 D2']) {
    await page.getByRole('button', {name: button, exact: true}).click();
    await expect(page.getByLabel('文件名稱', {exact: true})).not.toHaveValue('');
    await page.getByLabel('這是我的原創文字，我有權使用。').check();
    await page.getByRole('button', {name: '加入文件', exact: true}).click();
    await expect(page.getByLabel('文件名稱', {exact: true})).toHaveValue('');
  }
  await page.getByLabel('你的問題', {exact: true}).fill('請用示例筆記整理一份攻略，私人備忘不要公開。');
  await page.getByRole('button', {name: '討論已選文件', exact: true}).click();
  await expect(page.getByText('討論已保存並讀回。', {exact: true})).toBeVisible();
  await page.getByRole('region', {name: '證據', exact: true}).locator('summary').first().click();
  await expect(page.getByRole('region', {name: '證據', exact: true}).locator('blockquote').first()).toBeVisible();
  checks.push('Example documents, explicit selection, discussion and expandable evidence');
  await page.getByRole('button', {name: '另開 brief', exact: true}).click();
  await page.getByRole('button', {name: '填入 brief 基本資料', exact: true}).click();
  await expect(page.getByLabel('攻略名稱', {exact: true})).toHaveValue('海旁慢步｜示例攻略');
  await page.getByLabel('選取這一項加入公開攻略預覽', {exact: true}).first().check();
  await expect(page.getByLabel('選取這一項加入公開攻略預覽', {exact: true}).nth(1)).not.toBeChecked();
  await page.getByRole('button', {name: '保存私人 brief', exact: true}).click();
  await expect(page.getByText('私人 brief 已保存並讀回核對。', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: '預覽交到 guide', exact: true}).click();
  const handoff = page.getByRole('region', {name: '公開攻略交接預覽'});
  await expect(handoff).not.toContainText('PRIVATE_DEMO_NOTE');
  await handoff.getByRole('checkbox').check();
  await handoff.getByRole('button', {name: '保存至既有 guide 草稿', exact: true}).click();
  await expect(page.getByTestId('creator-editor')).toBeVisible();
  checks.push('Separate brief, explicit public projection, D2 excluded, original guide editor');
  await page.getByLabel('攻略名稱', {exact: true}).fill('海旁慢步｜已編輯示例');
  await page.getByRole('button', {name: '保存草稿', exact: true}).click();
  await page.getByLabel('我已核對完整內容，並有權使用每項已包含的資料。', {exact: true}).check();
  await page.getByRole('button', {name: '確認保存', exact: true}).click();
  await expect(page.getByRole('button', {name: '發布結構化版本', exact: true})).toBeEnabled();
  const guideId = new URL(page.url()).pathname.split('/')[4];
  await page.getByRole('button', {name: '發布結構化版本', exact: true}).click();
  const before = await context.request.get(origin + '/api/guides/' + guideId);
  expect(before.status()).toBe(404);
  await page.getByLabel('我已核對完整內容，並有權使用每項已包含的資料。', {exact: true}).check();
  await page.getByRole('button', {name: '確認現在發布', exact: true}).click();
  await expect(page.getByText('版本已發布，既有旅人行程保留原樣。', {exact: true})).toBeVisible();
  const after = await context.request.get(origin + '/api/guides/' + guideId);
  const snapshot = await after.json();
  expect(snapshot.data.title).toBe('海旁慢步｜已編輯示例');
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_DEMO_NOTE');
  checks.push('Guide edit and confirmed save; no publication before confirmation; simulated publication readback');
  const isolated = await browser.newContext();
  expect((await isolated.request.get(origin + '/api/guides/' + guideId)).status()).toBe(404);
  await isolated.close();
  checks.push('Example state is separate between browser sessions (not real Auth/RLS)');
  await page.reload();
  await expect(page.getByLabel('攻略名稱', {exact: true})).toHaveValue('海旁慢步｜已編輯示例');
  await page.getByRole('button', {name: '重設示例', exact: true}).click();
  await expect(page.getByRole('heading', {name: '下一段旅程，從一個問題開始。'})).toBeVisible();
  expect((await context.request.get(origin + '/api/guides/' + guideId)).status()).toBe(404);
  checks.push('Reload of example state and explicit reset');
  for (const width of [390, 1280]) {
    await page.setViewportSize({width, height: 900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
  checks.push('Mobile/desktop home, no page errors, no external requests');
  const report = {checkedAt: new Date().toISOString(), timezone: 'Asia/Hong_Kong', platform: 'Windows / Chromium ' + browser.version(), mode: 'LOCAL_EXAMPLES_ONLY', result: 'PASS', checks, pageErrors: errors, externalRequests: external, databaseMigrations: 'NOT_RUN', realConnections: 'NONE', deployment: 'NONE'};
  await writeFile(new URL(process.argv[3]??'preview-check.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({path: fileURLToPath(new URL('preview-check-failure.png', import.meta.url)), fullPage: true});
  console.error((await page.locator('body').innerText()).slice(-16000));
  throw error;
} finally {await browser.close();}
