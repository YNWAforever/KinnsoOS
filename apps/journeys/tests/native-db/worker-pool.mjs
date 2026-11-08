import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {gate,requireVerifiedTarget} from './target.mjs';
import {commandEnvironment,engineHost} from './docker-runtime.mjs';
import {createPsqlChannel} from './psql-channel.mjs';
import {createActorSession,workerRoleSql} from './actor-sessions.mjs';
import {sqlLiteral} from './live-auth.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sameTarget=(a,b)=>['runId','dbContainerId','networkId','volumeId','sourceHash','migrationHash'].every(k=>a[k]===b[k])&&
  JSON.stringify(a.imageDigests)===JSON.stringify(b.imageDigests)&&JSON.stringify(a.containerIds)===JSON.stringify(b.containerIds);
export async function createWorkerPool({plan,target,admin,refresh=async()=>target,verify=requireVerifiedTarget,spawnPort=spawn}){
  verify(target,'run');
  const role='na_'+plan.runId.replaceAll('-','')+'_worker',password=randomBytes(36).toString('base64url');
  const sessions=new Set(),pidSet=new Set();let closed=false,serial=0;
  try{await admin(workerRoleSql({name:role,password}));}
  catch{
    await admin(`REVOKE CONNECT ON DATABASE postgres FROM "${role}"; REVOKE authenticated FROM "${role}"; DROP ROLE IF EXISTS "${role}";`).catch(()=>{});
    throw Object.assign(Error('role setup'),{code:'WORKER_ROLE_SETUP_FAILED'});
  }
  const closeAll=async()=>{
    const closedSessions=await Promise.allSettled([...sessions].map(s=>s.close()));
    gate(closedSessions.every(r=>r.status==='fulfilled'),'SESSION_CLEANUP_FAILED');
  };
  return Object.freeze({
    async open(actor){
      gate(!closed,'WORKER_POOL_CLOSED');
      const fresh=await refresh();verify(fresh,'run');gate(sameTarget(target,fresh),'TARGET_CONTINUITY_MISMATCH');
      const {data,error}=await actor.client.auth.getSession(),token=data?.session?.access_token;
      let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{}
      gate(!error&&data?.session?.user?.id===actor.id&&claims?.sub===actor.id,'ACTOR_SESSION_CLAIMS_INVALID');
      const verified=await actor.client.auth.getUser(token);
      gate(!verified.error&&verified.data?.user?.id===actor.id,'ACTOR_SESSION_CLAIMS_INVALID');
      const child=spawnPort('docker',['--host',engineHost,'exec','-i','--env','PGPASSWORD='+password,
        fresh.dbContainerId,'psql','-X','-q','-t','-A','--no-password','--host=127.0.0.1','--username='+role,'--dbname=postgres','--set=ON_ERROR_STOP=off'],
      {env:commandEnvironment(process.env),windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
      const channel=createPsqlChannel(child);
      try{
        await channel.query(`SET application_name=${sqlLiteral(role+'_'+(++serial))};`);
        const session=await createActorSession({channel,actor:{id:actor.id,claims},loginRole:role});
        let ownedPid=null;
        const wrapped=Object.freeze({...session,
          request(){return session.request();},
          async begin(isolation){await session.begin(isolation);ownedPid=session.pid();pidSet.add(ownedPid);},
          async close(){await session.close();if(ownedPid)pidSet.delete(ownedPid);}
        });
        sessions.add(wrapped);return wrapped;
      }catch(e){await channel.close();throw e;}
    },
    async observe({writerPid,waiterPid,requestId}){
      gate(pidSet.has(writerPid)&&pidSet.has(waiterPid)&&writerPid!==waiterPid&&uuid.test(requestId??''),'WORKER_OBSERVER_INPUT_INVALID');
      const raw=await admin(`SELECT jsonb_build_object('pid',b.pid,'blockers',pg_blocking_pids(b.pid),'waitEventType',b.wait_event_type,
 'writerQueryMatches',a.usename=${sqlLiteral(role)} AND position('apply_kinnso_discovery_command' in a.query)>0 AND position(${sqlLiteral(requestId)} in a.query)>0,
 'waiterQueryMatches',b.usename=${sqlLiteral(role)} AND position('apply_kinnso_discovery_command' in b.query)>0 AND position(${sqlLiteral(requestId)} in b.query)>0)
FROM pg_stat_activity a CROSS JOIN pg_stat_activity b WHERE a.pid=${writerPid} AND b.pid=${waiterPid};`);
      let row;try{row=JSON.parse(raw);}catch{}
      return row??{pid:waiterPid,blockers:[],waitEventType:null,writerQueryMatches:false,waiterQueryMatches:false};
    },
    async cleanup(){
      if(closed)return;
      const failures=[];
      await closeAll().catch(e=>failures.push(e));
      await admin(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=${sqlLiteral(role)} AND pid<>pg_backend_pid();`).catch(e=>failures.push(e));
      await admin(`REVOKE CONNECT ON DATABASE postgres FROM "${role}"; REVOKE authenticated FROM "${role}"; DROP ROLE IF EXISTS "${role}";`).catch(e=>failures.push(e));
      closed=true;
      if(failures.length)throw Object.assign(Error('worker cleanup'),{code:'WORKER_POOL_CLEANUP_FAILED'});
    }
  });
}
