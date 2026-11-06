import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {projectPerk,TIERS,type Tier} from '../../../../lib/creators/ladder';

export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 if(new URL(request.url).search)return failure('INVALID',400);
 try{
  const[contribution,perks,redemptions]=await Promise.all([
   ctx.client.from('creator_contribution').select('tier').eq('creator_id',ctx.actor.id).maybeSingle(),
   ctx.client.rpc('list_active_perks'),
   ctx.client.from('perk_redemptions').select('perk_id').eq('creator_id',ctx.actor.id),
  ]);
  if(contribution.error||perks.error||redemptions.error)return backendFailure(contribution.error??perks.error??redemptions.error);
  const tier=TIERS.includes(contribution.data?.tier as Tier)?(contribution.data?.tier as Tier):'seed';
  const redeemed=new Set<string>(((redemptions.data??[]) as Record<string,unknown>[]).map(row=>String(row.perk_id)));
  const items=((perks.data??[]) as Record<string,unknown>[]).map(row=>projectPerk(row,tier,redeemed.has(String(row.id))));
  return reply({ok:true,data:{tier,items}});
 }catch{return failure('UNAVAILABLE',503);}
}

export async function POST(request:Request){
 const ctx=await apiContext(request,'creator',true);if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 let body:Record<string,unknown>;
 try{body=object(await boundedBody(request,8192),['requestId','perkId']);if(!uuid(body.requestId)||!uuid(body.perkId))return failure('INVALID',400);}catch{return failure('INVALID',400);}
 try{
  const result=await ctx.client.rpc('redeem_perk',{p_perk_id:body.perkId});
  if(result.error){if(/below_tier/.test(result.error.message??''))return failure('FORBIDDEN',403);if(/perk_not_found/.test(result.error.message??''))return failure('NOT_FOUND',404);return backendFailure(result.error);}
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  if(!row||!['code','link'].includes(row.redemption_type)||typeof row.redemption_value!=='string')return failure('CONFLICT',409);
  return reply({ok:true,data:{redemptionType:row.redemption_type,value:row.redemption_value}});
 }catch{return failure('UNAVAILABLE',503);}
}
