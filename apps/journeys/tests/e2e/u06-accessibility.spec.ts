import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { verifyTestTarget } from '../../scripts/verify-test-target.mjs';

loadEnvFile('.env.test');
verifyTestTarget();
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, global: { fetch: boundedFetch } });
const ok = async (promise: PromiseLike<any>) => { const r = await promise; expect(r.error).toBeNull(); return r.data; };

test('U06 connected routes reflow across four widths and a 200% zoom-equivalent viewport; real evidence dialog works by keyboard', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(10_000); page.setDefaultNavigationTimeout(15_000);
  let failed = false;
  expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
  const users: string[] = [];
  let merchantId = '', missionId = '', opsId = '';
  const email = `synthetic-u06-${randomUUID()}@example.test`, password = `Synthetic!${randomUUID()}`;
  const measurements: object[] = [];
  try {
    const operator = (await ok(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user; users.push(operator.id);
    const creator = (await ok(admin.auth.admin.createUser({ email: `synthetic-u06-creator-${randomUUID()}@example.test`, password, email_confirm: true }))).user; users.push(creator.id);
    await ok(admin.from('creators').update({ status: 'active' }).eq('id', creator.id));
    opsId = (await ok(admin.from('kinnso_ops_members').insert({ user_id: operator.id, display_name: 'Synthetic accessibility operator', role: 'admin' }).select('id').single())).id;
    merchantId = (await ok(admin.from('merchant_profiles').insert({ user_id: operator.id, company_name: 'Synthetic U06 company', contact_email: email }).select('id').single())).id;
    missionId = (await ok(admin.from('missions').insert({ merchant_profile_id: merchantId, title: 'Synthetic accessible review', summary: 'Owned local keyboard verification fixture', mission_type: 'coupon_affiliate', status: 'published' }).select('id').single())).id;
    const participant = await ok(admin.from('mission_participants').insert({ mission_id: missionId, creator_id: creator.id, status: 'active', source: 'open_join' }).select('id').single());
    const milestone = await ok(admin.from('mission_milestones').insert({ mission_id: missionId, title: 'Keyboard evidence fixture', description: 'Synthetic verification milestone' }).select('id').single());
    await ok(admin.from('mission_milestone_submissions').insert({ mission_milestone_id: milestone.id, mission_participant_id: participant.id, status: 'submitted', submitted_at: new Date().toISOString(), notes: 'Synthetic evidence readable in the real modal.', proof_urls: ['https://example.test/synthetic-keyboard-evidence'] }));
    await page.goto('/en/sign-in?next=/en/ops');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/en/ops');
    await expect(page.getByRole('heading', { name: 'Review submissions', exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic accessible review', { exact: true })).toBeVisible();
    await expect.poll(async () => { const r = await page.request.get('/api/session', { timeout: 10_000 }); const b = await r.json(); return r.ok() && b.ok && b.data?.id === operator.id; }, { timeout: 15_000, message: 'Browser session must identify the signed-in synthetic operator before route navigation' }).toBe(true);
    const routes = [
      { path: '/en/trips', heading: 'Your trips', ready: () => page.getByLabel('Trip title', { exact: true }) },
      { path: '/en/merchant', heading: 'Merchant workspace', ready: () => page.getByRole('heading', { name: 'Create coupon promotion brief', exact: true }) },
      { path: '/en/ops', heading: 'Operations queue', ready: () => page.getByRole('heading', { name: 'Review submissions', exact: true }) },
      { path: '/en/me', heading: 'Your Kinnso account', ready: () => page.getByRole('button', { name: 'Sign out', exact: true }) },
    ];
    // 640 x 450 CSS px is the content viewport equivalent of 1280 x 900 at 200% browser zoom.
    // deviceScaleFactor or pinch/pageScaleFactor would not test layout reflow and are not used.
    for (const viewport of [{ width: 320, height: 800 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 640, height: 450 }]) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await test.step(`${route.path} reflow at ${viewport.width}x${viewport.height}`, async () => {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.heading, exact: true })).toBeVisible();
        await expect(route.ready()).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        const layout = await page.evaluate(() => ({ viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, visibleNavigation: [...document.querySelectorAll('nav[aria-label]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).length, unnamedControls: [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type=hidden]),textarea,select')].filter(el => el.getBoundingClientRect().width > 0 && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length }));
        measurements.push({ path: route.path, ...viewport, zoomEquivalent: viewport.width === 640 ? '200% of 1280x900' : null, ...layout });
        expect(layout.documentWidth, `${route.path} at ${viewport.width}px`).toBeLessThanOrEqual(layout.viewport + 1);
        expect(layout.bodyWidth, `${route.path} body at ${viewport.width}px`).toBeLessThanOrEqual(layout.viewport + 1);
        expect(layout.visibleNavigation).toBeGreaterThan(0);
        expect(layout.unnamedControls).toBe(0);
        });
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/en/ops');
    await page.getByRole('link', { name: '繁中', exact: true }).click();
    await page.waitForURL('**/zh-HK/ops');
    await expect(page.getByRole('heading', { level: 1, name: '營運待辦', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '手機導航', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'EN', exact: true }).click();
    await page.waitForURL('**/en/ops');
    await expect(page.getByRole('heading', { name: 'Review submissions', exact: true })).toBeVisible();

    const trigger = page.getByRole('article').filter({ hasText: 'Synthetic accessible review' }).getByRole('button', { name: 'Review evidence', exact: true });
    // Enter keyboard modality before focusing: focus-visible intentionally excludes pointer focus.
    await page.keyboard.press('Tab');
    await trigger.focus();
    await expect(trigger).toBeFocused();
    const focusStyle = await trigger.evaluate(el => { const style = getComputedStyle(el); return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow }; });
    measurements.push({ check: 'keyboard-trigger-focus-style', ...focusStyle });
    expect((focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0) || focusStyle.boxShadow !== 'none').toBe(true);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Submission evidence', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Synthetic evidence readable in the real modal.', { exact: true })).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const close = dialog.getByRole('button', { name: 'Close / 關閉', exact: true });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('link', { name: 'https://example.test/synthetic-keyboard-evidence', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    const drawer = await dialog.evaluate(el => ({ width: el.getBoundingClientRect().width, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, viewport: innerWidth }));
    measurements.push({ check: '375px-evidence-dialog', ...drawer });
    expect(drawer.width).toBeLessThanOrEqual(drawer.viewport);
    expect(drawer.scrollWidth).toBeLessThanOrEqual(drawer.clientWidth + 1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } catch (error) { failed = true; throw error; } finally {
    const errors: string[] = [];
    const clean = async (label: string, operation: () => PromiseLike<unknown>) => { try { await operation(); } catch { errors.push(label); } };
    await clean('measurement attachment', () => testInfo.attach('u06-layout-and-focus-measurements', { body: JSON.stringify({ scope: 'Synthetic connected-route reflow, named controls and keyboard modal checks; not formal WCAG or Core Web Vitals certification', measurements }, null, 2), contentType: 'application/json' }));
    if (missionId) await clean('mission', () => ok(admin.from('missions').delete().eq('id', missionId)));
    if (merchantId) await clean('merchant', () => ok(admin.from('merchant_profiles').delete().eq('id', merchantId)));
    if (opsId) { await clean('audit', () => ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id', opsId))); await clean('ops membership', () => ok(admin.from('kinnso_ops_members').delete().eq('id', opsId))); }
    for (const id of users) await clean('synthetic auth user', () => ok(admin.auth.admin.deleteUser(id)));
    if (errors.length) { testInfo.annotations.push({ type: 'cleanup failures', description: errors.join(', ') }); await testInfo.attach('u06-cleanup-failures', { body: JSON.stringify(errors), contentType: 'application/json' }).catch(() => {}); if (!failed) throw new Error('Synthetic cleanup failed: ' + errors.join(', ')); }
  }
});
