import {test,expect,type Page} from '@playwright/test';
import {build,type Metafile} from 'esbuild';
import {resolve,relative} from 'node:path';
import {readFile} from 'node:fs/promises';

// Actual React, installed Next App dynamic loader, all Merchant panels and
// repositories. Only actor/session/router boundaries and HTTP are fixtures.
const origin='http://127.0.0.1:3495',id='11111111-1111-4111-8111-111111111111';
const panels=['MerchantCampaigns','MerchantCreatorDiscovery','MerchantTeamAccess','MerchantInvitations','MerchantInsights'];
let files=new Map<string,string>(),meta:Metafile,css='';
test.beforeAll(async()=>{
 css=await readFile('app/travel/workbench.css','utf8');
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixtureLocale,t:(en,zh)=>window.fixtureLocale==='zh-HK'?zh:en,href:path=>'/'+window.fixtureLocale+'/'+path});`,
  session:`export const subscribeAccountInvalidation=fn=>{const handler=()=>fn(null);window.addEventListener('fixture-invalidate',handler);return()=>window.removeEventListener('fixture-invalidate',handler)};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async()=>null;export const saveLocalWorkspaceRecovery=async()=>{};export const clearLocalWorkspaceRecovery=async()=>{};export const releaseLocalWorkspaceRecovery=async()=>{};export const completeLocalWorkspaceRecovery=async()=>{};`,
  router:`export const useSearchParams=()=>new URLSearchParams(window.location.search);`,link:`export default 'a';`,
 };
 const outdir=resolve('evidence/merchant-panel-fixture');
 const output=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MerchantWorkspace} from './app/travel/MerchantWorkspace';createRoot(document.getElementById('fixture')).render(<MerchantWorkspace actorId="actor-A" enabled/>);`,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'esm',splitting:true,metafile:true,outdir,entryNames:'entry',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'framework-session-ports',setup(b){
  b.onResolve({filter:/.*/},args=>{
   const port=args.path==='./ui'?'ui':args.path.endsWith('/trips/local-drafts')?'session':args.path==='next/navigation'?'router':args.path==='next/link'?'link':null;
   // Next's App compiler resolves next/dynamic to this installed implementation.
   if(args.path==='next/dynamic')return{path:resolve('node_modules/next/dist/shared/lib/app-dynamic.js')};
   return port?{path:port,namespace:'port'}:null;
  });b.onLoad({filter:/.*/,namespace:'port'},args=>({loader:'js',contents:ports[args.path]}));
 }}]});
 meta=output.metafile!;
 files=new Map(output.outputFiles.map(file=>[relative(outdir,file.path).replaceAll('\\','/'),file.text]));
});
async function mount(page:Page,locale:string,role='marketing',unknownWrite=false){
 const downloaded=new Set<string>(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/__merchant-assets/')&&response.status()===200)downloaded.add(path.split('/').pop()!);});
 await page.route(origin+'/__merchant-assets/**',route=>{const name=new URL(route.request().url()).pathname.split('/').pop()!;const body=files.get(name);return route.fulfill({status:body?200:404,contentType:'text/javascript',body:body??'Missing owned asset'});});
 let releaseMembership!:(data:unknown)=>void,releaseWorkspace!:(data:unknown)=>void;
 const membership=new Promise<unknown>(resolve=>{releaseMembership=resolve;}),workspace=new Promise<unknown>(resolve=>{releaseWorkspace=resolve;});
 const reads:string[]=[],writes:unknown[]=[];let refreshGate:Promise<void>|null=null,releaseRefreshGate!:()=>void,nextWorkspaceData:unknown;const holdRefresh=()=>{if(refreshGate)throw Error('Refresh already held');refreshGate=new Promise<void>(resolve=>releaseRefreshGate=resolve);};const releaseRefresh=(data:unknown)=>{nextWorkspaceData=data;releaseRefreshGate();};const workspaceResult=async()=>{if(refreshGate){await refreshGate;refreshGate=null;return nextWorkspaceData;}return await workspace;};
 await page.route(origin+'/api/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='POST'){expect(unknownWrite).toBe(true);expect(url.pathname).toBe('/api/merchant');writes.push(route.request().postDataJSON());await route.fulfill({status:writes.length===1?503:200,contentType:'application/json',body:JSON.stringify(writes.length===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{}})});return;}
  expect(route.request().method()).toBe('GET');reads.push(url.pathname+url.search);
  const data=url.pathname==='/api/merchant'?(url.searchParams.has('id')?(url.searchParams.get('id')===id?await workspaceResult():{merchantId:url.searchParams.get('id'),role:'clerk',branches:[],missions:[],applications:[],outcomes:[]}):await membership):url.pathname.endsWith('/team')?{merchantId:id,members:[],nextCursor:null}:url.pathname.endsWith('/invitations')?{merchantId:id,invitations:[],nextCursor:null}:url.pathname.endsWith('/creators')?{items:[],nextCursor:null,quota:{limit:3,used:0,remaining:3,periodStart:'2026-10-11'},campaigns:[],campaignsNextCursor:null}:{merchantId:id,role,items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,applications:0,activeCreators:0,submitted:0,approved:0}};
  await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data})});
 });
 await page.route(origin+'/__merchant-fixture',route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0}${css}</style><div class="k-app"><main id="fixture"></main></div><script>window.fixtureLocale=${JSON.stringify(locale)}</script><script type="module" src="/__merchant-assets/entry.js"></script>`}));
 await page.goto(origin+'/__merchant-fixture');
 await expect(page.getByRole('heading',{name:locale==='en'?'Merchant workspace':'商戶工作區',exact:true})).toBeVisible();
 const sources=()=>Object.entries(meta.outputs).filter(([name])=>downloaded.has(name.split('/').pop()!)).flatMap(([,value])=>Object.keys(value.inputs));
 const loadedPanels=()=>panels.filter(panel=>sources().some(source=>source.endsWith('/'+panel+'.tsx')));
 return{downloaded,errors,reads,writes,releaseMembership,releaseWorkspace,loadedPanels,holdRefresh,releaseRefresh};
}
for(const locale of ['en','zh-HK'])test(`P16 ${locale}: company read defers panel code and loads only its permitted tools`,async({page},testInfo)=>{
 const f=await mount(page,locale);await expect.poll(()=>f.reads.length).toBe(1);
 const initialBytes=[...f.downloaded].reduce((sum,name)=>sum+Buffer.byteLength(files.get(name)!),0);
 await testInfo.attach('initial-bundle',{body:Buffer.from(JSON.stringify({locale,bytes:initialBytes,assets:[...f.downloaded],panels:f.loadedPanels()})),contentType:'application/json'});
 expect(f.loadedPanels()).toEqual([]);
 f.releaseMembership([{merchantId:id,name:'Owned company',role:'marketing',branchIds:[]}]);
 await expect.poll(()=>f.reads.length).toBe(2);expect(f.loadedPanels()).toEqual([]);
 f.releaseWorkspace({merchantId:id,role:'marketing',branches:[],missions:[],applications:[],outcomes:[],moneyCapability:'historical_records_only'});
 await expect(page.getByRole('heading',{name:locale==='en'?'Your next actions':'你的下一步',exact:true})).toBeVisible();
 expect(f.loadedPanels()).toEqual(['MerchantCampaigns']);expect(f.errors).toEqual([]);
 const title=page.getByLabel(locale==='en'?'Brief title':'簡報標題',{exact:true});await title.fill('Retained private draft');
 f.holdRefresh();await page.getByRole('button',{name:locale==='en'?'Refresh workspace':'重新載入工作區',exact:true}).click();await expect.poll(()=>f.reads.filter(p=>p.startsWith('/api/merchant?id=')).length).toBe(2);await expect(title).toHaveValue('Retained private draft');f.releaseRefresh({merchantId:id,role:'marketing',branches:[],missions:[],applications:[],outcomes:[{id:'22222222-2222-4222-8222-222222222222',redeemedAt:'2026-10-13T12:00:00Z',state:'recorded'}],moneyCapability:'historical_records_only'});await expect(page.locator('#merchant-results')).toContainText('2026-10-13T12:00:00Z');await expect(title).toHaveValue('Retained private draft');
});
for(const locale of ['en','zh-HK'])test(`P17 ${locale}: logout while permitted panel asset is pending cannot mount stale controls`,async({page})=>{
 const held=new Set<string>();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const f=await mount(page,locale);
 // Override the fixture asset handler, retaining real emitted chunks.
 await page.route(origin+'/__merchant-assets/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()!,body=files.get(name);
  const inputs=Object.entries(meta.outputs).find(([path])=>path.endsWith('/'+name))?.[1].inputs??{};
  if(Object.keys(inputs).some(path=>path.endsWith('/MerchantCampaigns.tsx'))){held.add(name);await gate;}
  await route.fulfill({status:body?200:404,contentType:'text/javascript',body:body??'Missing owned asset'});
 });
 try{
  f.releaseMembership([{merchantId:id,name:'Owned company',role:'marketing',branchIds:[]}]);await expect.poll(()=>f.reads.length).toBe(2);
  f.releaseWorkspace({merchantId:id,role:'marketing',branches:[],missions:[],applications:[],outcomes:[],moneyCapability:'historical_records_only'});
  await expect.poll(()=>held.size).toBeGreaterThan(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('fixture-invalidate')));
  await expect(page.getByRole('link',{name:locale==='en'?'Sign in to continue':'登入後繼續',exact:true})).toBeVisible();
  release();await page.waitForLoadState('networkidle');
  await expect(page.getByLabel(locale==='en'?'Brief title':'簡報標題',{exact:true})).toHaveCount(0);
  expect(f.reads.some(path=>path.startsWith('/api/merchant/campaigns'))).toBe(false);expect(f.errors).toEqual([]);
 }finally{release();}
});

for(const locale of ['en','zh-HK'])for(const exit of ['logout','company'])test(`P17 ${locale}: failed company tool preserves sibling drafts and unknown request through ${exit}`,async({page})=>{
 let reject!:()=>void;const gate=new Promise<void>(resolve=>{reject=resolve;});const held=new Set<string>();
 const f=await mount(page,locale,'owner',true);
 await page.route(origin+'/__merchant-assets/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()!,body=files.get(name);
  const inputs=Object.entries(meta.outputs).find(([path])=>path.endsWith('/'+name))?.[1].inputs??{};
  if(Object.keys(inputs).some(path=>path.endsWith('/MerchantInsights.tsx'))){held.add(name);await gate;await route.fulfill({status:503,contentType:'text/javascript',body:'Owned failed module'});return;}
  await route.fulfill({status:body?200:404,contentType:'text/javascript',body:body??'Missing owned asset'});
 });
 try{
  const second='33333333-3333-4333-8333-333333333333';
  f.releaseMembership([{merchantId:id,name:'Owned A',role:'owner',branchIds:[]},{merchantId:second,name:'Owned B',role:'clerk',branchIds:[]}]);await expect.poll(()=>f.reads.length).toBe(2);
  f.releaseWorkspace({merchantId:id,role:'owner',branches:[],missions:[],applications:[],outcomes:[]});
  await expect.poll(()=>held.size).toBeGreaterThan(0);
  const title=page.getByLabel(locale==='en'?'Brief title':'簡報標題',{exact:true});await expect(title).toBeEnabled();await title.fill('PRIVATE_HEALTHY_DRAFT');
  const branch=page.getByLabel(locale==='en'?'Branch name':'分店名稱',{exact:true});await branch.fill('Original pending branch');
  await page.getByRole('button',{name:locale==='en'?'Create branch':'建立分店',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(1);
  const retry=page.getByRole('button',{name:locale==='en'?'Retry the same request':'重試相同請求',exact:true});await expect(retry).toBeVisible();
  reject();const loadRetry=page.getByRole('button',{name:locale==='en'?'Retry loading company tool':'重試載入公司工具',exact:true});await expect(loadRetry).toBeVisible();
  await expect(branch).toHaveValue('Original pending branch');await expect(title).toHaveValue('PRIVATE_HEALTHY_DRAFT');await expect(retry).toBeEnabled();
  await retry.click();await expect.poll(()=>f.writes.length).toBe(2);expect(f.writes[1]).toEqual(f.writes[0]);await expect(branch).toHaveValue('');await expect(title).toHaveValue('PRIVATE_HEALTHY_DRAFT');
  await loadRetry.click();
  if(exit==='logout'){await page.evaluate(()=>window.dispatchEvent(new Event('fixture-invalidate')));await expect(page.getByRole('link',{name:locale==='en'?'Sign in to continue':'登入後繼續',exact:true})).toBeVisible();}
  else{await page.getByRole('combobox',{name:locale==='en'?'Company':'公司',exact:true}).selectOption(second);await expect(page.getByRole('heading',{name:locale==='en'?'Recorded outcomes in your branch scope':'分店權限範圍內的已記錄結果',exact:true})).toBeVisible();}
  await page.waitForLoadState('networkidle');await expect(title).toHaveCount(0);await expect(loadRetry).toHaveCount(0);expect(f.errors).toEqual([]);
 }finally{reject();}
});
