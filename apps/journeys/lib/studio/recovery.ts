import {studioUuid} from './policy';
type ReferenceStore=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(actor:string,thread:string)=>'kinnso.studio.pending.'+actor+'.'+thread;
export function readStudioRecovery(actor:string,thread:string,storage:ReferenceStore=sessionStorage):{threadId:string;requestId:string}|null{
 try{const raw=storage.getItem(key(actor,thread));if(!raw)return null;const ref=JSON.parse(raw);return ref.threadId===thread&&studioUuid(ref.requestId)?{threadId:thread,requestId:ref.requestId}:null;}catch{return null;}
}
export function rememberStudioRecovery(actor:string,thread:string,request:string,storage:ReferenceStore=sessionStorage){try{storage.setItem(key(actor,thread),JSON.stringify({threadId:thread,requestId:request}));}catch{/* In-memory immutable intent still works. */}}
export function forgetStudioRecovery(actor:string,thread:string,request:string|null,storage:ReferenceStore=sessionStorage){try{if(request&&readStudioRecovery(actor,thread,storage)?.requestId===request)storage.removeItem(key(actor,thread));}catch{}}
