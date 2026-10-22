import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Owned browser component fixture. The network port is synthetic; IndexedDB,
// React, field events, keyboard and reload are real. No Auth/SQL/seed/cleanup.
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',company='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222';
const a='33333333-3333-4333-8333-333333333333',b='44444444-4444-4444-8444-444444444444';
let script='',css='';
test.beforeAll(async()=>{
 css=await readFile('app/travel/workbench.css','utf8');
 const ports:Record<string,string>={ui:`export const useApp=()=>({locale:window.fixtureLocale,t:(en,zh)=>window.fixtureLocale==='zh-HK'?zh:en,href:p=>'/'+window.fixtureLocale+'/'+p});`,router:`export const useSearchParams=()=>new URLSearchParams(window.location.search);`,repository:`export const request=(...args)=>window.fixtureRequest(...args);`};
 const result=await build({stdin:{contents:`
  import React from 'react';import{createRoot}from'react-dom/client';
  import{MerchantCampaigns}from'./app/travel/MerchantCampaigns';
  import{synchronizeAccountCache,saveLocalWorkspaceRecovery,readLocalWorkspaceRecovery}from'./lib/trips/local-drafts';
  const actor='${actor}',company='${company}',campaign='${campaign}',a='${a}',b='${b}',stamp='2026-10-23T01:00:00.123456Z';
  const summary={id:campaign,title:'Owned collaboration',summary:'Original authored brief',status:'published',missionType:'coupon_affiliate',updatedAt:stamp};
  window.fixtureData=window.fixtureInitialData??{merchantId:company,role:'owner',items:[summary],nextCursor:null,summary:{draft:0,published:1,closed:0,applications:2,activeCreators:0,submitted:0,approved:0},branches:[{id:company,name:'Original branch',active:true}],branchesNextCursor:null,detail:{...summary,couponCode:'OWNED',couponUrl:'https://example.test/offer',affiliateRate:0,kinnsoRate:0,creatorRate:0,requirements:['Original route'],deliverables:['Authored work'],milestones:[],applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC',requiresApplication:true,canEdit:false,canClose:true,canReviewSubmissions:true,participants:[a,b].map((id,index)=>({id,creatorId:'creator-'+index,creatorName:'Creator '+(index?'B':'A'),creatorHandle:null,status:'applied',note:'Original application',reviewNote:null,updatedAt:stamp})),participantsNextCursor:null,submissions:[],submissionsNextCursor:null}};
  window.fixtureWrites=[];
  window.fixtureRequest=async(url,method,body)=>{
   if(!method||method==='GET')return{ok:true,data:structuredClone(window.fixtureData)};
   if(url!=='/api/merchant/campaigns'||method!=='POST'||body.command.type!=='reviewApplication')throw Error('Unexpected fixture command');
   window.fixtureWrites.push(structuredClone(body));
   const row=window.fixtureData.detail.participants.find(row=>row.id===body.command.id);if(!row)throw Error('Unknown owned record');row.status='active';row.reviewNote=body.command.note;
   return{ok:true,data:{id:row.id,status:row.status}};
  };
  window.fixtureJournal=()=>readLocalWorkspaceRecovery(actor,'merchant-campaign:'+company);
  const noop=()=>{},changed=async()=>{};
  void(async()=>{
   if(window.fixtureStoredDraft){await synchronizeAccountCache(actor);await saveLocalWorkspaceRecovery(actor,'merchant-campaign:'+company,{version:1,draft:window.fixtureStoredDraft,pending:null});}
   createRoot(document.getElementById('fixture')).render(<MerchantCampaigns actorId={actor} merchantId={company} refreshKey={0} locked={false} onLockChange={noop} onChanged={changed} onDenied={noop}/>);
  })().catch(error=>{window.fixtureStartupError=String(error);});
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'workflow-network-boundaries',setup(builder){
  builder.onResolve({filter:/.*/},args=>{const key=args.path==='./ui'?'ui':args.path==='next/navigation'?'router':args.path.endsWith('/trips/repository')?'repository':null;return key?{path:key,namespace:'port'}:null;});
  builder.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path],loader:'js'}));
 }}]});script=result.outputFiles[0].text;
});
async function install(page:Page,locale:string,options:{data?:unknown;storedDraft?:unknown}={}){
 await page.evaluate(({locale,options})=>{(window as any).fixtureLocale=locale;(window as any).fixtureInitialData=options.data;(window as any).fixtureStoredDraft=options.storedDraft;},{locale,options});
 await page.addStyleTag({content:css+'\nbody{margin:16px;font-size:16px}.k-app{font-size:200%}input,textarea,select,button{font-size:inherit}'});
 await page.addScriptTag({content:script});
 await expect(page.locator('.k-app')).toHaveCSS('font-size','32px');
 await expect(page.getByLabel(locale==='en'?'Brief title':'簡報標題',{exact:true})).toBeEnabled();
}
async function mount(page:Page,locale:string,options:{storedDraft?:unknown}={}){
 const unexpected:string[]=[];await page.setViewportSize({width:320,height:900});
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin==='http://127.0.0.1:3495'&&new URL(route.request().url()).pathname==='/__pd-workflow')return route.fulfill({contentType:'text/html',body:'<main class="k-app" id="fixture"></main>'});unexpected.push(route.request().url());return route.abort();});
 page.on('dialog',dialog=>void dialog.accept());await page.goto('http://127.0.0.1:3495/__pd-workflow');await install(page,locale,options);return unexpected;
}
for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 test(`PD10 ${locale}: keyboard review A preserves B and other drafts through real IndexedDB and reload at 320px/200%`,async({page},testInfo)=>{
  const unexpected=await mount(page,locale);
  const card=(name:string)=>page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
  const note=label('Application review feedback','申請審核回饋');
  await card('Creator B').getByRole('textbox',{name:note,exact:true}).fill('B unsent review survives A');
  await page.getByLabel(label('Brief title','簡報標題'),{exact:true}).fill('Another unsent brief');
  await page.getByLabel(label('Updated branch name','更新分店名稱'),{exact:true}).fill('Unsent branch rename');
  await page.getByRole('textbox',{name:label('Branch change reason','分店變更原因'),exact:true}).fill('Unsent branch reason');
  await card('Creator A').getByRole('textbox',{name:note,exact:true}).fill('A explicit approved review');await card('Creator A').getByRole('textbox',{name:note,exact:true}).focus();
  const approve=card('Creator A').getByRole('button',{name:label('Approve application','批准申請'),exact:true});await page.keyboard.press('Tab');await expect(approve).toBeFocused();await page.keyboard.press('Enter');
  await expect(card('Creator A').getByRole('button',{name:label('Approve application','批准申請'),exact:true})).toHaveCount(0);
  await expect(card('Creator B').getByRole('textbox',{name:note,exact:true})).toHaveValue('B unsent review survives A');
  await expect.poll(()=>page.evaluate(async()=>{const row=await (window as any).fixtureJournal();return row?.pending===null&&row?.draft.feedback['44444444-4444-4444-8444-444444444444']==='B unsent review survives A';})).toBe(true);
  expect(await page.evaluate(()=>(window as any).fixtureWrites.length)).toBe(1);
  const data=await page.evaluate(()=>(window as any).fixtureData);await page.reload();await install(page,locale,{data});
  await expect(card('Creator B').getByRole('textbox',{name:note,exact:true})).toHaveValue('B unsent review survives A');
  await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toHaveValue('Another unsent brief');
  await expect(page.getByLabel(label('Updated branch name','更新分店名稱'),{exact:true})).toHaveValue('Unsent branch rename');
  await expect(page.getByRole('textbox',{name:label('Branch change reason','分店變更原因'),exact:true})).toHaveValue('Unsent branch reason');
  expect(await page.evaluate(()=>(window as any).fixtureWrites.length)).toBe(0);expect(unexpected).toEqual([]);
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,inner:innerWidth,scroll:document.documentElement.scrollWidth,wide:Array.from(document.querySelectorAll('*')).filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1||el.scrollWidth>el.clientWidth+1).slice(0,18).map(el=>({tag:el.tagName,classes:el.className,type:el.getAttribute('type'),width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth,overflow:getComputedStyle(el).overflowX,minWidth:getComputedStyle(el).minWidth}))}));if(geometry.scroll>geometry.viewport)console.log('LAYOUT',JSON.stringify(geometry));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.bringToFront();await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
  await testInfo.attach(`review-drafts-${locale}-320-200`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 });
 test(`PD08 ${locale}: malformed recovered schedule remains editable with original text and no network write`,async({page})=>{
  const storedDraft={draft:{title:'Recovered authored brief',summary:'Keep original instructions',couponCode:'',couponUrl:'',affiliateRate:null,kinnsoRate:null,creatorRate:null,requirements:[],deliverables:[],milestones:[],applicationOpensAt:'2030-02-30T12:00:00Z',applicationClosesAt:null,scheduleTimeZone:'Invalid/Stored_Zone'},rates:['','',''],editing:null,feedback:{},branchEdits:{}};
  const unexpected=await mount(page,locale,{storedDraft});
  await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toHaveValue('Recovered authored brief');
  const correction=page.getByRole('alert').filter({hasText:label('Check the application dates and time zone.','請核對申請日期及時區。')});await expect(correction).toBeVisible();
  await expect(page.getByLabel(label('Applications open (UTC, optional)','申請開始（UTC，選填）'),{exact:true})).toHaveValue('');
  await expect(page.getByRole('region',{name:label('Publication summary','發布前摘要'),exact:true})).toContainText('2030-02-30T12:00:00Z');
  await page.getByLabel(label('Applications open (UTC, optional)','申請開始（UTC，選填）'),{exact:true}).fill('2030-06-01T12:00');
  await page.getByRole('combobox',{name:label('Display time zone','顯示時區'),exact:true}).selectOption('Asia/Hong_Kong');await expect(correction).toHaveCount(0);
  await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toHaveValue('Recovered authored brief');
  expect(await page.evaluate(()=>(window as any).fixtureWrites.length)).toBe(0);expect(unexpected).toEqual([]);
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,inner:innerWidth,scroll:document.documentElement.scrollWidth,wide:Array.from(document.querySelectorAll('*')).filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1||el.scrollWidth>el.clientWidth+1).slice(0,18).map(el=>({tag:el.tagName,classes:el.className,type:el.getAttribute('type'),width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth,overflow:getComputedStyle(el).overflowX,minWidth:getComputedStyle(el).minWidth}))}));if(geometry.scroll>geometry.viewport)console.log('LAYOUT',JSON.stringify(geometry));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 });
}
