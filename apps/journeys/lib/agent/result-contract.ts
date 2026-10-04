import type {TripCommand} from '../contracts/trips.ts';
export type Source={url:string;title:string;verifiedAt:string|null};
export type Evidence=Source&{excerpt:string;state:'current'|'unknown'|'stale'|'conflicting'};
export type TripProposal={type:'tripCommand';payload:{tripId:string;expectedRevision:number;command:TripCommand};requiresConfirmation:true};
export type AgentResult={answer:string;sources:Source[];proposedActions:TripProposal[];capabilityMode:'sources_only'|'connected';providerStatus:'unconfigured'|'budget_disabled'|'budget_exhausted'|'timeout'|'unavailable'|'available';evidenceState:'grounded'|'unverified'|'no_data'|'stale'|'conflict'|'unsafe_content'|'unavailable'};
export function canonicalUrl(value:unknown):string|null {
 if(typeof value!=='string'||value.length>2048)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:null;}catch{return null;}
}
export const unsafeText=(value:string)=>/(ignore\s+(all\s+)?(previous|prior)|system\s*prompt|developer\s*message|override\s+(the\s+)?(policy|permission)|saveTrip|\b(book|pay|notify)\s*\(|<script|javascript:|已(儲存|保存|預訂|付款|通知)|\b(saved|booked|notified)\b|payment\s+(completed|confirmed|successful)|\b(I|we)\s+(have\s+)?paid)/i.test(value);
export function evidence(value:Evidence):Evidence|null {
 const url=canonicalUrl(value.url);
 if(!url||typeof value.title!=='string'||!value.title.trim()||typeof value.excerpt!=='string'||!['current','unknown','stale','conflicting'].includes(value.state))return null;
 const verifiedAt=value.verifiedAt===null?null:typeof value.verifiedAt==='string'&&Number.isFinite(Date.parse(value.verifiedAt))?new Date(value.verifiedAt).toISOString():null;
 return{url,title:value.title.slice(0,200),excerpt:value.excerpt.slice(0,2000),verifiedAt,state:value.state};
}
