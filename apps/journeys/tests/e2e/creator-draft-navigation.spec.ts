import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Real editor, navigation provider, React and native dialog. Only Next routing
// and HTTP transport are isolated here; these tests do not claim DB acceptance.
let bundle:string;
const id='11111111-1111-4111-8111-111111111111';
test.beforeAll(async()=>{
 const result=await build({stdin:{contents:`
  import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
  import{CreatorEditor}from'./app/travel/CreatorWorkspace';
  import{AppContext}from'./app/travel/ui';
  import{UnsavedDraftNavigationProvider,useUnsavedDraftGuard}from'./app/travel/UnsavedDraftGuard';
  import{usePathname}from'next/navigation';
  function Device(){useUnsavedDraftGuard({dirty:true,busy:false,scopeKey:'device',saveLatest:async()=>true});return <a href="/en/explore">Leave device editor</a>}
  function App(){const path=usePathname(),locale=path.startsWith('/zh-HK')?'zh-HK':'en';return <AppContext.Provider value={{locale,t:(en,zh)=>locale==='en'?en:zh,href:p=>'/'+locale+'/'+p}}><UnsavedDraftNavigationProvider>{location.search==='?device'?<Device/>:path.endsWith('/edit')?<CreatorEditor path={'studio/guides/${id}/edit'}/>:<h1>Guide list</h1>}</UnsavedDraftNavigationProvider></AppContext.Provider>}
  createRoot(document.getElementById('root')).render(<App/>);
 `,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'framework-boundaries',setup(b){
  b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'framework'}));
  b.onLoad({filter:/.*/,namespace:'framework'},args=>({loader:'tsx',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:args.path==='next/navigation'?`
   import{useSyncExternalStore}from'react';
   const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn)};
   export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);
   export const router={push:path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'))},refresh(){}};
   export const useRouter=()=>router;
  `:`import React from'react';import{router}from'next/navigation';export default function Link({href,children,...props}){return <a href={href} {...props} onClick={event=>{event.preventDefault();router.push(href)}}>{children}</a>}`}));
  b.onLoad({filter:/CreatorWorkspace\.tsx$/},async args=>({loader:'tsx',contents:await readFile(args.path,'utf8')+'\nexport {CreatorEditor};'}));
 }}]});
 bundle=result.outputFiles[0].text;
});

for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 async function fixture(page:import('@playwright/test').Page,save?:(body:any)=>Promise<any>){
  let draft={id,revision:1,publishedVersion:0,sourceChanged:false,status:'draft',payload:{title:'Saved authored title',city:'Kyoto',summary:'Authored summary',content:{days:[]}}};
  const commands:any[]=[];
  await page.route('**/*',async route=>{
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/fixture.js"></script>'});
   if(new URL(route.request().url()).pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle});
   if(route.request().url().includes('/api/creator/guides/'+id)){
    if(route.request().method()==='PUT'){
     const body=route.request().postDataJSON();commands.push(body);
     const error=await save?.(body);
     if(error)return route.fulfill({status:503,json:error});
     draft={...draft,revision:draft.revision+1,payload:body.payload};
    }
    return route.fulfill({json:{ok:true,data:draft}});
   }
   throw Error('Unexpected fixture request: '+route.request().url());
  });
  await page.goto('http://127.0.0.1:3491/'+locale+'/studio/guides/'+id+'/edit');
  const title=page.getByLabel(label('Guide title','攻略名稱'),{exact:true});
  await expect(title).toHaveValue('Saved authored title');
  // Keep the existing 900ms debounce deterministic while testing the navigation
  // that happens before it fires. Manual saves still use the actual handler.
  await page.clock.install();await page.clock.pauseAt(new Date());
  return{title,commands,draft:()=>draft,back:()=>page.getByRole('link',{name:label('Back to guides','返回攻略'),exact:true}).click(),dialog:page.getByRole('dialog',{name:label('Unsaved guide draft','未保存的攻略草稿'),exact:true})};
 }

 test(`creator navigation keeps edits on cancel and explicitly discards only unsaved changes (${locale})`,async({page})=>{
  const h=await fixture(page);await h.title.fill('Unsaved authored title');await h.back();await expect(h.dialog).toBeVisible();
  await h.dialog.getByRole('button',{name:label('Continue editing','繼續編輯'),exact:true}).click();await expect(h.title).toHaveValue('Unsaved authored title');
  await h.back();await h.dialog.getByRole('button',{name:label('Discard unsaved edits','放棄未保存修改'),exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guide list',exact:true})).toBeVisible();expect(h.draft().payload.title).toBe('Saved authored title');expect(h.commands).toHaveLength(0);
 });

 test(`creator navigation waits for acknowledgement and cancellation prevents a late redirect (${locale})`,async({page})=>{
  let release!:()=>void,received!:()=>void;const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>received=r);
  const h=await fixture(page,async()=>{received();await held;});
  try{
   await h.title.fill('Latest acknowledged title');await h.back();await h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true}).click();await started;
   await expect(h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true})).toBeDisabled();
   await h.dialog.getByRole('button',{name:label('Continue editing','繼續編輯'),exact:true}).click();release();
   await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText(label('Draft saved.','草稿已保存。'));await expect(h.title).toHaveValue('Latest acknowledged title');
   expect(new URL(page.url()).pathname).toContain('/edit');expect(h.draft().payload.title).toBe('Latest acknowledged title');
   await h.back();await expect(page.getByRole('heading',{name:'Guide list',exact:true})).toBeVisible();
  }finally{release();}
 });

 test(`creator navigation retains failed saves and retries the same command before leaving (${locale})`,async({page})=>{
  let first=true;const h=await fixture(page,async()=>{if(first){first=false;return{ok:false,code:'UNAVAILABLE',retryable:true}}});
  await h.title.fill('Retained after failure');await h.back();const save=h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true});await save.click();
  await expect(h.dialog.getByRole('status')).toContainText(label('Latest edits were not saved.','最新修改尚未保存'));await expect(h.title).toHaveValue('Retained after failure');
  await save.click();await expect(page.getByRole('heading',{name:'Guide list',exact:true})).toBeVisible();
  expect(h.commands).toHaveLength(2);expect(h.commands[1]).toEqual(h.commands[0]);expect(h.draft().payload.title).toBe('Retained after failure');
 });

 test(`a dirty creator draft has a native reload warning (${locale})`,async({page})=>{
  const h=await fixture(page);await h.title.fill('Keep this tab open');let kind='';
  page.once('dialog',async dialog=>{kind=dialog.type();await dialog.dismiss();});
  await page.reload({timeout:1500}).catch(()=>{});
  expect(kind).toBe('beforeunload');await expect(h.title).toHaveValue('Keep this tab open');expect(h.commands).toHaveLength(0);
 });
}

test('device draft dialog retains its existing copy when no creator kind is registered',async({page})=>{
 await page.route('**/*',route=>route.fulfill({contentType:route.request().isNavigationRequest()?'text/html':'text/javascript',body:route.request().isNavigationRequest()?'<div id="root"></div><script src="/fixture.js"></script>':bundle}));
 await page.goto('http://127.0.0.1:3491/en/g/device?device');await page.getByRole('link',{name:'Leave device editor'}).click();
 await expect(page.getByRole('dialog',{name:'Unsaved device draft',exact:true})).toBeVisible();await expect(page.getByText('Save before leaving, or discard only unsaved edits. The last saved device copy is kept.',{exact:true})).toBeVisible();
});
