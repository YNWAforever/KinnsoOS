import type {SupabaseClient} from '@supabase/supabase-js';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {APPLICATION_REVIEW_COLUMNS,APPLICATION_REVIEW_PAGE_SIZE,merchantApplicationDecision,merchantApplicationFromRow,merchantApplicationReviewQuery,type MerchantApplicationRow} from '../../../../lib/merchants/application-review';

async function moderatorContext(request:Request,write=false){
 const ctx=await apiContext(request,'ops',write);if(ctx.response)return ctx;
 if(!Array.isArray(ctx.actor.roles)||!ctx.actor.roles.includes('ops'))return{response:failure('FORBIDDEN',403)} as const;
 const role=await ctx.client.rpc('is_active_ops_role',{p_min:'moderator'});
 if(role.error)return{response:backendFailure(role.error)} as const;
 if(role.data!==true)return{response:failure('FORBIDDEN',403)} as const;
 return ctx;
}
const currentApplication=(client:SupabaseClient,id:string)=>client.from('merchant_applications').select(APPLICATION_REVIEW_COLUMNS).eq('id',id).maybeSingle();
const unknownOutcome=()=>reply({ok:false,code:'UNAVAILABLE',retryable:false,requestId:crypto.randomUUID()},503);

export async function GET(request:Request){
 try{
  const ctx=await moderatorContext(request);if(ctx.response)return ctx.response;
  let scope;try{scope=merchantApplicationReviewQuery(new URL(request.url).searchParams);}catch{return failure('INVALID',400);}
  if(scope.id){const result=await currentApplication(ctx.client,scope.id);if(result.error)return backendFailure(result.error);return result.data?reply({ok:true,data:merchantApplicationFromRow(result.data as unknown as MerchantApplicationRow)}):failure('NOT_FOUND',404);}
  let query=ctx.client.from('merchant_applications').select(APPLICATION_REVIEW_COLUMNS).eq('status','pending').order('created_at',{ascending:true}).order('id',{ascending:true}).limit(APPLICATION_REVIEW_PAGE_SIZE+1);
  if(scope.cursor)query=query.or(`created_at.gt.${scope.cursor.createdAt},and(created_at.eq.${scope.cursor.createdAt},id.gt.${scope.cursor.id})`);
  const result=await query;if(result.error)return backendFailure(result.error);
  const rows=(result.data??[]) as unknown as MerchantApplicationRow[],page=rows.slice(0,APPLICATION_REVIEW_PAGE_SIZE),last=page.at(-1);
  return reply({ok:true,data:{applications:page.map(merchantApplicationFromRow),nextCursor:rows.length>APPLICATION_REVIEW_PAGE_SIZE&&last?{createdAt:last.created_at,id:last.id}:null}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function POST(request:Request){
 try{
  const ctx=await moderatorContext(request,true);if(ctx.response)return ctx.response;
  let decision;try{if(new URL(request.url).search)throw Error('INVALID');decision=merchantApplicationDecision(await boundedBody(request,8192));}catch{return failure('INVALID',400);}
  const result=await ctx.client.rpc(decision.action==='approve'?'admin_approve_merchant_application':'admin_reject_merchant_application',{p_id:decision.id,p_reason:decision.reason});
  if(result.error&&result.error.message!=='not_pending'){
   const message=result.error.message;
   if(message==='not_found')return failure('NOT_FOUND',404);
   if(message==='already_merchant')return failure('CONFLICT',409);
   if(message==='reason_required'||message==='reason_too_long')return failure('INVALID',400);
   if(message==='forbidden'||result.error.code==='42501')return failure('FORBIDDEN',403);
   return unknownOutcome();
  }
  // A lost acknowledgement or a concurrent decision is resolved from persisted state.
  // Never report the requested action as successful merely because the RPC returned.
  const persisted=await currentApplication(ctx.client,decision.id);
  if(persisted.error||!persisted.data||!['approved','rejected'].includes(persisted.data.status))return unknownOutcome();
  return reply({ok:true,data:merchantApplicationFromRow(persisted.data as unknown as MerchantApplicationRow)});
 }catch{return unknownOutcome();}
}
