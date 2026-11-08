import { backendTarget, type Environment } from '../contracts/capabilities.ts';
import { readPublicRows } from './public-http.ts';
import { sanitizePublicTerms } from './public-terms.ts';

export type PublicGuideCard = {
  id: string;
  title: string;
  summary: string;
  city: string;
  coverUrl: string | null;
  creatorHandle: string | null;
  savesCount: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const handle = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('guide_schema');
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('guide_schema');
  return value;
}

function nullableText(value: unknown, max: number): string | null {
  if (value === null) return null;
  return text(value, max);
}

function image(value: unknown): string | null {
  if (value === null) return null;
  try {
    const url = new URL(text(value, 2_048));
    return url.origin === 'https://cdn.kinnso.ai' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('guide_schema');
  }
  return value;
}

export function projectPublicGuideCard(value: unknown): PublicGuideCard {
  const row = record(value);
  const id = text(row.id, 64);
  const title = text(row.title, 500);
  const city = text(row.city, 500);
  const publishedAt = text(row.published_at, 100);
  const creatorHandle = nullableText(row.creator_handle, 80);
  if (
    !uuid.test(id) ||
    !title.trim() ||
    !city.trim() ||
    !Number.isFinite(Date.parse(publishedAt)) ||
    (creatorHandle !== null && !handle.test(creatorHandle))
  ) {
    throw new Error('guide_schema');
  }
  return {
    id,
    title,
    summary: nullableText(row.summary, 50_000) ?? '',
    city,
    coverUrl: image(row.cover_url),
    creatorHandle,
    savesCount: integer(row.saves_count),
  };
}

export async function readActiveCreatorIds(ids: readonly string[],target:{origin:string;key:string},transport:typeof fetch):Promise<Set<string>>{
 const checked=[...new Set(ids.filter(id=>uuid.test(id)))];
 if(!checked.length)return new Set();
 const url=new URL('/rest/v1/creators',target.origin);
 url.search=new URLSearchParams({select:'id',id:`in.(${checked.join(',')})`,status:'eq.active',public_profile:'not.is.null',limit:String(checked.length+1)}).toString();
 const rows=await readPublicRows(url,target.key,transport,undefined,{unavailableCode:'guide_unavailable',schemaCode:'guide_schema'});
 if(rows.length>checked.length)throw new Error('guide_schema');
 const active=new Set<string>();
 for(const value of rows){
  const row=record(value),id=text(row.id,64);
  if(!uuid.test(id)||!checked.includes(id))throw new Error('guide_schema');
  active.add(id);
 }
 return active;
}

export async function readPublicGuidesForTerms(
  terms: readonly string[],
  limit: number,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicGuideCard[]> {
  const clean = sanitizePublicTerms(terms);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 6 || !clean.length) return [];
  const target = backendTarget(env);
  if (!target) throw new Error('guide_unconfigured');
  const url = new URL('/rest/v1/guides', target.origin);
  url.search = new URLSearchParams({
    select: 'id,title,summary,city,cover_url,creator_handle,saves_count,published_at,creator_id',
    status: 'eq.published',
    or: `(${clean.map(term => `city.ilike.%${term}%`).join(',')})`,
    order: 'published_at.desc.nullslast,id.asc',
    limit: String(limit),
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'guide_unavailable',
    schemaCode: 'guide_schema',
  });
  if (rows.length > limit) throw new Error('guide_schema');
  const seen = new Set<string>(),cards=[];
  for(const value of rows){
    try {
      const creatorId=text(record(value).creator_id,64);
      if(!uuid.test(creatorId))continue;
      const guide = projectPublicGuideCard(value);
      if (seen.has(guide.id)) continue;
      seen.add(guide.id);
      cards.push({guide,creatorId});
    } catch {
      continue;
    }
  }
  const active=await readActiveCreatorIds(cards.map(value=>value.creatorId),target,transport);
  return cards.filter(value=>active.has(value.creatorId)).map(value=>value.guide);
}
