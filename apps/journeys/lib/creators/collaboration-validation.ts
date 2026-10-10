import {object,uuid} from '../api/validation.ts';
import type {CreatorMissionCommand} from './collaboration';

export function evidenceUrl(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return false;
 try {const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
const timestamp=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
export function creatorMissionCommand(value:unknown):CreatorMissionCommand {
 const initial=object(value,['type','applicationNote','expectedUpdatedAt','milestoneId','submissionId','proofUrls','notes']);
 if(initial.type==='join'){
  const c=object(value,['type','applicationNote']);if(c.applicationNote!==undefined&&(typeof c.applicationNote!=='string'||c.applicationNote.length>2000))throw Error('INVALID');
 }else if(initial.type==='acceptInvite'||initial.type==='withdrawApplication'){
  const c=object(value,['type','expectedUpdatedAt']);if(!timestamp(c.expectedUpdatedAt))throw Error('INVALID');
 }else if(initial.type==='submitEvidence'){
  const c=object(value,['type','milestoneId','submissionId','expectedUpdatedAt','proofUrls','notes']);
  if(!uuid(c.milestoneId)||!(c.submissionId===null||uuid(c.submissionId))||!(c.submissionId===null?c.expectedUpdatedAt===null:timestamp(c.expectedUpdatedAt))||!Array.isArray(c.proofUrls)||c.proofUrls.length<1||c.proofUrls.length>5||!c.proofUrls.every(evidenceUrl)||new Set(c.proofUrls).size!==c.proofUrls.length||typeof c.notes!=='string'||c.notes.length>4000)throw Error('INVALID');
 }else throw Error('INVALID');
 return initial as CreatorMissionCommand;
}

export function creatorQuery(request:Request,allowed:string[],cursorKind:'uuid'|'earnings'='uuid') {
 const params=new URL(request.url).searchParams;
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw Error('INVALID');
 if(params.has('after')){
  const after=params.get('after')!;
  if(cursorKind==='uuid'?!uuid(after):!(/^(mission|booking|affiliate|payout_batch):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)))throw Error('INVALID');
 }
 return params;
}
