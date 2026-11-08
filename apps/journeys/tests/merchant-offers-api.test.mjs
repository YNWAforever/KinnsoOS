import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url),actor='00000000-0000-4000-8000-000000000001',company='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',offer='33333333-3333-4333-8333-333333333333';
async function load(relative){const path=new URL(relative,import.meta.url);if(!existsSync(path))return{};const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'merchant-offer-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__merchantOfferClient}',loader:'js'}));}}]});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports;}
const listRoute=await load('../app/api/merchant/offers/route.ts'),statusRoute=await load('../app/api/merchant/offers/[id]/status/route.ts');
const input={title:'Synthetic visit offer',terms:'One synthetic offer for isolated merchant workflow verification.',discountKind:'percent',discountValue:'10',commissionKind:'flat',commissionValue:'5',validFrom:'2026-11-20T10:00:00.000Z',validTo:'2026-12-20T10:00:00.000Z',perVisitorLimit:'1',totalCap:'25',missionId:null};
function setup(t,{roles=['merchant'],memberships=[company],memberRole='owner',revoked=false,insertError=null,existing=null,rows=[],summary={claimed:2,redeemed:1},actorId=actor}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'merchant',KINNSO_AUTH_RECOVERY_SECRET:'synthetic-merchant-cursor-key-32-bytes'};const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[],inserted:null};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null,payload:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},order(key,value){q.orders.push([key,value]);return this;},or(value){q.cursor=value;return this;},limit(value){q.limit=value;return this;},insert(payload){q.operation='insert';q.payload=payload;state.inserted=payload;return this;},update(payload){q.operation='update';q.payload=payload;state.inserted=payload;return this;},maybeSingle:async()=>({data:q.operation==='insert'?(insertError?null:existing??{id:payload.qid}):existing??{id:offer,merchant_profile_id:company},error:q.operation==='insert'?insertError:null}),single:async()=>({data:q.operation==='insert'?(insertError?null:existing??{id:state.inserted?.id}):rows,error:insertError}),then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return builder;};
 globalThis.__merchantOfferClient={auth:{getUser:async()=>({data:{user:{id:actorId}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});if(name==='kinnso_actor')return{data:revoked?null:{id:actorId,roles,merchantMemberships:memberships},error:revoked?{message:'unauthenticated'}:null};if(name==='get_kinnso_merchant_memberships')return{data:memberships.map(id=>({merchantId:id,name:'Synthetic company',role:memberRole,branchIds:[]})),error:null};if(name==='get_merchant_offer_totals')return{data:summary,error:null};return{data:null,error:null};},from:query};
 t.after(()=>{delete globalThis.__merchantOfferClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=(path,body,method=body?'POST':'GET',origin='https://journeys.example')=>new Request('https://journeys.example'+path,{method,headers:{host:'journeys.example',origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
test('merchant offer routes enforce capability, actor, active company ownership and origin',async t=>{
 assert.equal(typeof listRoute.GET,'function');assert.equal(typeof listRoute.POST,'function');assert.equal(typeof statusRoute.POST,'function');
 let state=setup(t,{roles:['creator']});assert.equal((await listRoute.GET(request('/api/merchant/offers?company='+company))).status,403);
 state=setup(t,{revoked:true});assert.equal((await listRoute.GET(request('/api/merchant/offers?company='+company))).status,401);
 state=setup(t,{memberships:[]});assert.equal((await listRoute.GET(request('/api/merchant/offers?company='+company))).status,403);
 state=setup(t,{memberRole:'marketing'});assert.equal((await listRoute.GET(request('/api/merchant/offers?company='+company))).status,403);
 state=setup(t);assert.equal((await listRoute.POST(request('/api/merchant/offers',{requestId,company,input},'POST','https://foreign.test'))).status,403);assert.equal(state.queries.length,0);
});
test('merchant offer list is company-scoped, ordered and bounded',async t=>{
 const row={id:offer,title:input.title,terms:input.terms,discount_kind:'percent',discount_value:10,commission_kind:'flat',commission_value:5,valid_from:input.validFrom,valid_to:input.validTo,per_visitor_limit:1,total_cap:25,claimed_count:2,redeemed_count:1,status:'live',created_at:'2026-11-01T00:00:00Z'};
 const state=setup(t,{rows:[row]});const response=await listRoute.GET(request('/api/merchant/offers?company='+company));assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.data.items[0].claimedCount,2);assert.deepEqual(body.data.summary,{claimed:2,redeemed:1});assert.deepEqual(state.queries[0].filters,[['merchant_profile_id',company]]);assert.deepEqual(state.queries[0].orders,[['created_at',{ascending:false}],['id',{ascending:false}]]);assert.equal(state.queries[0].limit,26);
});
test('merchant offer create is idempotent by request id and status updates remain company-scoped',async t=>{
 let state=setup(t);let response=await listRoute.POST(request('/api/merchant/offers',{requestId,company,input}));assert.equal(response.status,201);assert.equal(state.inserted.id,requestId);assert.equal(state.inserted.merchant_profile_id,company);
 state=setup(t,{insertError:{code:'23505',message:'duplicate'},existing:{id:requestId,title:input.title}});response=await listRoute.POST(request('/api/merchant/offers',{requestId,company,input}));assert.equal(response.status,200);
 state=setup(t,{existing:{id:offer,status:'paused'}});response=await statusRoute.POST(request('/api/merchant/offers/'+offer+'/status',{requestId,company,status:'paused'}),{params:Promise.resolve({id:offer})});assert.equal(response.status,200);assert.deepEqual(state.queries[0].filters,[['id',offer],['merchant_profile_id',company]]);
});

test('merchant offer cursor keeps equal timestamps ordered and totals include every page',async t=>{
 const rows=Array.from({length:28},(_,i)=>({id:'44444444-4444-4444-8444-'+String(28-i).padStart(12,'0'),created_at:'2026-11-01T00:00:00.123456+00:00',claimed_count:2,redeemed_count:1}));
 const path='/api/merchant/offers?company='+company,summary={claimed:56,redeemed:28};
 let state=setup(t,{rows:rows.slice(0,26),summary});
 let response=await listRoute.GET(request(path)),first=(await response.json()).data;
 assert.equal(first.items.length,25);assert.ok(first.nextCursor);assert.deepEqual(first.summary,summary);
 state=setup(t,{rows:rows.slice(25),summary});
 response=await listRoute.GET(request(path+'&cursor='+first.nextCursor));
 const second=(await response.json()).data;
 assert.deepEqual([...first.items,...second.items].map(row=>row.id),rows.map(row=>row.id));
 assert.equal(second.nextCursor,null);assert.deepEqual(second.summary,summary);
 assert.equal(state.queries[0].cursor,'created_at.lt.'+rows[24].created_at+',and(created_at.eq.'+rows[24].created_at+',id.lt.'+rows[24].id+')');
 assert.equal((await listRoute.GET(request(path+'&cursor=x'+first.nextCursor))).status,400);
 assert.equal((await listRoute.GET(request(path+'&cursor='+first.nextCursor+'&cursor='+first.nextCursor))).status,400);
 setup(t,{actorId:offer});
 assert.equal((await listRoute.GET(request(path+'&cursor='+first.nextCursor))).status,400);
 setup(t,{memberships:[offer]});
 assert.equal((await listRoute.GET(request('/api/merchant/offers?company='+offer+'&cursor='+first.nextCursor))).status,400);
});
