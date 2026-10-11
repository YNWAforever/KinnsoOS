import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

// Native React/DOM and real IndexedDB; only router, locale and HTTP are fixtures.
let script='';
test.beforeAll(async()=>{
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixtureLocale,t:(en,zh)=>window.fixtureLocale==='zh-HK'?zh:en});`,
  router:`export const useSearchParams=()=>new URLSearchParams();`,link:`export default 'a';`,
  network:`export const request=async()=>({ok:true,data:{items:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,i)=>({id,subject:'Case '+(i+1),status:'open',revision:1,ownerId:null,linkedEventId:null,updatedAt:'2026-10-11T00:00:00Z',messages:[],messagesNextCursor:null})),nextCursor:null}});`,
 };
 const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SupportWorkspace}from'./app/travel/InboxWorkspace';createRoot(document.getElementById('fixture')).render(<SupportWorkspace actorId="actor-A" enabled opsMode/>);`,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'owned-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const port=args.path==='./ui'?'ui':args.path==='next/navigation'?'router':args.path==='next/link'?'link':args.path.endsWith('/trips/repository')?'network':null;return port?{path:port,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({loader:'js',contents:ports[args.path]}));
 }}]});script=result.outputFiles[0].text;
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
