import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import * as validation from '../lib/api/validation.ts';
import * as capabilityContract from '../lib/contracts/capabilities.ts';
import {mount} from './helpers/guide-workspace-harness.mjs';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',guide='cccccccc-cccc-4ccc-8ccc-cccccccccccc',requestId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const compiled={};
for(const [name,path] of Object.entries({repository:'../lib/bookmarks/repository.ts',request:'../lib/trips/repository.ts',server:'../lib/api/server.ts',route:'../app/api/bookmarks/route.ts'})) compiled[name]=(await transform(await readFile(new URL(path,import.meta.url),'utf8'),{loader:'ts',format:'cjs'})).code;
function harness({userId=actor,measurementThrows=false,rpcThrows=false}={}){
 const calls=[],rpc=[];
 const env={KINNSO_SUPABASE_URL:'https://offline.test',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://offline.test',KINNSO_LEGACY_AUTH_ORIGIN:'https://offline.test',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_offline',KINNSO_ENABLED_CAPABILITIES:'bookmarks',KINNSO_SITE_URL:'https://journeys.test'};
 const client={auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async(name,args)=>{rpc.push([name,args]);if(name==='kinnso_bookmark'&&rpcThrows)throw Error('private transport failure');return{data:name==='kinnso_actor'?{id:userId,roles:['traveller']}:{saved:args.p_desired_state}}},from:()=>{throw Error('Denied intent must never query bookmarks')}};
 const cache={};
 function load(name){if(cache[name])return cache[name];const mod={exports:{}};
  runInContext(compiled[name],createContext({module:mod,exports:mod.exports,Request,Response,URL,URLSearchParams,Buffer,performance,crypto:webcrypto,process:{env},fetch:async(url,init)=>{calls.push({url,init});return Response.json({ok:true,data:[],nextCursor:null})},require:spec=>{
   if(spec.endsWith('/trips/repository'))return load('request');
   if(spec.endsWith('/api/validation')||spec==='./validation')return validation;
   if(spec.endsWith('/contracts/capabilities'))return capabilityContract;
   if(spec.endsWith('/supabase/server'))return{serverClient:async()=>client};
   if(spec.endsWith('/api/server'))return load('server');
   if(spec.endsWith('/telemetry/server'))return{observeRequest:()=>{},timedRpc:(c,...args)=>c.rpc(...args),successEvent:async()=>{if(measurementThrows)throw Error('private measurement failure')}};
   if(spec.endsWith('/telemetry/events')||spec.endsWith('/telemetry/pilot-client'))return{};
   throw Error('Unexpected dependency '+spec);
  }}));return cache[name]=mod.exports;}
 return{load,calls,rpc};
}
test('bookmark repository binds list, cursor lookup and mutation to the intended actor',async()=>{
 const h=harness(),{bookmarks}=h.load('repository');
 await bookmarks.list(actor,{createdAt:'2026-10-25T00:00:00Z',guideId:guide});
 await bookmarks.list(actor,undefined,guide);
 await bookmarks.toggle(guide,true,requestId,actor);
 assert.equal(h.calls.length,3);
 for(const call of h.calls)assert.equal(call.init.headers['X-Kinnso-Intent-Actor'],actor);
 assert.match(h.calls[0].url,/before=/);assert.match(h.calls[1].url,new RegExp('guideId='+guide));
 assert.deepEqual(JSON.parse(h.calls[2].init.body),{guideId:guide,desiredState:true,requestId});
});
test('missing local actor fails closed without using the active cookie account',async()=>{
 const h=harness(),{bookmarks}=h.load('repository');
 for(const id of [null,undefined,'','invalid']){
  assert.equal((await bookmarks.list(id)).code,'AUTH_REQUIRED');
  assert.equal((await bookmarks.toggle(guide,false,requestId,id)).code,'AUTH_REQUIRED');
 }
 assert.equal(h.calls.length,0);
});
function post(intendedActor){return new Request('https://journeys.test/api/bookmarks',{method:'POST',headers:{host:'journeys.test',origin:'https://journeys.test','X-Kinnso-Intent-Actor':intendedActor},body:JSON.stringify({guideId:guide,desiredState:true,requestId})})}
test('stale actor intent is denied before a bookmark RPC or private read',async()=>{
 const h=harness({userId:other}),route=h.load('route');
 for(const req of [post(actor),new Request('https://journeys.test/api/bookmarks',{headers:{'X-Kinnso-Intent-Actor':actor}})]){
  const res=await route[req.method](req);assert.equal(res.status,401);assert.equal((await res.json()).code,'AUTH_REQUIRED');
 }
 assert.equal(h.rpc.length,0);
});
test('unknown bookmark transport outcome is retryable without leaking provider details',async()=>{
 const h=harness({rpcThrows:true}),res=await h.load('route').POST(post(actor));
 assert.equal(res.status,503);const body=await res.json();assert.equal(body.code,'UNAVAILABLE');assert.equal(body.retryable,true);assert.doesNotMatch(JSON.stringify(body),/private transport/);
});
test('malformed bookmark input is rejected before mutation',async()=>{
 const h=harness(),request=post(actor);const invalid=new Request(request.url,{method:'POST',headers:request.headers,body:'{'});
 const res=await h.load('route').POST(invalid);assert.equal(res.status,400);assert.equal((await res.json()).code,'INVALID');assert.equal(h.rpc.filter(([name])=>name==='kinnso_bookmark').length,0);
});
test('confirmed bookmark remains successful when optional measurement fails',async()=>{
 const h=harness({measurementThrows:true}),res=await h.load('route').POST(post(actor));
 assert.equal(res.status,200);assert.equal((await res.json()).data.saved,true);
 assert.equal(h.rpc.filter(([name])=>name==='kinnso_bookmark').length,1);
});
const ports={guidesGet:async()=>({ok:true,data:{kind:'summary',id:guide,title:'Guide'}}),bookmarksList:async()=>({ok:true,data:{items:[{guide_id:guide,guides:null}],nextCursor:null}})};
test('saved removal sends one command across rapid repeated clicks and retains its retry identity',async()=>{
 const commands=[];let resolve;
 const view=await mount('BookmarkWorkspace',{actorId:actor},{...ports,bookmarksToggle:(...args)=>{commands.push(args);return new Promise(r=>{resolve=r})}});
 const click=view.button('Remove bookmark').props.onClick;click();click();
 assert.equal(commands.length,1);assert.equal(commands[0][3],actor);
 resolve({ok:false,code:'UNAVAILABLE',retryable:true,requestId:'failure'});await view.settle();
 view.button('Retry removal').props.onClick();
 assert.equal(commands.length,2);assert.equal(commands[1][2],commands[0][2]);
 resolve({ok:true,data:{saved:false}});await view.settle();assert.match(view.text(),/No bookmarks yet/);
});
test('invalidation blocks a stale removal handler',async()=>{
 let invalidate;const commands=[];
 const view=await mount('BookmarkWorkspace',{actorId:actor},{...ports,subscribeInvalidation:fn=>{invalidate=fn;return()=>{}},bookmarksToggle:async(...args)=>{commands.push(args);return{ok:true,data:{saved:false}}}});
 const click=view.button('Remove bookmark').props.onClick;invalidate(other);click();
 assert.equal(commands.length,0);
 await view.settle();assert.match(view.text(),/Sign in/);
});
test('guide bookmark lookup and save both carry the displayed actor',async()=>{
 const reads=[],writes=[];
 const view=await mount('GuideWorkspace',{id:guide,actorId:actor},{...ports,bookmarksList:async(...args)=>{reads.push(args);return{ok:true,data:{items:[]}}},bookmarksToggle:async(...args)=>{writes.push(args);return{ok:true,data:{saved:true}}}});
 assert.deepEqual(reads[0],[actor,undefined,guide]);
 view.button('Bookmark guide').props.onClick();await view.settle();assert.equal(writes[0][3],actor);
});

for(const lateResult of [{ok:true,data:{saved:false}},{ok:false,code:'UNAVAILABLE',retryable:true,requestId:'lost'}])test('late removal acknowledgement cannot repopulate an invalidated account: '+lateResult.ok,async()=>{
 let invalidate,complete;const view=await mount('BookmarkWorkspace',{actorId:actor},{...ports,subscribeInvalidation:fn=>{invalidate=fn;return()=>{}},bookmarksToggle:()=>new Promise(r=>{complete=r})});
 view.button('Remove bookmark').props.onClick();invalidate(other);complete(lateResult);await view.settle();
 assert.match(view.text(),/Sign in/);assert.doesNotMatch(view.text(),/Source unavailable|could not be removed|Retry removal/);
});
