import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {isActiveMerchantOwner} from '../../../../lib/merchants/offer-authorization';
import {parseMerchantOffer,summarizeMerchantOffers} from '../../../../lib/merchants/offers';

const columns='id,title,terms,discount_kind,discount_value,commission_kind,commission_value,valid_from,valid_to,per_visitor_limit,total_cap,claimed_count,redeemed_count,status,created_at,updated_at';
const project=(row:Record<string,unknown>)=>({id:row.id,title:row.title,terms:row.terms,discountKind:row.discount_kind,discountValue:row.discount_value,commissionKind:row.commission_kind,commissionValue:row.commission_value,validFrom:row.valid_from,validTo:row.valid_to,perVisitorLimit:row.per_visitor_limit,totalCap:row.total_cap,claimedCount:row.claimed_count,redeemedCount:row.redeemed_count,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at});
function companyQuery(request:Request){
 const params=new URL(request.url).searchParams;if([...params.keys()].some(key=>key!=='company'||params.getAll(key).length!==1))return null;
 const value=params.get('company');return value&&uuid(value)?value:null;
}
export async function GET(request:Request){
 const company=companyQuery(request);if(!company)return failure('INVALID',400);
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 if(!await isActiveMerchantOwner(ctx.client,ctx.actor,company))return failure('FORBIDDEN',403);
 try{
  const result=await ctx.client.from('merchant_offers').select(columns).eq('merchant_profile_id',company).order('created_at',{ascending:false}).limit(26);
  if(result.error)return backendFailure(result.error);
  const rows=((result.data??[]) as Record<string,unknown>[]).map(project),items=rows.slice(0,25);
  return reply({ok:true,data:{items,summary:summarizeMerchantOffers(items.map(row=>({claimedCount:Number(row.claimedCount),redeemedCount:Number(row.redeemedCount)}))),truncated:rows.length>25}});
 }catch{return failure('UNAVAILABLE',503);}
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let requestId:string,company:string,parsed:ReturnType<typeof parseMerchantOffer>;
 try{const body=object(await boundedBody(request,32768),['requestId','company','input']);if(!uuid(body.requestId)||!uuid(body.company))return failure('INVALID',400);requestId=body.requestId;company=body.company;parsed=parseMerchantOffer(body.input);}catch{return failure('INVALID',400);}
 if(!await isActiveMerchantOwner(ctx.client,ctx.actor,company))return failure('FORBIDDEN',403);
 try{
  const result=await ctx.client.from('merchant_offers').insert({id:requestId,merchant_profile_id:company,mission_id:parsed.missionId,title:parsed.title,terms:parsed.terms,discount_kind:parsed.discountKind,discount_value:parsed.discountValue,commission_kind:parsed.commissionKind,commission_value:parsed.commissionValue,valid_from:parsed.validFrom,valid_to:parsed.validTo,per_visitor_limit:parsed.perVisitorLimit,total_cap:parsed.totalCap}).select('id,title,status').single();
  if(!result.error)return reply({ok:true,data:result.data},201);
  if(result.error.code!=='23505')return backendFailure(result.error);
  const existing=await ctx.client.from('merchant_offers').select('id,title,status').eq('id',requestId).eq('merchant_profile_id',company).maybeSingle();
  if(existing.error)return backendFailure(existing.error);
  return existing.data?reply({ok:true,data:existing.data}):failure('CONFLICT',409);
 }catch{return failure('UNAVAILABLE',503);}
}
