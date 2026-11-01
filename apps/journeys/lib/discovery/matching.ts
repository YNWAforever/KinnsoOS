import type {TripIntent,PublishedOfferContext,MatchCandidate,MatchChoice,MatchResult} from './contracts.ts';
import {grantFor} from './offers.ts';
import {dateRange,localDate} from './intents.ts';
export function priceMinor(amount:string|null):number|null{if(amount===null)return null;if(typeof amount!=='string'||!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(amount))throw Error('INVALID');const [major,decimal='']=amount.split('.');return Number(major)*100+Number(decimal.padEnd(2,'0'));}
/** Pure policy. Scores are sorting weights, never probabilities or missing-data measurements. */
export function evaluateOffer(intent:TripIntent,offer:PublishedOfferContext,now:Date):MatchCandidate{
 const {publication:p,import:i,link}=offer,f=i.fields;
 const result:MatchCandidate={publicationId:p.id,publicationRevision:p.revision,contentVersion:p.contentVersion,grantVersions:[],eligibility:'excluded',score:0,scoreBreakdown:{city:0,dates:0,interests:0,budget:0,language:0},reasons:[],missing:[],coverage:0,observedAt:i.observedAt,sourceRevision:i.sourceRevision,checkedAt:offer.checkedAt};
 const excluded=(why:string)=>({...result,reasons:[why]});
 const catalog=grantFor(p,offer.grants,'catalog',now),matching=grantFor(p,offer.grants,'matching',now);
 if(p.status!=='published'||link.status!=='active'||!catalog||!matching)return excluded('展示或配對授權未核對');
 if(offer.sourceState!=='current'||!Number.isFinite(Date.parse(offer.checkedAt))||+now-Date.parse(offer.checkedAt)>60000||Date.parse(offer.checkedAt)>+now+1000)return excluded('來源需要商戶重新核對');
 if(f.sourceStatus!=='confirmed'||localDate(now,p.dateTimeZone)>f.validUntil)return excluded('優惠已到期或已撤回');
 if(intent.cityKey!==p.cityKey)return excluded('目的地不符');
 const dates=dateRange(intent.dateSpec);if(dates&&(dates.end<f.validFrom||dates.start>f.validUntil))return excluded('優惠日期不符');
 const minor=priceMinor(f.priceAmount),budgetKnown=intent.budget!==null&&minor!==null&&f.currency===intent.budget.currency&&p.priceBasis==='per_person';
 if(budgetKnown&&minor!>intent.budget!.maxPerPersonMinor)return excluded('超過所選每人預算');
 result.eligibility='eligible';result.scoreBreakdown.city=30;result.coverage=1;result.reasons.push('符合目的地');
 if(!dates){result.eligibility='needs_confirmation';result.missing.push('旅程日期尚未決定');}
 else{result.coverage++;const full=dates.start>=f.validFrom&&dates.end<=f.validUntil;result.scoreBreakdown.dates=full?25:15;result.reasons.push(full?'優惠涵蓋所選日期':'只有部分日期適用，請核對使用日');}
 const tags=[...new Set(intent.interestTags)];if(tags.length){result.coverage++;result.scoreBreakdown.interests=25*tags.filter(t=>p.interestTags.includes(t)).length/tags.length;result.reasons.push('依你選擇的興趣配對');}else result.missing.push('未指定興趣');
 if(budgetKnown){result.coverage++;result.scoreBreakdown.budget=10;result.reasons.push('在每人預算內');}else{result.missing.push(intent.budget?'價格、幣別或每人計價尚待確認':'未設定預算');if(intent.budget)result.eligibility='needs_confirmation';}
 if(intent.languages.length&&p.languages.length){result.coverage++;result.scoreBreakdown.language=intent.languages.some(l=>p.languages.includes(l))?10:0;}else result.missing.push('語言資料不足');
 result.score=Object.values(result.scoreBreakdown).reduce((a,b)=>a+b,0);
 result.grantVersions=offer.grants.filter(g=>grantFor(p,[g],g.purpose,now)).map(g=>({id:g.id,version:g.grantVersion,purpose:g.purpose}));
 result.display={title:f.title,details:p.displayFields.includes('details')?f.details:'',terms:f.terms,priceAmount:f.priceAmount,currency:f.currency,validFrom:f.validFrom,validUntil:f.validUntil};
 if(p.campaignId&&offer.campaignEligible)result.campaignId=p.campaignId;else if(p.audiences.includes('creator'))result.reasons.push('可作內容靈感；不代表合作獲批');
 return result;
}
export function rankOffers(intent:TripIntent,offers:PublishedOfferContext[],choices:MatchChoice[],now:Date):MatchResult{
 const dismissed=new Set(choices.filter(c=>c.ownerActorId===intent.ownerActorId&&c.intentId===intent.id&&c.choice==='dismissed').map(c=>c.publicationId));
 const all=offers.map(o=>evaluateOffer(intent,o,now)).filter(r=>r.eligibility!=='excluded'&&!dismissed.has(r.publicationId));
 all.sort((a,b)=>(a.eligibility==='eligible'?0:1)-(b.eligibility==='eligible'?0:1)||b.score-a.score||b.observedAt.localeCompare(a.observedAt)||a.publicationId.localeCompare(b.publicationId));
 return {results:all.slice(0,100),coverage:{candidateCount:all.length,returnedCount:Math.min(100,all.length),bounded:all.length>100}};
}
