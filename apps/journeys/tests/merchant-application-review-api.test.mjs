import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),actorId='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const routePath=new URL('../app/api/ops/merchant-applications/route.ts',import.meta.url);
let route={};
if(existsSync(routePath)){
 const compiled=await build({entryPoints:[fileURLToPath(routePath)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'owned-review-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'owned-session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__applicationReviewClient}',loader:'js'}));}}]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);route=module.exports;
}
const row={id,company_name:'Submitted company',contact_name:'Submitted contact',contact_email:'application-contact@example.test',website_url:'https://company.test',pitch:'Original company application',status:'pending',created_at:'2026-10-10T12:30:00.123456+00:00',decided_at:null,decision_reason:null};
function setup(t,options={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'ops',KINNSO_SYNTHETIC_RUN:'true'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const state={calls:[],queries:[],rows:[row],current:row,roles:['ops'],moderator:true,revoked:false,writeError:null,writeThrows:false,...options};
 globalThis.__applicationReviewClient={auth:{getUser:async()=>({data:{user:{id:actorId,email:'provider-login@secret.test'}},error:null})},rpc:async(name,args)=>{
  state.calls.push({name,args});
  if(name==='kinnso_actor')return{data:state.revoked?null:{id:actorId,roles:state.roles},error:state.revoked?{message:'unauthenticated'}:null};
  if(name==='is_active_ops_role')return{data:state.moderator,error:null};
  if(state.writeThrows)throw Error('Private backend connection detail');
  if(!state.writeError)state.current={...row,status:name==='admin_approve_merchant_application'?'approved':'rejected',decided_at:'2026-10-10T13:00:00+00:00',decision_reason:args.p_reason};
  return{data:name==='admin_approve_merchant_application'?id:null,error:state.writeError};
 },from:table=>{
  const query={table,filters:[],orders:[]};state.queries.push(query);
  const builder={select(columns){query.columns=columns;return this;},eq(key,value){query.filters.push([key,value]);return this;},order(key,value){query.orders.push([key,value]);return this;},limit(value){query.limit=value;return this;},or(value){query.or=value;return this;},maybeSingle:async()=>({data:state.current,error:state.readError??null}),then(resolve,reject){return Promise.resolve({data:state.rows,error:state.readError??null}).then(resolve,reject);}};
  return builder;
 }};
 t.after(()=>{delete globalThis.__applicationReviewClient;for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});return state;
}
const get=query=>new Request('https://journeys.example/api/ops/merchant-applications'+(query?'?'+query:''));
const post=(body,origin='https://journeys.example')=>new Request('https://journeys.example/api/ops/merchant-applications',{method:'POST',headers:{host:'journeys.example',origin,'content-type':'application/json'},body:JSON.stringify(body)});
const decision={id,action:'approve',reason:'Verified the submitted company details'};

test('actual merchant review BFF checks fresh ops actor, moderator authority, origin and capability before private access',async t=>{
 assert.equal(typeof route.GET,'function');const s=setup(t,{roles:['creator']});
 assert.equal((await route.GET(get())).status,403);assert.equal(s.queries.length,0);assert.deepEqual(s.calls.map(x=>x.name),['kinnso_actor']);
 s.roles=['ops'];s.moderator=false;assert.equal((await route.GET(get())).status,403);assert.equal((await route.POST(post(decision))).status,403);assert.equal(s.queries.length,0);assert.equal(s.calls.some(x=>x.name.startsWith('admin_')),false);
 s.moderator=true;assert.equal((await route.POST(post(decision,'https://foreign.test'))).status,403);
 s.revoked=true;assert.equal((await route.GET(get())).status,401);s.revoked=false;
 process.env.KINNSO_ENABLED_CAPABILITIES='';assert.equal((await route.GET(get())).status,503);assert.equal(s.queries.length,0);
});

test('actual merchant review queue is private, bounded to20 plus lookahead and uses stable microsecond cursor',async t=>{
 assert.equal(typeof route.GET,'function');const rows=Array.from({length:21},(_,i)=>({...row,id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`})),s=setup(t,{rows});
 const response=await route.GET(get());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Cookie/);
 const body=await response.json();assert.equal(body.data.applications.length,20);assert.deepEqual(body.data.nextCursor,{createdAt:row.created_at,id:rows[19].id});
 assert.equal(JSON.stringify(body).includes('provider-login'),false);assert.equal(JSON.stringify(body).includes('user_id'),false);
 assert.equal(s.queries[0].limit,21);assert.deepEqual(s.queries[0].filters,[['status','pending']]);assert.deepEqual(s.queries[0].orders,[['created_at',{ascending:true}],['id',{ascending:true}]]);
 await route.GET(get(new URLSearchParams({after:JSON.stringify(body.data.nextCursor)})));assert.equal(s.queries[1].or,`created_at.gt.${row.created_at},and(created_at.eq.${row.created_at},id.gt.${rows[19].id})`);
 const read=await route.GET(get('id='+id));assert.equal((await read.json()).data.companyName,row.company_name);assert.deepEqual(s.queries[2].filters,[['id',id]]);
});

test('actual review BFF rejects injected scopes, missing authored reasons and oversized bodies without writing',async t=>{
 assert.equal(typeof route.POST,'function');const s=setup(t);
 for(const query of ['status=approved','limit=999','id='+id+'&id='+id,'after=','id='+id+'&after={}'])assert.equal((await route.GET(get(query))).status,400);
 for(const body of [{...decision,actorId},{...decision,reason:' '},{...decision,reason:'x'.repeat(501)},{...decision,action:'delete'},{...decision,notes:'x'.repeat(17000)}])assert.equal((await route.POST(post(body))).status,400);
 assert.equal(s.queries.length,0);assert.equal(s.calls.some(x=>x.name.startsWith('admin_')),false);
});

test('mature application RPC persists authored approval and returns current application state',async t=>{
 assert.equal(typeof route.POST,'function');const s=setup(t);const response=await route.POST(post({...decision,reason:'  '+decision.reason+'  '}));assert.equal(response.status,200);
 assert.deepEqual(s.calls.find(x=>x.name==='admin_approve_merchant_application').args,{p_id:id,p_reason:decision.reason});
 const data=(await response.json()).data;assert.equal(data.status,'approved');assert.equal(data.decisionReason,decision.reason);assert.ok(data.decidedAt);
});

test('already decided application reconciles persisted rejection without pretending an approval succeeded',async t=>{
 assert.equal(typeof route.POST,'function');setup(t,{writeError:{message:'not_pending'},current:{...row,status:'rejected',decision_reason:'Reviewed by another moderator',decided_at:'2026-10-10T13:00:00Z'}});
 const response=await route.POST(post(decision));assert.equal(response.status,200);assert.equal((await response.json()).data.status,'rejected');
});

test('ambiguous review failure is sanitized and cannot promise a safe new decision',async t=>{
 assert.equal(typeof route.POST,'function');const s=setup(t,{writeThrows:true});let response=await route.POST(post(decision));assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'UNAVAILABLE');assert.equal(body.retryable,false);assert.equal(JSON.stringify(body).includes('Private backend'),false);
 s.writeThrows=false;s.readError={message:'Private read detail'};response=await route.POST(post(decision));assert.equal(response.status,503);assert.equal((await response.json()).retryable,false);
});
