import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const actor='00000000-0000-4000-8000-000000000001';
const session='00000000-0000-4000-8000-000000000002';
const routeUrl=new URL('../app/api/creator/sessions/route.ts',import.meta.url);
let route={};
if(existsSync(routeUrl)){
 const compiled=await build({entryPoints:[fileURLToPath(routeUrl)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'creator-session',setup(b){
  b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__creatorSessionsClient}',loader:'js'}));
 }}]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);route=module.exports;
}

const input={title:'Synthetic creator session',description:'Bounded synthetic creator session.',type:'destination_briefing',startsAt:'2026-11-20T10:00:00.000Z',durationMinutes:45,embedUrl:'https://www.youtube.com/watch?v=abc123',replayUrl:'',destinationTags:['Tokyo']};
function setup(t,{roles=['creator'],revoked=false,insertError=null,existing=null,rows=[],anchors=new Map(),pageRows=[]}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'creator',KINNSO_SYNTHETIC_RUN:'true'};
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[],rows,existing,insertError,inserted:null};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null,boundary:null,payload:null,columns:null};state.queries.push(q);
  const builder={select(columns){q.columns=columns;return this;},eq(key,value){q.filters.push([key,value]);return this;},or(value){q.boundary=value;return this;},order(key,value){q.orders.push([key,value]);return this;},limit(value){q.limit=value;return this;},insert(payload){q.operation='insert';q.payload=payload;state.inserted=payload;return this;},maybeSingle:async()=>({data:q.operation==='insert'?(state.insertError?null:state.existing??{id:q.payload.id,slug:q.payload.slug}):q.columns==='starts_at'?anchors.get(q.filters.find(([key])=>key==='id')?.[1])??null:state.existing,error:q.operation==='insert'?state.insertError:null}),single:async()=>({data:q.operation==='insert'?(state.insertError?null:state.existing??{id:q.payload.id,slug:q.payload.slug}):q.columns==='starts_at'?anchors.get(q.filters.find(([key])=>key==='id')?.[1])??null:state.existing,error:q.operation==='insert'?state.insertError:null}),then(resolve,reject){return Promise.resolve({data:q.boundary?pageRows:state.rows,error:null}).then(resolve,reject);}};
  return builder;
 };
 globalThis.__creatorSessionsClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});return name==='kinnso_actor'?{data:revoked?null:{id:actor,roles},error:revoked?{message:'unauthenticated'}:null}:{data:null,error:null};},from:query};
 t.after(()=>{delete globalThis.__creatorSessionsClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=(body,origin='https://journeys.example',method=body===undefined?'GET':'POST')=>new Request('https://journeys.example/api/creator/sessions',{method,headers:{host:'journeys.example',origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});

test('creator session BFF checks fresh role, origin and capability before data access',async t=>{
 assert.equal(typeof route.GET,'function');assert.equal(typeof route.POST,'function');
 let state=setup(t,{roles:['traveller']});assert.equal((await route.GET(request(undefined))).status,403);assert.equal(state.queries.length,0);
 state=setup(t);assert.equal((await route.POST(request({requestId:session,input},'https://foreign.test'))).status,403);assert.equal(state.queries.length,0);
 state=setup(t,{revoked:true});assert.equal((await route.GET(request(undefined))).status,401);
 state=setup(t);process.env.KINNSO_ENABLED_CAPABILITIES='';assert.equal((await route.GET(request(undefined))).status,503);assert.equal(state.queries.length,0);
});

test('creator session list is actor-scoped, ordered and bounded with a cursor',async t=>{
 const rows=Array.from({length:26},(_,index)=>({id:index?`00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`:session,slug:'session-'+index,title:'Session '+index,description:'Synthetic',type:'destination_briefing',starts_at:`2026-11-${String(index+1).padStart(2,'0')}T10:00:00.000Z`,duration_minutes:45,status:'scheduled',embed_url:null,replay_url:null,destination_tags:[],created_at:'2026-11-01T00:00:00.000Z',updated_at:'2026-11-01T00:00:00.000Z'}));
 const state=setup(t,{rows});const response=await route.GET(request(undefined));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.data.items.length,25);assert.deepEqual(body.data.nextCursor,{startsAt:rows[24].starts_at,id:rows[24].id});
 assert.deepEqual(state.queries[0].filters,[['host_creator_id',actor]]);assert.deepEqual(state.queries[0].orders,[['starts_at',{ascending:false}],['id',{ascending:false}]]);assert.equal(state.queries[0].limit,26);
});

test('creator session create uses the request id as the idempotent record id and never accepts an actor field',async t=>{
 const state=setup(t);const response=await route.POST(request({requestId:session,input}));assert.equal(response.status,201);
 assert.equal(state.inserted.id,session);assert.equal(state.inserted.host_creator_id,actor);assert.equal(state.inserted.embed_url,'https://www.youtube-nocookie.com/embed/abc123');
 for(const body of [{requestId:session,input:{...input,actorId:actor}},{requestId:'bad',input},{requestId:session,input:{...input,title:''}}])assert.equal((await route.POST(request(body))).status,400);
});

test('a retried session create reconciles the already persisted record instead of duplicating it',async t=>{
 const existing={id:session,slug:'synthetic-creator-session-000000'};
 const state=setup(t,{insertError:{code:'23505',message:'duplicate'},existing});const response=await route.POST(request({requestId:session,input}));assert.equal(response.status,200);
 assert.deepEqual((await response.json()).data,existing);assert.equal(state.queries.filter(q=>q.operation==='insert').length,1);assert.equal(state.queries.filter(q=>q.operation==='select').length,1);
});

test('owned session cursor advances past the full first page using a strict tie breaker',async t=>{
 const starts_at='2026-11-20T10:00:00.123456+00:00';
 const rows=Array.from({length:27},(_,i)=>({id:'11111111-1111-4111-8111-'+String(27-i).padStart(12,'0'),starts_at}));
 const anchor=rows[24];
 const state=setup(t,{rows:rows.slice(0,26),anchors:new Map([[anchor.id,anchor]]),pageRows:rows.slice(25)});
 const first=(await (await route.GET(request(undefined))).json()).data;
 const second=await route.GET(new Request('https://journeys.example/api/creator/sessions?cursor='+first.nextCursor.id));
 assert.equal(second.status,200);
 const {data}=await second.json();
 assert.equal(data.nextCursor,null);
 assert.deepEqual([...first.items,...data.items].map(row=>row.id),rows.map(row=>row.id));
 assert.deepEqual(state.queries[1].filters,[['host_creator_id',actor],['id',anchor.id]]);
 assert.deepEqual(state.queries[2].filters,[['host_creator_id',actor]]);
 assert.equal(state.queries[2].boundary,`starts_at.lt.${starts_at},and(starts_at.eq.${starts_at},id.lt.${anchor.id})`);
 assert.equal(state.queries[2].limit,26);
});

test('unknown or foreign session anchors fail without a page query, and malformed cursors never reach storage',async t=>{
 const state=setup(t);
 const get=query=>route.GET(new Request('https://journeys.example/api/creator/sessions?'+query));
 for(const query of ['cursor=','cursor=invalid','limit=100','cursor='+session+'&cursor='+session])assert.equal((await get(query)).status,400);
 assert.equal(state.queries.length,0);
 assert.equal((await get('cursor='+session)).status,400);
 assert.equal(state.queries.length,1);
 assert.deepEqual(state.queries[0].filters,[['host_creator_id',actor],['id',session]]);
});
