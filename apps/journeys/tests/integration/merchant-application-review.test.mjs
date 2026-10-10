import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {fixture,admin,anonymous} from './local-fixtures.mjs';

// local-fixtures verifies the owned target before any client or fixture is used.
const ok=async promise=>{const result=await promise;assert.equal(result.error,null,JSON.stringify(result.error));return result.data;};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../app/api/ops/merchant-applications/route.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'owned-application-review-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export async function serverClient(){return globalThis.__ownedApplicationReviewClient}'}));}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const route=module.exports;
function configure(t){
 const env={KINNSO_ENVIRONMENT:'local',KINNSO_SUPABASE_URL:process.env.SUPABASE_URL,KINNSO_APPROVED_SUPABASE_ORIGIN:process.env.SUPABASE_URL,KINNSO_LEGACY_AUTH_ORIGIN:process.env.SUPABASE_URL,KINNSO_SUPABASE_PUBLISHABLE_KEY:process.env.SUPABASE_ANON_KEY,KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'ops',KINNSO_SYNTHETIC_RUN:'true'};
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 t.after(()=>{delete globalThis.__ownedApplicationReviewClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});
}
const get=(query='')=>new Request('https://journeys.example/api/ops/merchant-applications'+(query?'?'+query:''));
const post=body=>new Request('https://journeys.example/api/ops/merchant-applications',{method:'POST',headers:{host:'journeys.example',origin:'https://journeys.example','content-type':'application/json'},body:JSON.stringify(body)});

test('merchant decisions enforce current moderator membership, serialize races and create exactly one profile and audit',async t=>{
 configure(t);const f=await fixture(),members=[],applications=[],profiles=[];
 try{
  const applicant=await f.actor(),rejectedApplicant=await f.actor(),reviewer=await f.actor(),analyst=await f.actor(),outsider=await f.actor();
  for(const[actor,role]of [[reviewer,'moderator'],[analyst,'analyst']])members.push((await ok(admin.from('kinnso_ops_members').insert({user_id:actor.id,display_name:'Synthetic merchant review '+role,role}).select('id').single())).id);
  for(const actor of [applicant,rejectedApplicant])applications.push((await ok(admin.from('merchant_applications').insert({user_id:actor.id,company_name:'Synthetic merchant intake',contact_email:'submitted-contact@example.test',contact_name:'Submitted contact',website_url:'https://company.example.test',pitch:'Synthetic authored company details'}).select('id').single())).id);
  const args={p_id:applications[0],p_reason:'Synthetic documented company review'};
  assert.equal((await analyst.client.rpc('admin_approve_merchant_application',args)).error?.message,'forbidden');
  assert.equal((await outsider.client.rpc('admin_reject_merchant_application',args)).error?.message,'forbidden');assert.ok((await anonymous.rpc('admin_approve_merchant_application',args)).error);
  globalThis.__ownedApplicationReviewClient=analyst.client;assert.equal((await route.GET(get())).status,403);assert.equal((await route.POST(post({id:applications[0],action:'approve',reason:args.p_reason}))).status,403);
  assert.deepEqual(await ok(outsider.client.from('merchant_applications').select('id').eq('id',applications[0])),[]);
  assert.equal((await ok(applicant.client.from('merchant_applications').select('id').eq('id',applications[0]))).length,1);
  assert.equal((await reviewer.client.rpc('admin_approve_merchant_application',{...args,p_reason:' '})).error?.message,'reason_required');
  // Both calls use the mature row lock. A conflicting decision cannot audit twice.
  const race=await Promise.all([reviewer.client.rpc('admin_approve_merchant_application',args),reviewer.client.rpc('admin_reject_merchant_application',{...args,p_reason:'Synthetic alternate assessment'})]);
  assert.equal(race.filter(result=>!result.error).length,1);assert.equal(race.find(result=>result.error)?.error.message,'not_pending');
  const state=await ok(admin.from('merchant_applications').select('status,decision_reason,decided_at,decided_by_ops_member_id').eq('id',applications[0]).single());assert.ok(state.decided_at);assert.equal(state.decided_by_ops_member_id,members[0]);
  const created=await ok(admin.from('merchant_profiles').select('id,status,tier').eq('user_id',applicant.id));profiles.push(...created.map(row=>row.id));assert.equal(created.length,state.status==='approved'?1:0);if(created.length)assert.equal(created[0].status,'active');
  const audits=await ok(admin.from('ops_audit_log').select('action,reason,actor_ops_member_id').eq('entity_type','merchant_application').eq('entity_id',applications[0]));assert.equal(audits.length,1);assert.equal(audits[0].action,'application.'+state.status);assert.equal(audits[0].reason,state.decision_reason);assert.equal(audits[0].actor_ops_member_id,members[0]);
  await ok(reviewer.client.rpc('admin_reject_merchant_application',{p_id:applications[1],p_reason:'Synthetic company details need correction'}));assert.equal((await ok(admin.from('merchant_profiles').select('id').eq('user_id',rejectedApplicant.id))).length,0);
  assert.equal((await reviewer.client.rpc('admin_approve_merchant_application',{p_id:applications[1],p_reason:'Cannot reverse a decided record'})).error?.message,'not_pending');
  globalThis.__ownedApplicationReviewClient=reviewer.client;const response=await route.GET(get('id='+applications[0]));assert.equal(response.status,200);assert.equal((await response.json()).data.status,state.status);assert.match(response.headers.get('cache-control'),/private.*no-store/);
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('id',members[0]));assert.equal((await route.GET(get('id='+applications[0]))).status,403);assert.equal((await reviewer.client.rpc('admin_approve_merchant_application',args)).error?.message,'forbidden');
 }finally{
  if(applications.length){await ok(admin.from('merchant_applications').delete().in('id',applications));await ok(admin.from('ops_audit_log').delete().eq('entity_type','merchant_application').in('entity_id',applications));}
  if(profiles.length)await ok(admin.from('merchant_profiles').delete().in('id',profiles));if(members.length)await ok(admin.from('kinnso_ops_members').delete().in('id',members));await f.cleanup();
 }
});

test('merchant review BFF pages tied timestamps once and reconciles a committed approval after acknowledgement loss',async t=>{
 configure(t);const f=await fixture(),applications=[],members=[],profiles=[];
 try{
  const reviewer=await f.actor();members.push((await ok(admin.from('kinnso_ops_members').insert({user_id:reviewer.id,display_name:'Synthetic paged application reviewer',role:'moderator'}).select('id').single())).id);
  for(let index=0;index<23;index++){
   const actor=await f.actor(),id=randomUUID();applications.push(id);await ok(admin.from('merchant_applications').insert({id,user_id:actor.id,company_name:'Synthetic page '+index,contact_email:'submitted-contact@example.test',created_at:'1900-01-01T00:00:00.123456Z'}));
  }
  globalThis.__ownedApplicationReviewClient=reviewer.client;
  const firstResponse=await route.GET(get());assert.equal(firstResponse.status,200);const first=(await firstResponse.json()).data;assert.equal(first.applications.length,20);assert.ok(first.nextCursor);assert.match(first.nextCursor.createdAt,/\.123456/);
  const secondResponse=await route.GET(get(new URLSearchParams({after:JSON.stringify(first.nextCursor)})));assert.equal(secondResponse.status,200);const second=(await secondResponse.json()).data;
  const ours=[...first.applications,...second.applications].filter(row=>applications.includes(row.id));assert.equal(ours.length,23);assert.equal(new Set(ours.map(row=>row.id)).size,23);assert.ok(ours.every(row=>row.status==='pending'));assert.ok(ours.every(row=>row.contactEmail==='submitted-contact@example.test'));
  const id=applications[0],decision={id,action:'approve',reason:'Synthetic independently verified contact'};
  // The real RPC commits; only its client acknowledgement is deliberately lost.
  globalThis.__ownedApplicationReviewClient={auth:reviewer.client.auth,from:(...args)=>reviewer.client.from(...args),rpc:async(name,args)=>{const result=await reviewer.client.rpc(name,args);if(name==='admin_approve_merchant_application'&&!result.error){profiles.push(result.data);throw Error('Synthetic lost acknowledgement');}return result;}};
  const lost=await route.POST(post(decision));assert.equal(lost.status,503);assert.equal((await lost.json()).retryable,false);
  globalThis.__ownedApplicationReviewClient=reviewer.client;
  const persisted=await route.GET(get('id='+id));assert.equal(persisted.status,200);const approved=(await persisted.json()).data;assert.equal(approved.status,'approved');assert.equal(approved.decisionReason,decision.reason);
  const retry=await route.POST(post(decision));assert.equal(retry.status,200);assert.equal((await retry.json()).data.status,'approved');
  const conflict=await route.POST(post({...decision,action:'reject',reason:'Synthetic conflicting reviewer'}));assert.equal(conflict.status,200);assert.equal((await conflict.json()).data.status,'approved');
  assert.equal((await ok(admin.from('ops_audit_log').select('id').eq('entity_type','merchant_application').eq('entity_id',id))).length,1);
  const refreshed=(await(await route.GET(get())).json()).data;assert.equal(refreshed.applications.some(row=>row.id===id),false);
 }finally{
  if(applications.length){await ok(admin.from('merchant_applications').delete().in('id',applications));await ok(admin.from('ops_audit_log').delete().eq('entity_type','merchant_application').in('entity_id',applications));}
  if(profiles.length)await ok(admin.from('merchant_profiles').delete().in('id',profiles));if(members.length)await ok(admin.from('kinnso_ops_members').delete().in('id',members));await f.cleanup();
 }
});
