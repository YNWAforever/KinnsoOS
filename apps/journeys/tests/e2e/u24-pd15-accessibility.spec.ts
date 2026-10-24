import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {auditPage,doubleText,assertReflow,keyboardFocus} from './helpers/accessibility';

const id='11111111-1111-4111-8111-111111111111',stamp='2026-10-23T00:00:00Z';
let script='',css='';
test.beforeAll(async()=>{
 css=await readFile('app/globals.css','utf8')+'\n'+await readFile('app/travel/workbench.css','utf8')+'\n'+await readFile('app/integration/integration.css','utf8');
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixture.locale,t:(en,zh)=>window.fixture.locale==='en'?en:zh,href:path=>'/'+window.fixture.locale+'/'+path});`,
  drafts:`export const subscribeAccountInvalidation=()=>()=>{};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async()=>null;export const saveLocalWorkspaceRecovery=async()=>{};export const clearLocalWorkspaceRecovery=async()=>{};export const releaseLocalWorkspaceRecovery=async()=>{};export const completeLocalWorkspaceRecovery=async()=>{};`,
  repository:`export async function request(url,method){const f=window.fixture;if(method&&method!=='GET'){f.commands.push(url);throw Error('Read-only accessibility fixture rejects commands');}f.reads++;if(url.startsWith('/api/creator/missions/')){if(f.deferFirst&&!f.didDefer){f.didDefer=true;return new Promise(resolve=>window.resolveCreator=resolve);}return{ok:true,data:f.detail};}if(url.startsWith('/api/creator/earnings'))return{ok:true,data:f.earnings[new URL(url,'http://fixture.invalid').searchParams.get('section')??'settled']};if(url.startsWith('/api/merchant/campaigns'))return{ok:true,data:f.directory};if(url==='/api/ops/monitoring')return{ok:true,data:f.monitoring};if(url.startsWith('/api/inbox/deliveries'))return{ok:true,data:{items:[],nextCursor:null}};if(url.startsWith('/api/support?'))return{ok:true,data:{items:[{id:'11111111-1111-4111-8111-111111111111',subject:'Owned support case',status:'open',revision:1,ownerId:null,linkedEventId:null,updatedAt:'2026-10-23T00:00:00Z',messages:[],messagesNextCursor:null}],nextCursor:null}};throw Error('Unexpected fixture read '+url);}`,
  router:`export const useRouter=()=>({refresh(){}});export const useSearchParams=()=>new URLSearchParams();`,link:`export default 'a';`,image:`export default 'img';`,
 };
 const built=await build({stdin:{contents:`
  import React from 'react';import{createRoot}from'react-dom/client';
  import{PublicGuideContent}from'./lib/seo/PublicGuideContent';import{CreatorMissionsWorkspace}from'./app/travel/CreatorMissionsWorkspace';import{CreatorEarningsWorkspace}from'./app/travel/CreatorEarningsWorkspace';import{MerchantCampaigns}from'./app/travel/MerchantCampaigns';import{MonitoringWorkspace}from'./app/travel/MonitoringWorkspace';import{SupportWorkspace}from'./app/travel/InboxWorkspace';
  const f=window.fixture;createRoot(document.getElementById('fixture')).render(f.kind==='guide'?<PublicGuideContent guide={f.guide} locale={f.locale}/>:f.kind==='creator'?<CreatorMissionsWorkspace path="studio/missions/11111111-1111-4111-8111-111111111111" actorId="fixture-creator" enabled/>:f.kind==='earnings'?<CreatorEarningsWorkspace actorId="fixture-creator" enabled/>:f.kind==='merchant'?<MerchantCampaigns actorId="fixture-owner" merchantId="11111111-1111-4111-8111-111111111111" refreshKey={0} locked={false} onLockChange={()=>{}} onChanged={async()=>{}} onDenied={()=>{}}/>:f.kind==='ops'?<MonitoringWorkspace actorId="fixture-ops" enabled/>:<SupportWorkspace actorId="fixture-support" enabled opsMode={f.kind==='supportOps'}/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'owned-a11y-read-ports',setup(b){
  b.onResolve({filter:/.*/},args=>{const port=args.path==='./ui'?'ui':args.path.endsWith('/trips/local-drafts')?'drafts':args.path.endsWith('/trips/repository')?'repository':args.path==='next/navigation'?'router':args.path==='next/link'?'link':args.path==='next/image'?'image':null;return port?{path:port,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path],loader:'js'}));
 }}]});script=built.outputFiles[0].text;
});
function fixture(kind:string,locale:string){
 return{kind,locale,commands:[] as string[],reads:0,
 guide:{kind:'itinerary',id,title:'Owned authored guide',destinationId:null,creator:{id,name:'Owned author',handle:null},version:1,publishedAt:stamp,days:[{id,title:'Original day',stops:[{id,title:'Original stop',description:'Original description'}]}]},
 detail:{id,title:'Owned collaboration',summary:'Original authored brief',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',merchantName:'Owned company',eligible:true,joinAvailable:false,acceptAvailable:false,evidenceAvailable:true,participant:{id,status:'active',updatedAt:stamp},requirements:[],deliverables:[],minTier:null,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',scheduleTimeZone:'UTC',startsAt:null,endsAt:null,applicationOpensAt:null,applicationClosesAt:null,milestones:[{id,title:'Original milestone',description:'Original instructions',dueAt:null,repeatable:false}],milestonesTruncated:false,submissions:[],submissionsNextCursor:null,partnerLinks:[],maxReceipts:null,couponCode:null,couponUrl:null},
 earnings:{settled:{section:'settled',items:[],totals:[{currency:'HKD',pending:'123.45',paid:'0.00'}],nextCursor:null},tracked:{section:'tracked',items:[],totals:[],nextCursor:null}},
 directory:{merchantId:id,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}},
 monitoring:{day:'2026-10-23',funnel:[],performance:[],budgets:[],scheduledRuns:[{job:'notifications',lastStatus:null,lastAttemptAt:null,lastSuccessAt:null,owner:'',runbook:''}]},
 };
}
async function mount(page:Page,value:ReturnType<typeof fixture>&{deferFirst?:boolean},width:number){
 page.on('pageerror',error=>{throw error;});
 await page.setViewportSize({width,height:844});
 await page.route('http://pd15-owned.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('http://pd15-owned.invalid/'+value.locale+'/'+value.kind);
 await page.setContent('<!doctype html><html lang="'+value.locale+'"><head><title>KinnsoOS owned native accessibility fixture</title><style>'+css+'</style></head><body><div class="k-app"><main id="fixture" class="k-main"></main></div></body></html>');
 await page.evaluate(value=>{(window as any).fixture=value;},value);await page.addScriptTag({content:script});
 await expect(page.getByRole('heading').first()).toBeVisible();
 if(value.kind!=='guide'&&!value.deferFirst)await page.waitForFunction(()=>(window as any).fixture.reads>0);
 if(!value.deferFirst)await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
}
for(const locale of ['en','zh-HK'])for(const width of [320,640,1280])for(const kind of ['guide','creator','earnings','merchant','ops','support','supportOps']){
 test('PD15 '+locale+' '+width+' '+kind+': computed styles, keyboard, WCAG scan and doubled text reflow',async({page},testInfo)=>{
  await mount(page,fixture(kind,locale),width);if(kind==='earnings')await expect(page.getByRole('group',{name:locale==='en'?'Earnings record categories':'收益紀錄分類'})).toBeVisible();await auditPage(page,testInfo,'normal');
  await keyboardFocus(page,testInfo);
  await doubleText(page,testInfo);await assertReflow(page);await auditPage(page,testInfo,'text-200');
  expect(await page.evaluate(()=>(window as any).fixture.commands)).toEqual([]);
 });
}
for(const locale of ['en','zh-HK'])for(const width of [320,640,1280])test('PD15 '+locale+' '+width+': loading and error announcements expose a keyboard read recovery',async({page},testInfo)=>{
 const value={...fixture('creator',locale),deferFirst:true};await mount(page,value,width);
 await expect(page.getByRole('status').filter({hasText:locale==='en'?'Loading collaboration records':'正在載入合作紀錄'})).toBeVisible();
 await page.evaluate(()=>(window as any).resolveCreator({ok:false,code:'UNAVAILABLE',retryable:true}));
 const alert=page.getByRole('alert',{name:locale==='en'?'Workspace service status':'工作區服務狀態'});await expect(alert).toBeVisible();
 const retry=page.getByRole('button',{name:locale==='en'?'Retry loading':'重試載入',exact:true});
 for(let count=0;count<20&&!await retry.evaluate(el=>el===document.activeElement);count++)await page.keyboard.press('Tab');
 await expect(retry).toBeFocused();await auditPage(page,testInfo,'read-error');await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Owned collaboration',exact:true})).toBeVisible();await expect(alert).toHaveCount(0);
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.querySelector('main')?.contains(document.activeElement))).toBe(true);
 expect(await page.evaluate(()=>(window as any).fixture.commands)).toEqual([]);
});

// Negative controls prove the accessibility gates reject misleading rendered states.
test('PD15 validator rejects a permanent outline with no focus change',async({page},testInfo)=>{
 await page.setContent('<html><body><div class="k-app"><main><button style="outline:2px solid black">Fixed outline</button></main></div></body></html>');
 await expect(keyboardFocus(page,testInfo)).rejects.toThrow();
});
test('PD15 validator rejects clipped form controls beyond the viewport',async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.setContent('<html><head><style>html,body{margin:0;width:320px;overflow-x:hidden}main{width:320px;overflow:hidden}input{width:500px}</style></head><body><main><input aria-label="Clipped field"/></main></body></html>');
 await expect(assertReflow(page)).rejects.toThrow();
});
