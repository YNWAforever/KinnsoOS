import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const validation=await import('../lib/merchants/onboarding-validation.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111';
const stamp='2026-10-10T18:00:00.123456+00:00';
const input={companyName:'Example cafe',contactName:'Owner',contactEmail:'owner@example.test',websiteUrl:'https://example.test/',pitch:'A creator tasting route.'};
test('merchant application accepts only bounded contact and proposal fields',()=>{
 assert.equal(typeof validation.applicationInput,'function');assert.deepEqual(validation.applicationInput(input),input);
 for(const bad of [{...input,userId:id},{...input,status:'approved'},{...input,tier:'enterprise'},{...input,companyName:' '},{...input,contactEmail:'bad@'},{...input,pitch:'x'.repeat(4001)},{...input,websiteUrl:'javascript:alert(1)'},{...input,websiteUrl:'https://user:password@example.test'},{...input,websiteUrl:'https://example.test/\npath'},{...input,contactName:42}])assert.throws(()=>validation.applicationInput(bad),/INVALID/);
 assert.equal(validation.applicationInput({...input,websiteUrl:'',contactName:'',pitch:''}).websiteUrl,'');
});
test('owner profile whitelist never accepts ownership, tier, status or URL credentials',()=>{
 const profile={companyName:input.companyName,contactName:input.contactName,contactEmail:input.contactEmail,websiteUrl:input.websiteUrl,tagline:'Meet local creators',city:'Hong Kong',logoUrl:''};
 assert.equal(typeof validation.profileInput,'function');assert.deepEqual(validation.profileInput(profile),profile);
 for(const bad of [{...profile,userId:id},{...profile,slug:'takeover'},{...profile,status:'active'},{...profile,tagline:'x'.repeat(161)},{...profile,logoUrl:'http://example.test/logo.png'}])assert.throws(()=>validation.profileInput(bad),/INVALID/);
 assert.equal(validation.timestamp(stamp),true);assert.equal(validation.timestamp('2026-99-70'),false);
});
const require=createRequire(import.meta.url);
async function handler(path){const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export async function serverClient(){return globalThis.__onboardingClient}'}));}}]});const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;}
function setup(t){const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'merchant'};const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const calls=[];globalThis.__onboardingClient={auth:{getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='kinnso_actor'?{id}:{id},error:null}}};t.after(()=>{delete globalThis.__onboardingClient;for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});return calls;}
const post=(body,origin='https://journeys.example',method='POST')=>new Request('https://journeys.example/api/merchant/application',{method,headers:{Host:'journeys.example',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('onboarding BFF checks session and origin, forbids caller actor, and preserves retry identity',async t=>{
 const api=await handler('../app/api/merchant/application/route.ts'),calls=setup(t);const body={requestId:id,input};
 const r=await api.POST(post(body));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-store/);assert.deepEqual(calls.at(-1),{name:'submit_kinnso_merchant_application',args:{p_request_id:id,p_input:input}});
 calls.length=0;assert.equal((await api.POST(post({...body,actorId:id}))).status,400);assert.equal((await api.POST(post(body,'https://foreign.example'))).status,403);assert.equal(calls.filter(c=>c.name!=='kinnso_actor').length,0);
 assert.equal((await api.GET(new Request('https://journeys.example/api/merchant/application?userId='+id))).status,400);
 globalThis.__onboardingClient.rpc=async()=>({data:null,error:{message:'unauthenticated'}});assert.equal((await api.GET(new Request('https://journeys.example/api/merchant/application'))).status,401);
});
test('profile BFF preserves CAS token, rejects ambiguous selectors and redacts conflicts',async t=>{
 const api=await handler('../app/api/merchant/profile/route.ts'),calls=setup(t);const profile={companyName:'Cafe',contactName:'Owner',contactEmail:'owner@example.test',websiteUrl:'',tagline:'',city:'',logoUrl:''};
 assert.equal((await api.PUT(post({merchantId:id,requestId:id,expectedUpdatedAt:stamp,input:profile},undefined,'PUT'))).status,200);
 assert.deepEqual(calls.at(-1),{name:'save_kinnso_merchant_profile',args:{p_merchant_id:id,p_request_id:id,p_expected_updated_at:stamp,p_input:profile}});
 for(const query of ['id='+id+'&id='+id,'id='+id+'&userId='+id,'id=',''])assert.equal((await api.GET(new Request('https://journeys.example/api/merchant/profile?'+query))).status,400);
 globalThis.__onboardingClient.rpc=async name=>name==='kinnso_actor'?{data:{id},error:null}:{error:{message:'revision_conflict private details'}};
 const r=await api.PUT(post({merchantId:id,requestId:id,expectedUpdatedAt:stamp,input:profile},undefined,'PUT'));assert.equal(r.status,409);assert.doesNotMatch(await r.text(),/private details/);
});
test('a thrown RPC response is an unknown outcome, never a validation rejection',async t=>{
 const api=await handler('../app/api/merchant/application/route.ts'),profile=await handler('../app/api/merchant/profile/route.ts');setup(t);
 globalThis.__onboardingClient.rpc=async name=>{if(name==='kinnso_actor')return{data:{id},error:null};throw Error('Lost response after commit');};
 const r=await api.POST(post({requestId:id,input}));assert.equal(r.status,503);assert.equal((await r.json()).code,'UNAVAILABLE');
 const p=await profile.PUT(post({merchantId:id,requestId:id,expectedUpdatedAt:stamp,input:{companyName:'Cafe',contactName:'Owner',contactEmail:input.contactEmail,websiteUrl:'',tagline:'',city:'',logoUrl:''}},undefined,'PUT'));assert.equal(p.status,503);
 assert.equal((await api.GET(new Request('https://journeys.example/api/merchant/application'))).status,503);
 assert.equal((await profile.GET(new Request('https://journeys.example/api/merchant/profile?id='+id))).status,503);
});
