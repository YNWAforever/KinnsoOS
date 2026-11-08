import {revalidatePath} from 'next/cache';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {parseOpsRecordAction} from '../../../../lib/ops/record-actions';

function mutationFailure(message=''){
 if(/forbidden/.test(message))return failure('FORBIDDEN',403);
 if(/not_found/.test(message))return failure('NOT_FOUND',404);
 if(/bad_transition|no_change|not_banned/.test(message))return failure('CONFLICT',409);
 if(/bad_status|bad_tier|reason_required|reason_too_long/.test(message))return failure('INVALID',400);
 return failure('UNAVAILABLE',503);
}

export async function POST(request:Request){
 const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 const authority=await ctx.client.rpc('is_active_ops_role',{p_min:'moderator'});
 if(authority.error)return backendFailure(authority.error);
 if(authority.data!==true)return failure('FORBIDDEN',403);
 let action:ReturnType<typeof parseOpsRecordAction>;
 try{action=parseOpsRecordAction(await boundedBody(request,8192));}catch{return failure('INVALID',400);}
 const result=await (()=>{
  switch(action.action){
   case 'setCreatorStatus':return ctx.client.rpc('admin_set_creator_status',{p_id:action.id,p_status:action.status,p_reason:action.reason});
   case 'setCreatorVerified':return ctx.client.rpc('admin_set_creator_verified',{p_id:action.id,p_verified:action.verified,p_reason:action.reason});
   case 'setCreatorListed':return ctx.client.rpc('admin_set_creator_listed',{p_id:action.id,p_is_listed:action.listed,p_reason:action.reason});
   case 'addCreatorNote':return ctx.client.rpc('admin_add_creator_note',{p_id:action.id,p_note:action.reason});
   case 'setMerchantStatus':return ctx.client.rpc('admin_set_merchant_status',{p_id:action.id,p_status:action.status,p_reason:action.reason});
   case 'setMerchantTier':return ctx.client.rpc('admin_set_merchant_tier',{p_id:action.id,p_tier:action.tier,p_reason:action.reason});
   case 'addMerchantNote':return ctx.client.rpc('admin_add_merchant_note',{p_id:action.id,p_note:action.reason});
  }
 })();
 if(result.error)return mutationFailure(result.error.message);
 for(const path of ['/ops','/creators','/merchants']){
  try{revalidatePath(`/${action.locale}/${path}`);}catch{/* A committed audited write remains successful if cache invalidation is unavailable. */}
 }
 try{revalidatePath('/sitemap.xml');}catch{}
 return reply({ok:true,data:{action:action.action,id:action.id}});
}
