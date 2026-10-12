import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';
let script='';
test.beforeAll(async()=>{
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixture.locale,t:(en,zh)=>window.fixture.locale==='en'?en:zh,href:path=>'/'+window.fixture.locale+'/'+path});`,
  session:`export const subscribeAccountInvalidation=()=>()=>{};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async()=>null;export const saveLocalWorkspaceRecovery=async()=>{};export const clearLocalWorkspaceRecovery=async()=>{};export const releaseLocalWorkspaceRecovery=async()=>{};export const completeLocalWorkspaceRecovery=async()=>{};`,
  repository:`export const request=async()=>{window.fixtureReads++;return {ok:false,code:window.fixture.code,retryable:true}};`,
  link:`export default 'a';`,router:`export const useRouter=()=>({refresh(){}});export const useSearchParams=()=>new URLSearchParams();`,
 };
 const result=await build({stdin:{contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{CreatorWorkspace}from'./app/travel/CreatorWorkspace';import{MerchantWorkspace}from'./app/travel/MerchantWorkspace';
 const f=window.fixture;window.fixtureReads=0;
 createRoot(document.getElementById('fixture')).render(f.kind==='creator'?<CreatorWorkspace path="studio/guides" actorId={f.actorId} enabled={f.enabled}/>:<MerchantWorkspace actorId={f.actorId} enabled={f.enabled}/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'entry-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const key=args.path==='./ui'?'ui':args.path.endsWith('/trips/local-drafts')?'session':args.path.endsWith('/trips/repository')?'repository':args.path==='next/link'?'link':args.path==='next/navigation'?'router':null;return key?{path:key,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path],loader:'js'}));
 }}]});script=result.outputFiles[0].text;
});
for(const locale of ['en','zh-HK'])for(const kind of ['creator','merchant']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 for(const state of ['disabled','unavailable'])test(`W03 ${locale} ${kind}: ${state} entry is actionable at 320px and 200% text`,async({page})=>{
  await page.setViewportSize({width:320,height:844});
  await page.setContent('<style>body{margin:16px;font-size:200%}*{box-sizing:border-box}button,a{font-size:inherit;white-space:normal}</style><main id="fixture"></main>');
  await page.evaluate(f=>{(window as any).fixture=f;},{locale,kind,actorId:state==='disabled'?null:'actor-A',enabled:state!=='disabled',code:'UNAVAILABLE'});
  await page.addScriptTag({content:script});
  if(state==='disabled'){
   await expect(page.getByRole('status')).toContainText(label('not connected yet','尚未接通'));
   const explore=page.getByRole('link',{name:label('Explore guides','探索攻略'),exact:true});
   await expect(explore).toHaveAttribute('href',`/${locale}/explore`);
   await expect(page.getByRole('link',{name:label('Sign in to continue','登入後繼續'),exact:true})).toHaveCount(0);
   expect(await page.evaluate(()=>(window as any).fixtureReads)).toBe(0);
  }else{
   const retry=page.getByRole('button',{name:label('Retry loading','重試載入'),exact:true});await expect(retry).toBeVisible();
   await page.evaluate(()=>{(window as any).fixture.code='AUTH_REQUIRED';});
   await retry.focus();await page.keyboard.press('Enter');
   const next=`/${locale}/${kind==='creator'?'studio/guides':'merchant'}`;
   await expect(page.getByRole('link',{name:label('Sign in to continue','登入後繼續'),exact:true})).toHaveAttribute('href',`/${locale}/sign-in?next=${encodeURIComponent(next)}`);
   await expect(retry).toHaveCount(0);expect(await page.evaluate(()=>(window as any).fixtureReads)).toBe(2);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
