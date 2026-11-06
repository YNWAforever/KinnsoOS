import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../../../lib/api/server';
import {object,uuid} from '../../../../../../lib/api/validation';
import {isActiveMerchantOwner} from '../../../../../../lib/merchants/offer-authorization';

const states=new Set(['live','paused','ended']);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const{id}=await params;if(!uuid(id))return failure('INVALID',400);
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let company:string,status:string;
 try{const body=object(await boundedBody(request,8192),['requestId','company','status']);if(!uuid(body.requestId)||!uuid(body.company)||!states.has(String(body.status)))return failure('INVALID',400);company=body.company;status=String(body.status);}catch{return failure('INVALID',400);}
 if(!await isActiveMerchantOwner(ctx.client,ctx.actor,company))return failure('FORBIDDEN',403);
 try{
  const result=await ctx.client.from('merchant_offers').update({status}).eq('id',id).eq('merchant_profile_id',company).select('id,status,updated_at').maybeSingle();
  if(result.error)return backendFailure(result.error);
  return result.data?reply({ok:true,data:result.data}):failure('NOT_FOUND',404);
 }catch{return failure('UNAVAILABLE',503);}
}
