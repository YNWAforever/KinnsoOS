import {backendTarget,type Environment} from '../contracts/capabilities.ts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isGuideSlug(value:string):boolean {
 return value.length<=240&&!uuid.test(value)&&/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(value);
}
/** Anonymous projection only; publication is checked again by the canonical renderer. */
export async function resolvePublishedGuideId(slug:string,env:Environment,transport:typeof fetch=fetch):Promise<string|null> {
 if(!isGuideSlug(slug))return null;
 const target=backendTarget(env);if(!target)throw new Error('guide_unconfigured');
 const url=new URL('/rest/v1/guides',target.origin);
 url.search=new URLSearchParams({select:'id,slug,status',slug:`eq.${slug}`,status:'eq.published',limit:'2'}).toString();
 const response=await transport(url,{method:'GET',headers:{apikey:target.key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('guide_unavailable');
 const rows:unknown=await response.json();
 if(!Array.isArray(rows)||rows.length!==1)return null;
 const row=rows[0];
 if(!row||typeof row!=='object'||typeof row.id!=='string'||!uuid.test(row.id)||row.slug!==slug||row.status!=='published')return null;
 return row.id;
}
