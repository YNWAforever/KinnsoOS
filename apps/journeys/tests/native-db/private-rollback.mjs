import {Blocked,gate} from './target.mjs';
import {sqlLiteral} from './live-auth.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function privateFaultName(caseId){
  gate(typeof caseId==='string'&&/^[a-z][a-z0-9_]{1,43}$/.test(caseId),'FAULT_CASE_INVALID');
  return 'na_'+caseId;
}
function validate(spec){
  gate([spec.requestId,spec.actorId,spec.targetId].every(v=>uuid.test(v??'')),'FAULT_TARGET_INVALID');
  return privateFaultName(spec.caseId);
}
export function privateIntentFaultSql(spec){
  const name=validate(spec);
  return `BEGIN;
CREATE SCHEMA IF NOT EXISTS kinnso_na_fault;
CREATE FUNCTION kinnso_na_fault.${name}_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.request_id=${sqlLiteral(spec.requestId)}::uuid AND new.actor_id=${sqlLiteral(spec.actorId)}::uuid THEN
  IF NOT EXISTS(SELECT 1 FROM public.trip_intents WHERE id=${sqlLiteral(spec.targetId)}::uuid
    AND owner_actor_id=${sqlLiteral(spec.actorId)}::uuid AND revision=1) THEN
   RAISE EXCEPTION 'fault_stage_not_reached';
  END IF;
  RAISE EXCEPTION 'synthetic_native_fault:${name}' USING ERRCODE='P0001',
   DETAIL=jsonb_build_object('requestId',new.request_id,'actorId',new.actor_id,
     'targetId',new.resource_id,'domainWritten',true)::text;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION kinnso_na_fault.${name}_fail() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ${name}_trigger BEFORE INSERT ON kinnso_internal.discovery_requests
 FOR EACH ROW EXECUTE FUNCTION kinnso_na_fault.${name}_fail();
COMMIT;`;
}
export function removePrivateIntentFaultSql(spec){
  const name=validate(spec);
  return `BEGIN; DROP TRIGGER IF EXISTS ${name}_trigger ON kinnso_internal.discovery_requests;
DROP FUNCTION IF EXISTS kinnso_na_fault.${name}_fail(); COMMIT;`;
}
export function parsePrivateIntentFault(error,spec){
  const name=validate(spec);let detail;
  try{detail=JSON.parse(error?.details);}catch{}
  gate(error?.code==='P0001'&&error.message==='synthetic_native_fault:'+name&&
    detail?.requestId===spec.requestId&&detail.actorId===spec.actorId&&detail.targetId===spec.targetId&&
    detail.domainWritten===true,'FAULT_NOT_PROVEN');
  const failure=new Blocked('EXPECTED_TRANSACTION_ROLLBACK');
  failure.sqlState=error.code;failure.faultMarker=error.message;failure.wroteBeforeFault=true;return failure;
}
