import {test,expect,type Page,type Route} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {parseCreatorSessionInput} from '../../lib/creators/sessions';

const origin='http://localhost:31947';
const actorId='33333333-3333-4333-8333-333333333333';
const id='44444444-4444-4444-8444-444444444444';
const editToken='55555555-5555-4555-8555-555555555555';
let script:string;

test.beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:resolve('.'),loader:'tsx',contents:`
  import {createRoot} from 'react-dom/client';
  import {AppContext} from './app/travel/ui';
  import {OpsTeamWorkspace} from './app/travel/OpsTeamWorkspace';
  import {CreatorSessionsWorkspace} from './app/travel/CreatorSessionsWorkspace';
  createRoot(document.getElementById('fixture')).render(
   <AppContext.Provider value={{locale:'en',t:en=>en,href:path=>'/en/'+path}}>
    {location.pathname==='/team' ? <OpsTeamWorkspace actorId="${actorId}" enabled/>
      : <CreatorSessionsWorkspace actorId="${actorId}" enabled path="studio/sessions/${id}/edit"/>}
   </AppContext.Provider>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',
 define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'fixture-link',setup(builder){
  builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export default 'a';"}));
 }}]});
 script=result.outputFiles[0].text;
});

async function mount(page:Page,path:string,api:(route:Route)=>Promise<void>){
 await page.route(origin+'/**',route=>new URL(route.request().url()).pathname.startsWith('/api/')
  ? api(route) : route.fulfill({contentType:'text/html',body:'<!doctype html><main id="fixture"></main>'}));
 await page.goto(origin+path);
 await page.addScriptTag({content:script});
}

test('editing a title resubmits both stored YouTube URLs and saves',async({page})=>{
 const embedUrl='https://www.youtube-nocookie.com/embed/live_123';
 const replayUrl='https://www.youtube-nocookie.com/embed/replay_123';
 let row={id,editToken,revision:1,status:'scheduled',title:'Original title',description:'Description',
  type:'ask_a_creator',startsAt:'2026-11-21T10:00:00.000Z',durationMinutes:45,embedUrl,replayUrl,destinationTags:[] as string[]};
 let submitted:Record<string,unknown>|undefined;
 await mount(page,'/session',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{ok:true,data:row}});
  const payload=route.request().postDataJSON();
  submitted=payload;
  try{const parsed=parseCreatorSessionInput(payload.input);row={...row,...parsed,embedUrl:parsed.embedUrl!,replayUrl:parsed.replayUrl!,revision:2};}
  catch{return route.fulfill({status:400,json:{ok:false,code:'INVALID',retryable:false}});}
  return route.fulfill({json:{ok:true,data:{id,revision:2}}});
 });
 await expect(page.getByLabel('Live YouTube URL',{exact:false})).toHaveValue(embedUrl);
 await expect(page.getByLabel('Replay YouTube URL',{exact:false})).toHaveValue(replayUrl);
 await page.getByLabel('Session title').fill('Edited title');
 await page.getByRole('button',{name:'Save session'}).click();
 await expect(page.getByRole('status')).toContainText('Session saved on the server.',{timeout:3000});
 expect(submitted).toMatchObject({requestId:expect.any(String),expectedToken:editToken,expectedRevision:1,
  input:{title:'Edited title',embedUrl,replayUrl}});
});

async function mountTeam(page:Page,fail:(route:Route)=>Promise<void>){
 const wire:(string|null)[]=[];
 await mount(page,'/team',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{ok:true,data:{canManage:true,
   members:[{id,displayName:'Test analyst',role:'analyst',status:'active',joinedAt:'2026-11-01T00:00:00Z'}],pendingInvites:[]}}});
  wire.push(route.request().postData());
  if(wire.length===1)return fail(route);
  return route.fulfill({json:{ok:true,data:{token:'a'.repeat(64)}}});
 });
 return wire;
}

for(const retry of ['Retry the same invite','Retry the same request']){
 test(retry+' resends the exact invite after a network failure',async({page})=>{
  const wire=await mountTeam(page,route=>route.abort('failed'));
  const email=page.getByLabel('Email',{exact:true});
  await email.fill('first@example.test');
  await page.getByRole('button',{name:'Generate invite link'}).click();
  await expect(email).toBeDisabled();
  await page.getByRole('button',{name:retry,exact:true}).click();
  await expect(page.getByLabel('One-time invitation link')).toBeVisible({timeout:3000});
  expect(wire).toHaveLength(2);
  expect(wire[1]).toBe(wire[0]);
  expect(JSON.parse(wire[0]!).requestId).toMatch(/^[a-f0-9-]{36}$/);
 });
}

test('generic retry resends a pending role change after an ambiguous server response',async({page})=>{
 const wire=await mountTeam(page,route=>route.fulfill({status:503,json:{ok:false,code:'UNAVAILABLE',retryable:true}}));
 await page.getByLabel('Reason for access change').fill('Synthetic access change');
 await page.getByLabel('New role for Test analyst').selectOption('owner');
 await page.getByRole('button',{name:'Apply role'}).click();
 await expect(page.getByRole('button',{name:'Retry the same invite'})).toHaveCount(0);
 await page.getByRole('button',{name:'Retry the same request'}).click();
 await expect(page.getByText('Operations team updated.')).toBeVisible({timeout:3000});
 expect(wire).toHaveLength(2);
 expect(wire[1]).toBe(wire[0]);
  expect(JSON.parse(wire[0]!).requestId).toMatch(/^[a-f0-9-]{36}$/);
});

for(const [status,code] of [[400,'INVALID'],[409,'CONFLICT']] as const){
 test(code+' unlocks management and allows a fresh action',async({page})=>{
  const wire=await mountTeam(page,route=>route.fulfill({status,json:{ok:false,code,retryable:false,requestId:id}}));
  const email=page.getByLabel('Email',{exact:true});
  await email.fill('first@example.test');
  await page.getByRole('button',{name:'Generate invite link'}).click();
  await expect(page.getByRole('alert')).toContainText(code);
  await expect(email).toBeEnabled({timeout:3000});
  await expect(page.getByRole('button',{name:/Retry the same/})).toHaveCount(0);
  await email.fill('second@example.test');
  await page.getByRole('button',{name:'Generate invite link'}).click();
  await expect(page.getByLabel('One-time invitation link')).toBeVisible();
  const [first,second]=wire.map(body=>JSON.parse(body!));
  expect([first.email,second.email]).toEqual(['first@example.test','second@example.test']);
  expect(first.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(second.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(second.requestId).not.toBe(first.requestId);
 });
}
for(const action of ['revoke','suspend'] as const){
 test(action+' reconciles a committed mutation after its response is lost',async({page})=>{
  const wire:string[]=[];
  await mount(page,'/team',async route=>{
   const req=route.request();
   if(req.method()==='GET')return route.fulfill({json:{ok:true,data:{canManage:true,
    members:[{id,displayName:'Test analyst',role:'analyst',status:wire.length&&action==='suspend'?'suspended':'active',joinedAt:'2026-11-01T00:00:00Z'}],
    pendingInvites:wire.length&&action==='revoke'?[]:[{id,email:'pending@example.test',role:'analyst',expiresAt:'2026-11-30T00:00:00Z'}]}}});
   wire.push(req.postData()!);
   if(wire.length===1)return route.abort('failed');
   if(!req.postDataJSON().requestId||wire[0]!==wire[1])return route.fulfill({status:404,json:{ok:false,code:'NOT_FOUND',retryable:false}});
   return route.fulfill({json:{ok:true,data:{id,status:action==='revoke'?'revoked':'suspended'}}});
  });
  if(action==='suspend')await page.getByLabel('Reason for access change').fill('Synthetic review');
  await page.getByRole('button',{name:action==='revoke'?'Revoke invite':'Suspend',exact:true}).click();
  await page.getByRole('button',{name:'Retry the same request'}).click();
  await expect(page.getByText('Operations team updated.')).toBeVisible({timeout:3000});
  if(action==='revoke')await expect(page.getByText('pending@example.test')).toHaveCount(0);
  else await expect(page.getByRole('button',{name:'Reactivate'})).toBeVisible();
  expect(wire).toHaveLength(2);expect(wire[1]).toBe(wire[0]);
 });
}
