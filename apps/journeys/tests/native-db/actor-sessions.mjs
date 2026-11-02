import {gate} from './target.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const identifier=value=>{gate(typeof value==='string'&&/^[a-z][a-z0-9_]{1,62}$/.test(value),'SQL_IDENTIFIER_INVALID');return '"'+value+'"';};
const string=value=>{
  gate(typeof value==='string'&&value.length<=262144&&!value.includes('\0'),'SQL_VALUE_INVALID');
  return "'"+value.replaceAll("'","''")+"'";
};
const signatures={
  apply_kinnso_discovery_command:{p_target_id:'uuid',p_expected_revision:'integer',p_request_id:'uuid',p_command:'jsonb',p_authority:'jsonb'},
  get_kinnso_discovery_request:{p_request_id:'uuid'},
  read_kinnso_discovery:{p_scope:'jsonb'}
};
export function rpcSql(method,args){
  const spec=signatures[method];gate(spec&&args&&typeof args==='object'&&!Array.isArray(args),'SUBJECT_RPC_NOT_ALLOWED');
  const values=Object.entries(args).map(([key,value])=>{
    const type=spec[key];gate(type,'SUBJECT_RPC_ARGUMENT_INVALID');
    let encoded;
    if(type==='uuid'){gate(uuid.test(value??''),'SUBJECT_RPC_ARGUMENT_INVALID');encoded=string(value)+'::uuid';}
    else if(type==='integer'){gate(Number.isSafeInteger(value)&&value>=0,'SUBJECT_RPC_ARGUMENT_INVALID');encoded=value+'::integer';}
    else{gate(value&&typeof value==='object','SUBJECT_RPC_ARGUMENT_INVALID');encoded=string(JSON.stringify(value))+'::jsonb';}
    return identifier(key)+'=>'+encoded;
  });
  return `SELECT public.${identifier(method)}(${values.join(',')});`;
}
export function workerRoleSql({name,password}){
  gate(/^na_[a-z0-9_]+$/.test(name??'')&&typeof password==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(password),'WORKER_ROLE_INVALID');
  const role=identifier(name);
  return `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 4 PASSWORD ${string(password)};
GRANT CONNECT ON DATABASE postgres TO ${role};
GRANT authenticated TO ${role};`;
}
export async function createActorSession({channel,actor,loginRole,clock=Date.now}){
  const claims=actor?.claims;
  gate(uuid.test(actor?.id??'')&&claims?.sub===actor.id&&uuid.test(claims.session_id??'')&&claims.role==='authenticated'&&
    claims.is_anonymous!==true&&Number.isSafeInteger(claims.exp)&&claims.exp*1000>clock(),'ACTOR_SESSION_CLAIMS_INVALID');
  identifier(loginRole);
  let active=false,backendPid=null,closed=false,lastRequest=null;
  const abort=async()=>{active=false;try{await channel.query('ROLLBACK;');}catch{}};
  return Object.freeze({
    async begin(isolation='READ COMMITTED'){
      gate(!closed&&!active,'ACTOR_TRANSACTION_STATE_INVALID');
      gate(['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'].includes(isolation),'ACTOR_ISOLATION_INVALID');
      try{
        await channel.query(`BEGIN ISOLATION LEVEL ${isolation};`);
        await channel.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'; SET LOCAL standard_conforming_strings=on;");
        await channel.query('SET LOCAL ROLE authenticated;');
        await channel.query(`SELECT set_config('request.jwt.claims',${string(JSON.stringify(claims))},true);`);
        const reply=await channel.query(`SELECT jsonb_build_object(
 'pid',pg_backend_pid(),'sessionUser',session_user,'currentUser',current_user,
 'sessionSuper',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),
 'sessionBypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user),
 'currentSuper',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'currentBypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'actorId',auth.uid(),'validSession',public.kinnso_session_valid(),
 'standardStrings',current_setting('standard_conforming_strings'));`);
        let identity;try{identity=JSON.parse(reply.rows[0]);}catch{}
        gate(identity?.sessionUser===loginRole&&identity.currentUser==='authenticated'&&identity.actorId===actor.id&&
          identity.validSession===true&&identity.standardStrings==='on'&&
          ['sessionSuper','sessionBypass','currentSuper','currentBypass'].every(k=>identity[k]===false)&&
          Number.isSafeInteger(identity.pid)&&identity.pid>0,'ACTOR_SQL_IDENTITY_INVALID');
        backendPid=identity.pid;active=true;
      }catch(error){await abort();throw error;}
    },
    pid(){gate(active&&backendPid,'ACTOR_TRANSACTION_REQUIRED');return backendPid;},
    async rpc(method,args){
      gate(active&&!closed,'ACTOR_TRANSACTION_REQUIRED');
      const sql=rpcSql(method,args);
      lastRequest=Object.freeze({method,requestId:args.p_request_id??null});
      const reply=await channel.query(sql);
      gate(reply.rows.length===1,'SUBJECT_RPC_RESULT_INVALID');
      try{return JSON.parse(reply.rows[0]);}catch{gate(false,'SUBJECT_RPC_RESULT_INVALID');}
    },
    request(){return lastRequest;},
    async commit(){gate(active,'ACTOR_TRANSACTION_REQUIRED');await channel.query('COMMIT;');active=false;},
    async rollback(){await abort();},
    async close(){if(closed)return;closed=true;if(active)await abort();await channel.close();}
  });
}
