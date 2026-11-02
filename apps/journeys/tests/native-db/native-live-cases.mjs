import {randomUUID} from 'node:crypto';
import {gate} from './target.mjs';
import {privateCommandInput,runGateCase,runOwnerReadIsolationCase} from './db-cases.mjs';
import {runUuidCreationRace,runUuidRaceMatrix} from './uuid-race.mjs';
import {runAtomicFaultCase} from './transaction-faults.mjs';
import {parsePrivateIntentFault,privateFaultName} from './private-rollback.mjs';

const privateCommands=['savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent'];
const gateIds=[];
for(const command of privateCommands)for(const state of ['closed','privateOnly','allOpen'])gateIds.push(`NA03.${command}.${state}`);
export const implementedNativeCaseIds=Object.freeze([
  'NA03.realAuth',...gateIds,
  'NA04.discoveryRawGrants','NA04.privateIntentRpc','NA04.crossCompany',
  'NA04.crossThread','NA04.foreignReceipt','NA04.opsPositiveAndPrivateDenial','NA04.revokedSession',
  'NA04.anonymousLogin','NA04.publicOffersRequiresAuth','NA04.internalExecuteAcl',
  'NA05.sameUuid.saveIntent','NA05.revisionCas','NA05.deleteTombstone',
  'NA06.privateIntentReceipt',
  'NA09.disableWritesMinimalReceipt'
]);

function ok(result){return !result?.error;}
function sessionId(token){return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')).session_id;}
export function buildNativeHandlers(ctx){
  const handlers=new Map();
  handlers.set('NA03.realAuth',async()=>{
    gate(ctx?.actors,'AUTH_CONTEXT_REQUIRED');
    const names=['travellerA','travellerB','creatorA','creatorB','merchantA','merchantB','memberA','ops'];
    for(const name of names){
      const {data,error}=await ctx.actors[name].client.auth.getSession();
      const token=data?.session?.access_token;
      gate(!error&&data?.session?.user?.id===ctx.actors[name].id&&sessionId(token),'REAL_SESSION_REQUIRED');
    }
    const invalid=await ctx.actors.invalidCreator.client.rpc('query_kinnso_creator_missions',{p_scope:'mine',p_query:{}});
    gate(invalid.error?.message==='creator_required','INVALID_CREATOR_SESSION_NOT_REJECTED');
    return {actual:`verified ${names.length} valid local Auth sessions and rejected suspended creator access`,evidenceFiles:['native-auth-sessions']};
  });

  const revisions=new Map();
  for(const command of privateCommands)for(const state of ['closed','privateOnly','allOpen']){
    const id=`NA03.${command}.${state}`;
    handlers.set(id,async()=>{
      gate(ctx?.actors?.travellerA&&ctx?.setGates,'DATABASE_FIXTURE_REQUIRED');
      await ctx.setGates(state!=='closed',state==='allOpen');
      let target=command==='savePreferences'||command==='clearPreferences'?ctx.actors.travellerA.id:randomUUID();
      let revision=revisions.get(target)??0;
      if(command==='savePreferences'||command==='clearPreferences')revision=await ctx.getPreferenceRevision(ctx.actors.travellerA.id)??0;
      if((command==='archiveIntent'||command==='deleteIntent')&&revision===0){
        await ctx.setGates(true,false);
        const created=await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',privateCommandInput('saveIntent',target));
        gate(ok(created)&&created.data?.receipt?.revision===1,'INTENT_SETUP_FAILED');
        revision=1;revisions.set(target,1);
        await ctx.setGates(state!=='closed',state==='allOpen');
      }
      const input=privateCommandInput(command,target,revision);
      const outcome=await runGateCase({client:ctx.actors.travellerA.client,input,gate:state,
        snapshot:()=>ctx.observePrivateCommand(command,target)});
      if(state!=='closed')revisions.set(target,revision+1);
      return {actual:outcome.actual,evidenceFiles:['native-gate-case']};
    });
  }

  handlers.set('NA04.discoveryRawGrants',async()=>{
    gate(ctx?.actors?.travellerA&&ctx?.tables,'DATABASE_FIXTURE_REQUIRED');
    for(const table of ctx.tables){
      const error=(await ctx.actors.travellerA.client.from(table).select('*')).error;
      gate(error?.code==='42501'||error?.status===401||error?.status===403,'DIRECT_GRANT_NOT_DENIED_BY_ACL:'+table);
    }
    return {actual:`${ctx.tables.length} direct private-table reads denied`,evidenceFiles:['native-rls-grants']};
  });
  handlers.set('NA04.privateIntentRpc',async()=>{
    gate(ctx?.actors?.travellerA&&ctx?.actors?.travellerB,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const intentId=randomUUID(),requestId=randomUUID();
    const input=privateCommandInput('saveIntent',intentId,0,requestId);
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',input)),'OWNER_INTENT_SETUP_FAILED');
    const outcome=await runOwnerReadIsolationCase({
      owner:ctx.actors.travellerA.client,foreign:ctx.actors.travellerB.client,
      readRequest:()=>ctx.actors.travellerB.client.rpc('get_kinnso_discovery_request',{p_request_id:requestId})
    },{intentId,requestId});
    return {actual:outcome.actual,evidenceFiles:['native-cross-tenant']};
  });
  handlers.set('NA04.crossCompany',async()=>{
    gate(ctx?.actors?.merchantA&&ctx?.actors?.merchantB&&ctx?.companies,'DATABASE_FIXTURE_REQUIRED');
    const own=await ctx.actors.merchantA.client.rpc('read_kinnso_discovery',{p_scope:{kind:'companyOffers',companyId:ctx.companies.A}});
    const foreign=await ctx.actors.merchantB.client.rpc('read_kinnso_discovery',{p_scope:{kind:'companyOffers',companyId:ctx.companies.A}});
    gate(!own.error&&foreign.error?.message==='discovery_forbidden','CROSS_COMPANY_NOT_ISOLATED');
    return {actual:'merchant owner positive; foreign company denied',evidenceFiles:['native-cross-company']};
  });
  handlers.set('NA04.crossThread',async()=>{
    gate(ctx?.actors?.creatorA&&ctx?.actors?.creatorB,'DATABASE_FIXTURE_REQUIRED');
    const threadId=randomUUID(),created=await ctx.actors.creatorA.client.rpc('apply_kinnso_studio_command',{
      p_target_id:threadId,p_expected_revision:0,p_request_id:randomUUID(),
      p_command:{kind:'createThread',title:'Synthetic cross-thread source',topic:'creation',templateId:'C1'}});
    gate(!created.error,'STUDIO_THREAD_SETUP_FAILED');
    const foreign=await ctx.actors.creatorB.client.rpc('get_kinnso_studio_thread',{p_thread_id:threadId});
    gate(foreign.error?.message==='studio_not_found','CROSS_THREAD_READ_FAILED_FOR_UNEXPECTED_REASON');
    return {actual:'foreign studio thread read denied',evidenceFiles:['native-cross-thread']};
  });
  handlers.set('NA04.foreignReceipt',async()=>{
    gate(ctx?.actors?.travellerA&&ctx?.actors?.travellerB,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const requestId=randomUUID(),input=privateCommandInput('saveIntent',randomUUID(),0,requestId);
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',input)),'RECEIPT_SETUP_FAILED');
    const own=await ctx.actors.travellerA.client.rpc('get_kinnso_discovery_request',{p_request_id:requestId});
    const foreign=await ctx.actors.travellerB.client.rpc('get_kinnso_discovery_request',{p_request_id:requestId});
    gate(own.data?.status==='complete'&&foreign.data?.status==='unknown','FOREIGN_RECEIPT_NOT_ISOLATED');
    return {actual:'owner receipt complete; foreign receipt unknown',evidenceFiles:['native-receipt-isolation']};
  });
  handlers.set('NA04.anonymousLogin',async()=>{
    gate(ctx?.anonymous,'ANONYMOUS_CLIENT_REQUIRED');
    const result=await ctx.anonymous.rpc('get_kinnso_discovery_request',{p_request_id:randomUUID()});
    const code=result.error?.code;gate(result.error?.status===401||result.error?.status===403||['42501','PGRST301','PGRST302'].includes(code),'ANONYMOUS_RPC_ALLOWED');
    return {actual:'anonymous discovery RPC denied',evidenceFiles:['native-anonymous']};
  });
  handlers.set('NA04.publicOffersRequiresAuth',async()=>{
    gate(ctx?.anonymous,'ANONYMOUS_CLIENT_REQUIRED');
    const result=await ctx.anonymous.rpc('read_kinnso_discovery',{p_scope:{kind:'publicOffers'}});
    const code=result.error?.code;gate(result.error?.status===401||result.error?.status===403||['42501','PGRST301','PGRST302'].includes(code),'PUBLIC_OFFERS_ANONYMOUS_READ_ALLOWED');
    return {actual:'publicOffers remains authenticated-only in current candidate',evidenceFiles:['native-public-offers-auth']};
  });
  handlers.set('NA04.internalExecuteAcl',async()=>{
    gate(ctx?.actors?.travellerA,'DATABASE_FIXTURE_REQUIRED');
    const result=await ctx.actors.travellerA.client.schema('kinnso_internal').rpc('discovery_private_read',{p_scope:{kind:'intents'}});
    const code=result.error?.code;gate(result.error?.status===401||result.error?.status===403||['42501','PGRST106','PGRST301','PGRST302'].includes(code),'INTERNAL_EXECUTE_FAILED_FOR_UNEXPECTED_REASON');
    return {actual:'internal discovery read execution denied',evidenceFiles:['native-internal-acl']};
  });
  handlers.set('NA04.opsPositiveAndPrivateDenial',async()=>{
    gate(ctx?.actors?.ops&&ctx?.actors?.travellerA,'DATABASE_FIXTURE_REQUIRED');
    const publicRead=await ctx.actors.ops.client.rpc('read_kinnso_discovery',{p_scope:{kind:'publicOffers'}});
    gate(!publicRead.error,'OPS_PUBLIC_POSITIVE_FAILED');
    await ctx.setGates(true,false);
    const intentId=randomUUID();
    gate(!(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',privateCommandInput('saveIntent',intentId))).error,'OPS_PRIVATE_SETUP_FAILED');
    const privateRead=await ctx.actors.ops.client.rpc('read_kinnso_discovery',{p_scope:{kind:'intent',id:intentId}});
    gate(privateRead.error?.message==='discovery_not_found','OPS_PRIVATE_READ_FAILED_FOR_UNEXPECTED_REASON');
    return {actual:'Ops public read succeeds; private intent remains denied',evidenceFiles:['native-ops-scope']};
  });
  handlers.set('NA04.revokedSession',async()=>{
    gate(ctx?.fixture?.revokeActor&&ctx?.actors?.travellerB,'DATABASE_FIXTURE_REQUIRED');
    await ctx.fixture.revokeActor('travellerB');
    const result=await ctx.actors.travellerB.client.rpc('read_kinnso_discovery',{p_scope:{kind:'intents'}});
    const code=result.error?.code,message=result.error?.message??'';
    gate(result.error?.status===401||['PGRST301','PGRST302'].includes(code)||/jwt|session|token|unauthenticated/i.test(message),'REVOKED_SESSION_READ_FAILED_FOR_UNEXPECTED_REASON');
    return {actual:'revoked local Auth session cannot read private data',evidenceFiles:['native-revoked-session']};
  });
  handlers.set('NA05.revisionCas',async()=>{
    gate(ctx?.actors?.travellerA,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const id=randomUUID(),first=privateCommandInput('saveIntent',id);
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',first)),'CAS_SETUP_FAILED');
    const conflict=await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',privateCommandInput('archiveIntent',id,0));
    gate(conflict.error?.message==='revision_conflict','REVISION_CONFLICT_NOT_DENIED');
    return {actual:'stale expectedRevision rejected',evidenceFiles:['native-revision-cas']};
  });
  handlers.set('NA05.sameUuid.saveIntent',async()=>{
    gate(ctx?.actors?.travellerA&&ctx.workers&&ctx.observeUuidEffects,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const pool=await ctx.workers(),actor=ctx.actors.travellerA;
    const a=await pool.open(actor),b=await pool.open(actor);
    try{
      const results=await runUuidRaceMatrix({rounds:10,attempt:async({order})=>{
        const input=privateCommandInput('saveIntent',randomUUID()),ordered=order==='A-first'?[a,b]:[b,a];
        return runUuidCreationRace({input,openSession:async i=>ordered[i],observe:args=>pool.observe(args),
          effects:()=>ctx.observeUuidEffects(actor.id,input),closeSessions:false});
      }});
      return {actual:'20 overlapping native transactions; both worker orders; identical receipts and one intent/request per UUID',evidence:results};
    }finally{await a.close();await b.close();}
  });
  handlers.set('NA06.privateIntentReceipt',async()=>{
    gate(ctx?.actors?.travellerA&&ctx.installPrivateFault&&ctx.removePrivateFault&&ctx.observeUuidEffects,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const actor=ctx.actors.travellerA,input=privateCommandInput('saveIntent',randomUUID());
    const spec={caseId:'intent_'+randomUUID().replaceAll('-',''),actorId:actor.id,
      targetId:input.p_target_id,requestId:input.p_request_id};
    const snapshots=[];
    const snapshot=async()=>{const value=await ctx.observeUuidEffects(actor.id,input);snapshots.push(value);return value;};
    const rollback=await runAtomicFaultCase({
      expectedMarker:'synthetic_native_fault:'+privateFaultName(spec.caseId),
      install:()=>ctx.installPrivateFault(spec),baseline:snapshot,snapshot,
      action:async()=>{
        const result=await actor.client.rpc('apply_kinnso_discovery_command',input);
        gate(Boolean(result.error),'FAULT_NOT_PROVEN');
        throw parsePrivateIntentFault(result.error,spec);
      },remove:()=>ctx.removePrivateFault(spec)
    });
    const retried=await actor.client.rpc('apply_kinnso_discovery_command',input);
    gate(!retried.error&&retried.data?.receipt?.requestId===input.p_request_id&&retried.data.receipt.revision===1,'ROLLBACK_SAME_UUID_RETRY_FAILED');
    const effects=await ctx.observeUuidEffects(actor.id,input);
    gate(effects.intentCount===1&&effects.receiptCount===1&&effects.intentRevision===1,'ROLLBACK_RETRY_EFFECTS_INVALID');
    return {actual:'late receipt trigger saw the earlier intent insert; complete rollback, fault cleanup and same UUID retry verified',
      evidence:{rollback:{status:rollback.status,sqlState:rollback.failure.sqlState},requestId:input.p_request_id,snapshots,retry:effects}};
  });
  handlers.set('NA05.deleteTombstone',async()=>{
    gate(ctx?.actors?.travellerA,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const id=randomUUID(),create=privateCommandInput('saveIntent',id);
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',create)),'TOMBSTONE_SETUP_FAILED');
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',privateCommandInput('deleteIntent',id,1))),'DELETE_FAILED');
    const replay=await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',privateCommandInput('saveIntent',id,0,randomUUID()));
    gate(replay.error?.message==='discovery_restricted','TOMBSTONED_INTENT_FAILED_FOR_UNEXPECTED_REASON');
    return {actual:'deleted intent rejects a new UUID',evidenceFiles:['native-tombstone']};
  });
  handlers.set('NA09.disableWritesMinimalReceipt',async()=>{
    gate(ctx?.actors?.travellerA,'DATABASE_FIXTURE_REQUIRED');
    await ctx.setGates(true,false);
    const requestId=randomUUID(),input=privateCommandInput('saveIntent',randomUUID(),0,requestId);
    gate(ok(await ctx.actors.travellerA.client.rpc('apply_kinnso_discovery_command',input)),'DISABLE_SETUP_FAILED');
    await ctx.setGates(false,false);
    const receipt=await ctx.actors.travellerA.client.rpc('get_kinnso_discovery_request',{p_request_id:requestId});
    gate(receipt.data?.status==='complete'&&receipt.data?.receipt?.requestId===requestId,'MINIMAL_RECEIPT_UNAVAILABLE');
    const body=receipt.data,receiptKeys=Object.keys(body?.receipt??{}).sort(),topKeys=Object.keys(body??{}).sort();
    gate(JSON.stringify(topKeys)===JSON.stringify(['receipt','resourceState','status'])&&
      JSON.stringify(receiptKeys)===JSON.stringify(['commandDigest','requestId','resourceId','revision'])&&
      body.receipt.requestId===requestId&&body.receipt.resourceId===input.p_target_id&&body.receipt.revision===1&&
      /^[a-f0-9]{64}$/.test(body.receipt.commandDigest),'RECEIPT_LEAKED_PRIVATE_BODY');
    return {actual:'disabled writes still expose owner minimal receipt only',evidenceFiles:['native-disable-receipt']};
  });
  return handlers;
}
