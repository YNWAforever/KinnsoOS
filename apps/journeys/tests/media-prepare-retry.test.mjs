import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),owner='00000000-0000-4000-8000-000000000001',trip='00000000-0000-4000-8000-000000000002',media='00000000-0000-4000-8000-000000000003';
async function handler(client){
 const b=await build({entryPoints:[fileURLToPath(new URL('../app/api/media/route.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'owned-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return ownedClient}',loader:'js'}));}}]});
 const module={exports:{}};new Function('require','module','exports','ownedClient',b.outputFiles[0].text)(require,module,module.exports,client);return module.exports;
}
function setup(t,{exists=true,denied=false}={}){
 const values={KINNSO_ENVIRONMENT:'local',KINNSO_SITE_URL:'http://127.0.0.1:3495',KINNSO_SUPABASE_URL:'http://127.0.0.1:58421',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_APPROVED_SUPABASE_ORIGIN:'http://127.0.0.1:58421',KINNSO_LEGACY_AUTH_ORIGIN:'http://127.0.0.1:58421',KINNSO_ENABLED_CAPABILITIES:'media',KINNSO_MEDIA_RUNTIME:'unified',KINNSO_SUPABASE_SECRET_KEY:'sb_secret_test'};
 for(const[k,v]of Object.entries(values)){const old=process.env[k];process.env[k]=v;t.after(()=>{if(old===undefined)delete process.env[k];else process.env[k]=old});}
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc:async(name)=>{
  calls.push(name);if(name==='kinnso_actor')return{data:{id:owner},error:null};
  return denied?{data:null,error:{message:'trip_not_found'}}:{data:{id:media,path:`${owner}/${trip}/${media}`,state:'pending'},error:null};
 },storage:{from:bucket=>{assert.equal(bucket,'kinnso-trip-private');return{
  createSignedUploadUrl:async(path,options)=>{calls.push('signed');assert.equal(path,`${owner}/${trip}/${media}`);assert.notEqual(options?.upsert,true);return{data:null,error:{message:'The resource already exists'}}},
  exists:async(path)=>{calls.push('exists');assert.equal(path,`${owner}/${trip}/${media}`);return{data:exists,error:exists?null:{message:'not authorized'}}},
 };}}};
 return{calls,client};
}
function request(){return new Request('http://127.0.0.1:3495/api/media',{method:'POST',headers:{Host:'127.0.0.1:3495',Origin:'http://127.0.0.1:3495','Content-Type':'application/json'},body:JSON.stringify({tripId:trip,requestId:media,mime:'image/jpeg',size:100})});}
test('owned existing bytes can resume verification without an overwrite grant or another upload URL',async t=>{
 const f=setup(t),{POST}=await handler(f.client),r=await POST(request());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');const body=await r.json();assert.equal(body.data.id,media);assert.equal(body.data.alreadyUploaded,true);assert.equal(body.data.uploadUrl,null);assert.deepEqual(f.calls,['kinnso_actor','prepare_trip_upload','signed','exists']);
});
test('a failed signed URL does not claim resumable bytes when their presence is unverified',async t=>{
 const f=setup(t,{exists:false}),{POST}=await handler(f.client),r=await POST(request());assert.equal(r.status,503);const body=await r.json();assert.equal(body.ok,false);assert.equal(body.code,'UNAVAILABLE');assert.equal(body.data,undefined);
});
test('foreign trip denial happens before any Storage lookup or grant',async t=>{
 const f=setup(t,{denied:true}),{POST}=await handler(f.client),r=await POST(request());assert.equal(r.status,404);assert.deepEqual(f.calls,['kinnso_actor','prepare_trip_upload']);
});
