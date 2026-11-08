import {gate} from './target.mjs';
import {proveOverlap} from './sessions.mjs';

export async function runUuidCreationRace({input,openSession,observe,effects,barrierMs=5000,closeSessions=true}){
  gate(input?.p_command?.kind==='saveIntent'&&input.p_expected_revision===0,'UUID_CREATION_INPUT_INVALID');
  const sessions=[];let pending,committed=[];
  try{
    sessions.push(await openSession(0));sessions.push(await openSession(1));
    const [writer,waiter]=sessions;
    await writer.begin('READ COMMITTED');await waiter.begin('READ COMMITTED');
    const writerPid=writer.pid(),waiterPid=waiter.pid();
    const first=await writer.rpc('apply_kinnso_discovery_command',input);
    pending=waiter.rpc('apply_kinnso_discovery_command',input);
    // Observe rejection immediately, including when a transport dies during the barrier.
    pending.catch(()=>{});
    const matches=s=>s.request()?.method==='apply_kinnso_discovery_command'&&s.request().requestId===input.p_request_id;
    gate(matches(writer)&&matches(waiter),'UUID_WORKER_BINDING_MISMATCH');
    const overlapStartedAt=new Date().toISOString();
    const observed=await proveOverlap({writerPid,waiterPid,timeoutMs:barrierMs,pollMs:Math.min(barrierMs,20),
      observe:async args=>{
        const row=await observe({...args,requestId:input.p_request_id});
        return row?.writerQueryMatches===true&&row.waiterQueryMatches===true?row:{...row,blockers:[]};
      }});
    await writer.commit();committed.push(writer);
    const second=await pending;
    await waiter.commit();committed.push(waiter);
    gate(first?.ok===true&&JSON.stringify(first)===JSON.stringify(second)&&
      first.receipt?.requestId===input.p_request_id&&first.receipt.resourceId===input.p_target_id&&first.receipt.revision===1,'UUID_RESULT_MISMATCH');
    const snapshot=await effects(input);
    gate(snapshot?.intentCount===1&&snapshot.receiptCount===1&&snapshot.intentRevision===1&&snapshot.receiptRevision===1,'UUID_EFFECT_COUNT_MISMATCH');
    const overlapEndedAt=new Date().toISOString();
    gate(waiter.request()?.requestId===input.p_request_id&&Date.parse(overlapStartedAt)<=Date.parse(overlapEndedAt),'UUID_WORKER_BINDING_MISMATCH');
    return {receipt:first.receipt,effects:snapshot,proof:{...observed,requestId:input.p_request_id,
      overlapStartedAt,overlapEndedAt,activeRequestBound:true,
      evidenceLevel:'DATABASE_OBSERVER',writerQueryMatches:true,waiterQueryMatches:true}};
  }finally{
    const cleanup=[];
    for(const session of sessions){
      if(!committed.includes(session))try{await session.rollback();}catch{}
    }
    if(closeSessions)for(const session of sessions)cleanup.push(await session.close().then(()=>true,()=>false));
    gate(cleanup.every(Boolean),'SESSION_CLEANUP_FAILED');
  }
}
export async function runUuidRaceMatrix({rounds=10,attempt}){
  gate(Number.isSafeInteger(rounds)&&rounds>=1&&rounds<=10&&typeof attempt==='function','UUID_MATRIX_INVALID');
  const attempts=[];
  for(let round=0;round<rounds;round++)for(const order of ['A-first','B-first']){
    const result=await attempt({round,order});attempts.push({round,order,...result});
  }
  return {rounds,orders:['A-first','B-first'],attempts};
}
