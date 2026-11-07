import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../../lib/api/server';
import {object,uuid} from '../../../../../../lib/api/validation';
import {canSetSessionStatus} from '../../../../../../lib/creators/sessions';

type Status='live'|'ended'|'cancelled';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid(id))return failure('INVALID',400);
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 let status:Status;
 try{
  const body=object(await boundedBody(request,8192),['requestId','status']);
  if(!uuid(body.requestId)||!['live','ended','cancelled'].includes(String(body.status)))return failure('INVALID',400);
  status=body.status as Status;
 }catch{return failure('INVALID',400);}
 try{
  const current=await ctx.client.from('community_sessions').select('embed_url,status').eq('id',id).eq('host_creator_id',ctx.actor.id).maybeSingle();
  if(current.error)return backendFailure(current.error);
  if(!current.data)return failure('NOT_FOUND',404);
  if(!canSetSessionStatus(current.data.status,{embedUrl:current.data.embed_url},status))return failure('CONFLICT',409);
  const result=await ctx.client.from('community_sessions').update({status}).eq('id',id).eq('host_creator_id',ctx.actor.id).select('id,status,updated_at,edit_revision').maybeSingle();
  if(result.error)return backendFailure(result.error);
  return result.data?reply({ok:true,data:result.data}):failure('NOT_FOUND',404);
 }catch{return failure('UNAVAILABLE',503);}
}
