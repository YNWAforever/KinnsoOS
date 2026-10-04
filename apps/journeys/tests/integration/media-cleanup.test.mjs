import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import sharp from 'sharp';
import {fixture,admin,anonymous} from './local-fixtures.mjs';

const require=createRequire(import.meta.url);
async function bundled(relative,stubCookies=false) {
 const result=await build({entryPoints:[fileURLToPath(new URL(relative,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['sharp','@supabase/supabase-js','next/server','next/headers'],plugins:stubCookies?[{name:'unused-cookie-client',setup(b){
  b.onResolve({filter:/supabase\/server$/},()=>({path:'cookies',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function serverClient(){throw Error("Cleanup must not use cookie auth")}',loader:'js'}));
 }}]:[]});
 const module={exports:{}};
 new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
 return module.exports;
}

test('real local cleanup removes expired/deleted private uploads and retains ready/recent uploads',async t=>{
 const f=await fixture(),paths=[];
 const settings={KINNSO_ENVIRONMENT:'local',KINNSO_MEDIA_RUNTIME:'unified',KINNSO_SITE_URL:'http://127.0.0.1:3493',KINNSO_SUPABASE_URL:process.env.SUPABASE_URL,KINNSO_SUPABASE_PUBLISHABLE_KEY:process.env.SUPABASE_ANON_KEY,KINNSO_APPROVED_SUPABASE_ORIGIN:process.env.SUPABASE_URL,KINNSO_LEGACY_AUTH_ORIGIN:process.env.SUPABASE_URL,KINNSO_SUPABASE_SECRET_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,CRON_SECRET:'synthetic-local-cleanup-'+randomUUID()};
 const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));
 Object.assign(process.env,settings);
 t.after(()=>{for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v});
 const {GET}=await bundled('../../app/api/cron/media-cleanup/route.ts',true);
 const {finalizeMedia,unifiedMediaEnvironment}=await bundled('../../lib/media/service.ts');
 try {
  const a=await f.actor();
  assert.equal((await a.client.rpc('claim_kinnso_media_cleanup')).error?.code,'42501');
  assert.equal((await anonymous.rpc('claim_kinnso_media_cleanup')).error?.code,'42501');
  const trip=await a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic cleanup contract',timezone:'Asia/Tokyo',startDate:null}});
  assert.equal(trip.error,null);
  const bytes=await sharp({create:{width:1,height:1,channels:4,background:'#ffffff'}}).png().toBuffer(),intents=[];let signedUpload;
  for(let i=0;i<4;i++){
   const intent=await a.client.rpc('prepare_trip_upload',{p_trip_id:trip.data.id,p_request_id:randomUUID(),p_mime:'image/png',p_size:bytes.length});
   assert.equal(intent.error,null);intents.push(intent.data);paths.push(intent.data.path);
   if(i===0){const signed=await a.client.storage.from('kinnso-trip-private').createSignedUploadUrl(intent.data.path);assert.equal(signed.error,null);signedUpload=signed.data;
    const tokenClaims=JSON.parse(Buffer.from(signedUpload.token.split('.')[1],'base64url').toString());
    assert.ok(Number.isFinite(tokenClaims.exp)&&tokenClaims.exp>Date.now()/1000&&tokenClaims.exp<=Date.now()/1000+2*3600+60,'provider signed-upload lifetime must fit the retention window');
   }
   assert.equal((await a.client.storage.from('kinnso-trip-private').upload(intent.data.path,bytes,{contentType:'image/png',upsert:false})).error,null);
  }
  const token=(await a.client.auth.getSession()).data.session.access_token;
  const expired=await admin.from('kinnso_trip_media').update({created_at:new Date(Date.now()-48*3600000).toISOString()}).in('id',[intents[0].id,intents[2].id]).select('id');
  assert.equal(expired.error,null);assert.equal(expired.data.length,2);
  for(const intent of intents.slice(1,3))assert.equal((await finalizeMedia({token,id:intent.id,checksum:createHash('sha256').update(bytes).digest('hex')},unifiedMediaEnvironment(process.env))).state,'ready');
  const deleted=await admin.from('kinnso_trip_media').delete().eq('id',intents[1].id).select('id');
  assert.equal(deleted.error,null);assert.equal(deleted.data.length,1);
  const before=await admin.rpc('kinnso_media_cleanup_candidates');assert.equal(before.error,null);
  assert.ok(!before.data.includes(paths[0]));assert.ok(before.data.includes(paths[1]));
  assert.ok(!before.data.includes(paths[2]));assert.ok(!before.data.includes(paths[3]));
  const actualFetch=globalThis.fetch;let interleaved=false,finalizeResult;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const result=await actualFetch(input,init),url=new URL(input instanceof Request?input.url:input);
   if(/\/rpc\/(kinnso_media_cleanup_candidates|claim_kinnso_media_cleanup)$/.test(url.pathname)&&!interleaved){
    interleaved=true;
    try{finalizeResult=await finalizeMedia({token,id:intents[0].id,checksum:createHash('sha256').update(bytes).digest('hex')},unifiedMediaEnvironment(process.env));}
    catch(error){finalizeResult={error:error.message};}
   }
   return result;
  });
  const response=await GET(new Request(settings.KINNSO_SITE_URL+'/api/cron/media-cleanup',{headers:{Authorization:'Bearer '+settings.CRON_SECRET}}));
  assert.equal(response.status,200);assert.ok((await response.json()).data.removed>=2);
  assert.equal(interleaved,true);assert.deepEqual(finalizeResult,{error:'INVALID_MEDIA'},'finalization after cleanup claim must not create a ready photo with deleted bytes');
  for(const path of paths.slice(0,2))assert.ok((await admin.storage.from('kinnso-trip-private').download(path)).error);
  for(const path of paths.slice(2))assert.equal((await a.client.storage.from('kinnso-trip-private').download(path)).error,null);
  const after=await admin.rpc('kinnso_media_cleanup_candidates');assert.equal(after.error,null);
  assert.ok(after.data.includes(paths[0]));assert.ok(after.data.includes(paths[1]),'recent tombstones remain eligible until issued upload tokens expire');
  assert.equal((await admin.from('kinnso_trip_media').select('state').eq('id',intents[0].id).single()).data.state,'failed');
  assert.ok((await a.client.storage.from('kinnso-trip-private').createSignedUploadUrl(paths[0])).error,'failed intents with absent objects cannot mint new upload tokens');
  const late=await a.client.storage.from('kinnso-trip-private').uploadToSignedUrl(paths[0],signedUpload.token,bytes,{contentType:'image/png'});
  assert.equal(late.error,null,'exercise a still-valid pre-claim signed upload against real Storage');
  assert.equal((await admin.storage.from('kinnso-trip-private').download(paths[0])).error,null);
  const target=verifyTestTarget(),container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];
  assert.equal(container.Config.Labels['com.supabase.cli.project'],'kinnsoos-b1-20261002');
  for(const path of paths)assert.match(path,/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  // Advance only these synthetic tombstones; never wait for or change real clocks.
  execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:"update kinnso_internal.media_cleanup set queued_at=now()-interval '3 hours' where object_path in ("+paths.slice(0,2).map(path=>"'"+path+"'").join(',')+");",stdio:['pipe','pipe','pipe']});
  assert.equal((await GET(new Request(settings.KINNSO_SITE_URL+'/api/cron/media-cleanup',{headers:{Authorization:'Bearer '+settings.CRON_SECRET}}))).status,200);
  assert.ok((await admin.storage.from('kinnso-trip-private').download(paths[0])).error);
  const retired=await admin.rpc('kinnso_media_cleanup_candidates');assert.equal(retired.error,null);
  assert.ok(!retired.data.includes(paths[0]));assert.ok(!retired.data.includes(paths[1]));
  assert.equal((await a.client.storage.from('kinnso-trip-private').download(paths[2])).error,null);
 }finally{
  if(paths.length)assert.equal((await admin.storage.from('kinnso-trip-private').remove(paths)).error,null);
  await f.cleanup();
 }
});
