import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import {articleRows} from './public-article.ts';

export type PublicDestination={slug:string;name:string;description:string|null;heroImageUrl:string|null;matchTerms:string[];guideCount:number;experienceCount:number;latestPublishedAt:string|null};
const columns='slug,name,description,hero_image_url,match_terms,guide_count,experience_count,latest_published_at';
const slugPattern=/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
function text(value:unknown,max:number):string {
 if(typeof value!=='string'||value.length>max)throw Error('destination_schema');
 return value;
}
function count(value:unknown):number {
 const number=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
 if(typeof number!=='number'||!Number.isSafeInteger(number)||number<0)throw Error('destination_schema');
 return number;
}
function destination(value:unknown):PublicDestination {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('destination_schema');
 const row=value as Record<string,unknown>,slug=text(row.slug,200),name=text(row.name,500);
 if(!slugPattern.test(slug)||!name.trim()||!Array.isArray(row.match_terms)||row.match_terms.length>200)throw Error('destination_schema');
 const matchTerms=row.match_terms.map(value=>text(value,500));
 const latestPublishedAt=row.latest_published_at===null?null:text(row.latest_published_at,100);
 if(latestPublishedAt!==null&&!Number.isFinite(Date.parse(latestPublishedAt)))throw Error('destination_schema');
 let heroImageUrl:string|null=null;
 if(row.hero_image_url!==null){const source=text(row.hero_image_url,2048);try{const url=new URL(source);if(url.origin==='https://cdn.kinnso.ai'&&!url.username&&!url.password&&!url.search&&!url.hash)heroImageUrl=url.href;}catch{}}
 return {slug,name,description:row.description===null?null:text(row.description,20000),heroImageUrl,matchTerms,guideCount:count(row.guide_count),experienceCount:count(row.experience_count),latestPublishedAt};
}
async function read(params:Record<string,string>,env:Environment,transport:typeof fetch):Promise<PublicDestination[]> {
 const target=backendTarget(env);if(!target)throw Error('destination_unconfigured');
 const url=new URL('/rest/v1/destination_index',target.origin);url.search=new URLSearchParams({select:columns,...params}).toString();
 // The security-invoker view derives rows from published inventory; no actor or service key.
 const rows=await articleRows(url,target.key,transport);
 if(rows.length>Number(params.limit))throw Error('destination_schema');
 const items=rows.map(destination),seen=new Set<string>();
 for(const item of items){if(seen.has(item.slug))throw Error('destination_schema');seen.add(item.slug);}
 return items;
}
export async function readDestinationListing(page:number,env:Environment,transport:typeof fetch=fetch) {
 if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error('destination_query');
 const rows=await read({order:'sort_order.asc,name.asc,slug.asc',limit:'13',offset:String((page-1)*12)},env,transport);
 return {items:rows.slice(0,12),page,hasNext:rows.length>12};
}
export async function readPublicDestination(slug:string,env:Environment,transport:typeof fetch=fetch):Promise<PublicDestination|null> {
 try{slug=decodeURIComponent(slug);}catch{return null;}
 if(!slugPattern.test(slug))return null;
 const rows=await read({slug:'eq.'+slug,limit:'2'},env,transport);
 if(rows.length>1||rows.length===1&&rows[0].slug!==slug)throw Error('destination_schema');
 return rows[0]??null;
}
