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
  import React,{useEffect,useInsertionEffect} from 'react';import{createRoot}from'react-dom/client';import Link from 'next/link';
  import{CreatorEditor}from'./app/travel/CreatorWorkspace';
  import{GuestPlanner}from'./app/travel/GuestPlanner';
  import{AppContext}from'./app/travel/ui';
  import{UnsavedDraftNavigationProvider,useUnsavedDraftGuard,useDraftNavigation}from'./app/travel/UnsavedDraftGuard';
  import{usePathname}from'next/navigation';
  function Device(){useUnsavedDraftGuard({dirty:true,busy:false,scopeKey:'device',saveLatest:async()=>true});return <a href="/en/explore">Leave device editor</a>}
  function LeaveAction(){const leave=useDraftNavigation();return <button onClick={()=>leave('/en/explore')}>Leave through action</button>}
  function App(){const path=usePathname(),locale=path.startsWith('/zh-HK')?'zh-HK':'en';return <AppContext.Provider value={{locale,t:(en,zh)=>locale==='en'?en:zh,href:p=>'/'+locale+'/'+p}}><UnsavedDraftNavigationProvider>{location.search==='?guest'?<GuestPlanner guide={{id:'guest-guide',version:1,title:'Owned device route',days:[{offset:0,title:'Day',stops:[{title:'Owned stop',description:'Owned source',startMinuteOfDay:null,durationMinutes:null}]}]}}/>:location.search==='?device'?<Device/>:(path.endsWith('/edit')||path.endsWith('/new'))?<><CreatorEditor key={path} path={path.split('/').slice(2).join('/')}/><LeaveAction/></>:<><h1>Guide list</h1><Link href={'/'+locale+'/studio/guides/${id}/edit'}>Open editor</Link></>}</UnsavedDraftNavigationProvider></AppContext.Provider>}
  // Next installs parent history wrappers in a passive effect and restores bound
  // methods on cleanup. StrictMode must not leave an obsolete guard in that chain.
  function EarlyHistoryWrite(){useEffect(()=>{history.replaceState(null,'',location.href);window.earlyHistoryWritten=true;},[]);return null;}
  function FrameworkHistory({children}){
   useInsertionEffect(()=>{history.replaceState({...history.state,__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE??{fixture:'router-state'}},'');},[]);
   useEffect(()=>{
   if(window.skipFrameworkHistory)return;
   const push=history.pushState.bind(history),replace=history.replaceState.bind(history);
   // Mirror Next's internal-write bypass. Insertion seeds metadata; the
   // passive wrapper must not repair metadata erased by an earlier child.
   const state=data=>data?.__NA||data?._N?data:{...data,__NA:history.state?.__NA,__PRIVATE_NEXTJS_INTERNALS_TREE:history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE};
   history.pushState=(data,...args)=>push(state(data),...args);
   history.replaceState=(data,unused,url)=>{const before=location.pathname;replace(state(data),unused,url);if(before!==location.pathname)dispatchEvent(new PopStateEvent('popstate',{state:history.state}));};
   const pop=event=>{if(event.state&&!event.state.__NA)location.reload();};window.addEventListener('popstate',pop);
   return()=>{history.pushState=push;history.replaceState=replace;window.removeEventListener('popstate',pop);};
  },[]);return <>{location.search==='?early-history'&&<EarlyHistoryWrite/>}{children}</>;}
  createRoot(document.getElementById('root')).render(<React.StrictMode><FrameworkHistory><App/></FrameworkHistory></React.StrictMode>);
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
 async function fixture(page:import('@playwright/test').Page,save?:(body:any)=>Promise<any>,historyFixture=false,isNew=false,prehydration=false){
  let draft={id,revision:1,publishedVersion:0,sourceChanged:false,status:'draft',payload:{title:'Saved authored title',city:'Kyoto',summary:'Authored summary',content:{days:[]}}};
  const commands:any[]=[];
  await page.route('**/*',async route=>{
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.nativeHistory={push:history.pushState.bind(history),replace:history.replaceState.bind(history)};if(location.hash==="#prehydration"){history.replaceState(null,"","/'+locale+'/studio/guides");history.pushState(null,"","/'+locale+'/studio/guides/'+id+'/edit");}</script><script src="/fixture.js"></script>'});
   if(new URL(route.request().url()).pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle});
   if(new URL(route.request().url()).pathname.startsWith('/api/creator/guides/')){
    if(route.request().method()==='PUT'){
     const body=route.request().postDataJSON();commands.push(body);
     const error=await save?.(body);
     if(error)return route.fulfill({status:503,json:error});
     draft={...draft,id:new URL(route.request().url()).pathname.split('/').at(-1)!,revision:draft.revision+1,payload:body.payload};
    }
    return route.fulfill({json:{ok:true,data:draft}});
   }
   throw Error('Unexpected fixture request: '+route.request().url());
  });
  const editorURL='http://127.0.0.1:3491/'+locale+'/studio/guides/'+(isNew?'new':id+'/edit');
  if(historyFixture){
   await page.goto('http://127.0.0.1:3491/'+locale+'/studio/guides');
   await page.getByRole('link',{name:'Open editor',exact:true}).click();
   await expect(page.getByTestId('creator-editor')).toBeVisible();
   await page.evaluate(()=>{history.pushState({fixture:'forward'},'','/en/explore');dispatchEvent(new PopStateEvent('popstate'));});
   await expect(page.getByTestId('creator-editor')).toHaveCount(0);
   await page.goBack();
  }else await page.goto(editorURL+(prehydration?'#prehydration':''));
  const title=page.getByLabel(label('Guide title','攻略名稱'),{exact:true});
  await expect(title).toHaveValue(isNew?'':'Saved authored title');
  // Keep the existing 900ms debounce deterministic while testing the navigation
  // that happens before it fires. Manual saves still use the actual handler.
  await page.clock.install({time:new Date('2026-10-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-01T00:00:01Z'));
  return{title,commands,draft:()=>draft,back:()=>page.getByRole('link',{name:label('Back to guides','返回攻略'),exact:true}).click(),dialog:page.getByRole('dialog',{name:label('Unsaved guide draft','未保存的攻略草稿'),exact:true})};
 }

 test(`a new creator guide saves and leaves without a route-change race (${locale})`,async({page})=>{
  const h=await fixture(page,undefined,false,true);await h.title.fill('First saved guide');await h.back();
  await h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guide list',exact:true})).toBeVisible();
  expect(h.commands).toHaveLength(1);expect(h.draft().payload.title).toBe('First saved guide');
 });

 test(`canceling a new-guide leave keeps its acknowledged edit URL (${locale})`,async({page})=>{
  let release!:()=>void,received!:()=>void;const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>received=r);
  const h=await fixture(page,async()=>{received();await held;},false,true);
  try{
   await h.title.fill('Saved new guide after cancel');await h.back();
   await h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true}).click();await started;
   await h.dialog.getByRole('button',{name:label('Continue editing','繼續編輯'),exact:true}).click();release();
   await expect(page).toHaveURL(new RegExp('/'+locale+'/studio/guides/[^/]+/edit$'));
   await expect(h.title).toHaveValue('Saved new guide after cancel');expect(h.commands).toHaveLength(1);
  }finally{release();}
 });

 for(const startsBeforeLeave of [false,true])test(`autosave acknowledgement keeps the leave dialog open (${locale}, startsBeforeLeave=${startsBeforeLeave})`,async({page})=>{
  let release!:()=>void,received!:()=>void;const held=new Promise<void>(r=>release=r),started=new Promise<void>(r=>received=r);
  const h=await fixture(page,async()=>{received();await held;},false,true);
  try{
   await h.title.fill('Autosaved while deciding');
   if(startsBeforeLeave){await page.clock.runFor(900);await started;}
   await h.back();await expect(h.dialog).toBeVisible();
   if(!startsBeforeLeave){await page.clock.runFor(900);await started;}
   release();await expect(page.getByTestId('creator-editor').getByRole('status')).toHaveText(label('Draft saved.','草稿已保存。'));
   await expect(h.dialog).toBeVisible();await expect(page).toHaveURL(new RegExp('/'+locale+'/studio/guides/new$'));
   await expect(h.title).toHaveValue('Autosaved while deciding');
   await h.dialog.getByRole('button',{name:label('Discard unsaved edits','放棄未保存修改'),exact:true}).click();
   await expect(page.getByRole('heading',{name:'Guide list',exact:true})).toBeVisible();expect(h.commands).toHaveLength(1);
  }finally{release();}
 });

 test(`null history writes retain router and caller state (${locale})`,async({page})=>{
  await page.addInitScript(()=>{(window as any).skipFrameworkHistory=true;history.replaceState({__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:{fixture:'router-tree'}},'');});
  const h=await fixture(page,undefined,true);
  await page.evaluate(()=>{
   history.replaceState({...history.state,opaque:{retained:true}},'');
   // Framework wrapping is disabled: the guard must preserve router and
   // caller state even when null is passed straight to its wrappers.
   history.replaceState(null,'');history.pushState(null,'',location.href+'#state-check');
  });
  expect(await page.evaluate(()=>({marker:history.state.__NA,tree:history.state.__PRIVATE_NEXTJS_INTERNALS_TREE,opaque:history.state.opaque}))).toEqual({marker:true,tree:{fixture:'router-tree'},opaque:{retained:true}});
  await expect(h.title).toHaveValue('Saved authored title');
 });

 for(const target of ['unstamped','foreign','null','prehydration'] as const)for(const direction of ['back','forward'] as const){
  if(target==='prehydration'&&direction==='forward')continue;
  test(`dirty creator guards ${target} ${direction} entries (${locale})`,async({page})=>{
   await page.addInitScript(()=>Object.defineProperty(window,'navigation',{value:undefined,configurable:true}));
   const h=await fixture(page,undefined,false,false,target==='prehydration');
   const destination='/'+locale+'/studio/guides';
   if(target!=='prehydration'){
    await page.evaluate(({target,direction,destination})=>{
     const native=(window as any).nativeHistory,source=location.href;
     const data=target==='null'?null:{__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:{fixture:'target-tree'},...(target==='foreign'?{__kinnsoDraftPosition:{session:'previous-mount',index:10}}:{})};
     if(direction==='back'){
      native.replace(data,'',destination);history.pushState({...history.state},'',source);
     }else{
      native.push(data,'',destination);history.back();
     }
    },{target,direction,destination});
    await expect(page).toHaveURL(new RegExp('/'+locale+'/studio/guides/'+id+'/edit$'));
   }
   await h.title.fill('Keep unstamped edits');const source=page.url();
   const traverse=()=>page.evaluate(direction=>direction==='back'?history.back():history.forward(),direction);
   await traverse();await expect(h.dialog).toBeVisible();await expect(page).toHaveURL(source);
   await h.dialog.getByRole('button',{name:label('Continue editing','繼續編輯'),exact:true}).click();
   await expect(h.title).toHaveValue('Keep unstamped edits');expect(h.commands).toHaveLength(0);
   // The recovered source has the intercepted destination immediately behind it.
   await page.evaluate(()=>history.back());await expect(h.dialog).toBeVisible();
   await h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true}).click();
   await expect(page).toHaveURL(new RegExp(destination+'$'));await expect(page.getByTestId('creator-editor')).toHaveCount(0);
   expect(h.commands).toHaveLength(1);expect(h.draft().payload.title).toBe('Keep unstamped edits');
  });
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
   await expect(h.dialog.getByRole('button',{name:label('Discard unsaved edits','放棄未保存修改'),exact:true})).toBeDisabled();
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


 for(const fallback of [false,true])for(const direction of ['back','forward'] as const){
  test(`creator ${direction} retains edits on cancel and saves before traversal (${locale}, fallback=${fallback})`,async({page})=>{
   if(fallback)await page.addInitScript(()=>Object.defineProperty(window,'navigation',{value:undefined,configurable:true}));
   const h=await fixture(page,undefined,true);
   await page.evaluate(()=>history.replaceState({...history.state,fixture:{retained:true}},'',location.href));
   await h.title.fill('Keep through history');
   const traverse=()=>page.evaluate(direction=>direction==='back'?history.back():history.forward(),direction);
   const editorURL=page.url();
   await traverse();await expect(h.dialog).toBeVisible();await expect(page).toHaveURL(editorURL);
   await h.dialog.getByRole('button',{name:label('Continue editing','繼續編輯'),exact:true}).click();
   await expect(h.title).toHaveValue('Keep through history');expect(h.commands).toHaveLength(0);
   expect(await page.evaluate(()=>history.state.fixture)).toEqual({retained:true});
   await traverse();await expect(h.dialog).toBeVisible();
   await h.dialog.getByRole('button',{name:label('Save and leave','保存後離開'),exact:true}).click();
   await expect(page).toHaveURL(new RegExp(direction==='back'?'/'+locale+'/studio/guides$':'/en/explore$'));
   await expect(page.getByTestId('creator-editor')).toHaveCount(0);
   expect(h.commands).toHaveLength(1);expect(h.draft().payload.title).toBe('Keep through history');
  });
 }

 test(`native hash entries preserve the source of a multi-step leave (${locale})`,async({page})=>{
  const h=await fixture(page,undefined,true);await h.title.fill('Keep through hash history');
  await page.evaluate(()=>{location.hash='authored-notes';});await expect(page).toHaveURL(/#authored-notes$/);
  const source=page.url();await page.evaluate(()=>history.go(-2));await expect(h.dialog).toBeVisible();
  await expect(page).toHaveURL(source);await page.keyboard.press('Escape');await expect(h.title).toHaveValue('Keep through hash history');
  await page.evaluate(()=>history.back());await expect(page).not.toHaveURL(/#/);await expect(h.dialog).not.toBeVisible();
  await expect(h.title).toHaveValue('Keep through hash history');
  await page.evaluate(()=>history.forward());await expect(page).toHaveURL(source);await expect(h.dialog).not.toBeVisible();
  await expect(h.title).toHaveValue('Keep through hash history');
 });

 test(`programmatic navigation keeps the creator draft until explicit discard (${locale})`,async({page})=>{
  const h=await fixture(page);await h.title.fill('Keep through action');
  await page.getByRole('button',{name:'Leave through action',exact:true}).click();await expect(h.dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(h.title).toHaveValue('Keep through action');
  await page.getByRole('button',{name:'Leave through action',exact:true}).click();
  await h.dialog.getByRole('button',{name:label('Discard unsaved edits','放棄未保存修改'),exact:true}).click();
  await expect(page).toHaveURL(/\/en\/explore$/);expect(h.commands).toHaveLength(0);
 });


 test(`closing a dirty creator tab warns and cancellation retains its edits (${locale})`,async({page})=>{
  const h=await fixture(page);await h.title.fill('Retain on tab close');
  const warning=page.waitForEvent('dialog');await page.close({runBeforeUnload:true});
  const dialog=await warning;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();
  expect(page.isClosed()).toBe(false);await expect(h.title).toHaveValue('Retain on tab close');expect(h.commands).toHaveLength(0);
 });

 test(`cross-document Back warns before losing creator edits (${locale})`,async({page})=>{
  await page.goto('about:blank');const h=await fixture(page);await h.title.fill('Retain on document Back');
  const warning=page.waitForEvent('dialog');const back=page.goBack({timeout:1500}).catch(()=>{});
  const dialog=await warning;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await back;
  await expect(h.title).toHaveValue('Retain on document Back');expect(h.commands).toHaveLength(0);
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

test('real device editor retains native cross-document Back protection',async({page})=>{
 await page.route('**/*',route=>route.fulfill({contentType:route.request().isNavigationRequest()?'text/html':'text/javascript',body:route.request().isNavigationRequest()?'<div id="root"></div><script src="/fixture.js"></script>':bundle}));
 await page.route('**/en/device-back-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Owned prior document</h1>'}));
 await page.goto('http://127.0.0.1:3491/en/device-back-fixture');
 await page.goto('http://127.0.0.1:3491/en/g/device?guest');
 await page.getByRole('button',{name:'Plan as a device-only draft',exact:true}).click();
 await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 await page.getByRole('textbox',{name:'Draft private note',exact:true}).fill('Keep cross-document device note');
 let kind='';page.once('dialog',async dialog=>{kind=dialog.type();await dialog.dismiss();});
 await page.goBack({timeout:1500}).catch(()=>{});expect(kind).toBe('beforeunload');
 await expect(page.getByRole('textbox',{name:'Draft private note',exact:true})).toHaveValue('Keep cross-document device note');
 await page.getByRole('button',{name:'Save device draft',exact:true}).click();await expect(page.getByTestId('guest-save-state')).toContainText('Device draft saved.');
 await page.goBack();await expect(page.getByRole('heading',{name:'Owned prior document',exact:true})).toBeVisible();
 const notes=await page.evaluate(()=>new Promise<string[]>((resolve,reject)=>{const open=indexedDB.open('kinnso_guest_drafts_v1',1);open.onsuccess=()=>{const db=open.result,read=db.transaction('trips').objectStore('trips').getAll();read.onsuccess=()=>{resolve(read.result.map(row=>row.days[0].stops[0].travellerNote));db.close();};read.onerror=()=>reject(read.error);};open.onerror=()=>reject(open.error);}));
 expect(notes).toEqual(['Keep cross-document device note']);
});

test('registered device guards warn on reload without editor-specific listeners',async({page})=>{
 await page.route('**/*',route=>route.fulfill({contentType:route.request().isNavigationRequest()?'text/html':'text/javascript',body:route.request().isNavigationRequest()?'<div id="root"></div><script src="/fixture.js"></script>':bundle}));
 await page.goto('http://127.0.0.1:3491/en/g/device?device');
 // This guard registers in layout and has no editor-specific passive listener.
 await page.getByRole('link',{name:'Leave device editor'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Continue editing',exact:true}).click();
 let kind='';page.once('dialog',async dialog=>{kind=dialog.type();await dialog.dismiss();});
 await page.reload({timeout:1500}).catch(()=>{});expect(kind).toBe('beforeunload');
 await expect(page.getByRole('link',{name:'Leave device editor'})).toBeVisible();
});

test('early null history replacement preserves opaque router state',async({page})=>{
 await page.route('**/*',route=>route.fulfill({contentType:route.request().isNavigationRequest()?'text/html':'text/javascript',body:route.request().isNavigationRequest()?'<div id="root"></div><script src="/fixture.js"></script>':bundle}));
 await page.goto('http://127.0.0.1:3491/en/merchant?early-history');
 await expect.poll(()=>page.evaluate(()=>(window as any).earlyHistoryWritten)).toBe(true);
 expect(await page.evaluate(()=>({marker:history.state.__NA,tree:history.state.__PRIVATE_NEXTJS_INTERNALS_TREE}))).toEqual({marker:true,tree:{fixture:'router-state'}});
});
