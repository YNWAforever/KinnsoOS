import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build,transform} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url),actor='11111111-1111-4111-8111-111111111111';
const daily={day:'2026-10-05',funnel:[{name:'trip_created',count:7,status:'measured'}],performance:[{metric:'LCP',count:2,status:'insufficient',p75:null}],budgets:[],scheduledRuns:[{job:'media_cleanup',lastStatus:'failed',lastSuccessAt:null,owner:'Ops'}]};
const monthly={month:'2026-10-01',status:'unconfigured',limit:null,spent:null,reserved:null,services:[]};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/ops/monitoring/route.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'owned-auth-port',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'owned-session',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function serverClient(){return globalThis.__monitoringClient}',loader:'js'}));}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const {GET}=module.exports;

function backend(t,{monthlyError=null,dailyError=null,anonymous=false,enabled=true}={}){
 const env={KINNSO_ENVIRONMENT:'production',KINNSO_SITE_URL:'https://journeys.example',KINNSO_SUPABASE_URL:'https://example.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://example.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://example.supabase.co',KINNSO_ENABLED_CAPABILITIES:enabled?'ops':''};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))process.env[k]=v;
 const calls=[];globalThis.__monitoringClient={auth:{getUser:async()=>({data:{user:anonymous?null:{id:actor}},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(name==='kinnso_actor')return{data:{id:actor,roles:['ops']},error:null};if(name==='get_kinnso_monitoring')return{data:dailyError?null:daily,error:dailyError};if(name==='get_kinnso_monthly_costs')return{data:monthlyError?null:monthly,error:monthlyError};throw Error('Unexpected RPC '+name);}};
 t.after(()=>{delete globalThis.__monitoringClient;for(const[k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;});return calls;
}
const request=()=>new Request('https://journeys.example/api/ops/monitoring?day=2026-10-05');
for(const code of ['PGRST202','42883'])test('missing monthly definition preserves authorized daily monitoring without inventing zero costs: '+code,async t=>{
 backend(t,{monthlyError:{code,message:'Monthly definition is not installed'}});const response=await GET(request());
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.deepEqual(body.data,{...daily,monthlyCosts:null});
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal(response.headers.get('vary'),'Cookie');
});
test('installed monthly projection keeps the requested month and measured daily data',async t=>{
 const calls=backend(t);const response=await GET(request());assert.equal(response.status,200);assert.deepEqual((await response.json()).data,{...daily,monthlyCosts:monthly});
 assert.deepEqual(calls.find(x=>x.name==='get_kinnso_monitoring').args,{p_day:'2026-10-05'});assert.deepEqual(calls.find(x=>x.name==='get_kinnso_monthly_costs').args,{p_month:'2026-10-01'});
});
for(const [message,status] of [['forbidden',403],['unauthenticated',401],['timeout',503]])test('monthly '+message+' remains a failure and does not disclose daily data',async t=>{
 backend(t,{monthlyError:{code:'42501',message}});const response=await GET(request());assert.equal(response.status,status);const body=await response.json();assert.equal(body.ok,false);assert.equal(Object.hasOwn(body,'data'),false);
});
test('daily authorization failure cannot be downgraded to partial monitoring',async t=>{
 const calls=backend(t,{dailyError:{code:'42501',message:'forbidden'}});const response=await GET(request());assert.equal(response.status,403);assert.equal(Object.hasOwn(await response.json(),'data'),false);assert.equal(calls.some(x=>x.name==='get_kinnso_monthly_costs'),false);
});
test('anonymous and disabled capabilities remain closed before measurement queries',async t=>{
 const calls=backend(t,{anonymous:true});assert.equal((await GET(request())).status,401);assert.equal(calls.length,0);
 process.env.KINNSO_ENABLED_CAPABILITIES='';assert.equal((await GET(request())).status,503);assert.equal(calls.length,0);
});

const ui=await transform(await readFile(new URL('../app/travel/MonitoringWorkspace.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function rendered(data,locale){let state=0;const module={exports:{}};new Function('require','module','exports',ui.code)(name=>{
 if(name==='react')return{useState:()=>[state++===0?data:'',()=>{}],useRef:()=>({current:0}),useEffect:()=>{}};
 if(name==='react/jsx-runtime')return require(name);
 if(name==='./ui')return{useApp:()=>({t:(en,zh)=>locale==='en'?en:zh})};
 if(name==='../../lib/trips/repository')return{request:()=>{throw Error('No transport during server render');}};
 if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:()=>()=>{}};
 throw Error('Unexpected UI dependency '+name);
},module,module.exports);return renderToStaticMarkup(module.exports.MonitoringWorkspace({actorId:actor,enabled:true}));}
for(const locale of ['en','zh-HK'])test('monitoring shows the unknown monthly state while retaining activity and failed job: '+locale,()=>{
 const html=rendered({...daily,monthlyCosts:null},locale);assert.ok(html.includes(locale==='en'?'Combined monthly service costs':'服務合計月費'));
 assert.ok(html.includes(locale==='en'?'Monthly service costs are unavailable':'月費目前未可用'));assert.ok(html.includes('trip_created: 7'));assert.ok(html.includes('media_cleanup: failed'));
 assert.equal(html.includes('US$0'),false);assert.equal(html.includes('role="alert"'),false);
});
