import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const validation = await import('../lib/creators/collaboration-validation.ts').catch(() => ({}));
const id = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-10-10T18:00:00.123456+00:00';

test('creator evidence accepts bounded HTTPS links and rejects identity or review field injection', () => {
 assert.equal(typeof validation.creatorMissionCommand, 'function');
 const command = {type:'submitEvidence',milestoneId:id,submissionId:null,expectedUpdatedAt:null,proofUrls:['https://example.test/authored-post'],notes:'My original work'};
 assert.deepEqual(validation.creatorMissionCommand(command),command);
 for (const bad of [
  {...command,creatorId:id},{...command,merchantFeedback:'approve'},
  {...command,proofUrls:[]},{...command,proofUrls:Array(6).fill('https://example.test/p')},
  {...command,proofUrls:['javascript:alert(1)']},{...command,proofUrls:['https://private:secret@example.test/proof']},
  {...command,proofUrls:['http://example.test/proof']},{...command,proofUrls:['https://example.test/\nproof']},
  {...command,notes:'x'.repeat(4001)},{...command,submissionId:id,expectedUpdatedAt:null},
  {...command,submissionId:id,expectedUpdatedAt:'2026-15-77'},
 ]) assert.throws(() => validation.creatorMissionCommand(bad), /INVALID/);
 assert.equal(validation.creatorMissionCommand({...command,submissionId:id,expectedUpdatedAt:stamp}).expectedUpdatedAt,stamp);
});

test('creator participation commands accept no caller-supplied actor, status, or money', () => {
 assert.equal(typeof validation.creatorMissionCommand, 'function');
 assert.deepEqual(validation.creatorMissionCommand({type:'join',applicationNote:'I can author this route.'}),{type:'join',applicationNote:'I can author this route.'});
 for(const type of ['acceptInvite','withdrawApplication']) assert.equal(validation.creatorMissionCommand({type,expectedUpdatedAt:stamp}).type,type);
 for(const bad of [{type:'join',creatorId:id},{type:'join',status:'active'},{type:'join',applicationNote:'x'.repeat(2001)},{type:'join',paidFeeAmount:10},{type:'acceptInvite'},{type:'withdrawApplication',expectedUpdatedAt:null},{type:'reviewSubmission'}]) assert.throws(()=>validation.creatorMissionCommand(bad),/INVALID/);
});

const require = createRequire(import.meta.url);
async function handler(path) {
 const result = await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'creator-session',setup(b){
  b.onResolve({filter:/supabase\/server$/},()=>({path:'fixture',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export async function serverClient(){return globalThis.__collaborationClient}'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;
}
function setup(t,{revoked=false,error=null}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'creator'};
 const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const calls=[];globalThis.__collaborationClient={auth:{getUser:async()=>({data:{user:{id}}})},rpc:async(name,args)=>{calls.push({name,args});return name==='kinnso_actor'?{data:revoked?null:{id},error:revoked?{message:'unauthenticated'}:null}:{data:{items:[],id},error};}};
 t.after(()=>{delete globalThis.__collaborationClient;for(const[key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;});return calls;
}
const context={params:Promise.resolve({id})};
const post=(body,origin='https://journeys.example')=>new Request('https://journeys.example/api/creator/missions/'+id,{method:'POST',headers:{Host:'journeys.example',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('creator mission BFF rechecks live session, bounds commands and preserves CAS and replay identity',async t=>{
 const api=await handler('../app/api/creator/missions/[id]/route.ts'),calls=setup(t);
 const body={requestId:id,command:{type:'acceptInvite',expectedUpdatedAt:stamp}};
 const response=await api.POST(post(body),context);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
 assert.deepEqual(calls.map(x=>x.name),['kinnso_actor','apply_kinnso_creator_mission_command']);
 assert.deepEqual(calls[1].args,{p_mission_id:id,p_request_id:id,p_command:body.command});
 calls.length=0;
 for(const payload of [{...body,actorId:id},{...body,command:{...body.command,status:'active'}},{...body,command:{type:'join',applicationNote:'x'.repeat(20000)}}])assert.equal((await api.POST(post(payload),context)).status,400);
 assert.equal(calls.filter(x=>x.name!=='kinnso_actor').length,0);
 calls.length=0;assert.equal((await api.POST(post(body,'https://foreign.example'),context)).status,403);assert.equal(calls.length,0);
});

test('creator reads reject ambiguous query scope and stale session; command conflicts redact backend details',async t=>{
 const list=await handler('../app/api/creator/missions/route.ts'),detail=await handler('../app/api/creator/missions/[id]/route.ts');const calls=setup(t,{error:{message:'revision_conflict sensitive database details'}});
 for(const search of ['scope=all','scope=mine&scope=available','creatorId='+id,'after=','after=not-a-uuid'])assert.equal((await list.GET(new Request('https://journeys.example/api/creator/missions?'+search))).status,400);
 assert.equal(calls.filter(x=>x.name!=='kinnso_actor').length,0);
 const response=await detail.POST(post({requestId:id,command:{type:'acceptInvite',expectedUpdatedAt:stamp}}),context);assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/sensitive/);
 globalThis.__collaborationClient.rpc=async name=>({data:null,error:{message:'unauthenticated'}});
 assert.equal((await list.GET(new Request('https://journeys.example/api/creator/missions'))).status,401);
});

test('earnings endpoint is read-only, actor-scoped and allows only bounded section/cursor reads',async t=>{
 const api=await handler('../app/api/creator/earnings/route.ts'),calls=setup(t);
 assert.equal(api.POST,undefined);
 const response=await api.GET(new Request('https://journeys.example/api/creator/earnings?section=payouts&after=payout_batch:'+id));assert.equal(response.status,200);
 assert.deepEqual(calls.at(-1),{name:'get_kinnso_creator_earnings',args:{p_section:'payouts',p_after:'payout_batch:'+id}});
 calls.length=0;
 for(const search of ['section=withdraw','section=settled&creatorId='+id,'section=tracked&section=payouts','after=','after='+id,'after=foreign:'+id])assert.equal((await api.GET(new Request('https://journeys.example/api/creator/earnings?'+search))).status,400);
 assert.equal(calls.filter(x=>x.name!=='kinnso_actor').length,0);
});

test('creator command transport failure after commit remains retryable and never becomes a validation rejection',async t=>{
 const api=await handler('../app/api/creator/missions/[id]/route.ts');setup(t);let committed=0;
 globalThis.__collaborationClient.rpc=async name=>{if(name==='kinnso_actor')return{data:{id},error:null};committed++;throw Error('connection lost after commit, private host');};
 const response=await api.POST(post({requestId:id,command:{type:'join'}}),context);
 assert.equal(committed,1);assert.equal(response.status,503);const result=await response.json();assert.equal(result.code,'UNAVAILABLE');assert.equal(result.retryable,true);assert.doesNotMatch(JSON.stringify(result),/private host/);
});
