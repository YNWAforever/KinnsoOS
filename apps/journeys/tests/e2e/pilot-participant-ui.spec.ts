import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PilotParticipantCommand, PilotSelfSnapshot } from '../../lib/contracts/pilot';

const origin = 'http://localhost:31947';
const actor = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const digest = 'a'.repeat(64);
const code = 'b'.repeat(64);
const empty: PilotSelfSnapshot = { run: null, participant: null, nextStep: null,
  readiness: {stage:'setup_incomplete',readyToBegin:false,executionComplete:false,blockers:[]} };
const run = {id:actor,name:'Synthetic pilot',status:'running' as const,participationNoticeVersion:'Participation.V1',
  participationNoticeDigest:digest,privacyNoticeVersion:'Privacy.v2',privacyNoticeDigest:code};
const creator = {id:second,revision:1,role:'creator' as const,status:'active' as const,consentVersion:run.participationNoticeVersion,consentDigest:digest};
const consent: PilotSelfSnapshot = {...empty, run, participant:{...creator,status:'joined',consentVersion:null,consentDigest:null},
  nextStep:{code:'accept_consent',href:null,messageKey:'pilot.next.accept_consent'}};
const intake = {id:second,status:'rejected' as const,revision:3,title:'Owned guide intake',destination:'Hong Kong',
  authoredLocale:'zh-HK',sourceSummary:'Synthetic source',sourceUrls:['https://example.test/'],rightsBasis:'original' as const,
  rightsEvidenceReference:'Synthetic reference',coverRightsConfirmed:null,coverRightsEvidenceReference:null,
  reviewReason:'Clarify source',guideId:second,currentDraftRevision:7,editorHref:'/en/studio/guides/'+second+'/edit'};
const ready: PilotSelfSnapshot = {...empty,run,participant:creator,intake,contentConsent:{version:'Author.V3',digest},
  nextStep:{code:'open_workflow',href:'/en/studio/guides',messageKey:'pilot.next.open_workflow'}};
let script: string, css: string;

test.beforeAll(async () => {
  css = (await Promise.all(['app/globals.css','app/travel/workbench.css','app/integration/integration.css']
    .map(path => readFile(path,'utf8')))).join('\n');
  const bundle = await build({stdin:{resolveDir:resolve('.'),loader:'tsx',contents:`
    import {createRoot} from 'react-dom/client';
    import {AppContext} from './app/travel/ui';
    import {PilotWorkspace} from './app/travel/pilot/PilotWorkspace';
    import {CreatorSessionsWorkspace} from './app/travel/CreatorSessionsWorkspace';
    import {invalidateAccountViews} from './lib/trips/local-drafts';
    const root=createRoot(document.getElementById('fixture'));
    window.invalidatePilot=invalidateAccountViews;
    window.renderSessions=(path='studio/sessions/new')=>root.render(<AppContext.Provider value={{locale:'en',t:en=>en,href:path=>'/en/'+path}}><CreatorSessionsWorkspace actorId='11111111-1111-4111-8111-111111111111' enabled path={path}/></AppContext.Provider>);
    window.renderPilot=(actorId,locale)=>root.render(
      <AppContext.Provider value={{locale,t:(en,zh)=>locale==='en'?en:zh,href:path=>'/'+locale+'/'+path}}>
        <PilotWorkspace actorId={actorId} enabled/>
      </AppContext.Provider>);
  `},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
    define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-link',setup(builder) {
      builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export default 'a';"}));
    }}]});
  script = bundle.outputFiles[0].text;
});

async function mount(page: Page, options: {
  snapshot?: PilotSelfSnapshot; locale?: string;
  get?: (index: number) => unknown | Promise<unknown>;
  post?: (index: number) => unknown | Promise<unknown>;
} = {}) {
  const wire: {requestId:string; command:PilotParticipantCommand}[] = [];
  const errors: string[] = [];
  let reads = 0;
  page.on('pageerror',error => errors.push(error.message));
  await page.route(origin+'/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/pilot') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
    expect(url.search).toBe('');
    if (route.request().method() === 'GET') return route.fulfill({json:await options.get?.(++reads) ?? {ok:true,data:route.request().headers()['x-kinnso-intent-actor'] === second ? empty : options.snapshot ?? empty}});
    wire.push(route.request().postDataJSON());
    const response = await options.post?.(wire.length);
    if (response === false) return route.abort('failed');
    await route.fulfill({json:response ?? {ok:true,data:{snapshot:ready}}}).catch(() => {});
  });
  await page.goto(origin);
  await page.setViewportSize({width:320,height:844});
  await page.setContent(`<!doctype html><html lang="${options.locale ?? 'en'}"><head><style>${css}</style></head><body><div class="k-app"><main id="k-main" class="k-main" tabindex="-1"><div id="fixture"></div></main></div></body></html>`);
  // Simulate 200% browser text size without altering layout, wrapping or overflow rules.
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.addScriptTag({content:script});
  const render = (id: string | null) => page.evaluate(([id,locale]) => (window as any).renderPilot(id,locale), [id,options.locale ?? 'en']);
  await render(actor);
  return {wire,errors,render};
}

test('masked paste, immediate clearing, POST only, and generic invitation denial', async ({page,context}) => {
  let finish!: (value:unknown) => void;
  const response = new Promise(resolve => { finish=resolve; });
  const {wire,errors} = await mount(page,{post:()=>response});
  await expect(page.getByText('No pilot slot is available for this account.')).toBeVisible();
  const input = page.getByLabel('Invitation code');
  await expect(input).toHaveAttribute('type','pass'+'word');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(value => navigator.clipboard.writeText(value), '  '+code+'  ');
  await input.focus();
  await page.keyboard.press('Control+v');
  await expect(input).toHaveValue('  '+code+'  ');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('');
  await expect.poll(()=>wire.length).toBe(1);
  expect(wire[0].command).toMatchObject({type:'claimInvite',code,requestId:wire[0].requestId});
  finish({ok:false,code:'NOT_FOUND',retryable:false,detail:'Private other slot'});
  await expect(page.getByRole('status').filter({hasText:'This invitation code could not be used.'})).toBeVisible();
  await expect(page.getByText('Private other slot')).toHaveCount(0);
  expect(page.url()).not.toContain(code);
  expect(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).not.toContain(code);
  expect(errors).toEqual([]);
});

test('consent shows and posts exact pairs; unknown survives 401 and focus returns', async ({page}) => {
  const {wire} = await mount(page,{snapshot:consent,post:index => index === 1 ? false : index === 2
    ? {ok:false,code:'AUTH_REQUIRED',retryable:false} : undefined});
  await expect(page.getByText(run.participationNoticeVersion,{exact:true})).toBeVisible();
  await expect(page.getByText(run.privacyNoticeVersion,{exact:true})).toBeVisible();
  await expect(page.getByText(digest,{exact:true})).toBeVisible();
  await expect(page.getByText(code,{exact:true})).toBeVisible();
  const accept=page.getByRole('button',{name:'Accept these notices'});
  await accept.focus();
  await page.keyboard.press('Enter');
  const retry=page.getByRole('button',{name:'Retry same request'});
  await expect(retry).toBeFocused();
  await expect(accept).toBeDisabled();
  await retry.click();
  await expect(page.getByText(run.name)).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Sign in to continue'})).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(wire).toHaveLength(3);
  expect(wire[0].command).toMatchObject({type:'acceptConsent',noticeVersion:run.participationNoticeVersion,noticeDigest:digest,
    privacyNoticeVersion:run.privacyNoticeVersion,privacyNoticeDigest:code});
  expect(wire[1]).toEqual(wire[0]);
  expect(wire[2]).toEqual(wire[0]);
});

test('creator resubmits owned revision and published intake uses existing guide editor', async ({page}) => {
  const published = {...ready,intake:{...intake,status:'published',revision:4,title:'Revised owned title'}};
  const {wire} = await mount(page,{snapshot:ready,post:()=>({ok:true,data:{snapshot:published}})});
  await expect(page.getByText('Returned for changes · Intake revision 3')).toBeVisible();
  const title=page.getByLabel('Title',{exact:true});
  await expect(title).toHaveValue(intake.title);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await title.fill('Revised owned title');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Resubmit intake'}).click();
  await expect(page.getByText('Published · Intake revision 4')).toBeVisible();
  await expect(title).toBeDisabled();
  await expect(page.getByRole('button',{name:'Resubmit intake'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Open bound guide in Studio'})).toHaveAttribute('href',intake.editorHref);
  await expect(page.getByRole('heading',{name:'Pilot participation'})).toBeFocused();
  expect(wire[0].command).toMatchObject({type:'updateOwnedContentIntake',id:intake.id,expectedRevision:3,
    intake:{title:'Revised owned title',authorConsentVersion:'Author.V3',authorConsentDigest:digest}});
});

for (const role of ['merchant','traveller'] as const) {
  test(`${role} shows only the owned workflow at 320px and 200% in zh-HK`, async ({page}) => {
    const links={merchant:'/en/merchant/campaigns/'+actor,trip:'/en/trips/'+second,supportCaseId:null};
    await mount(page,{locale:'zh-HK',snapshot:{...ready,participant:{...creator,role},workflowLinks:links}});
    await expect(page.getByRole('heading',{name:'試行計劃參與'})).toBeVisible();
    const expected = role==='merchant' ? links.merchant : links.trip;
    const hidden = role==='merchant' ? links.trip : links.merchant;
    await expect(page.locator(`a[href="${expected.replace('/en/','/zh-HK/')}"]`)).toBeVisible();
    await expect(page.locator(`a[href="${hidden.replace('/en/','/zh-HK/')}"]`)).toHaveCount(0);
    await expect(page.getByText('Owned guide intake')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('sign-out invalidates private state and discards a late previous account response', async ({page}) => {
  let finish!: (value:unknown) => void;
  const response = new Promise(resolve => { finish=resolve; });
  const {wire,render} = await mount(page,{snapshot:consent,post:()=>response});
  await page.getByRole('button',{name:'Accept these notices'}).click();
  await expect.poll(()=>wire.length).toBe(1);
  await page.evaluate(()=> (window as any).invalidatePilot(null));
  await expect(page.getByRole('link',{name:'Sign in to continue'})).toBeVisible();
  await expect(page.getByText(run.name)).toHaveCount(0);
  finish({ok:true,data:{snapshot:ready}});
  await render(second);
  await expect(page.getByText('No pilot slot is available for this account.')).toBeVisible();
  await expect(page.getByText(run.name)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Retry same request'})).toHaveCount(0);
});

test('keyboard refresh keeps focus through loading, recoverable error and success', async ({page}) => {
  const replies = [Promise.withResolvers<unknown>(), Promise.withResolvers<unknown>()];
  await mount(page,{get:index=>index === 1 ? {ok:true,data:empty} : replies[index-2].promise});
  const refresh = page.getByRole('button',{name:'Refresh pilot'});
  const heading = page.getByRole('heading',{name:'Pilot participation'});
  for (const [index, reply] of [{ok:false,code:'UNAVAILABLE',retryable:true},{ok:true,data:empty}].entries()) {
    await refresh.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Loading pilot participation…')).toBeVisible();
    await expect(heading).toBeFocused();
    replies[index].resolve(reply);
    await expect(page.getByText(index === 0 ? 'Pilot participation could not be loaded.' : 'No pilot slot is available for this account.')).toBeVisible();
    await expect(heading).toBeFocused();
  }
});

async function expectReflow(page: Page) {
  const problems = await page.locator('#fixture').evaluate(root => {
    const issues: string[] = [];
    const viewport = document.documentElement.clientWidth;
    if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > viewport) issues.push('document overflow');
    if (parseFloat(getComputedStyle(root.querySelector('.k-page')!).fontSize) < 32) issues.push('workspace body text did not scale');
    const inspect = (rect: DOMRect, label: string) => {
      if (rect.width && (rect.left < -1 || rect.right > viewport + 1)) issues.push(label + ' crosses viewport');
    };
    for (const element of root.querySelectorAll<HTMLElement>('button,a,input,textarea,select')) {
      const box = element.getBoundingClientRect();
      inspect(box, element.tagName + ': ' + element.textContent);
      if (element.matches('button,a,select') && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1))
        issues.push('clipped control: ' + element.textContent);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent?.trim() || node.parentElement?.closest('select,textarea')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) inspect(rect, node.textContent);
    }
    return issues;
  });
  expect(problems).toEqual([]);
}

const labels = {
  en:{accept:'Accept these notices',retry:'Retry same request',signIn:'Sign in to continue',title:'Title',submit:'Submit intake',resubmit:'Resubmit intake',heading:'Pilot participation'},
  'zh-HK':{accept:'同意這些通知',retry:'重試相同請求',signIn:'登入後繼續',title:'標題',submit:'提交資料',resubmit:'重新提交資料',heading:'試行計劃參與'},
};
for (const locale of ['en','zh-HK'] as const) {
  const copy=labels[locale];
  test(`${locale} real shell reflow: consent, unknown retry and access denial`,async ({page})=>{
    await mount(page,{locale,snapshot:consent,post:index=>index===1 ? false : {ok:false,code:'AUTH_REQUIRED',retryable:false}});
    for (const value of [run.participationNoticeVersion,run.privacyNoticeVersion,digest,code])
      await expect(page.getByText(value,{exact:true})).toBeVisible();
    await expectReflow(page);
    const accept=page.getByRole('button',{name:copy.accept});
    await accept.focus();
    await page.keyboard.press('Enter');
    const retry=page.getByRole('button',{name:copy.retry});
    await expect(retry).toBeFocused();
    await expectReflow(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link',{name:copy.signIn})).toBeVisible();
    await expect(retry).toBeFocused();
    await expectReflow(page);
  });

  for (const status of ['new','draft','rejected','submitted','approved'] as const) {
    test(`${locale} real shell reflow: ${status} creator intake`,async ({page})=>{
      const {wire}=await mount(page,{locale,snapshot:{...ready,intake:status==='new' ? null : {...intake,status}},
        post:()=>({ok:true,data:{snapshot:{...ready,intake:{...intake,status:'submitted',revision:4}}}})});
      const title=page.getByLabel(copy.title,{exact:true});
      await expect(title).toHaveValue(status==='new' ? '' : intake.title);
      await expectReflow(page);
      if (status==='approved' || status==='submitted') {
        await expect(title).toBeDisabled();
        await expect(page.getByRole('button',{name:copy.resubmit})).toHaveCount(0);
        if (status==='approved') await expect(page.locator(`a[href="/${locale}/studio/guides/${second}/edit"]`)).toBeVisible();
        expect(wire).toEqual([]);
        return;
      }
      if (status==='new') {
        await title.fill(intake.title);
        for (const [label,value] of [
          [locale==='en' ? 'Destination' : '目的地',intake.destination],
          [locale==='en' ? 'Source summary' : '來源摘要',intake.sourceSummary],
          [locale==='en' ? 'Rights evidence reference' : '權利證明參考資料',intake.rightsEvidenceReference],
        ]) await page.getByLabel(label,{exact:true}).fill(value);
      }
      await page.getByRole('checkbox').check();
      const submit=page.getByRole('button',{name:status==='new' ? copy.submit : copy.resubmit,exact:true});
      await submit.focus();
      await page.keyboard.press('Enter');
      await expect(title).toBeDisabled();
      await expect(page.getByRole('heading',{name:copy.heading})).toBeFocused();
      expect(wire[0].command).toMatchObject(status==='new' ? {type:'submitContentIntake'} :
        {type:'updateOwnedContentIntake',id:intake.id,expectedRevision:intake.revision});
      await expectReflow(page);
    });
  }
}

test('wrong, expired, claimed and revoked responses show the same safe denial',async ({page})=>{
  const reasons=['wrong','expired','claimed','revoked'];
  const {wire}=await mount(page,{post:index=>({ok:false,code:'NOT_FOUND',retryable:false,detail:'Fixture reason: '+reasons[index-1]})});
  const input=page.getByLabel('Invitation code');
  for (const [index,reason] of reasons.entries()) {
    await input.fill(index.toString(16).repeat(64));
    await page.getByRole('button',{name:'Claim invitation'}).click();
    await expect.poll(()=>wire.length).toBe(index+1);
    await expect(page.getByRole('status').filter({hasText:'This invitation code could not be used.'})).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(page.getByText('Fixture reason: '+reason)).toHaveCount(0);
  }
});

test('FINAL owned intake selector permits new and existing records',async({page})=>{
 await mount(page,{snapshot:{...ready,intakes:[intake,{...intake,id:actor,title:'Second intake',status:'approved'}]} as any});
 await page.getByLabel('Your content intakes',{exact:true}).selectOption(actor);
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Second intake');
 await expect(page.getByLabel('Title',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'New content intake',exact:true}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Title',{exact:true})).toBeEnabled();
});
test('FINAL acknowledgement controls use server identities and withdrawal confirms',async({page})=>{
 const {wire}=await mount(page,{snapshot:{...ready,acknowledgements:{notificationId:actor,supportCaseId:second},workflowLinks:{merchant:null,trip:null,supportCaseId:second,supportMissionId:actor}} as any});
 await expect(page.getByRole('link',{name:'Open support',exact:true})).toHaveAttribute('href','/en/support?mission='+actor);
 await page.getByRole('button',{name:'Acknowledge pilot notification',exact:true}).click();
 await expect.poll(()=>wire.length).toBe(1);expect(wire[0].command).toMatchObject({type:'acknowledgeNotification',notificationId:actor});
 await page.getByRole('button',{name:'Withdraw from pilot',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'Confirm withdrawal',exact:true}).click();
 await expect.poll(()=>wire.length).toBe(2);expect(wire[1].command).toMatchObject({type:'withdrawParticipation',runId:run.id,participantId:creator.id,expectedRevision:1});
});
test('FINAL creator session lost success retries identical request and rejection remains editable',async({page})=>{
 await mount(page);
 const bodies:string[]=[];
 await page.route(origin+'/api/creator/sessions',async route=>{
  bodies.push(route.request().postData()!);
  if(bodies.length===1)return route.abort('failed');
  return route.fulfill({json:{ok:true,data:{id:actor}}});
 });
 await page.evaluate(()=>(window as any).renderSessions());
 await page.getByLabel('Session title',{exact:true}).fill('Synthetic session');
 await page.getByLabel('Description',{exact:true}).fill('Synthetic');
 await page.getByLabel('Starts at (UTC)',{exact:true}).fill('2026-12-01T10:00');
 await page.getByRole('button',{name:'Save session',exact:true}).click();
 await page.getByRole('button',{name:'Retry the same save',exact:true}).click();
 await expect(page.getByText('Session saved on the server.',{exact:true})).toBeVisible();
 expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);
 await page.unroute(origin+'/api/creator/sessions');
 await page.route(origin+'/api/creator/sessions',route=>route.fulfill({status:400,json:{ok:false,code:'INVALID'}}));
 await page.getByLabel('Session title',{exact:true}).fill('Rejected session');
 await page.getByLabel('Description',{exact:true}).fill('Synthetic');
 await page.getByLabel('Starts at (UTC)',{exact:true}).fill('2026-12-01T10:00');
 await page.getByRole('button',{name:'Save session',exact:true}).click();
 await expect(page.getByText('Session request failed: INVALID')).toBeVisible();
 await expect(page.getByLabel('Session title',{exact:true})).toBeEnabled();
});

test('lost edit response retries exact revision and reconciles the newer record',async({page})=>{
 await mount(page);
 const bodies:string[]=[];
 const initial={id:actor,title:'Synthetic initial',description:'Synthetic',type:'ask_a_creator',startsAt:'2026-12-01T10:00:00Z',durationMinutes:60,status:'scheduled',destinationTags:[],revision:1};
 await page.route(origin+'/api/creator/sessions/'+actor,async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{ok:true,data:bodies.length?{...initial,title:'Synthetic B',revision:3}:initial}});
  bodies.push(route.request().postData()!);
  if(bodies.length===1)return route.abort('failed');
  return route.fulfill({json:{ok:true,data:{id:actor,revision:2}}});
 });
 await page.evaluate(id=>(window as any).renderSessions('studio/sessions/'+id+'/edit'),actor);
 const title=page.getByLabel('Session title',{exact:true});
 await expect(title).toHaveValue('Synthetic initial');
 await title.fill('Synthetic A');
 await page.getByRole('button',{name:'Save session',exact:true}).click();
 await page.getByRole('button',{name:'Retry the same save',exact:true}).click();
 await expect(page.getByText('Session saved on the server.',{exact:true})).toBeVisible();
 expect(bodies).toHaveLength(2);
 expect(bodies[1]).toBe(bodies[0]);
 expect(JSON.parse(bodies[0])).toMatchObject({expectedRevision:1,input:{title:'Synthetic A'}});
 await expect(title).toHaveValue('Synthetic B');
});
