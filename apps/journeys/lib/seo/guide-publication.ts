import type {Metadata} from 'next';
import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import {readPublicGuide,type PublicGuide,type GuidePublication} from './public-guide.ts';

function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('guide_schema');
 return value as Record<string,unknown>;
}
function optionalText(value:unknown):string|null {
 if(value===null)return null;
 if(typeof value!=='string')throw new Error('guide_schema');
 return value.trim()?value:null;
}
function publicCover(value:unknown):string|null {
 const source=optionalText(value);if(!source)return null;
 try {
  const url=new URL(source);
  if(url.origin!=='https://cdn.kinnso.ai'||url.username||url.password||url.search||url.hash)return null;
  return url.href;
 } catch {return null;}
}
/** Existing published-guide fields only. No creator profile, draft, private media or invented dimensions. */
export function publication(guide:PublicGuide,value:unknown):GuidePublication {
 const row=record(value);
 if(typeof row.id!=='string'||row.id.toLowerCase()!==guide.id.toLowerCase()||row.title!==guide.title)throw new Error('guide_schema');
 const publishedAt=optionalText(row.published_at);
 if(publishedAt&&!Number.isFinite(Date.parse(publishedAt)))throw new Error('guide_schema');
 return {author:optionalText(row.creator_name),publishedAt,coverUrl:publicCover(row.cover_url)};
}
/** Anonymous reads deliberately exclude any incoming actor/session from both publication checks. */
export async function readPublicGuidePage(id:string,env:Environment,transport:typeof fetch=fetch):Promise<PublicGuide|null> {
 const guide=await readPublicGuide(id,env,transport);if(!guide)return null;
 const target=backendTarget(env);if(!target)throw new Error('guide_unconfigured');
 const url=new URL('/rest/v1/guides',target.origin);
 url.search=new URLSearchParams({select:'id,title,creator_name,published_at,cover_url',id:'eq.'+id,status:'eq.published',limit:'1'}).toString();
 const response=await transport(url,{method:'GET',headers:{apikey:target.key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('guide_unavailable');
 const rows:unknown=await response.json();
 if(!Array.isArray(rows)||rows.length>1)throw new Error('guide_schema');
 if(!rows.length)return null; // Publication withdrawn between the two anonymous reads.
 return {...guide,publication:publication(guide,rows[0])};
}
export function guidePageMetadata(guide:PublicGuide):Metadata {
 const author=guide.kind==='itinerary'?guide.creator.name:guide.publication?.author;
 const publishedAt=guide.kind==='itinerary'?guide.publishedAt:guide.publication?.publishedAt;
 const description=guide.kind==='summary'?guide.summary:undefined;
 const images=guide.publication?.coverUrl?[{url:guide.publication.coverUrl,alt:guide.title}]:[];
 return {title:guide.title,description,robots:{index:false,follow:false},
  authors:author?[{name:author}]:undefined,
  openGraph:{title:guide.title,description,type:'article',images,authors:author?[author]:undefined,publishedTime:publishedAt??undefined},
  twitter:{card:images.length?'summary_large_image':'summary',title:guide.title,description,images}};
}
/** Published prose only. Credits do not guess Person/Organization; sections do not claim visits, places or bookings. */
export function guideStructuredData(guide:PublicGuide):string {
 const credit=guide.kind==='itinerary'?guide.creator.name:guide.publication?.author;
 const publishedAt=guide.kind==='itinerary'?guide.publishedAt:guide.publication?.publishedAt;
 const cover=guide.publication?.coverUrl?publicCover(guide.publication.coverUrl):null;
 const value={'@context':'https://schema.org','@type':'CreativeWork',name:guide.title,
  ...(guide.kind==='summary'?{description:guide.summary}:{version:guide.version,hasPart:guide.days.map((day,index)=>({
   '@type':'CreativeWork',name:day.title,position:index+1,hasPart:day.stops.map((stop,position)=>({
    '@type':'CreativeWork',name:stop.title,description:stop.description,position:position+1,
   })),
  }))}),
  ...(credit?.trim()?{creditText:credit}:{}),...(publishedAt?{datePublished:publishedAt}:{}),...(cover?{image:cover}:{}),
 };
 // Native JSON-LD script is inert; escape HTML delimiters and Unicode separators without changing authored text.
 return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
}
