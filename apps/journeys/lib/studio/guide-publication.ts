import {sameValue} from './contracts.ts';
function publishedContent(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))return value;const {publication: _publication,...snapshot}=value as Record<string,unknown>;return snapshot;}
/** ACK is not a readback. All three arguments come from separate completed reads. */
export function verifyGuidePublication(ack:{draft:{id:string;revision:number;publishedVersion:number;payload:unknown};snapshot:unknown},draft:{id:string;revision:number;publishedVersion:number;payload:unknown}|null,publicSnapshot:unknown):'verified'|'unknown'{
 if(!draft||!publicSnapshot||draft.id!==ack.draft.id||draft.revision!==ack.draft.revision||draft.publishedVersion!==ack.draft.publishedVersion||!sameValue(draft.payload,ack.draft.payload)||!sameValue(publishedContent(publicSnapshot),publishedContent(ack.snapshot)))return'unknown';
 return'verified';
}
