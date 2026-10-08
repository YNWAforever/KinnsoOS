import { test, expect, type Page } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
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
    for (const name of ['Affiliate commission rate (%)', 'Platform commission rate (%)', 'Creator commission rate (%)']) await page.getByLabel(name, { exact: true }).fill('0');
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

test('U04 owner selects a scoped member, previews access and retries one audited change; bilingual percentages are explicit',async({page},testInfo)=>{
 test.setTimeout(120_000);const users:string[]=[];let company:string|null=null;let failed=false;
 async function actor(){const email=`synthetic-n11-${randomUUID()}@example.test`,password=`Synthetic!${randomUUID()}`;const user=(await ok(admin.auth.admin.createUser({email,password,email_confirm:true}))).user;users.push(user.id);const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false},global:{fetch:boundedFetch}});await ok(client.auth.signInWithPassword({email,password}));return{id:user.id,email,password,client};}
 try{
  const owner=await actor(),clerk=await actor(),outsider=await actor();
  await ok(admin.from('creators').update({display_name:'Synthetic branch colleague'}).eq('id',clerk.id));
  company=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic N11 team',contact_email:owner.email}).select('id').single())).id;
  const branch=randomUUID(),command=(payload:object)=>ok(owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:company,p_request_id:randomUUID(),p_command:payload}));
  await command({type:'createBranch',id:branch,name:'Synthetic Central branch'});await command({type:'setMember',userId:clerk.id,role:'clerk',branchIds:[branch],active:true});
  await signIn(page,owner.email,owner.password,owner.id);
  await expect(page.getByLabel('Existing team member',{exact:true})).toBeVisible();
  const directory=await page.request.get('/api/merchant/team?id='+company);expect(directory.status()).toBe(200);expect(directory.headers()['cache-control']).toContain('private');expect(directory.headers()['cache-control']).toContain('no-store');const body=await directory.json();expect(body.data.members.map((m:any)=>m.userId)).toEqual([clerk.id]);expect(JSON.stringify(body)).not.toContain(outsider.id);expect(JSON.stringify(body)).not.toContain(clerk.email);
  await page.getByLabel('Existing team member',{exact:true}).selectOption(clerk.id);await expect(page.getByRole('heading',{name:'Access preview',exact:true})).toBeVisible();await expect(page.getByText('Can redeem and view outcomes only at the assigned branches; no company financial review.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel team edits',exact:true}).click();await expect(page.getByLabel('Existing team member',{exact:true})).toHaveValue('');
  await page.getByLabel('Existing team member',{exact:true}).selectOption(clerk.id);await page.getByLabel('Organization role',{exact:true}).selectOption('finance');await expect(page.getByText('Can review recorded financial outcomes within the assigned branches; cannot redeem or manage members.',{exact:true})).toBeVisible();
  await page.getByLabel('Access active',{exact:true}).uncheck();await page.getByLabel('Access change reason',{exact:true}).fill('Synthetic N11 owner reviewed finance access');
  const payloads:unknown[]=[];let attempts=0;await page.route('**/api/merchant',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}payloads.push(route.request().postDataJSON());const response=await route.fetch();if(++attempts===1)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'UNAVAILABLE'})});else await route.fulfill({response});});
  await page.getByRole('button',{name:'Save team access',exact:true}).click();await expect(page.getByRole('button',{name:'Retry the same request',exact:true})).toBeVisible();await expect(page.getByLabel('Organization role',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Retry the same request',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved on the server.'})).toBeVisible();expect(payloads).toHaveLength(2);expect(payloads[1]).toEqual(payloads[0]);
  expect((await clerk.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:company})).error?.message).toBe('forbidden');
  const audit=execFileSync('docker',['exec','supabase_db_kinnsoos-b1-20261002','psql','-U','postgres','-d','postgres','-X','-Atq','-c',`select count(*) from kinnso_internal.merchant_audit where merchant_id='${company}' and action='setMember' and reason='Synthetic N11 owner reviewed finance access';`],{encoding:'utf8'});expect(audit.trim()).toBe('1');
  await page.goto('/zh-HK/merchant');await expect(page.getByLabel('現有公司成員',{exact:true})).toBeVisible();await page.getByLabel('現有公司成員',{exact:true}).selectOption(clerk.id);await expect(page.getByRole('heading',{name:'權限預覽',exact:true})).toBeVisible();await expect(page.getByLabel('創作者佣金比例（%）',{exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:800});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await page.screenshot({path:'evidence/merchant-team-320.png',fullPage:true});
 }catch(error){failed=true;throw error;}finally{const errors:string[]=[];if(company){try{await ok(admin.from('merchant_profiles').delete().eq('id',company));}catch{errors.push('merchant cleanup');}}for(const id of users){try{await ok(admin.auth.admin.deleteUser(id));}catch{errors.push('auth fixture cleanup');}}if(errors.length){testInfo.annotations.push({type:'cleanup failures',description:errors.join(',')});if(!failed)throw Error('Synthetic N11 cleanup failed');}}
});

for (const locale of ['en', 'zh-HK'] as const) {
  test(`N14 ${locale} merchant fields remain readable at narrow and enlarged-text widths with keyboard saving`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    expect(new URL(baseURL!).origin).toBe('http://127.0.0.1:3495');
    const users: string[] = [];
    let company: string | null = null, failed = false;
    const text = (en: string, zh: string) => locale === 'en' ? en : zh;
    try {
      const email = `synthetic-n14-${randomUUID()}@example.test`, password = `Synthetic!${randomUUID()}`;
      const user = (await ok(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user;
      users.push(user.id);
      company = (await ok(admin.from('merchant_profiles').insert({ user_id: user.id, company_name: 'Synthetic N14 narrow company', contact_email: email }).select('id').single())).id;
      const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { fetch: boundedFetch } });
      await ok(client.auth.signInWithPassword({ email, password }));
      await ok(client.rpc('apply_kinnso_merchant_command', { p_merchant_id: company, p_request_id: randomUUID(), p_command: { type: 'createBranch', id: randomUUID(), name: 'Synthetic N14 initial branch', reason: 'Synthetic mobile fixture' } }));
      await signIn(page, email, password, user.id);
      if (locale !== 'en') await page.goto(`/${locale}/merchant`);
      const section = page.getByRole('heading', { name: text('Merchant workspace', '商戶工作區'), exact: true }).locator('..');
      await expect(section.getByLabel(text('Branch name', '分店名稱'), { exact: true })).toBeVisible();
      const measurements = [];
      for (const [width, enlarged] of [[320, false], [640, false], [1280, false], [320, true]] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(enlarged => { document.documentElement.style.fontSize = enlarged ? '32px' : ''; (document.querySelector('.k-app') as HTMLElement).style.fontSize = enlarged ? '32px' : ''; }, enlarged);
        const geometry = await section.evaluate(element => {
          const fields = Array.from(element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('form input:not([type="checkbox"]), form select, form textarea')).filter(field => field.getClientRects().length);
          return { viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, fields: fields.map(field => {
            const label = field.closest('label')!, control = field.getBoundingClientRect(), bounds = label.getBoundingClientRect();
            const node = Array.from(label.childNodes).find(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())!;
            const range = document.createRange(); range.selectNodeContents(node);
            return { name: node.textContent!.trim(), height: control.height, width: control.width, available: bounds.width, separation: control.top - range.getBoundingClientRect().bottom, left: control.left, right: control.right };
          }) };
        });
        measurements.push({ width, enlarged, geometry });
        await page.screenshot({ path: `evidence/n14-merchant-${locale}-${width}-${enlarged ? 'double-text' : 'normal'}.png`, fullPage: true });
        expect(geometry.fields.length).toBeGreaterThanOrEqual(12);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
        for (const field of geometry.fields) {
          expect(field.height, `${field.name}: usable field height`).toBeGreaterThanOrEqual(44);
          expect(field.width, `${field.name}: full-width entry`).toBeGreaterThanOrEqual(field.available - 2);
          expect(field.separation, `${field.name}: label above the control`).toBeGreaterThanOrEqual(4);
          expect(field.left).toBeGreaterThanOrEqual(0);
          expect(field.right).toBeLessThanOrEqual(geometry.viewport);
        }
      }
      await testInfo.attach('n14-local-browser-geometry', { body: JSON.stringify(measurements), contentType: 'application/json' });
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; (document.querySelector('.k-app') as HTMLElement).style.fontSize = ''; });
      const branchName = section.getByLabel(text('Branch name', '分店名稱'), { exact: true });
      await branchName.focus();
      await expect(branchName).toBeFocused();
      await branchName.fill('Synthetic N14 keyboard branch');
      await page.keyboard.press('Tab');
      const create = section.getByRole('button', { name: text('Create branch', '建立分店'), exact: true });
      await expect(create).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(section.getByRole('status').filter({ hasText: text('Saved on the server.', '已儲存至伺服器。') })).toBeVisible();
      const workspace = await ok(client.rpc('get_kinnso_merchant_workspace', { p_merchant_id: company }));
      expect(workspace.branches.filter((branch: any) => branch.name === 'Synthetic N14 keyboard branch')).toHaveLength(1);
      await page.reload();
      await expect(section.getByLabel(text('Redemption branch', '核銷分店'), { exact: true }).locator('option').filter({ hasText: 'Synthetic N14 keyboard branch' })).toHaveCount(1);
    } catch (error) { failed = true; throw error; } finally {
      const errors: string[] = [];
      if (company) { try { await ok(admin.from('merchant_profiles').delete().eq('id', company)); } catch { errors.push('merchant'); } }
      for (const id of users) { try { await ok(admin.auth.admin.deleteUser(id)); } catch { errors.push('auth'); } }
      if (errors.length) { testInfo.annotations.push({ type: 'cleanup failures', description: errors.join(',') }); if (!failed) throw Error('Synthetic N14 cleanup failed: ' + errors.join(',')); }
    }
  });
}
