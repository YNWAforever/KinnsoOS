import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {parseCreatorSessionInput,sessionSlug} from '../../../../lib/creators/sessions';

const columns='id,slug,title,description,type,starts_at,duration_minutes,status,embed_url,replay_url,destination_tags,created_at,updated_at';
const project=(row:Record<string,unknown>)=>({id:row.id,slug:row.slug,title:row.title,description:row.description,type:row.type,startsAt:row.starts_at,durationMinutes:row.duration_minutes,status:row.status,embedUrl:row.embed_url,replayUrl:row.replay_url,destinationTags:row.destination_tags,createdAt:row.created_at,updatedAt:row.updated_at});

export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 const params=new URL(request.url).searchParams,cursor=params.get('cursor');
 if([...params.keys()].some(key=>key!=='cursor')||params.getAll('cursor').length>1||(cursor!==null&&!uuid(cursor)))return failure('INVALID',400);
 try{
  let boundary:string|null=null;
  if(cursor){
   // Resolve the boundary only in the caller's own rows. Use the database
   // timestamp as-is so sub-millisecond ordering survives the next page.
   const anchor=await ctx.client.from('community_sessions').select('starts_at').eq('host_creator_id',ctx.actor.id).eq('id',cursor).maybeSingle();
   if(anchor.error)return backendFailure(anchor.error);
   const startsAt=anchor.data?.starts_at;
   if(typeof startsAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(startsAt))return failure('INVALID',400);
   boundary=`starts_at.lt.${startsAt},and(starts_at.eq.${startsAt},id.lt.${cursor})`;
  }
  let query=ctx.client.from('community_sessions').select(columns).eq('host_creator_id',ctx.actor.id);
  if(boundary)query=query.or(boundary);
  const result=await query.order('starts_at',{ascending:false}).order('id',{ascending:false}).limit(26);
  if(result.error)return backendFailure(result.error);
  const rows=(result.data??[]) as Record<string,unknown>[];
  const visible=rows.slice(0,25),last=visible.at(-1);
  return reply({ok:true,data:{items:visible.map(project),nextCursor:rows.length>25&&last?{startsAt:last.starts_at,id:last.id}:null}});
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
