import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
let script='',css='';
const id='11111111-1111-4111-8111-111111111111';
test.beforeAll(async()=>{
 css=await readFile('app/globals.css','utf8')+'\n'+await readFile('app/travel/workbench.css','utf8')+'\n'+await readFile('app/integration/integration.css','utf8');
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixture.locale,t:(en,zh)=>window.fixture.locale==='en'?en:zh,href:path=>'/'+window.fixture.locale+'/'+path});`,
  drafts:`export const subscribeAccountInvalidation=()=>()=>{};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async()=>null;export const saveLocalWorkspaceRecovery=async()=>{};export const clearLocalWorkspaceRecovery=async()=>{};export const releaseLocalWorkspaceRecovery=async()=>{};export const completeLocalWorkspaceRecovery=async()=>{};`,
  repository:`export async function request(url,method){if(method&&method!=='GET'){window.commands.push(url);throw Error('Presentation must not issue commands');}if(url.startsWith('/api/merchant/campaigns'))return{ok:true,data:window.fixture.directory};if(url.startsWith('/api/creator/missions/'))return{ok:true,data:new URL(url,'http://fixture.invalid').searchParams.has('after')?(window.fixture.earlierDetail??window.fixture.detail):window.fixture.detail};if(url.startsWith('/api/creator/earnings'))return{ok:true,data:window.fixture.earnings[new URL(url,'http://fixture.invalid').searchParams.get('section')??'settled']};if(url==='/api/ops/monitoring')return{ok:true,data:window.fixture.monitoring};throw Error('Unexpected read '+url);}`,
  link:`export default 'a';`,image:`export default 'img';`,router:`export const useRouter=()=>({refresh(){}});export const useSearchParams=()=>new URLSearchParams();`,
 };
 const result=await build({stdin:{contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{PublicGuideContent}from'./lib/seo/PublicGuideContent';import{MerchantCampaigns}from'./app/travel/MerchantCampaigns';import{CreatorMissionsWorkspace}from'./app/travel/CreatorMissionsWorkspace';import{MonitoringWorkspace}from'./app/travel/MonitoringWorkspace';import{CreatorEarningsWorkspace}from'./app/travel/CreatorEarningsWorkspace';
 const f=window.fixture;window.commands=[];
 createRoot(document.getElementById('fixture')).render(f.kind==='guide'?<PublicGuideContent guide={f.guide} locale={f.locale}/>:f.kind==='merchant'?<MerchantCampaigns actorId="synthetic-owner" merchantId="${id}" refreshKey={0} locked={false} onLockChange={()=>{}} onChanged={async()=>{}} onDenied={()=>{}}/>:f.kind==='creator'?<CreatorMissionsWorkspace path="studio/missions/${id}" actorId="synthetic-creator" enabled/>:f.kind==='earnings'?<CreatorEarningsWorkspace actorId="fixture-creator" enabled/>:<MonitoringWorkspace actorId="synthetic-ops" enabled/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'pure-presentation-ports',setup(b){
  b.onResolve({filter:/.*/},args=>{const key=args.path==='./ui'?'ui':args.path.endsWith('/trips/local-drafts')?'drafts':args.path.endsWith('/trips/repository')?'repository':args.path==='next/link'?'link':args.path==='next/image'?'image':args.path==='next/navigation'?'router':null;return key?{path:key,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path],loader:'js'}));
 }}]});script=result.outputFiles[0].text;
});
async function mount(page:Page,fixture:Record<string,unknown>){
 page.on('pageerror',(error:Error)=>{throw error;});
 await page.route('http://presentation.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 const path=fixture.kind==='merchant'?'merchant':fixture.kind==='creator'?`studio/missions/${id}`:fixture.kind==='earnings'?'studio/earnings':fixture.kind==='ops'?'ops/monitoring':`g/${id}`;
 await page.goto(`http://presentation.invalid/${fixture.locale}/${path}`);
 await page.setViewportSize({width:320,height:844});
 await page.setContent(`<style>${css}html{font-size:200%}body:has(.k-app){margin:16px;overflow-x:visible}.k-app{font-size:1rem}button,a{white-space:normal}</style><div class="k-app"><main id="fixture"></main></div>`);
 await page.evaluate((value:any)=>{(window as any).fixture=value;},fixture);
 await page.addScriptTag({content:script});
}
async function reflow(page:Page){

 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),await page.evaluate(()=>JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea,button,fieldset,legend,a,h1,h2,h3,dd,p,time')).filter(el=>el.getBoundingClientRect().right>innerWidth||el.scrollWidth>el.clientWidth).map(el=>({tag:el.tagName,id:el.id,text:el.textContent?.slice(0,100),right:el.getBoundingClientRect().right,scroll:el.scrollWidth,width:el.clientWidth,min:getComputedStyle(el).minWidth}))))).toBe(true);
 expect(await page.evaluate(()=>(window as any).commands)).toEqual([]);
}
for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 for(const kind of ['itinerary','summary'])test(`U21 ${locale} ${kind}: source metadata stays truthful at 320px/200%`,async({page})=>{
  const guide=kind==='summary'?{kind,id,title:'Original authored text',summary:'Original prose',destinationId:null}:{kind,id,title:'Original authored text',destinationId:null,creator:{id,name:'Author',handle:null},version:3,publishedAt:'2026-10-20T10:00:00Z',days:[{id,title:'Original day',stops:[{id,title:'Original stop',description:'Original description'}]}]};
  await mount(page,{kind:'guide',locale,guide});
  await expect(page.getByRole('heading',{level:1})).toHaveText('Original authored text');
  const source=page.getByRole('complementary',{name:label('Guide source','攻略來源'),exact:true});
  await expect(source).toHaveAttribute('lang',locale);await expect(source).toContainText(label('Place verification date','地點查核日期'));
  await expect(source).toContainText(kind==='summary'?label('Reading summary','閱讀摘要'):'v3');
  if(kind==='summary')await expect(source.locator('time')).toHaveCount(0);
  else await expect(source.locator('time')).toHaveAttribute('datetime','2026-10-20T10:00:00Z');
  await reflow(page);
 });
 test(`U21 ${locale}: merchant preview has keyboard field destinations and never publishes`,async({page})=>{
  const directory={merchantId:id,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}};
  await mount(page,{kind:'merchant',locale,directory});
  const preview=page.getByRole('region',{name:label('Publication summary','發布前摘要'),exact:true});await expect(preview).toBeVisible();
  await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toBeEnabled();
  const destination=preview.getByRole('link',{name:label('Brief title','簡報標題'),exact:true});await destination.focus();await page.keyboard.press('Enter');
  await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toBeFocused();
  await page.getByLabel(label('Brief title','簡報標題'),{exact:true}).fill('Original authored brief');await expect(preview).toContainText('Original authored brief');
  await reflow(page);
 });
 test(`U21 ${locale}: creator evidence history shows loaded source records without a payment claim`,async({page})=>{
  const detail={id,title:'Original collaboration',summary:'Brief',merchantName:'Synthetic company',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',participant:{id,status:'active',updatedAt:'2026-10-20T10:00:00Z'},joinAvailable:false,evidenceAvailable:false,acceptAvailable:false,requirements:[],deliverables:[],milestones:[{id,title:'Original milestone',description:'Instructions',dueAt:null,repeatable:false}],milestonesTruncated:false,submissions:[{id,milestoneId:id,status:'approved',notes:'Original evidence notes',proofUrls:[],submittedAt:'2026-10-20T10:00:00Z',reviews:[{id,action:'approve',reason:'Original review',createdAt:'2026-10-21T10:00:00Z'}]}],submissionsNextCursor:null,partnerLinks:[],maxReceipts:null,paidFeeAmount:null,minTier:null,scheduleTimeZone:'UTC'};
  await mount(page,{kind:'creator',locale,detail});
  const history=page.getByRole('region',{name:label('Recorded evidence history','已記錄交付歷程'),exact:true});await expect(history).toContainText('Original review');
  await expect(history).toContainText(label('Approval is not payment','核准不等於付款'));
  expect(await history.locator('time').evaluateAll(els=>els.map(el=>el.getAttribute('datetime')))).toEqual(['2026-10-20T10:00:00Z','2026-10-21T10:00:00Z']);
  const milestoneLink=history.getByRole('link',{name:label('Milestone: Original milestone','里程碑：Original milestone'),exact:true}).first();await milestoneLink.focus();await page.keyboard.press('Enter');await expect(page.locator(`#milestone-${id}`)).toBeFocused();

  await reflow(page);
 });
 test(`U21 ${locale}: Ops sees failed attempt, last success and unknown observations`,async({page})=>{
  const monitoring={day:'2026-10-22',funnel:[],performance:[],budgets:[],scheduledRuns:[{job:'collaboration_reminders',lastStatus:'failed',lastAttemptAt:'2026-10-22T10:00:00Z',lastSuccessAt:'2026-10-21T10:00:00Z',owner:'Synthetic Ops',runbook:'PILOT_SUPPORT_RUNBOOK.md'},{job:'notifications',lastStatus:null,lastAttemptAt:null,lastSuccessAt:null,owner:'',runbook:''}]};
  await mount(page,{kind:'ops',locale,monitoring});
  await expect(page.getByText('2026-10-22T10:00:00Z',{exact:true})).toBeVisible();await expect(page.getByText('2026-10-21T10:00:00Z',{exact:true})).toBeVisible();
  await expect(page.getByText(label('Unknown (no result recorded)','未知（未有結果紀錄）'),{exact:true})).toBeVisible();
  await reflow(page);
 });
}

for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 test('U21 '+locale+' PD09: paged evidence stays unknown and the earlier revision opens its original form',async({page})=>{
  const receipt='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',stamp='2026-10-23T01:00:00Z';
  const detail={id,title:'Paged creator work',summary:'Original authored brief',merchantName:'Owned fixture company',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',participant:{id,status:'active',updatedAt:stamp},eligible:true,joinAvailable:false,evidenceAvailable:true,acceptAvailable:false,requiresApplication:true,requirements:[],deliverables:[],milestones:[{id,title:'Original nonrepeatable work',description:'Original instructions',dueAt:null,repeatable:false},{id:other,title:'Repeatable receipts',description:'Separate receipts',dueAt:null,repeatable:true}],milestonesTruncated:false,submissions:Array.from({length:50},(_,index)=>({id:'10000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),milestoneId:other,status:'approved',notes:null,proofUrls:[],reviews:[],submittedAt:stamp,updatedAt:stamp})),submissionsNextCursor:'older-page',partnerLinks:[],maxReceipts:null,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',minTier:null,scheduleTimeZone:'UTC',startsAt:null,endsAt:null,applicationOpensAt:null,applicationClosesAt:null};
  const older={id:receipt,milestoneId:id,status:'revision_requested',notes:'Original retained revision',proofUrls:['https://example.test/retained-proof'],reviews:[],merchantFeedback:'Clarify source',submittedAt:stamp,updatedAt:stamp};
  await mount(page,{kind:'creator',locale,detail,earlierDetail:{...detail,submissions:[older],submissionsNextCursor:null}});
  await expect(page.getByRole('heading',{name:'Paged creator work',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:label('Prepare evidence','準備證明'),exact:true})).toHaveCount(0);
  await expect(page.getByText(label('Load earlier evidence to check whether this milestone already has a submission.','請載入較早證明，核對此里程碑是否已有交付。'),{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:label('Prepare new receipt','準備新收據'),exact:true})).toBeEnabled();
  await page.getByRole('button',{name:label('Load earlier evidence','載入較早證明'),exact:true}).focus();await page.keyboard.press('Enter');
  const revise=page.getByRole('button',{name:label('Edit and resubmit evidence','修改並重新提交證明'),exact:true});await expect(revise).toBeEnabled();await revise.focus();await page.keyboard.press('Enter');
  await expect(page.getByLabel(label('Notes for reviewer','給審核員的備註'),{exact:true})).toHaveValue('Original retained revision');
  await expect(page.getByLabel(label('Evidence links (one HTTPS link per line)','證明連結（每行一條 HTTPS 連結）'),{exact:true})).toHaveValue('https://example.test/retained-proof');
  await reflow(page);
 });
 test('U21 '+locale+' PD11: unknown tracked amount and confirmed zero remain distinct in the browser',async({page})=>{
  const base={kind:'affiliate',missionId:null,currency:'HKD',status:'processing',updatedAt:'2026-10-23T01:00:00Z',targetAt:null};
  const totals=[{currency:'HKD',pending:'123.45',paid:'0.00'}];
  await mount(page,{kind:'earnings',locale,earnings:{settled:{section:'settled',items:[],totals,nextCursor:null},tracked:{section:'tracked',items:[{...base,id,title:'Unknown tracked amount',amount:null},{...base,id:'22222222-2222-4222-8222-222222222222',title:'Known tracked zero',amount:'0.00'}],totals,nextCursor:null}}});
  const tracked=page.getByRole('button',{name:label('Tracked activity','追蹤活動'),exact:true});await expect(tracked).toBeEnabled();await tracked.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('article').filter({hasText:'Unknown tracked amount'})).toContainText(label('HKD Amount unknown','HKD 金額不詳'));
  await expect(page.getByRole('article').filter({hasText:'Known tracked zero'})).toContainText('HKD 0.00');
  await expect(page.getByText('HKD 123.45',{exact:true})).toBeVisible();
  await reflow(page);
 });
}
