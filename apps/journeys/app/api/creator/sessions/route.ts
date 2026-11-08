import {createHmac,timingSafeEqual} from 'node:crypto';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {parseCreatorSessionInput,sessionSlug} from '../../../../lib/creators/sessions';

const columns='id,slug,title,description,type,starts_at,duration_minutes,status,embed_url,replay_url,destination_tags,created_at,updated_at';
const project=(row:Record<string,unknown>)=>({id:row.id,slug:row.slug,title:row.title,description:row.description,type:row.type,startsAt:row.starts_at,durationMinutes:row.duration_minutes,status:row.status,embedUrl:row.embed_url,replayUrl:row.replay_url,destinationTags:row.destination_tags,createdAt:row.created_at,updatedAt:row.updated_at});

const cursorTimestamp=/^\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const cursorFormat=/^[A-Za-z0-9_-]{1,116}\.[A-Za-z0-9_-]{43}$/;
const cursorKey=()=>[process.env.KINNSO_AUTH_RECOVERY_SECRET,process.env.KINNSO_SUPABASE_SECRET_KEY].find(key=>key&&key.length>=32);
const cursorTag=(encoded:string,actorId:string,key:string)=>createHmac('sha256',key)
 .update('kinnso-creator-sessions-v1:'+actorId+':'+encoded).digest('base64url');
const encodeCursor=(id:string,startsAt:string)=>Buffer.from(JSON.stringify([id,startsAt])).toString('base64url');

function readCursor(token:string,actorId:string,key:string){
 const [encoded,tag]=token.split('.');
 if(!timingSafeEqual(Buffer.from(tag),Buffer.from(cursorTag(encoded,actorId,key))))return null;
 try{
  const tuple:unknown=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(!Array.isArray(tuple)||tuple.length!==2)return null;
  const [id,startsAt]=tuple;
  if(!uuid(id)||id!==id.toLowerCase()||typeof startsAt!=='string'||!cursorTimestamp.test(startsAt)||
     encodeCursor(id,startsAt)!==encoded)return null;
  return {id,startsAt};
 }catch{return null;}
}

export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 const params=new URL(request.url).searchParams,token=params.get('cursor');
 if([...params.keys()].some(key=>key!=='cursor')||params.getAll('cursor').length>1||(token!==null&&!cursorFormat.test(token)))return failure('INVALID',400);
 try{
  const key=cursorKey(),actorId=ctx.actor.id;
  let cursor:ReturnType<typeof readCursor>=null;
  if(token){
   if(!key)return failure('UNAVAILABLE',503);
   cursor=readCursor(token,actorId,key);
   if(!cursor)return failure('INVALID',400);
   // Verify current ownership without replacing the signed sort boundary.
   const anchor=await ctx.client.from('community_sessions').select('id').eq('host_creator_id',actorId).eq('id',cursor.id).maybeSingle();
   if(anchor.error)return backendFailure(anchor.error);
   if(!anchor.data)return failure('INVALID',400);
  }
  let query=ctx.client.from('community_sessions').select(columns).eq('host_creator_id',actorId);
  if(cursor){
   const {id,startsAt}=cursor;
   // A rescheduled boundary row may now fall below its original position.
   query=query.neq('id',id).or(`starts_at.lt.${startsAt},and(starts_at.eq.${startsAt},id.lt.${id})`);
  }
  const result=await query.order('starts_at',{ascending:false}).order('id',{ascending:false}).limit(26);
  if(result.error)return backendFailure(result.error);
  const rows=(result.data??[]) as Record<string,unknown>[];
  const visible=rows.slice(0,25),last=visible.at(-1);
  let nextCursor:string|null=null;
  if(rows.length>25&&last){
   if(!key||!uuid(last.id)||typeof last.starts_at!=='string'||!cursorTimestamp.test(last.starts_at))return failure('UNAVAILABLE',503);
   const encoded=encodeCursor(last.id.toLowerCase(),last.starts_at);
   nextCursor=encoded+'.'+cursorTag(encoded,actorId,key);
  }
  return reply({ok:true,data:{items:visible.map(project),nextCursor}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function POST(request:Request){
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 let requestId:string,parsed:ReturnType<typeof parseCreatorSessionInput>;
 try{
  const body=object(await boundedBody(request,32768),['requestId','input']);
  if(!uuid(body.requestId))return failure('INVALID',400);
  requestId=body.requestId;parsed=parseCreatorSessionInput(body.input);
 }catch{return failure('INVALID',400);}
 try{
  const response=await ctx.client.from('community_sessions').insert({
   id:requestId,host_creator_id:ctx.actor.id,slug:sessionSlug(parsed.title,requestId.slice(0,6)),
   title:parsed.title,description:parsed.description,type:parsed.type,starts_at:parsed.startsAt,duration_minutes:parsed.durationMinutes,
   embed_url:parsed.embedUrl,replay_url:parsed.replayUrl,destination_tags:parsed.destinationTags,
  }).select('id,slug').single();
  if(!response.error)return reply({ok:true,data:response.data},201);
  if(response.error.code!=='23505')return backendFailure(response.error);
  const existing=await ctx.client.from('community_sessions').select('id,slug').eq('id',requestId).eq('host_creator_id',ctx.actor.id).maybeSingle();
  if(existing.error)return backendFailure(existing.error);
  return existing.data?reply({ok:true,data:existing.data}):failure('CONFLICT',409);
 }catch{return failure('UNAVAILABLE',503);}
}
