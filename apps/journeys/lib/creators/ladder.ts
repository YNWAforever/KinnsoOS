export const TIERS=['seed','rising','pro','elite'] as const;
export type Tier=(typeof TIERS)[number];
const thresholds=[[0,'seed'],[50,'rising'],[150,'pro'],[400,'elite']] as const;
export type TierProgress={tier:Tier;nextTier:Tier|null;points:number;pointsIntoTier:number;pointsForNext:number|null;pct:number};
const invalid=():never=>{throw Error('INVALID_LADDER')};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function progressToNext(raw:number):TierProgress{
 const points=Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
 let index=0;for(let i=0;i<thresholds.length;i++)if(points>=thresholds[i][0])index=i;
 const[tier,currentMin]=[thresholds[index][1],thresholds[index][0]],next=thresholds[index+1];
 if(!next)return{tier,nextTier:null,points,pointsIntoTier:points-currentMin,pointsForNext:null,pct:100};
 const band=next[0]-currentMin,into=points-currentMin;
 return{tier,nextTier:next[1],points,pointsIntoTier:into,pointsForNext:next[0]-points,pct:Math.min(100,Math.max(0,Math.round(into/band*100)))};
}
export function tierRank(tier:Tier){return TIERS.indexOf(tier);}

export type ActivePerk={id:string;slug:string;partnerName:string;title:string;summary:string;category:string;discountLabel:string;minTier:Tier|null;redemptionType:'code'|'link';sortOrder:number;eligible:boolean;redeemed:boolean};
export function projectPerk(row:Record<string,unknown>,storedTier:Tier,redeemed:boolean):ActivePerk{
 if(!row||typeof row.id!=='string'||!uuid.test(row.id)||typeof row.slug!=='string'||typeof row.partner_name!=='string'||typeof row.title!=='string'||typeof row.summary!=='string'||typeof row.category!=='string'||typeof row.discount_label!=='string'||!['code','link'].includes(String(row.redemption_type))||!Number.isInteger(row.sort_order))return invalid();
 const minTier=row.min_tier===null?null:TIERS.includes(row.min_tier as Tier)?row.min_tier as Tier:invalid();
 return{id:row.id,slug:row.slug,partnerName:row.partner_name,title:row.title,summary:row.summary,category:row.category,discountLabel:row.discount_label,minTier,redemptionType:row.redemption_type as 'code'|'link',sortOrder:Number(row.sort_order),eligible:minTier===null||tierRank(storedTier)>=tierRank(minTier),redeemed:Boolean(redeemed)};
}

export type ContributionEvent={id:string;eventType:'dna_scan'|'guide_published'|'mission_verified';points:number;createdAt:string};
export function validateContributionEvents(value:unknown):ContributionEvent[]{
 if(!Array.isArray(value)||value.length>50)return invalid();
 const seen=new Set<string>(),result:ContributionEvent[]=[];
 for(const item of value){
  if(!item||typeof item!=='object')return invalid();const row=item as Record<string,unknown>;
  if(typeof row.id!=='string'||!uuid.test(row.id)||seen.has(row.id)||!['dna_scan','guide_published','mission_verified'].includes(String(row.eventType))||!Number.isInteger(row.points)||Number(row.points)<0||typeof row.createdAt!=='string'||Number.isNaN(Date.parse(row.createdAt)))return invalid();
  seen.add(row.id);result.push({id:row.id,eventType:row.eventType as ContributionEvent['eventType'],points:Number(row.points),createdAt:row.createdAt});
 }
 return result;
}

export function nextTierPerks(progress:TierProgress,perks:ActivePerk[]){
 if(progress.nextTier===null)return[];
 return perks.filter(perk=>perk.minTier===progress.nextTier).map(perk=>({title:perk.title,partnerName:perk.partnerName}));
}
