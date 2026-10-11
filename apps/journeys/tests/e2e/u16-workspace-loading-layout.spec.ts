import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Real React, role components, recovery hook, next-action derivation and CSS.
// Only session/repository/router boundaries are fixtures; no Auth, DB or seed.
let script='',css='';
const id='11111111-1111-4111-8111-111111111111';
const detail={id,title:'Synthetic original collaboration with a long readable title',summary:'Owned original brief.',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',eligible:true,joinAvailable:false,evidenceAvailable:false,paidFeeAmount:null,requirements:[],deliverables:[],milestones:[],submissions:[],partnerLinks:[]};
const directory={merchantId:id,role:'marketing',items:Array.from({length:55},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,title:'Synthetic authored campaign '+i,summary:'Original work.',status:'draft',missionType:'coupon_affiliate'})),nextCursor:null,detail:null,branches:[],summary:{draft:55,published:0,applications:0,activeCreators:0,submitted:0,approved:0}};
test.beforeAll(async()=>{
 css=await readFile('app/travel/workbench.css','utf8')+'\n'+await readFile('app/integration/integration.css','utf8');
 const workbench=await readFile('app/travel/Workbench.tsx','utf8');
 const start=workbench.indexOf('function RoleWorkspaceLoading()'),end=workbench.indexOf('\n}',start)+2;
 if(start<0||end<start)throw Error('Actual role loader missing');
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixture.locale,t:(en,zh)=>window.fixture.locale==='zh-HK'?zh:en,href:path=>'/'+window.fixture.locale+'/'+path});`,
  session:`const records=new Map();export const subscribeAccountInvalidation=fn=>{const handler=()=>fn(null);window.addEventListener('fixture-invalidate',handler);return()=>window.removeEventListener('fixture-invalidate',handler)};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async(actor,scope)=>records.get(actor+':'+scope)??null;export const saveLocalWorkspaceRecovery=async(actor,scope,value)=>{records.set(actor+':'+scope,structuredClone(value))};export const clearLocalWorkspaceRecovery=async(actor,scope)=>{records.delete(actor+':'+scope)};export const releaseLocalWorkspaceRecovery=async()=>{};`,
  creator:`export const creatorMissions={get:()=>window.fixtureRead('creator')};`,
  campaigns:`export const merchantCampaigns={list:()=>window.fixtureRead('campaigns')};`,
  merchant:`export const merchants={memberships:()=>window.fixtureRead('memberships'),workspace:()=>window.fixtureRead('workspace')};`,
  router:`export const useSearchParams=()=>new URLSearchParams(window.location.search);`,link:`export default 'a';`,
 };
 const output=await build({stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';import {useApp} from './app/travel/ui';
  import {CreatorMissionsWorkspace} from './app/travel/CreatorMissionsWorkspace';
  import {MerchantWorkspace} from './app/travel/MerchantWorkspace';
  import {MerchantCampaigns} from './app/travel/MerchantCampaigns';
  ${workbench.slice(start,end)}
  const waiters={};window.fixtureReads={};window.fixtureRead=kind=>{window.fixtureReads[kind]=(window.fixtureReads[kind]??0)+1;return new Promise(resolve=>(waiters[kind]??=[]).push(resolve))};
  window.fixtureResolve=(kind,result)=>{const done=waiters[kind]?.shift();if(!done)throw Error('No pending '+kind);done(result)};
  const f=window.fixture,id='${id}';
  const root=createRoot(document.getElementById('fixture'));
  window.fixtureCompany=company=>root.render(<section className="k-page k-merchant"><h1>Merchant workspace</h1><MerchantCampaigns key={company} actorId="actor-A" merchantId={company} refreshKey={0} locked={false} onLockChange={()=>{}} onChanged={async()=>{}} onDenied={()=>{}}/></section>);
  root.render(f.kind==='creator'?<CreatorMissionsWorkspace actorId="actor-A" enabled path={'studio/missions/'+id}/>:f.kind==='merchant'?<MerchantWorkspace actorId="actor-A" enabled/>:f.kind==='campaigns'?<section className="k-page k-merchant"><h1>Merchant workspace</h1><MerchantCampaigns actorId="actor-A" merchantId={id} refreshKey={0} locked={false} onLockChange={()=>{}} onChanged={async()=>{}} onDenied={()=>{}}/></section>:<RoleWorkspaceLoading/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'owned-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{
   const port=args.path==='./ui'||args.path==='./app/travel/ui'?'ui':args.path.endsWith('/trips/local-drafts')?'session':args.path.endsWith('/creators/collaboration')?'creator':args.path.endsWith('/merchants/campaign-repository')?'campaigns':args.path.endsWith('/merchants/repository')?'merchant':args.path==='next/navigation'?'router':args.path==='next/link'?'link':null;
   // Marketing cannot render these owner-only siblings. Their source is covered
   // by the separate connected role suite, not this layout fixture.
   if(['./MerchantTeamAccess','./MerchantInvitations','./MerchantCreatorDiscovery','./MerchantInsights'].includes(args.path))return{path:args.path.slice(2),namespace:'owner-only'};
   return port?{path:port,namespace:'port'}:null;
  });
  b.onLoad({filter:/.*/,namespace:'port'},args=>({loader:'js',contents:ports[args.path]}));
  b.onLoad({filter:/.*/,namespace:'owner-only'},args=>({loader:'js',contents:`export const ${args.path}=()=>null;`}));
 }}]});script=output.outputFiles[0].text;
});
async function mount(page:Page,kind:string,locale:string,width:number){
 await page.setViewportSize({width,height:844});
 await page.route('http://127.0.0.1:3495/__layout-fixture**',route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0}${css}</style><div class="k-app"><header style="height:240px">Journeys</header><main class="k-main" id="fixture"></main><footer class="k-footer">Footer</footer></div>`}));
 await page.goto('http://127.0.0.1:3495/__layout-fixture?company='+id+'&campaign='+id);
 await page.evaluate(({kind,locale})=>{(window as any).fixture={kind,locale};},{kind,locale});await page.addScriptTag({content:script});
}
async function settle(page:Page,kind:string,data:unknown){
 await page.evaluate(({kind,data})=>(window as any).fixtureResolve(kind,{ok:true,data}),{kind,data});
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
const label=(locale:string,en:string,zh:string)=>locale==='en'?en:zh;
for(const locale of ['en','zh-HK'])for(const width of [320,640,1280]){
 test(`P16 ${locale} ${width}: creator refresh stays still across slow load and refresh`,async({page},testInfo)=>{
  await mount(page,'creator',locale,width);
  const refresh=page.getByRole('button',{name:label(locale,'Refresh collaborations','重新載入合作'),exact:true});await expect(refresh).toBeDisabled();
  const loading=page.getByRole('status').filter({hasText:label(locale,'Loading collaboration records','正在載入合作紀錄')});await expect(loading).toBeVisible();
  const before=(await refresh.boundingBox())!;await settle(page,'creator',detail);await expect(refresh).toBeEnabled();
  const after=(await refresh.boundingBox())!;await testInfo.attach('creator-load-geometry',{body:Buffer.from(JSON.stringify({locale,width,before,after,deltaY:after.y-before.y})),contentType:'application/json'});
  expect(Math.abs(after.y-before.y)).toBeLessThanOrEqual(1);
  await refresh.click();await expect(refresh).toBeDisabled();expect(Math.abs((await refresh.boundingBox())!.y-before.y)).toBeLessThanOrEqual(1);
  await settle(page,'creator',detail);await expect(refresh).toBeEnabled();expect(Math.abs((await refresh.boundingBox())!.y-before.y)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('fixture-invalidate')));await expect(page.getByRole('heading',{name:detail.title})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`P16 ${locale} ${width}: company access does not move the workspace refresh`,async({page},testInfo)=>{
  await mount(page,'merchant',locale,width);
  const refresh=page.getByRole('button',{name:label(locale,'Refresh workspace','重新載入工作區'),exact:true});await expect(refresh).toBeDisabled();
  const before=(await refresh.boundingBox())!;await settle(page,'memberships',[{merchantId:id,name:'Synthetic company',role:'marketing'}]);
  await expect(page.getByRole('combobox',{name:label(locale,'Company','公司'),exact:true})).toHaveValue(id);
  const after=(await refresh.boundingBox())!;await testInfo.attach('merchant-access-geometry',{body:Buffer.from(JSON.stringify({locale,width,before,after,deltaY:after.y-before.y})),contentType:'application/json'});
  expect(Math.abs(after.y-before.y)).toBeLessThanOrEqual(1);
  await expect(page.locator('.k-footer')).not.toBeInViewport();
 });
 test(`P16 ${locale} ${width}: first campaign read paints actions and editor together`,async({page},testInfo)=>{
  await mount(page,'campaigns',locale,width);await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.campaigns)).toBe(1);
  await expect(page.getByRole('status')).toContainText(label(locale,'Loading promotions','正在載入推廣'));
  await expect(page.getByLabel(label(locale,'Brief title','簡報標題'),{exact:true})).toHaveCount(0);
  await settle(page,'campaigns',directory);await expect(page.getByRole('heading',{name:label(locale,'Your next actions','你的下一步'),exact:true})).toBeVisible();
  const field=page.getByLabel(label(locale,'Brief title','簡報標題'),{exact:true});await expect(field).toBeEnabled();await field.fill('Retained draft');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('fixture-invalidate')));await expect(field).toHaveCount(0);await expect(page.locator('body')).not.toContainText('Synthetic authored campaign');
 });
 test(`P16 ${locale} ${width}: role chunk loading keeps footer below the first viewport`,async({page},testInfo)=>{
  await mount(page,'chunk',locale,width);await expect(page.getByRole('status')).toContainText(label(locale,'Loading workspace','正在載入工作區'));
  await expect(page.locator('.k-footer')).not.toBeInViewport();
 });
}

for(const locale of ['en','zh-HK'])test(`P17 ${locale}: A draft is quarantined until its fresh scope read and survives A-B-A`,async({page})=>{
 await mount(page,'campaigns',locale,320);
 const title=page.getByLabel(label(locale,'Brief title','簡報標題'),{exact:true});
 await expect(title).toHaveCount(0);await settle(page,'campaigns',{...directory,items:[],summary:{...directory.summary,draft:0}});await expect(title).toBeEnabled();
 await title.fill('PRIVATE_A_TITLE');await page.getByRole('textbox',{name:label(locale,'Brief description','簡報內容'),exact:true}).fill('PRIVATE_A_DESCRIPTION');await page.getByLabel(label(locale,'Coupon code','優惠碼'),{exact:true}).fill('PRIVATE_A_COUPON');
 await expect(page.getByRole('status').filter({hasText:label(locale,'Draft kept on this device for this account.','草稿已保存在此裝置，僅供此帳戶使用。')})).toBeVisible();
 const second='33333333-3333-4333-8333-333333333333';
 await page.evaluate(company=>(window as any).fixtureCompany(company),second);await expect(title).toHaveCount(0);
 await settle(page,'campaigns',{...directory,merchantId:second,items:[],summary:{...directory.summary,draft:0}});await expect(title).toBeEnabled();await expect(title).toHaveValue('');await expect(page.getByRole('textbox',{name:label(locale,'Brief description','簡報內容'),exact:true})).toHaveValue('');await expect(page.getByLabel(label(locale,'Coupon code','優惠碼'),{exact:true})).toHaveValue('');
 await page.evaluate(company=>(window as any).fixtureCompany(company),id);await expect(title).toHaveCount(0);
 await settle(page,'campaigns',{...directory,items:[],summary:{...directory.summary,draft:0}});await expect(title).toBeEnabled();await expect(title).toHaveValue('PRIVATE_A_TITLE');await expect(page.getByRole('textbox',{name:label(locale,'Brief description','簡報內容'),exact:true})).toHaveValue('PRIVATE_A_DESCRIPTION');await expect(page.getByLabel(label(locale,'Coupon code','優惠碼'),{exact:true})).toHaveValue('PRIVATE_A_COUPON');
 await page.evaluate(()=>window.dispatchEvent(new Event('fixture-invalidate')));await expect(title).toHaveCount(0);
});

for(const locale of ['en','zh-HK'])for(const width of [320,640,1280])test(`P03 ${locale} ${width}: first-read recovery keeps the shell through retry`,async({page},testInfo)=>{
 await mount(page,'campaigns',locale,width);await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.campaigns)).toBe(1);
 const title=page.getByLabel(label(locale,'Brief title','簡報標題'),{exact:true});await expect(title).toHaveCount(0);
 await page.evaluate(()=>(window as any).fixtureResolve('campaigns',{ok:false,code:'UNAVAILABLE',requestId:'22222222-2222-4222-8222-222222222222'}));
 const retry=page.getByRole('button',{name:label(locale,'Retry loading','重試載入'),exact:true});await expect(retry).toBeVisible();
 await expect(title).toHaveCount(0);await expect(page.locator('.k-campaigns form')).toHaveCount(0);
 const failure=(await page.locator('.k-campaigns').boundingBox())!;await retry.focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.campaigns)).toBe(2);await expect(title).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText(label(locale,'Loading promotions','正在載入推廣'));
 await settle(page,'campaigns',{...directory,items:[],summary:{...directory.summary,draft:0}});await expect(title).toBeEnabled();await title.fill('Original scoped input');
 await page.getByRole('button',{name:label(locale,'Reload promotion','重新載入推廣'),exact:true}).click();
 await page.evaluate(()=>(window as any).fixtureResolve('campaigns',{ok:false,code:'UNAVAILABLE'}));await expect(retry).toBeVisible();await expect(title).toHaveValue('Original scoped input');
 await retry.click();await expect(title).toHaveValue('Original scoped input');await settle(page,'campaigns',{...directory,items:[]});await expect(title).toBeEnabled();await expect(title).toHaveValue('Original scoped input');
 await testInfo.attach('first-read-recovery-shell',{body:Buffer.from(JSON.stringify({locale,width,failure,reads:4})),contentType:'application/json'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
