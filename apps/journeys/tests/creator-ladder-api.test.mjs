import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url),actor='00000000-0000-4000-8000-000000000001',perk='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
async function load(relative){const path=new URL(relative,import.meta.url);if(!existsSync(path))return{};const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'creator-ladder-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__creatorLadderClient}',loader:'js'}));}}]});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports;}
const ladderRoute=await load('../app/api/creator/ladder/route.ts'),perkRoute=await load('../app/api/creator/perks/route.ts');
function setup(t,{roles=['creator'],revoked=false,contribution={contribution_points:75,tier:'rising'},events=[],perks=[],redemptions=[],redeem={data:[{redemption_type:'code',redemption_value:'PARTNER-CODE'}],error:null}}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'creator'};const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[]};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},order(key,value){q.orders.push([key,value]);return this;},limit(value){q.limit=value;return this;},maybeSingle:async()=>({data:contribution,error:null}),then(resolve,reject){return Promise.resolve({data:table==='perk_redemptions'?redemptions:events,error:null}).then(resolve,reject);}};return builder;};
 globalThis.__creatorLadderClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});if(name==='kinnso_actor')return{data:revoked?null:{id:actor,roles},error:revoked?{message:'unauthenticated'}:null};if(name==='list_active_perks')return{data:perks,error:null};if(name==='redeem_perk')return typeof redeem==='function'?redeem(args):redeem;return{data:null,error:null};},from:query};
 t.after(()=>{delete globalThis.__creatorLadderClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=(path,body,method=body?'POST':'GET',origin='https://journeys.example')=>new Request('https://journeys.example'+path,{method,headers:{host:'journeys.example',origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});

test('creator ladder and perk routes enforce origin, fresh creator role and capability',async t=>{
 assert.equal(typeof ladderRoute.GET,'function');assert.equal(typeof perkRoute.GET,'function');assert.equal(typeof perkRoute.POST,'function');
 let state=setup(t,{roles:['traveller']});assert.equal((await ladderRoute.GET(request('/api/creator/ladder'))).status,403);
 state=setup(t,{revoked:true});assert.equal((await perkRoute.GET(request('/api/creator/perks'))).status,401);
 state=setup(t);assert.equal((await perkRoute.POST(request('/api/creator/perks',{requestId,perkId:perk},'POST','https://foreign.test'))).status,403);assert.equal(state.rpcCalls.some(x=>x.name==='redeem_perk'),false);
 state=setup(t);process.env.KINNSO_ENABLED_CAPABILITIES='';assert.equal((await ladderRoute.GET(request('/api/creator/ladder'))).status,503);
});

test('tier payload returns canonical progress, bounded events and next-tier perks',async t=>{
 const event={id:'33333333-3333-4333-8333-333333333333',event_type:'guide_published',points:15,created_at:'2026-11-01T00:00:00Z'};
 const row={id:perk,slug:'rail-pass',partner_name:'Partner',title:'Rail pass',summary:'Synthetic benefit',category:'travel',discount_label:'10%',min_tier:'pro',redemption_type:'code',sort_order:1};
 const state=setup(t,{events:[event],perks:[row]});const response=await ladderRoute.GET(request('/api/creator/ladder'));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.data.progress.tier,'rising');assert.equal(body.data.progress.pointsForNext,75);assert.deepEqual(body.data.events,[{id:event.id,eventType:'guide_published',points:15,createdAt:event.created_at}]);assert.deepEqual(body.data.nextTierPerks,[{title:'Rail pass',partnerName:'Partner'}]);
 assert.equal(state.queries.find(q=>q.table==='creator_contribution_events').limit,50);assert.equal(JSON.stringify(body).includes('redemption_value'),false);
});

test('perk catalog returns eligibility without secret redemption values',async t=>{
 const row={id:perk,slug:'rail-pass',partner_name:'Partner',title:'Rail pass',summary:'Synthetic benefit',category:'travel',discount_label:'10%',min_tier:'rising',redemption_type:'code',sort_order:1,redemption_value:'DO_NOT_EXPOSE'};
 setup(t,{perks:[row]});const response=await perkRoute.GET(request('/api/creator/perks'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.items[0].eligible,true);assert.equal(JSON.stringify(body).includes('DO_NOT_EXPOSE'),false);
});

test('perk redemption is an idempotent RPC and maps tier or missing-perk errors without leaking backend text',async t=>{
 let state=setup(t);let response=await perkRoute.POST(request('/api/creator/perks',{requestId,perkId:perk}));assert.equal(response.status,200);assert.deepEqual((await response.json()).data,{redemptionType:'code',value:'PARTNER-CODE'});assert.deepEqual(state.rpcCalls.find(x=>x.name==='redeem_perk').args,{p_perk_id:perk});
 for(const[error,status]of[[{message:'below_tier',code:'42501'},403],[{message:'perk_not_found',code:'P0002'},404],[{message:'private database detail',code:'XX000'},503]]){setup(t,{redeem:{data:null,error}});response=await perkRoute.POST(request('/api/creator/perks',{requestId,perkId:perk}));assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes('private database'),false);}
 for(const body of [{requestId:'bad',perkId:perk},{requestId,perkId:'bad'},{requestId,perkId:perk,actorId:actor}])assert.equal((await perkRoute.POST(request('/api/creator/perks',body))).status,400);
});

test('catalog reload keeps two redeemed values private and POST reveals each independently',async t=>{
 const another='33333333-3333-4333-8333-333333333333';
 const row={id:perk,slug:'rail',partner_name:'Partner',title:'Rail',summary:'Benefit',category:'travel',discount_label:'10%',min_tier:'rising',redemption_type:'code',sort_order:1};
 const state=setup(t,{perks:[row,{...row,id:another,slug:'hotel',redemption_type:'link'}],
  redemptions:[{perk_id:perk},{perk_id:another}],
  redeem:({p_perk_id})=>({data:[p_perk_id===perk?{redemption_type:'code',redemption_value:'RAIL-CODE'}:{redemption_type:'link',redemption_value:'https://example.test/hotel'}],error:null})});
 const catalog=await (await perkRoute.GET(request('/api/creator/perks'))).json();
 assert.deepEqual(catalog.data.items.map(({id,redeemed})=>[id,redeemed]),[[perk,true],[another,true]]);
 assert.ok(catalog.data.items.every(item=>!('value' in item)));
 assert.deepEqual(state.queries.find(q=>q.table==='perk_redemptions').filters,[['creator_id',actor]]);
 for(const [perkId,type,value] of [[perk,'code','RAIL-CODE'],[another,'link','https://example.test/hotel'],[perk,'code','RAIL-CODE']]){
  const response=await perkRoute.POST(request('/api/creator/perks',{requestId,perkId}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual((await response.json()).data,{redemptionType:type,value});
 }
 assert.deepEqual(state.rpcCalls.filter(call=>call.name==='redeem_perk').map(call=>call.args.p_perk_id),[perk,another,perk]);
});

test('perk redemption never returns an unsafe stored link',async t=>{
 setup(t,{redeem:{data:[{redemption_type:'link',redemption_value:'javascript:alert(1)'}],error:null}});
 const response=await perkRoute.POST(request('/api/creator/perks',{requestId,perkId:perk}));
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'CONFLICT');
});
