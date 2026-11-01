import {randomUUID} from 'node:crypto';
import {Blocked,gate} from './target.mjs';

const privateCommands=new Set(['savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent']);
const sampleIntent={cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-10',end:'2026-11-12'},
  budget:{currency:'HKD',maxPerPersonMinor:20000},interestTags:['food','walking'],languages:['zh-HK']};
const samplePreferences={favoriteCityKeys:['city:hk:hong-kong'],interestTags:['food'],languages:['zh-HK']};
export function privateCommandInput(kind,targetId,expectedRevision=0,requestId=randomUUID()){
  gate(privateCommands.has(kind),'PRIVATE_COMMAND_INVALID');
  const data=kind==='savePreferences'?structuredClone(samplePreferences):kind==='saveIntent'?structuredClone(sampleIntent):{};
  return Object.freeze({p_target_id:targetId,p_expected_revision:expectedRevision,p_request_id:requestId,p_command:Object.freeze({kind,data:Object.freeze(data)})});
}
function response(result){return {data:result?.data??null,error:result?.error??null,status:result?.status??null};}
export async function runGateCase({client,input,command,target,expectedRevision=0,gate:gateMode,snapshot}){
  const request=input??privateCommandInput(command,target,expectedRevision);
  const revision=request.p_expected_revision;
  gate(Number.isSafeInteger(revision)&&revision>=0,'PRIVATE_COMMAND_INVALID');
  gate(typeof snapshot==='function','EFFECT_OBSERVER_REQUIRED');
  const before=await snapshot();
  const result=response(await client.rpc('apply_kinnso_discovery_command',request));
  const after=await snapshot();
  if(gateMode==='closed'){
    gate(result.error?.message==='discovery_unavailable','CLOSED_GATE_NOT_DENIED');
    gate(JSON.stringify(before)===JSON.stringify(after),'CLOSED_GATE_CHANGED_EFFECTS');
  }else{
    gate(!result.error&&result.data?.ok===true&&result.data?.receipt?.revision===revision+1,'PRIVATE_GATE_POSITIVE_FAILED');
    gate(JSON.stringify(before)!==JSON.stringify(after),'PRIVATE_GATE_DID_NOT_WRITE');
  }
  return {status:'PASS',expected:gateMode==='closed'?'closed gate leaves effects unchanged':'private gate commits one receipt',
    actual:{gate:gateMode,requestId:request.p_request_id,errorCode:result.error?.message??null,revision:result.data?.receipt?.revision??null,before,after},
    evidence:{request,response:result,before,after}};
}
export async function runSameUuidCase({client,input,observe,proveOverlap}){
  gate(typeof proveOverlap==='function','UUID_OVERLAP_PROOF_REQUIRED');
  const overlapPromise=Promise.resolve().then(()=>proveOverlap());
  const [a,b]=await Promise.all([client.rpc('apply_kinnso_discovery_command',input),client.rpc('apply_kinnso_discovery_command',input)]);
  const overlap=await overlapPromise;
  gate(overlap?.evidenceLevel==='DATABASE_OBSERVER'&&overlap.writerPid!==overlap.waiterPid&&
    overlap.requestId===input.p_request_id&&overlap.query?.includes('apply_kinnso_discovery_command'),'UUID_OVERLAP_NOT_PROVEN');
  const x=response(a),y=response(b);
  gate(!x.error&&!y.error,'UUID_CONCURRENT_CALL_FAILED');
  if(JSON.stringify(x.data)!==JSON.stringify(y.data))throw new Blocked('UUID_RESULT_MISMATCH');
  const effects=await observe(input);
  gate(effects?.count===1,'UUID_EFFECT_COUNT_MISMATCH');
  return {status:'PASS',expected:'same UUID produces one receipt and one effect',actual:{requestId:input.p_request_id,effectCount:effects.count},
    evidence:{first:x,second:y,effects,overlap}};
}
export async function runOwnerReadIsolationCase({owner,foreign,readRequest},{intentId,requestId}){
  const own=response(await owner.rpc('read_kinnso_discovery',{p_scope:{kind:'intent',id:intentId}}));
  gate(!own.error&&own.data?.data?.id===intentId,'OWNER_POSITIVE_READ_FAILED');
  const denied=response(await foreign.rpc('read_kinnso_discovery',{p_scope:{kind:'intent',id:intentId}}));
  gate(Boolean(denied.error)&&JSON.stringify(denied.data??null).includes(intentId)===false,'FOREIGN_READ_EXPOSED_ROW');
  const receipt=response(await readRequest());
  gate(receipt.data?.status==='unknown'&&!JSON.stringify(receipt.data).includes(intentId),'FOREIGN_RECEIPT_EXPOSED_DATA');
  return {status:'PASS',expected:'owner positive control, foreign intent and receipt denied',actual:{ownerRead:true,foreignError:denied.error.message,receiptStatus:receipt.data.status},
    evidence:{owner:own,foreign:denied,receipt}};
}
