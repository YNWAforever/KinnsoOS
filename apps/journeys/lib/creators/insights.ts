export type InsightsClient={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data?:unknown;error?:unknown}>};
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('insights_schema');return value as Record<string,unknown>;}
function integer(value:unknown,signed=false):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||(!signed&&value<0))throw Error('insights_schema');return value;}
// Mirrors contribution_tier_for_points and the preserved legacy ladder.
export function contributionProgress(points:number){
 const value=Math.max(0,integer(points,true)),tiers=[{tier:'seed',min:0},{tier:'rising',min:50},{tier:'pro',min:150},{tier:'elite',min:400}];
 const index=tiers.findLastIndex(t=>value>=t.min),tier=tiers[index],next=tiers[index+1];
 return{tier:tier.tier,nextTier:next?.tier??null,pointsForNext:next?next.min-value:null,pct:next?Math.round(100*(value-tier.min)/(next.min-tier.min)):100};
}
export function creatorInsights(value:unknown){
 const raw=record(value),types=record(raw.points_by_type),statuses=record(raw.missions_by_status);
 const pointsTotal=integer(raw.points_total,true);let running=integer(raw.points_before_window,true),previous='';
 if(!Array.isArray(raw.points_trajectory)||raw.points_trajectory.length>13)throw Error('insights_schema');
 const trajectory=raw.points_trajectory.map(value=>{const row=record(value),date=row.week_start;if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||date<=previous)throw Error('insights_schema');previous=date;running=integer(running+integer(row.points,true),true);return{weekStart:date,cumulative:running};});
 return{pointsTotal,tier:contributionProgress(pointsTotal),trajectory,
 pointsByType:{dna_scan:integer(types.dna_scan??0,true),guide_published:integer(types.guide_published??0,true),mission_verified:integer(types.mission_verified??0,true)},
 guidesPublished:integer(raw.guides_published),guideSavesTotal:integer(raw.guide_saves_total),submissionsApproved:integer(raw.submissions_approved),visitsDriven:integer(raw.visits_driven),
 missionsByStatus:{applied:integer(statuses.applied??0),active:integer(statuses.active??0),invited:integer(statuses.invited??0),rejected:integer(statuses.rejected??0)}};
}
/** Fresh user client, never cached: creator_insights scopes every aggregate to auth.uid(). */
export async function readCreatorInsights(client:InsightsClient|null,actorId:string|null){
 if(!client||!actorId)throw Error('insights_unavailable');
 const actor=await client.rpc('kinnso_actor',{});
 if(actor.error||!actor.data||record(actor.data).id!==actorId)throw Error('insights_unavailable');
 const response=await client.rpc('creator_insights',{});
 if(response.error||!response.data)throw Error('insights_unavailable');
 return creatorInsights(response.data);
}
