export type CaseDraft={message:string;reason:string;status:'in_progress'|'waiting_customer'|'resolved'};
export type SupportDraft={version:2;subject:string;message:string;cases:Record<string,CaseDraft>;legacyText:string};
export const emptyCaseDraft=():CaseDraft=>({message:'',reason:'',status:'in_progress'});
export const emptySupportDraft=():SupportDraft=>({version:2,subject:'',message:'',cases:{},legacyText:''});
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max?value:'';
/** Old global text has no reliable recipient. Keep it for copying, never prefill a case. */
export function restoreSupportDraft(value:unknown):SupportDraft{
 const d=object(value),result=emptySupportDraft();result.subject=text(d.subject,200);
 if(d.version!==2){result.legacyText=[text(d.message,4000),text(d.reason,2000)].filter(Boolean).join('\n\n');return result;}
 result.message=text(d.message,4000);result.legacyText=text(d.legacyText,6002);
 for(const [id,value]of Object.entries(object(d.cases))){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))continue;
  const c=object(value);result.cases[id]={message:text(c.message,4000),reason:text(c.reason,2000),status:c.status==='resolved'||c.status==='waiting_customer'?c.status:'in_progress'};
 }
 return result;
}
export function supportDraftDirty(d:SupportDraft){return !!(d.subject||d.message||d.legacyText||Object.values(d.cases).some(c=>c.message||c.reason||c.status!=='in_progress'));}
export function completeSupportDraft(d:SupportDraft,command:Record<string,unknown>):SupportDraft{
 if(command.type==='create')return{...d,subject:'',message:''};
 const cases={...d.cases};delete cases[String(command.id)];return{...d,cases};
}
