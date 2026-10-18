import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {URL,pathToFileURL} from 'node:url';
import {verifyTarget,assertSafeLedger,Blocked,uuid,expected,root} from './target.mjs';

// Credentials and sessions stay in this process. No raw SDK errors or actor
// objects are handed to a reporter; screenshots are restricted to travel pages.
export async function openFixture(env=process.env){
 const target=await verifyTarget(env,{empty:env.KINNSO_REAL_IT_NONEMPTY_BASELINE!=='1'});
 const httpRuntime=await import(pathToFileURL(path.resolve(root,'../../.local-private/guide-real-integration-20261016/bootstrap/runtime-http.mjs')).href);
 httpRuntime.installBoundedTransport(root);
 const output=env.KINNSO_REAL_IT_EVIDENCE;
 if(!output)throw new Blocked('EVIDENCE_DIRECTORY_REQUIRED');
 if(path.resolve(output)!==path.resolve(target.approval.evidenceRoot,target.approval.runId))throw new Blocked('EVIDENCE_SCOPE_MISMATCH');
 let run;try{run=JSON.parse(readFileSync(path.join(output,'RUN.json'),'utf8'))}catch{throw new Blocked('RUN_DIRECTORY_NOT_AUTHORIZED')}
 if(run.runId!==target.approval.runId||run.productHead!==target.head||run.project!==expected.project)throw new Blocked('RUN_DIRECTORY_NOT_AUTHORIZED');
 const privateValues=['KINNSO_REAL_IT_PUBLIC_KEY','KINNSO_REAL_IT_SERVICE_KEY','KINNSO_REAL_IT_PASSWORD_A','KINNSO_REAL_IT_PASSWORD_B','KINNSO_REAL_IT_PASSWORD_C'].map(name=>env[name]);
 if(privateValues.some(value=>typeof value!=='string'||value.length<12)||new Set(privateValues.slice(2)).size!==3)throw new Blocked('SECURE_CONFIGURATION_REQUIRED');
 const [publicKey,serviceKey,...credentials]=privateValues;
 const {createClient}=await import('@supabase/supabase-js'); // only after live gate
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const admin=createClient(expected.apiOrigin,serviceKey,options);
 const runId=randomUUID(),actors={},trips=new Map(),guides=new Set(),requests=[];
 let unresolved=false,cleaned=false;
 const startedAt=new Date().toISOString(),diagnostics=[];
 writeFileSync(path.join(output,'before-'+runId+'.json'),JSON.stringify(assertSafeLedger({runId,identity:target.identity,catalog:target.catalog}),null,2)+'\n',{flag:'wx'});
 const ledger=()=>({
  runId,parentRunId:target.approval.runId,productHead:target.head,project:expected.project,startedAt,
  users:Object.entries(actors).map(([actor,row])=>({actor,id:row.id})),
  guides:[...guides],trips:[...trips].map(([id,actor])=>({id,actor})),
  requests:requests.map(({actor,id,kind})=>({actor,id,kind})),unresolved,cleaned,diagnostics,
 });
 function write(){
  const value=assertSafeLedger(ledger()),text=JSON.stringify(value,null,2);
  if(privateValues.some(secret=>text.includes(secret)))throw new Blocked('SENSITIVE_EVIDENCE_VALUE');
  appendFileSync(path.join(output,'events-'+runId+'.jsonl'),text.replaceAll('\n','')+'\n',{encoding:'utf8'});
  writeFileSync(path.join(output,'fixtures-'+runId+'.json'),text+'\n',{encoding:'utf8'});
 }
 function failure(stage,error){
  const rawCode=String(error?.code??''),code=/^(?:[A-Z0-9]{5}|PGRST\d{3}|ECONNREFUSED|ETIMEDOUT)$/.test(rawCode)?rawCode:'UNCLASSIFIED';
   const location=String(error?.stack??'').split(/\r?\n/)
    .map(line=>line.match(/(journey\.spec\.ts:\d+:\d+)/)?.[1])
    .find(Boolean)??null;
  let message=String(error?.message??'');
  for(const value of privateValues)message=message.split(value).join('[REDACTED]');
  message=message.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_JWT]')
   .replace(/(:\/\/[^:/@\s]+:)[^@\s]+@/g,'$1[REDACTED]@');
   diagnostics.push({stage,code,location,message:message.slice(0,2400)});write();return new Error('REAL_IT_FAILURE '+stage+' '+code);
 }
 function recordDiagnostic(stage,value){
  const safe={};
  for(const [key,raw] of Object.entries(value??{})){
   if(typeof raw!=='string'){safe[key]=raw;continue}
   safe[key]=raw.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,'[uuid]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[jwt]')
    .replace(/(:\/\/[^:/@\s]+:)[^@\s]+@/g,'$1[redacted]@').slice(0,600);
  }
  diagnostics.push({stage,...safe});write();
 }
 function data(result,stage){
  if(result.error)throw failure(stage,result.error);
  return result.data;
 }
 const rpc=async(actor,name,args)=>{
  if(['confirm_kinnso_creator_profile','save_kinnso_guide_draft','publish_kinnso_guide_draft'].includes(name)&&args?.p_request_id)
   registerRequest(actor.label,args.p_request_id,'creator');
  let result;try{result=await actor.client.rpc(name,args)}catch(error){unresolved=true;write();throw failure('RPC_UNCERTAIN_'+name,error)}
  if(result.error&&result.status>=500){unresolved=true;write()}
  return data(result,'RPC_'+name);
 };
 const registerRequest=(actor,id,kind)=>{
  if(!uuid.test(id)||!['create','adopt','edit','creator','import','bookmark'].includes(kind))throw new Blocked('INVALID_FIXTURE_REQUEST');
  if(!requests.some(row=>row.actor===actor&&row.id===id&&row.kind===kind)){requests.push({actor,id,kind});write()}
 };
 const registerTrip=(actor,id)=>{
  if(!actors[actor]||!uuid.test(id)||trips.has(id)&&trips.get(id)!==actor)throw new Blocked('INVALID_FIXTURE_TRIP');
  trips.set(id,actor);write();
 };
 try{
  for(const [index,label] of ['A','B','C'].entries()){
   const email=`synthetic-real-it-${runId}-${label.toLowerCase()}@example.test`;
   let result;
   try{result=await admin.auth.admin.createUser({email,password:credentials[index],email_confirm:true,user_metadata:{kinnso_fixture_run:runId,fixture_actor:label}})}
   catch(error){unresolved=true;throw failure('AUTH_CREATE_UNCERTAIN_'+label,error)}
   if(result.error){unresolved=true;throw failure('AUTH_CREATE_REFUSED_'+label,result.error)}
   const id=result.data.user?.id;if(!uuid.test(id??'')){unresolved=true;throw new Blocked('AUTH_FIXTURE_ID_MISSING')}
   const actor={id,email,label};
   Object.defineProperties(actor,{credential:{value:credentials[index]},client:{value:createClient(expected.apiOrigin,publicKey,options)}});
   actors[label]=actor;write();
   const auth=await actor.client.auth.signInWithPassword({email,password:credentials[index]});
   if(auth.error||auth.data.user?.id!==id)throw failure('AUTH_SESSION_'+label,auth.error);
  }
 }catch(error){write();throw failure('FIXTURE_SETUP_STOPPED',error)}
 const draftId=randomUUID();
 await rpc(actors.C,'confirm_kinnso_creator_profile',{p_request_id:randomUUID(),p_profile:{bio:'Synthetic isolated author; no licensed content claim',niches:['Walking'],content_pillars:[],tone:[],languages:['en']},p_confirmed:true});
 const payload=version=>({title:`Synthetic real integration ${runId}`,city:'Kyoto',summary:'Synthetic fixtures only; not the three-guide licensed pilot.',content:{days:[{offset:0,title:'Synthetic authored day',stops:[{title:'Synthetic source stop v'+version,description:'Synthetic public directions v'+version,placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}});
 async function publish(version){
  let revision=0;
  if(version>1)revision=(await rpc(actors.C,'get_kinnso_guide_draft',{p_draft_id:draftId})).revision;
  guides.add(draftId);write();
  const saved=await rpc(actors.C,'save_kinnso_guide_draft',{p_draft_id:draftId,p_expected_revision:revision,p_request_id:randomUUID(),p_payload:payload(version)});
  const published=await rpc(actors.C,'publish_kinnso_guide_draft',{p_draft_id:draftId,p_expected_revision:saved.revision,p_request_id:randomUUID()});
  if(published.snapshot.id!==draftId||published.snapshot.version!==version)throw new Blocked('GUIDE_FIXTURE_VERSION_MISMATCH');
  return published.snapshot;
 }
 const guide=await publish(1);
 async function create(actor,input={title:'Synthetic existing trip',timezone:'Asia/Tokyo',startDate:null},id=randomUUID()){
  registerRequest(actor.label,id,'create');
  const value=await rpc(actor,'create_trip_v2',{p_request_id:id,p_payload:input});
  registerTrip(actor.label,value.id);return {value,id,input};
 }
 async function snapshot(actor,id){return rpc(actor,'get_trip_snapshot',{p_trip_id:id})}
 async function screenshot(page,name){
  const url=new URL(page.url());
  if(url.origin!==expected.appOrigin||!/^\/(?:en|zh-HK)\/(?:g\/[0-9a-f-]{36}|trips(?:\/[0-9a-f-]{36})?|saved|library|explore)$/.test(url.pathname)||(await page.locator('input[type="password"]').count()))throw new Blocked('SENSITIVE_SCREENSHOT_REFUSED');
  if(!/^[a-z0-9-]+$/.test(name))throw new Blocked('INVALID_EVIDENCE_NAME');
  await page.screenshot({path:path.join(output,name+'-'+runId+'.png'),fullPage:true});
 }
 async function cleanup(){
  if(unresolved){write();throw new Blocked('CLEANUP_HOLD_UNRESOLVED_WRITE')}
  const ids=Object.values(actors).map(actor=>actor.id);
  // Verify every descendant before Auth deletion, whose cascade would otherwise
  // hide an unregistered write. Never clean by a broad synthetic-name prefix.
  const actual=data(await admin.from('trips').select('id,owner_user_id').in('owner_user_id',ids),'CLEANUP_TRIP_READ');
  if(actual.some(row=>!trips.has(row.id)||actors[trips.get(row.id)]?.id!==row.owner_user_id)){unresolved=true;write();throw new Blocked('CLEANUP_HOLD_UNREGISTERED_TRIP')}
  const actualGuides=data(await admin.from('guides').select('id,creator_id').eq('creator_id',actors.C.id),'CLEANUP_GUIDE_READ');
  if(actualGuides.some(row=>!guides.has(row.id))){unresolved=true;write();throw new Blocked('CLEANUP_HOLD_UNREGISTERED_GUIDE')}
  for(const row of actual){
   const actor=actors[trips.get(row.id)],current=await snapshot(actor,row.id);
   await rpc(actor,'delete_trip_v2',{p_trip_id:row.id,p_expected_revision:current.revision,p_request_id:randomUUID()});
  }
  for(const id of guides)data(await admin.from('guides').delete().eq('id',id).eq('creator_id',actors.C.id),'CLEANUP_GUIDE_DELETE');
  for(const actor of Object.values(actors)){
   const ended=await actor.client.auth.signOut({scope:'global'});if(ended.error)throw failure('CLEANUP_SESSION',ended.error);
   const removed=await admin.auth.admin.deleteUser(actor.id);if(removed.error){unresolved=true;throw failure('CLEANUP_OWNED_USER',removed.error)}
  }
  const after=await verifyTarget(env);
  if(after.schemaFingerprint!==target.schemaFingerprint)throw new Blocked('SCHEMA_CHANGED_DURING_TESTS');
  writeFileSync(path.join(output,'after-'+runId+'.json'),JSON.stringify(assertSafeLedger({runId,identity:after.identity,catalog:after.catalog}),null,2)+'\n',{flag:'wx'});
  cleaned=true;write();
 }
 return {target,runId,actors,guide,publish,create,snapshot,rpc,registerTrip,registerRequest,screenshot,cleanup,write,recordDiagnostic,
  hold:()=>{unresolved=true;write()},safeFailure:failure,ledger};
}
