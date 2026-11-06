import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
import {parseCreatorSessionInput} from '../../../../../lib/creators/sessions';

const columns='id,slug,title,description,type,starts_at,duration_minutes,status,embed_url,replay_url,destination_tags,created_at,updated_at';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid(id))return failure('INVALID',400);
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 try{
  const result=await ctx.client.from('community_sessions').select(columns).eq('id',id).eq('host_creator_id',ctx.actor.id).maybeSingle();
  if(result.error)return backendFailure(result.error);
  if(!result.data)return failure('NOT_FOUND',404);
  const row=result.data as Record<string,unknown>;
  return reply({ok:true,data:{id:row.id,slug:row.slug,title:row.title,description:row.description,type:row.type,startsAt:row.starts_at,durationMinutes:row.duration_minutes,status:row.status,embedUrl:row.embed_url,replayUrl:row.replay_url,destinationTags:row.destination_tags,createdAt:row.created_at,updatedAt:row.updated_at}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid(id))return failure('INVALID',400);
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 let parsed:ReturnType<typeof parseCreatorSessionInput>;
 try{
  const body=object(await boundedBody(request,32768),['requestId','input']);
  if(!uuid(body.requestId))return failure('INVALID',400);
  parsed=parseCreatorSessionInput(body.input);
 }catch{return failure('INVALID',400);}
 try{
  const result=await ctx.client.from('community_sessions').update({
   title:parsed.title,description:parsed.description,type:parsed.type,starts_at:parsed.startsAt,duration_minutes:parsed.durationMinutes,
   embed_url:parsed.embedUrl,replay_url:parsed.replayUrl,destination_tags:parsed.destinationTags,
  }).eq('id',id).eq('host_creator_id',ctx.actor.id).select('id,updated_at').maybeSingle();
  if(result.error)return backendFailure(result.error);
  return result.data?reply({ok:true,data:result.data}):failure('NOT_FOUND',404);
 }catch{return failure('UNAVAILABLE',503);}
}
