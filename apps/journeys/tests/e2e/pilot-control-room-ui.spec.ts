import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const runId = '11111111-1111-4111-8111-111111111111';
const anotherRun = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const slot = '44444444-4444-4444-8444-444444444444';
const invite = '55555555-5555-4555-8555-555555555555';
const intake = '66666666-6666-4666-8666-666666666666';
const digest = 'a'.repeat(64);
const origin = 'http://localhost:31947';
let script = '', css = '';

test.beforeAll(async () => {
  css = await readFile('app/globals.css','utf8') + '\n' + await readFile('app/travel/workbench.css','utf8') + '\n' + await readFile('app/integration/integration.css','utf8');
  const result = await build({ stdin: { resolveDir:resolve('.'), loader:'tsx', contents:`
    import {createRoot} from 'react-dom/client';
    import {AppContext} from './app/travel/ui';
    import {PilotControlRoom} from './app/travel/pilot/PilotControlRoom';
    const root=createRoot(document.getElementById('fixture'));
    window.renderPilot=(actorId,runId,locale,show=true)=>root.render(show
      ? <AppContext.Provider value={{locale,t:(en,zh)=>locale==='en'?en:zh,href:path=>'/'+locale+'/'+path}}>
          <PilotControlRoom actorId={actorId} runId={runId} enabled/>
        </AppContext.Provider> : null);
  ` }, bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'}, plugins:[{name:'fixture-link',setup(builder) {
    builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export default 'a';"}));
  }}] });
  script = result.outputFiles[0].text;
});

function snapshot(id: string, stage = 'executing') {
  return {
    run:{id,status:'running',revision:1,dataClassification:'synthetic',candidateReleaseSha:'synthetic',environmentOrigin:origin,acceptanceStartedAt:null},
    participants:[{id:slot,role:'traveller',cohortRole:'required_traveller',status:'invited',userLinked:false,consentAccepted:false,revision:2,
      activeInvite:{id:invite,status:'active',expiresAt:'2026-11-08T00:00:00Z'}}],
    contentIntakes:[{id:intake,guideId:slot,status:'submitted',revision:3,authoredLocale:'en',currentDraftRevision:7,currentContentDigest:digest,title:'Authored title',destination:'Kyoto',review:{sourceSummary:'Reviewable source',sourceUrls:['https://example.test/source'],rightsBasis:'permission',rightsEvidenceReference:'ref:1',coverRightsConfirmed:true,coverRightsEvidenceReference:'ref:2',coverUrl:'https://example.test/cover.jpg',draftPreview:{title:'Authored title',summary:'Authored preview'}}}],
    checks:[{id:slot,code:'physical_ios',status:'not_run',derived:false,revision:1},
      {code:'guide_saved',status:'not_run',derived:true,revision:1,observedSummary:'PRIVATE SUPPORT BODY'}],
    collaboration:null,
    readiness:{stage,readyToBegin:false,executionComplete:false,
      blockers:[{category:'cohort',code:'required_creator_missing',messageKey:'pilot.readiness.required_creator_missing',recordId:id}]},
  };
}

async function mount(page: Page, options: {actor?: string|null; locale?: string; writable?: boolean; denied?: boolean; stage?: string;
  post?: (body:any, index:number) => any | Promise<any>} = {}) {
  const wire: {body:any; actor:string|undefined}[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(origin+'/**', async route => {
    const url = new URL(route.request().url());
    const reply = (data:unknown) => route.fulfill({json:data});
    if (url.pathname === '/api/ops/routing') return reply({ok:true,data:{canAssign:options.writable !== false}});
    if (url.pathname !== '/api/ops/pilot') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
    if (route.request().method() === 'GET') return reply(options.denied ? {ok:false,code:'FORBIDDEN'} :
      {ok:true,data:snapshot(url.searchParams.get('runId') ?? runId, options.stage)});
    const body=route.request().postDataJSON();
    wire.push({body,actor:route.request().headers()['x-kinnso-intent-actor']});
    const result = await options.post?.(body,wire.length);
    if (result === false) return route.abort('failed');
    return reply(result ?? {ok:true,data:{snapshot:snapshot(runId)}});
  });
  await page.goto(origin);
  await page.setViewportSize({width:320,height:844});
  await page.setContent(`<style>${css}html{font-size:200%}body:has(.k-app){margin:16px;overflow-x:visible}.k-app{font-size:1rem}button,a{white-space:normal}</style><div class="k-app"><main id="fixture"></main></div>`);
  await page.addScriptTag({content:script});
  const render = (id: string, show = true, actor: string | null = options.actor === undefined ? actorId : options.actor) =>
    page.evaluate(([a,r,l,s]) => (window as any).renderPilot(a,r,l,s), [actor,id,options.locale ?? 'en',show] as const);
  await render(runId);
  return {wire,errors,render};
}

for (const [locale, category, detail] of [['en','Participant cohort','Required creator slot is missing.'],['zh-HK','參與組別','缺少必要創作者名額。']]) {
  test(`localizes blocker and hides write controls for moderator at 320px / 200%: ${locale}`,async({page})=>{
    const {wire,errors}=await mount(page,{locale,writable:false});
    await expect(page.getByText(category+': '+detail,{exact:false})).toContainText(runId);
    await expect(page.getByRole('button',{name:/Approve exact draft|批准此草稿版本|Revoke invitation|撤銷邀請/})).toHaveCount(0);
    await expect(page.getByText('PRIVATE SUPPORT BODY')).toHaveCount(0);
    expect(wire).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('signed out and non-ops denial expose no records',async({page})=>{
  await mount(page,{actor:null});
  await expect(page.getByRole('link',{name:'Sign in to continue'})).toBeVisible();
  await page.unrouteAll();
  await mount(page,{denied:true});
  await expect(page.getByRole('alert')).toContainText('Access denied');
  await expect(page.getByRole('heading',{name:'Participant slots'})).toHaveCount(0);
});

for (const [stage, title] of Object.entries({setup_incomplete:'Setup incomplete',ready_to_begin:'Ready to begin',executing:'Executing',
  execution_complete:'Execution complete',completed:'Completed',blocked:'Blocked'})) {
  test('renders distinct readiness '+stage,async({page})=>{
    await mount(page,{stage,writable:false});
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  });
}

test('approve exact content, focus dialog, and retry original wire envelope after unmount and run switch',async({page})=>{
  let release!: () => void;
  const wait=new Promise<void>(resolve=>{release=resolve;});
  const {wire,errors,render}=await mount(page,{post:async(_,index)=>{if(index===1){await wait;return false;}}});
  const approve=page.getByRole('button',{name:'Approve exact draft'});
  await expect(approve).toBeVisible();
  await approve.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('I reviewed this exact draft revision and digest.').check();
  await page.getByLabel('Written approval reason').fill('Reviewed fixture');
  await approve.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText(digest);
  await page.keyboard.press('Escape');
  await expect(approve).toBeFocused();
  await approve.press('Enter');
  await dialog.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Close / 關閉'})).toBeDisabled();
  await expect(dialog.getByText(/Saving\./)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByText(/Saving\./)).toBeFocused();
  expect(await dialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth && el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole('button',{name:'Retry same request'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading',{name:'Pilot control room'})).toBeFocused();
  await render(runId,false);
  await expect(page.getByRole('heading',{name:'Pilot control room'})).toHaveCount(0);
  await render(anotherRun);
  const retry=page.getByRole('button',{name:'Retry previous request'});
  await expect(retry).toBeVisible();
  await expect(approve).toHaveCount(0);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByText('Pilot run record is missing.')).toHaveCount(0);
  await expect(page.getByText(anotherRun,{exact:true})).toBeVisible();
  expect(wire).toHaveLength(2);
  expect(wire[0]).toEqual(wire[1]);
  expect(wire[0].actor).toBe(actorId);
  expect(wire[0].body.command).toEqual({type:'reviewContentIntake',id:intake,expectedRevision:3,decision:'approve',
    reason:'Reviewed fixture',expectedDraftRevision:7,expectedContentDigest:digest});
  expect(wire[0].body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(errors).toEqual([]);
});

test('one-time invitation is cleared on close; returning operator revokes snapshot ID',async({page})=>{
  const secret='fixture-code-'.repeat(5);
  const {wire,render}=await mount(page,{post:body=>body.command.type==='createInvite'
    ? {ok:true,data:{snapshot:snapshot(runId),inviteCode:secret}} : undefined});
  const generate=page.getByRole('button',{name:'Generate or rotate code'});
  await generate.click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByLabel('Invitation code',{exact:true})).toHaveValue(secret);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Clipboard blocked'); } } }));
  await page.getByRole('button',{name:'Copy code'}).click();
  await expect(page.getByText('Clipboard unavailable. Select and copy the code manually.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(generate).toBeFocused();
  await expect(page.locator('input[value="'+secret+'"]')).toHaveCount(0);
  await render(runId,false);
  await expect(generate).toHaveCount(0);
  await render(runId);
  await page.getByLabel('Written reason',{exact:true}).last().fill('Revoke fixture');
  await page.getByRole('button',{name:'Revoke invitation'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(wire[1].body.command).toMatchObject({type:'revokeInvite',id:invite,participantId:slot,expectedRevision:2});
});

test('operator records manual evidence without an editable result for a derived check',async({page})=>{
  const {wire,errors}=await mount(page);
  const manual=page.locator('article').filter({has:page.getByRole('heading',{name:'physical ios',exact:true})});
  const derived=page.locator('article').filter({has:page.getByRole('heading',{name:'guide saved',exact:true})});
  await expect(derived).toBeVisible();
  await expect(derived.getByRole('combobox')).toHaveCount(0);
  await manual.getByRole('combobox').selectOption('pass');
  await manual.getByLabel('Opaque evidence reference (ref: followed by an ID)',{exact:true}).last().fill('ref:123');
  await manual.getByLabel('Observation (no private text; required to pass)').fill('Physical fixture verified');
  await manual.getByRole('button',{name:'Record manual check result'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(wire[0].body.command).toEqual({type:'setManualCheck',id:slot,expectedRevision:1,status:'pass',
    evidenceReference:'ref:123',observedSummary:'Physical fixture verified'});
  const overflow = await page.evaluate(() => ({ width:document.documentElement.scrollWidth, viewport:innerWidth,
    elements:[...document.querySelectorAll('#fixture *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1)
      .map(el=>[el.tagName,el.getBoundingClientRect().right,el.textContent?.slice(0,50)]) }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
  expect(errors).toEqual([]);
});

test('first FORBIDDEN retains the exact request through an authorized refresh of the mounted room',async({page})=>{
  const fixture = { denied:false, writable:true, post:(_body:unknown,index:number) =>
    index===1 ? {ok:false,code:'FORBIDDEN',retryable:false} : undefined };
  const {wire,errors}=await mount(page,fixture);
  await page.getByRole('button',{name:'Generate or rotate code'}).click();
  fixture.denied=true;
  fixture.writable=false;
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Access denied');
  await expect(page.getByRole('heading',{name:'Participant slots'})).toHaveCount(0);

  fixture.denied=false;
  fixture.writable=true;
  await page.getByRole('button',{name:'Refresh pilot'}).click();
  const retry=page.getByRole('button',{name:'Retry previous request'});
  await expect(retry).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate or rotate code'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add participant slot'})).toHaveCount(0);
  expect(wire).toHaveLength(1);

  await retry.click();
  await expect(page.getByRole('button',{name:'Add participant slot'})).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(wire).toHaveLength(2);
  expect(wire[1]).toEqual(wire[0]);
  expect(wire[0].actor).toBe(actorId);
  expect(wire[0].body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(wire[0].body.command).toMatchObject({type:'createInvite',participantId:slot,expectedRevision:2});
  expect(errors).toEqual([]);
});

test('FINAL operator reads source cover rights and draft before approval',async({page})=>{
 await mount(page);
 await expect(page.getByText('Reviewable source',{exact:true})).toBeVisible();
 await expect(page.getByText('true · ref:2',{exact:true})).toBeVisible();
 await page.getByText('Read bound draft preview',{exact:true}).click();
 await expect(page.getByText(/Authored preview/)).toBeVisible();
});
