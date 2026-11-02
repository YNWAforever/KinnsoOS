import {Blocked,gate} from './target.mjs';
import {sqlLiteral} from './live-auth.mjs';

const safeCase=/^[A-Za-z0-9_.-]+$/;
function identifier(caseId){gate(safeCase.test(caseId??''),'FAULT_CASE_INVALID');return `na_${caseId.toLowerCase().replace(/[^a-z0-9_]/g,'_')}`;}
export function faultSql({caseId,table,targetColumn='id',targetValue}){
  const name=identifier(caseId);
  gate(/^(public|kinnso_internal)\.[a-z0-9_]+$/.test(table??'')&&/^[a-z_][a-z0-9_]*$/.test(targetColumn)&&targetValue,'FAULT_TARGET_INVALID');
  return `create schema if not exists kinnso_na_fault;
create or replace function kinnso_na_fault.${name}_fail() returns trigger language plpgsql set search_path='' as $$
declare payload jsonb;
begin
  payload:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if payload->>${sqlLiteral(targetColumn)}=${sqlLiteral(targetValue)} then
    raise exception 'synthetic_native_fault:${name}' using errcode='P0001';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists ${name}_trigger on ${table};
create trigger ${name}_trigger before insert or update or delete on ${table}
for each row execute function kinnso_na_fault.${name}_fail();`;
}
export function removeFaultSql(caseId,table){
  const name=identifier(caseId);gate(/^(public|kinnso_internal)\.[a-z0-9_]+$/.test(table??''),'FAULT_TARGET_INVALID');
  return `drop trigger if exists ${name}_trigger on ${table};drop function if exists kinnso_na_fault.${name}_fail();`;
}
export async function runAtomicFaultCase({install,baseline,action,snapshot,remove,expectedMarker='synthetic_native_fault'}){
  gate([install,baseline,action,snapshot,remove].every(fn=>typeof fn==='function'),'FAULT_ADAPTER_INVALID');
  let installed=false,actionError;
  try{
    await install();installed=true;
    const before=await baseline();
    try{await action();}catch(error){actionError=error;}
    const after=await snapshot();
    if(!actionError||actionError.sqlState!=='P0001'||actionError.wroteBeforeFault!==true||
      typeof actionError.faultMarker!=='string'||!actionError.faultMarker.includes(expectedMarker))throw new Blocked('FAULT_NOT_PROVEN');
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Blocked('PARTIAL_EFFECT_AFTER_ROLLBACK');
    const failure=new Blocked('EXPECTED_TRANSACTION_ROLLBACK');failure.sqlState=/^[0-9A-Z]{5}$/.test(actionError.sqlState??'')?actionError.sqlState:'UNKNOWN';
    return {status:'PASS',failure};
  }finally{
    if(installed){
      try{await remove();}catch{throw new Blocked('FAULT_CLEANUP_FAILED');}
    }
  }
}
