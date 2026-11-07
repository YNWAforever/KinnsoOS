import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const actor='00000000-0000-4000-8000-000000000001';
const token='00000000-0000-4000-8000-000000000003';
const session='00000000-0000-4000-8000-000000000002';
async function load(relative){
 const path=new URL(relative,import.meta.url);if(!existsSync(path))return{};
 const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'creator-session-mutation',setup(b){
  b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__creatorSessionMutationClient}',loader:'js'}));
 }}]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports;
}
const updateRoute=await load('../app/api/creator/sessions/[id]/route.ts');
const statusRoute=await load('../app/api/creator/sessions/[id]/status/route.ts');
const input={title:'Updated session',description:'Updated synthetic session.',type:'ask_a_creator',startsAt:'2026-11-21T10:00:00.000Z',durationMinutes:60,embedUrl:'',replayUrl:'',destinationTags:['Tokyo']};
function setup(t,{roles=['creator'],current={embed_url:null,status:'scheduled'},write=null,writeError=null,readError=null}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'creator'};
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],current,write,rpcs:[]};
 const query=table=>{const q={table,operation:'select',filters:[],payload:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},update(payload){q.operation='update';q.payload=payload;state.write=payload;return this;},maybeSingle:async()=>({data:q.operation==='update'?(writeError?null:{id:session,...write}):state.current,error:q.operation==='update'?writeError:readError})};return builder;};
 globalThis.__creatorSessionMutationClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async (name,args)=>{if(name==='kinnso_actor')return {data:{id:actor,roles},error:null};state.rpcs.push({name,args});return {data:write,error:writeError};},from:query};
 t.after(()=>{delete globalThis.__creatorSessionMutationClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=(path,body,origin='https://journeys.example',method='PUT')=>new Request('https://journeys.example'+path,{method,headers:{host:'journeys.example',origin,'content-type':'application/json'},body:JSON.stringify(body)});
const context={params:Promise.resolve({id:session})};

test('session update and status routes recheck creator access and reject malformed ids or fields',async t=>{
 assert.equal(typeof updateRoute.GET,'function');assert.equal(typeof updateRoute.PUT,'function');assert.equal(typeof statusRoute.POST,'function');
 let state=setup(t,{roles:['traveller']});assert.equal((await updateRoute.PUT(request('/api/creator/sessions/'+session,{requestId:session,input}),context)).status,403);assert.equal(state.queries.length,0);
 state=setup(t);assert.equal((await updateRoute.PUT(request('/api/creator/sessions/not-a-uuid',{requestId:session,input}),{params:Promise.resolve({id:'not-a-uuid'})})).status,400);
 for(const body of [{requestId:session,input:{...input,actorId:actor}},{requestId:session,input:{...input,durationMinutes:0}},{requestId:session,status:'deleted'}])assert.equal((await statusRoute.POST(request('/api/creator/sessions/'+session+'/status',body,'https://journeys.example','POST'),context)).status,400);
 assert.equal(state.queries.length,0);
});

test('session detail is owner-scoped and hides a foreign or missing record',async t=>{
 const state=setup(t,{current:{id:session,slug:'session',title:'Owned',description:'Synthetic',type:'destination_briefing',starts_at:'2026-11-21T10:00:00.000Z',duration_minutes:60,status:'scheduled',embed_url:null,replay_url:null,destination_tags:[],created_at:'2026-11-01T00:00:00.000Z',updated_at:'2026-11-01T00:00:00.000Z',edit_token:token,edit_revision:1}});
 const response=await updateRoute.GET(request('/api/creator/sessions/'+session,undefined,undefined,'GET'),context);assert.equal(response.status,200);
 const {data}=await response.json();assert.equal(data.editToken,token);assert.equal(data.revision,1);
 assert.deepEqual(state.queries[0].filters,[['id',session],['host_creator_id',actor]]);
 state.current=null;assert.equal((await updateRoute.GET(request('/api/creator/sessions/'+session,undefined,undefined,'GET'),context)).status,404);
});

test('session edit forwards the request identity and revision to the atomic owner command',async t=>{
 const state=setup(t,{write:{id:session,revision:2}});
 const response=await updateRoute.PUT(request('/api/creator/sessions/'+session,{requestId:session,expectedToken:token,expectedRevision:1,input}),context);
 assert.equal(response.status,200);
 assert.equal(state.queries.length,0);
 const [{name,args}]=state.rpcs;
 assert.equal(name,'edit_kinnso_creator_session');
 assert.equal(args.p_session_id,session);
 assert.equal(args.p_request_id,session);
 assert.equal(args.p_expected_revision,1);
 assert.equal(args.p_expected_token,token);
 assert.equal(args.p_input.title,'Updated session');
 assert.equal(args.p_input.embed_url,null);
 assert.equal(args.p_input.host_creator_id,undefined);
});

test('session edit conflicts are definite failures',async t=>{
 for(const message of ['CONFLICT','REQUEST_ID_REUSED']){
  setup(t,{writeError:{message}});
  const response=await updateRoute.PUT(request('/api/creator/sessions/'+session,{requestId:session,expectedToken:token,expectedRevision:1,input}),context);
  assert.equal(response.status,409);
  assert.equal((await response.json()).retryable,false);
 }
});

test('going live without an embed link fails before update while ended and cancelled remain allowed',async t=>{
 let state=setup(t,{current:{embed_url:null,status:'scheduled'}});
 assert.equal((await statusRoute.POST(request('/api/creator/sessions/'+session+'/status',{requestId:session,status:'live'},undefined,'POST'),context)).status,409);
 assert.equal(state.queries.filter(q=>q.operation==='update').length,0);
 state=setup(t,{current:{embed_url:'https://www.youtube-nocookie.com/embed/abc123',status:'scheduled'},write:{status:'live'}});
 assert.equal((await statusRoute.POST(request('/api/creator/sessions/'+session+'/status',{requestId:session,status:'live'},undefined,'POST'),context)).status,200);
 assert.deepEqual(state.queries.filter(q=>q.operation==='update')[0].filters,[['id',session],['host_creator_id',actor]]);
 state=setup(t,{current:{embed_url:null,status:'live'},write:{status:'ended'}});
 assert.equal((await statusRoute.POST(request('/api/creator/sessions/'+session+'/status',{requestId:session,status:'ended'},undefined,'POST'),context)).status,200);
});
test('session edit requires a revision from the loaded record',async t=>{
 setup(t);
 assert.equal((await updateRoute.PUT(request('/api/creator/sessions/'+session,{requestId:session,input}),context)).status,400);
});
test('PUT rejects a missing or malformed lifetime token before reaching the edit command',async t=>{
 const state=setup(t);
 for(const expectedToken of [undefined,'not-a-uuid']){
  const response=await updateRoute.PUT(request('/api/creator/sessions/'+session,{requestId:session,expectedToken,expectedRevision:1,input}),context);
  assert.equal(response.status,400);
 }
 assert.equal(state.rpcs.length,0);
});
