import {revalidatePath} from 'next/cache';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {parseOpsContentAction} from '../../../../lib/ops/content-actions';

function mutationFailure(message=''){
 if(/forbidden/.test(message))return failure('FORBIDDEN',403);
 if(/not_found|enquiry_not_found/.test(message))return failure('NOT_FOUND',404);
 if(/no_change|conflict|request_id_reused/.test(message))return failure('CONFLICT',409);
 if(/invalid_|reason_required|too_long|bad_/.test(message))return failure('INVALID',400);
 return failure('UNAVAILABLE',503);
}
function refresh(action:ReturnType<typeof parseOpsContentAction>){
 const paths=action.action.includes('Session')?['/ops','/sessions']:action.action.includes('Perk')?['/ops','/studio/perks']:action.action.includes('Testimonial')?['/ops','/for-creators','/for-merchants']:['/ops'];
 for(const path of paths)try{revalidatePath(`/${action.locale}${path}`);}catch{}
}

export async function POST(request:Request){
 const ctx=await apiContext(request,'ops',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 const authority=await ctx.client.rpc('is_active_ops_role',{p_min:'moderator'});
 if(authority.error)return backendFailure(authority.error);
 if(authority.data!==true)return failure('FORBIDDEN',403);
 let action:ReturnType<typeof parseOpsContentAction>;
 try{action=parseOpsContentAction(await boundedBody(request,32768));}catch{return failure('INVALID',400);}
 try{
  if(action.action==='createSession'){
   const result=await ctx.client.rpc('admin_create_community_session',{
    p_request_id:action.requestId,p_host_creator_id:action.hostCreatorId,p_title:action.title,p_description:action.description,p_type:action.type,p_starts_at:action.startsAt,p_duration_minutes:action.durationMinutes,p_embed_url:action.embedUrl||null,p_replay_url:action.replayUrl||null,p_destination_tags:action.destinationTags,
   });
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data},201);
  }
  if(action.action==='setSessionStatus'){
   const result=await ctx.client.rpc('admin_set_community_session_status',{p_id:action.id,p_status:action.status});
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data});
  }
  if(action.action==='createPerk'){
   const result=await ctx.client.rpc('admin_create_partner_perk',{
    p_request_id:action.requestId,p_partner_name:action.partnerName,p_title:action.title,p_summary:action.summary,p_category:action.category,p_discount_label:action.discountLabel,p_min_tier:action.minTier,p_redemption_type:action.redemptionType,p_redemption_value:action.redemptionValue,p_sort_order:action.sortOrder,p_active:action.active,
   });
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data},201);
  }
  if(action.action==='setPerkActive'){
   const result=await ctx.client.rpc('admin_set_partner_perk_active',{p_id:action.id,p_active:action.active});
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data});
  }
  if(action.action==='createTestimonial'){
   const result=await ctx.client.rpc('admin_create_testimonial',{
    p_request_id:action.requestId,p_quote:action.quote,p_author_name:action.authorName,p_author_role:action.authorRole,p_content_locale:action.contentLocale,p_sort_order:action.sortOrder,
   });
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data},201);
  }
  if(action.action==='setTestimonialStatus'){
   const result=await ctx.client.rpc('admin_set_testimonial_status',{p_id:action.id,p_status:action.status});
   if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:result.data});
  }
  const result=await ctx.client.rpc('admin_set_enquiry_status',{p_id:action.id,p_status:action.status,p_reason:action.reason||null});if(result.error)return mutationFailure(result.error.message);refresh(action);return reply({ok:true,data:{id:action.id,status:action.status}});
 }catch{return failure('UNAVAILABLE',503);}
}
