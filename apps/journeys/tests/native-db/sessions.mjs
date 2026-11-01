import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {Blocked,gate} from './target.mjs';
/** Observer contract: a live implementation must query pg_blocking_pids and
 * pg_stat_activity using the third connection. This helper alone proves no DB race.
 */
export async function proveOverlap({writerPid,waiterPid,observe,timeoutMs=5000,pollMs=20}){
 gate([writerPid,waiterPid].every(x=>Number.isSafeInteger(x)&&x>0)&&writerPid!==waiterPid&&
  Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=5000&&Number.isSafeInteger(pollMs)&&pollMs>0&&pollMs<=timeoutMs,'BARRIER_CONFIG_INVALID');
 const startedAt=new Date().toISOString(),deadline=performance.now()+timeoutMs,controller=new AbortController();let timer,observationCount=0;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Blocked('OVERLAP_NOT_PROVEN'));},timeoutMs);});
 try{return await Promise.race([timeout,(async()=>{
  while(performance.now()<deadline){
   const row=await observe({writerPid,waiterPid,signal:controller.signal});observationCount++;
   if(!controller.signal.aborted&&row?.pid===waiterPid&&row.waitEventType==='Lock'&&Array.isArray(row.blockers)&&row.blockers.includes(writerPid))
    return {writerPid,waiterPid,startedAt,observedAt:new Date().toISOString(),observationCount,evidenceLevel:'OBSERVER_CONTRACT_ONLY'};
   await delay(Math.min(pollMs,Math.max(1,deadline-performance.now())),undefined,{signal:controller.signal});
  }
  throw new Blocked('OVERLAP_NOT_PROVEN');
 })()]);}finally{clearTimeout(timer);controller.abort();}
}
export async function withSessions(sessions,work){
 try{return await work();}finally{
  // Attempt every close even when one rejects. Never report green with leaked sessions.
  const cleanup=await Promise.allSettled(sessions.map(s=>Promise.resolve().then(()=>s.close())));
  gate(cleanup.every(r=>r.status==='fulfilled'),'SESSION_CLEANUP_FAILED');
 }
}
