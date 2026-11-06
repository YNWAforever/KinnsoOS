import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url),actor='00000000-0000-4000-8000-000000000001',id='11111111-1111-4111-8111-111111111111';
const routeUrl=new URL('../app/api/ops/dashboard/route.ts',import.meta.url);
let route={};
if(existsSync(routeUrl)){
 const compiled=await build({entryPoints:[fileURLToPath(routeUrl)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'ops-dashboard-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__opsDashboardClient}',loader:'js'}));}}]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);route=module.exports;
}
function setup(t,{roles=['ops'],revoked=false}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'ops'};const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[]};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},order(key,value){q.orders.push([key,value]);return this;},limit(value){q.limit=value;return this;},maybeSingle:async()=>({data:{id,title:'Fixture mission',status:'published'},error:null}),then(resolve,reject){const rows=[{id,title:'Fixture mission',status:'published',created_at:'2026-11-01T00:00:00Z'}];return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return builder;};
 globalThis.__opsDashboardClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});if(name==='kinnso_actor')return{data:revoked?null:{id:actor,roles},error:revoked?{message:'unauthenticated'}:null};if(name==='admin_overview_counts')return{data:{creators:4,merchants:3,ops:2,perks_active:1,perks_total:2,redemptions:5},error:null};if(name==='admin_search_creators')return{data:[{id,display_name:'Creator',handle:'creator',status:'active',tier:'rising',dna_status:'final',contribution_points:75,created_at:'2026-11-01T00:00:00Z'}],error:null};if(name==='admin_search_merchants')return{data:[{id,company_name:'Company',status:'active',tier:'free',created_at:'2026-11-01T00:00:00Z'}],error:null};if(name==='admin_list_ops_members')return{data:[{id,display_name:'Operator',role:'admin',status:'active'}],error:null};return{data:[],error:null};},from:query};
 t.after(()=>{delete globalThis.__opsDashboardClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=query=>new Request('https://journeys.example/api/ops/dashboard'+(query?'?'+query:''));
test('operations dashboard requires a fresh active operations actor and validates bounded views',async t=>{
 assert.equal(typeof route.GET,'function');
 let state=setup(t,{roles:['creator']});assert.equal((await route.GET(request('view=overview'))).status,403);assert.equal(state.rpcCalls.some(call=>call.name.startsWith('admin_')),false);
 state=setup(t,{revoked:true});assert.equal((await route.GET(request('view=overview'))).status,401);
 state=setup(t);for(const query of ['view=unknown','view=overview&view=creators','view=creators&id=bad','limit=999'])assert.equal((await route.GET(request(query))).status,400,query);
 process.env.KINNSO_ENABLED_CAPABILITIES='';assert.equal((await route.GET(request('view=overview'))).status,503);
});
test('overview and directory views return bounded operations records',async t=>{
 let state=setup(t);let response=await route.GET(request('view=overview'));assert.equal(response.status,200);let body=await response.json();assert.equal(body.data.counts.creators,4);assert.equal(state.rpcCalls.find(call=>call.name==='admin_overview_counts').args,undefined);
 state=setup(t);response=await route.GET(request('view=creators'));assert.equal(response.status,200);body=await response.json();assert.equal(body.data.items[0].tier,'rising');assert.equal(state.rpcCalls.find(call=>call.name==='admin_search_creators').args.p_limit,25);
 state=setup(t);response=await route.GET(request('view=team'));assert.equal(response.status,200);body=await response.json();assert.equal(body.data.items[0].role,'admin');
});
test('operational records are bounded and optional detail ids are owner-scoped through operations RPCs',async t=>{
 const state=setup(t);let response=await route.GET(request('view=missions'));assert.equal(response.status,200);assert.equal(state.queries[0].limit,25);
 response=await route.GET(request('view=missions&id='+id));assert.equal(response.status,200);assert.deepEqual(state.queries[1].filters,[['id',id]]);
 response=await route.GET(request('view=creators&id='+id));assert.equal(response.status,200);assert.deepEqual(state.rpcCalls.find(call=>call.name==='admin_creator_detail').args,{p_creator_id:id});
});
test('booking and payout views remain explicitly gated and do not read operational tables',async t=>{
 const state=setup(t);for(const view of ['bookings','payouts']){const response=await route.GET(request('view='+view));assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.status,'GATED');assert.deepEqual(body.data.items,[]);}
 assert.equal(state.queries.length,0);assert.equal(state.rpcCalls.some(call=>call.name.startsWith('admin_')),false);
});
