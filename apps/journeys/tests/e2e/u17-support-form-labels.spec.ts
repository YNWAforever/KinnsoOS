import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

// Native React/DOM and real IndexedDB; only router, locale and HTTP are fixtures.
let script='';
test.beforeAll(async()=>{
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixtureLocale,t:(en,zh)=>window.fixtureLocale==='zh-HK'?zh:en});`,
  router:`export const useSearchParams=()=>new URLSearchParams();`,link:`export default 'a';`,
  network:`export const request=async(path)=>{if(path.startsWith('/api/support?')&&window.failNextRead){window.failNextRead=false;return{ok:false,code:'UNAVAILABLE'};}return{ok:true,data:{items:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,i)=>({id,subject:'Case '+(i+1),status:'open',revision:1,ownerId:null,linkedEventId:null,updatedAt:'2026-10-11T00:00:00Z',messages:[],messagesNextCursor:null})),nextCursor:null}};};`,
 };
 const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SupportWorkspace}from'./app/travel/InboxWorkspace';import{readLocalWorkspaceRecovery}from'./lib/trips/local-drafts';window.readFixtureDraft=()=>readLocalWorkspaceRecovery('actor-A','support:'+(window.fixtureOps!==false)+':');createRoot(document.getElementById('fixture')).render(<SupportWorkspace actorId="actor-A" enabled opsMode={window.fixtureOps!==false}/>);`,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'owned-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const port=args.path==='./ui'?'ui':args.path==='next/navigation'?'router':args.path==='next/link'?'link':args.path.endsWith('/trips/repository')?'network':null;return port?{path:port,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({loader:'js',contents:ports[args.path]}));
 }}]});script=result.outputFiles[0].text;
});
for(const locale of ['en','zh-HK'])for(const opsMode of [false,true])test(`P17 ${locale} ${opsMode?'ops':'customer'}: restored text keeps its exact label after unavailable read and reload`,async({page})=>{
 await page.route('http://127.0.0.1:3495/__support-recovery-labels',route=>route.fulfill({contentType:'text/html',body:'<main id="fixture"></main>'}));
 const mount=async()=>{await page.evaluate(({locale,opsMode})=>{Object.assign(window,{fixtureLocale:locale,fixtureOps:opsMode});},{locale,opsMode});await page.addScriptTag({content:script});};
 await page.goto('http://127.0.0.1:3495/__support-recovery-labels');await mount();
 const form=page.getByRole('form',{name:'Case 2',exact:true}),other=page.getByRole('form',{name:'Case 1',exact:true});
 const label=opsMode?(locale==='en'?'Response visible to the customer':'客戶可見的回覆'):(locale==='en'?'Reply to this case':'回覆此案件');
 const reason=locale==='en'?'Internal decision reason':'內部決定原因';
 await expect(form.getByLabel(label,{exact:true})).toBeEnabled();await form.getByLabel(label,{exact:true}).fill('Keep the second case draft');
 if(opsMode)await form.getByLabel(reason,{exact:true}).fill('Keep the second internal reason');
 await expect.poll(()=>page.evaluate(async()=>{const value=await (window as any).readFixtureDraft();return value?.draft.cases['22222222-2222-4222-8222-222222222222'];})).toMatchObject({message:'Keep the second case draft',...opsMode?{reason:'Keep the second internal reason'}:{}});
 await page.evaluate(()=>{(window as any).failNextRead=true;});
 const refresh=page.getByRole('button',{name:locale==='en'?'Refresh cases':'重新載入案件',exact:true});await refresh.click();await expect(form).toHaveCount(0);await refresh.click();
 await expect(form.getByLabel(label,{exact:true})).toHaveValue('Keep the second case draft');await expect(other.getByLabel(label,{exact:true})).toHaveValue('');
 if(opsMode)await expect(form.getByLabel(reason,{exact:true})).toHaveValue('Keep the second internal reason');
 page.once('dialog',dialog=>dialog.accept());await page.reload();await mount();
 await expect(form.getByLabel(label,{exact:true})).toHaveValue('Keep the second case draft');await expect(other.getByLabel(label,{exact:true})).toHaveValue('');
 if(opsMode)await expect(form.getByLabel(reason,{exact:true})).toHaveValue('Keep the second internal reason');
 await form.getByLabel(label,{exact:true}).fill('Continue editing the restored draft');await expect(form.getByLabel(label,{exact:true})).toHaveValue('Continue editing the restored draft');
});
for(const locale of ['en','zh-HK'])test(`P17 ${locale}: each case decision has a stable exact label across option changes`,async({page},testInfo)=>{
 await page.route('http://127.0.0.1:3495/__support-labels',route=>route.fulfill({contentType:'text/html',body:'<main id="fixture"></main>'}));
 await page.goto('http://127.0.0.1:3495/__support-labels');await page.evaluate(locale=>{(window as any).fixtureLocale=locale;},locale);await page.addScriptTag({content:script});
 const form=page.getByRole('form',{name:'Case 1',exact:true}),other=page.getByRole('form',{name:'Case 2',exact:true});
 const label=locale==='en'?'Case decision':'案件決定';
 await expect(form).toBeVisible();
 await testInfo.attach('decision-label-dom',{body:Buffer.from(JSON.stringify(await form.locator('select').evaluate(select=>({ariaLabel:select.getAttribute('aria-label'),labels:Array.from((select as HTMLSelectElement).labels??[]).map(label=>label.textContent)})))),contentType:'application/json'});
 const decision=form.getByLabel(label,{exact:true});await expect(decision).toBeEnabled();await decision.focus();await page.keyboard.press('ArrowDown');await expect(decision).toHaveValue('waiting_customer');
 await decision.selectOption('resolved');await expect(decision).toHaveValue('resolved');await expect(other.getByLabel(label,{exact:true})).toHaveValue('in_progress');
 await form.getByLabel(locale==='en'?'Internal decision reason':'內部決定原因',{exact:true}).fill('Reason for this case only');
 await expect(other.getByLabel(locale==='en'?'Internal decision reason':'內部決定原因',{exact:true})).toHaveValue('');
});
