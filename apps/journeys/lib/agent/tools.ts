import type {SupabaseClient} from '@supabase/supabase-js';
import {toolGuard} from './policy.ts';
import type {Actor,AgentTask} from './policy.ts';
import {canonicalUrl} from './result-contract.ts';
import type {Evidence} from './result-contract.ts';
import type {TripSnapshot} from '../contracts/trips.ts';
const slug=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;
export function sourceOrigin(value:string|undefined):string|null {
 const canonical=canonicalUrl(value);if(!canonical)return null;
 const url=new URL(canonical);return url.pathname==='/'&&!url.search&&!url.hash?url.origin:null;
}
/** Tool names and query parameters are chosen here; source/user/provider prose never controls RPC names. */
export async function readContext(client:SupabaseClient,actor:Actor,input:{task:AgentTask;prompt:string;tripId?:string;merchantId?:string;locale:'en'|'zh-hk'|'zh-cn'},canonicalOrigin:string|null):Promise<{sources:Evidence[];trip:TripSnapshot|null;readFailure?:string;ownedContext?:string}> {
 const guard=toolGuard(actor,input.task);const sources:Evidence[]=[];let trip:TripSnapshot|null=null;let ownedContext='';
 const read=async(name:string,rpc:string,args:Record<string,unknown>)=>{
  guard(name);const result=await client.rpc(rpc,args);if(result.error)throw new Error('READ_UNAVAILABLE');return result.data;
 };
 // The new RPC derives its bucket from the live session and fixes 20 requests/hour; no caller-selected actor or quota.
 const rate=await client.rpc('take_kinnso_agent_quota');
 if(rate.error||rate.data!==true)throw new Error(rate.error?'UNAVAILABLE':'RATE_LIMIT');
 if(input.task==='tripSuggestion'){
  if(!input.tripId)throw new Error('INVALID');
  // RPC independently checks a live backend session and exact trip.owner_user_id before returning any private text.
  trip=await read('ownedTrip','get_trip_snapshot',{p_trip_id:input.tripId}) as TripSnapshot;
  if(!trip||trip.id!==input.tripId||!Array.isArray(trip.days)||!Number.isSafeInteger(trip.revision))throw new Error('FORBIDDEN');
  ownedContext='Review an alternative order without changing any places:\n'+trip.days.slice(0,10).map(d=>d.stops.slice(0,20).map(s=>s.title).join(' → ')).join('\n');
 }
 if(input.task==='creatorMaterials'){
  guard('ownedCreatorMaterials');
  const result=await client.from('creator_dna').select('final').eq('creator_id',actor.id).maybeSingle();
  if(result.error)throw new Error('READ_UNAVAILABLE');
  // An owned profile is private context, never exposed as a fabricated public citation.
  if(!result.data?.final)return{sources:[],trip,readFailure:'owned_materials_missing'};
  const final=result.data.final;
  ownedContext='Material outline from your confirmed profile:\n'+['bio','niches','content_pillars','tone','languages'].map(key=>{const value=final[key];return key+': '+(typeof value==='string'?value.slice(0,1000):Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,20).join(', '):'Unknown');}).join('\n');
 }
 if(input.task==='merchantBrief'){
  if(!input.merchantId)throw new Error('INVALID');
  const members=await read('ownedMerchantBrief','get_kinnso_merchant_memberships',{});
  if(!Array.isArray(members)||!members.some((m:{merchantId:string;role:string})=>m.merchantId===input.merchantId&&['owner','marketing'].includes(m.role)))throw new Error('FORBIDDEN');
  const workspace=await read('ownedMerchantBrief','get_kinnso_merchant_workspace',{p_merchant_id:input.merchantId});
  ownedContext='Brief review checklist: audience, source-backed itinerary context, deliverables, dates and review criteria. Complete commercial terms in the merchant editor.\n'+(workspace&&typeof workspace==='object'&&'missions'in workspace&&Array.isArray(workspace.missions)?workspace.missions.slice(0,5).map((m:{title?:unknown})=>typeof m.title==='string'?m.title.slice(0,200):'').filter(Boolean).join('\n'):'No existing brief titles available.');
 }
 if(!canonicalOrigin)return{sources,trip,readFailure:'canonical_origin_missing'};
 const query=input.prompt.slice(0,120);
 const kinds:[string,string,Record<string,unknown>,string][]=[['searchGuides','search_guides',{p_q:query,p_city:null,p_limit:5,p_offset:0},'guides']];
 if(input.task!=='creatorMaterials')kinds.push(['searchArticles','search_articles',{p_locale:input.locale,p_q:query,p_limit:5,p_offset:0},'articles']);
 if(input.task==='sourceQA')kinds.push(['searchExperiences','search_experiences',{p_q:query,p_city:null,p_limit:5,p_offset:0},'experiences']);
 try{
  for(const [name,rpc,args,path] of kinds){
   const rows=await read(name,rpc,args);if(!Array.isArray(rows)||rows.length>5)throw new Error('INVALID_SOURCE');
   for(const row of rows as Record<string,unknown>[]){
    if(typeof row.title!=='string'||typeof row.summary!=='string')continue;
    const url=path==='articles'?canonicalUrl(row.url):typeof row.slug==='string'&&slug.test(row.slug)?canonicalUrl(`${canonicalOrigin}/${input.locale}/${path}/${encodeURIComponent(row.slug)}`):null;
    if(url)sources.push({url,title:row.title,excerpt:row.summary,verifiedAt:null,state:'unknown'});
   }
  }
  return{sources,trip,ownedContext};
 }catch{return{sources:[],trip,readFailure:'source_unavailable'};}
}
