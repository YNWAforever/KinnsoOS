import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import type {GuideSummary,GuideSnapshot} from '../contracts/trips';
export type GuidePublication={author:string|null;publishedAt:string|null;coverUrl:string|null};
export type PublicGuide=(GuideSummary|GuideSnapshot)&{publication?:GuidePublication};
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('guide_schema');return v as Record<string,unknown>;}
function text(v:unknown):string{if(typeof v!=='string')throw new Error('guide_schema');return v;}
function nullable(v:unknown):string|null{return v===null?null:text(v);}
function integer(v:unknown):number{if(typeof v!=='number'||!Number.isInteger(v)||v<0)throw new Error('guide_schema');return v;}
function optionalInteger(v:unknown):number|null{return v===null?null:integer(v);}
export function publicGuide(value:unknown):PublicGuide {
 const r=record(value),id=text(r.id),title=text(r.title),destinationId=nullable(r.destinationId);
 if(!id||!title.trim())throw new Error('guide_schema');
 if(r.kind==='summary')return {kind:'summary',id,title,summary:text(r.summary),destinationId};
 if(r.kind!=='itinerary'||!Array.isArray(r.days)||r.days.length>100)throw new Error('guide_schema');
 const creator=record(r.creator),publishedAt=text(r.publishedAt),version=integer(r.version);
 if(!version||!Number.isFinite(Date.parse(publishedAt)))throw new Error('guide_schema');
 return {kind:'itinerary',id,title,destinationId,version,publishedAt,creator:{id:text(creator.id),name:text(creator.name),handle:nullable(creator.handle)},days:r.days.map(value=>{
  const day=record(value);if(!Array.isArray(day.stops)||day.stops.length>200)throw new Error('guide_schema');
  return {id:text(day.id),offset:integer(day.offset),title:text(day.title),stops:day.stops.map(value=>{const stop=record(value);if(stop.source!==null)throw new Error('guide_schema');return {id:text(stop.id),title:text(stop.title),description:text(stop.description),placeId:nullable(stop.placeId),position:integer(stop.position),startMinuteOfDay:optionalInteger(stop.startMinuteOfDay),durationMinutes:optionalInteger(stop.durationMinutes),source:null};})};
 })};
}
/** Anonymous, published-only RPC; no cookies, identity adapter, private draft or client API proxy. */
export async function readPublicGuide(id:string,env:Environment,transport:typeof fetch=fetch):Promise<PublicGuide|null> {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 const target=backendTarget(env);if(!target)throw new Error('guide_unconfigured');
 const response=await transport(new URL('/rest/v1/rpc/kinnso_guide',target.origin),{method:'POST',headers:{apikey:target.key,'Content-Type':'application/json'},body:JSON.stringify({p_guide_id:id}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 const data:unknown=await response.json();
 if(!response.ok){if(record(data).message==='guide_not_found')return null;throw new Error('guide_unavailable');}
 const guide=publicGuide(data);
 if(guide.id.toLowerCase()!==id.toLowerCase())throw new Error('guide_schema');
 return guide;
}
