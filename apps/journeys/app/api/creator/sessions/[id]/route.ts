import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../lib/api/server';
import {object,uuid} from '../../../../../lib/api/validation';
import {parseCreatorSessionInput} from '../../../../../lib/creators/sessions';

const columns='id,slug,title,description,type,starts_at,duration_minutes,status,embed_url,replay_url,destination_tags,created_at,updated_at,edit_revision,edit_token';
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
  return reply({ok:true,data:{id:row.id,slug:row.slug,title:row.title,description:row.description,type:row.type,startsAt:row.starts_at,durationMinutes:row.duration_minutes,status:row.status,embedUrl:row.embed_url,replayUrl:row.replay_url,destinationTags:row.destination_tags,createdAt:row.created_at,updatedAt:row.updated_at,revision:row.edit_revision,editToken:row.edit_token}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid(id))return failure('INVALID',400);
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 let parsed:ReturnType<typeof parseCreatorSessionInput>;
 let requestId:string,expectedToken:string,expectedRevision:number;
 try{
  const body=object(await boundedBody(request,32768),['requestId','expectedToken','expectedRevision','input']);
  if(!uuid(body.requestId)||!uuid(body.expectedToken)||typeof body.expectedRevision!=='number'||!Number.isInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>2147483647)return failure('INVALID',400);
  requestId=body.requestId;expectedToken=body.expectedToken;expectedRevision=body.expectedRevision;
  parsed=parseCreatorSessionInput(body.input);
 }catch{return failure('INVALID',400);}
 try{
  const result=await ctx.client.rpc('edit_kinnso_creator_session',{p_session_id:id,p_request_id:requestId,p_expected_token:expectedToken,p_expected_revision:expectedRevision,p_input:{
   title:parsed.title,description:parsed.description,type:parsed.type,starts_at:parsed.startsAt,duration_minutes:parsed.durationMinutes,
   embed_url:parsed.embedUrl,replay_url:parsed.replayUrl,destination_tags:parsed.destinationTags,
  }});
  if(result.error){
   const message=result.error.message;
   if(message==='CONFLICT'||message==='REQUEST_ID_REUSED')return failure('CONFLICT',409);
   if(message==='SESSION_NOT_FOUND')return failure('NOT_FOUND',404);
   if(message==='FORBIDDEN')return failure('FORBIDDEN',403);
   return backendFailure(result.error);
  }
  return result.data?reply({ok:true,data:result.data}):failure('NOT_FOUND',404);
 }catch{return failure('UNAVAILABLE',503);}
}
