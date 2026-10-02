import { test, expect } from '@playwright/test';
test('first HTML has its requested language without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const locale of ['en', 'zh-HK']) {
    const response = await page.goto(`http://127.0.0.1:3491/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  const missing = await page.goto('http://127.0.0.1:3491/fr');
  expect(missing?.status()).toBe(404);
  await context.close();
});
for (const width of [320, 375, 768, 1280]) {
  test(`shell fits ${width}px and 200% text with keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en');
    await page.locator('main').first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll('body *')).map(e => ({ name: e.className,
        width: Math.round(e.getBoundingClientRect().width), right: Math.round(e.getBoundingClientRect().right) }))
        .filter(e => e.width > innerWidth + 1).slice(0, 12) }));
    await page.screenshot({ path: `evidence/shell-${width}.png`, fullPage: true });
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    await page.screenshot({ path: `evidence/shell-${width}.png`, fullPage: true });
  });
}
