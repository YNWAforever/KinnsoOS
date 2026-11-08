import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {nextTierPerks,progressToNext,projectPerk,TIERS,validateContributionEvents,type Tier} from '../../../../lib/creators/ladder';

export async function GET(request:Request){
 const ctx=await apiContext(request,'creator');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('creator'))return failure('FORBIDDEN',403);
 if(new URL(request.url).search)return failure('INVALID',400);
 try{
  const[contribution,events,perks]=await Promise.all([
   ctx.client.from('creator_contribution').select('contribution_points,tier').eq('creator_id',ctx.actor.id).maybeSingle(),
   ctx.client.from('creator_contribution_events').select('id,event_type,points,created_at').eq('creator_id',ctx.actor.id).order('created_at',{ascending:false}).limit(50),
   ctx.client.rpc('list_active_perks'),
  ]);
  if(contribution.error||events.error)return backendFailure(contribution.error??events.error);
  const progress=progressToNext(contribution.data?.contribution_points??0);
  const normalized=validateContributionEvents((events.data??[]).map((row:Record<string,unknown>)=>({id:row.id,eventType:row.event_type,points:row.points,createdAt:row.created_at})));
  let projected:ReturnType<typeof projectPerk>[]=[],perksAvailable=true;
  if(perks.error)perksAvailable=false;else try{
  const tier=TIERS.includes(contribution.data?.tier as Tier)?(contribution.data?.tier as Tier):'seed';
   projected=((perks.data??[]) as Record<string,unknown>[]).map(row=>projectPerk(row,tier,false));
  }catch{perksAvailable=false;}
  return reply({ok:true,data:{progress,events:normalized,nextTierPerks:perksAvailable?nextTierPerks(progress,projected):[],perksAvailable}});
 }catch{return failure('UNAVAILABLE',503);}
}
