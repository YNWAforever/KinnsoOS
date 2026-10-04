import type {Metadata} from 'next';
import {backendTarget,type Environment} from '../contracts/capabilities.ts';
import {publicUrl} from './migration-policy.ts';

export type PublicCreator={id:string;handle:string;name:string;bio:string;guides:{id:string;title:string}[];hasMore:boolean};
const handlePattern=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('creator_schema');
 return value as Record<string,unknown>;
}
function text(value:unknown):string {
 if(value===null)return '';
 if(typeof value!=='string')throw new Error('creator_schema');
 return value;
}
async function rows(url:URL,key:string,transport:typeof fetch):Promise<unknown[]> {
 let response:Response;
 try {response=await transport(url,{method:'GET',headers:{apikey:key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});}
 catch {throw new Error('creator_unavailable');}
 if(!response.ok)throw new Error('creator_unavailable');
 let value:unknown;try {value=await response.json();} catch {throw new Error('creator_schema');}
 if(!Array.isArray(value))throw new Error('creator_schema');
 return value;
}
/** Anonymous RLS reads, independent of the visitor's session. Never project DNA, private profile JSON or drafts. */
export async function readPublicCreator(handle:string,env:Environment,transport:typeof fetch=fetch):Promise<PublicCreator|null> {
 if(typeof handle!=='string'||!handlePattern.test(handle))return null;
 const target=backendTarget(env);if(!target)throw new Error('creator_unconfigured');
 const url=new URL('/rest/v1/creators',target.origin);
 url.search=new URLSearchParams({select:'id,handle,display_name,bio',handle:'eq.'+handle,status:'eq.active',public_profile:'not.is.null',limit:'1'}).toString();
 const creators=await rows(url,target.key,transport);
 if(creators.length>1)throw new Error('creator_schema');if(!creators.length)return null;
 const creator=record(creators[0]);
 if(typeof creator.id!=='string'||!uuidPattern.test(creator.id)||creator.handle!==handle)throw new Error('creator_schema');
 const name=text(creator.display_name),bio=text(creator.bio);
 const guideUrl=new URL('/rest/v1/guides',target.origin);
 guideUrl.search=new URLSearchParams({select:'id,title',creator_id:'eq.'+creator.id,status:'eq.published',order:'published_at.desc.nullslast,id.asc',limit:'7'}).toString();
 const guides=await rows(guideUrl,target.key,transport);
 if(guides.length>7)throw new Error('creator_schema');
 const projected=guides.map(value=>{
  const guide=record(value);
  if(typeof guide.id!=='string'||!uuidPattern.test(guide.id)||typeof guide.title!=='string'||!guide.title.trim())throw new Error('creator_schema');
  return {id:guide.id,title:guide.title};
 });
 return {id:creator.id,handle,name:name.trim()?name:handle,bio,guides:projected.slice(0,6),hasMore:guides.length>6};
}
export function creatorPageMetadata(creator:PublicCreator,locale:string):Metadata {
 if(!['en','zh-HK'].includes(locale))throw new Error('creator_locale');
 if(!handlePattern.test(creator.handle))throw new Error('creator_schema');
 const canonical=publicUrl(`https://remix-kinnso-web.vercel.app/${locale==='en'?'en':'zh-hk'}/c/${creator.handle}`);
 // Bio has no authored-language field. A translated shell does not establish a translated profile.
 return {title:creator.name,description:creator.bio,robots:{index:false,follow:false},alternates:{canonical},
  openGraph:{type:'profile',url:canonical,title:creator.name,description:creator.bio},
  twitter:{card:'summary',title:creator.name,description:creator.bio}};
}
