import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const trip='11111111-1111-4111-8111-111111111111',stop='33333333-3333-4333-8333-333333333333';
const requestId='77777777-7777-4777-8777-777777777777';
const snapshot={ownerId:owner,tripId:trip,tripRevision:7,progressRevision:0,entries:[]};
const body={requestId,stopId:stop,state:'visited',expectedTripRevision:7,expectedProgressRevision:0};
const origin='http://127.0.0.1:49999';
async function routeWith(options={}){
 const calls=[];let clients=0;
 const client={
  auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:owner}},error:null})},
  rpc:async(name,args)=>{
   calls.push({name,args:args===undefined?undefined:JSON.parse(JSON.stringify(args))});
   if(name==='kinnso_actor')return{data:{id:options.actorMismatch?other:owner},error:null};
   if(options.error)return{data:null,error:options.error};
   if(name==='get_trip_progress')return{data:options.data??snapshot,error:null};
   return{data:options.data??{snapshot:{...snapshot,progressRevision:1,entries:[{stopId:stop,state:'visited'}]},
    requestId,appliedProgressRevision:1,replayed:false},error:null};
  },
 };
 const compiled=await build({entryPoints:[new URL('../app/api/trips/[id]/progress/route.ts',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],
  bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'auth-db-ports-only',setup(b){
   b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'ports'}));
   b.onResolve({filter:/telemetry\/server$/},()=>({path:'observe',namespace:'ports'}));
   b.onLoad({filter:/.*/,namespace:'ports'},({path})=>({loader:'js',contents:path==='session'
    ?'export const serverClient=()=>globalThis.__client();':'export const observeRequest=()=>{};'}));
  }}]});
 const module={exports:{}};
 runInContext(compiled.outputFiles[0].text,createContext({module,exports:module.exports,Request,Response,URL,Buffer,Uint8Array,
  crypto:webcrypto,performance,console,__client:()=>{clients++;return client},
  process:{env:{KINNSO_ENVIRONMENT:'local',KINNSO_SITE_URL:origin,KINNSO_SUPABASE_URL:origin,
   KINNSO_APPROVED_SUPABASE_ORIGIN:origin,KINNSO_LEGACY_AUTH_ORIGIN:origin,
   KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',KINNSO_ENABLED_CAPABILITIES:'trips'}}}));
 const request=(method,value=body,headers={})=>new Request(origin+'/api/trips/'+trip+'/progress',{
  method,headers:{Host:'127.0.0.1:49999',Origin:origin,'Content-Type':'application/json','X-Kinnso-Intent-Actor':owner,...headers},
  ...(method==='POST'?{body:JSON.stringify(value)}:{}),
 });
 return{route:module.exports,calls,clients:()=>clients,request,context:{params:Promise.resolve({id:trip})}};
}
test('progress GET uses the actual session/actor gate and exposes only the owner-bound snapshot',async()=>{
 const h=await routeWith({data:{...snapshot,privateNote:'never leak'}});
 const response=await h.route.GET(h.request('GET'),h.context);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(response.headers.get('vary'),'Cookie');
 assert.deepEqual((await response.json()).data,snapshot);
 assert.deepEqual(h.calls.map(call=>call.name),['kinnso_actor','get_trip_progress']);
});
test('progress POST invokes the separate progress RPC, never a trip edit command',async()=>{
 const h=await routeWith();
 const response=await h.route.POST(h.request('POST'),h.context);
 assert.equal(response.status,200);
 assert.deepEqual(h.calls[1],{name:'apply_trip_progress',args:{p_trip_id:trip,p_request_id:requestId,p_stop_id:stop,
  p_state:'visited',p_expected_trip_revision:7,p_expected_progress_revision:0}});
});
test('progress POST rejects a cross-origin request before a client or write RPC exists',async()=>{
 const h=await routeWith();
 const response=await h.route.POST(h.request('POST',body,{Origin:'https://other.invalid'}),h.context);
 assert.equal(response.status,403);assert.equal(h.clients(),0);assert.deepEqual(h.calls,[]);
});
test('progress rejects anonymous, actor-mismatched and owner-denied access',async()=>{
 for(const options of [{anonymous:true},{actorMismatch:true}]){
  const h=await routeWith(options);
  assert.equal((await h.route.GET(h.request('GET'),h.context)).status,401);
  assert.ok(!h.calls.some(call=>call.name==='get_trip_progress'));
 }
 for(const method of ['GET','POST']){
  const h=await routeWith({error:{message:'trip_not_found'}});
  assert.equal((await h.route[method](h.request(method),h.context)).status,404);
 }
});
test('progress rejects forged owner fields and maps version/idempotency conflicts to 409',async()=>{
 const invalid=await routeWith();
 assert.equal((await invalid.route.POST(invalid.request('POST',{...body,ownerId:other}),invalid.context)).status,400);
 assert.ok(!invalid.calls.some(call=>call.name==='apply_trip_progress'));
 for(const message of ['progress_revision_conflict','progress_idempotency_conflict']){
  const h=await routeWith({error:{message}});
  assert.equal((await h.route.POST(h.request('POST'),h.context)).status,409);
 }
});
test('a missing pending RPC or a malformed acknowledgement never reports saved',async()=>{
 const missing=await routeWith({error:{code:'PGRST202',message:'function not found'}});
 assert.equal((await missing.route.POST(missing.request('POST'),missing.context)).status,503);
 const wrong=await routeWith({data:{snapshot,requestId:other,appliedProgressRevision:1,replayed:true}});
 assert.equal((await wrong.route.POST(wrong.request('POST'),wrong.context)).status,503);
});
