export type InsightsQuery={from?:string;to?:string;campaignId?:string;after?:string};
export type InsightsSnapshot={campaigns?:number;participants:number;invited:number;active:number;applied:number;submitted:number;approved:number;revisionRequested:number};
export type InvitationCohort={issued:number;accepted:number|null};
export type InsightsEvents={applications:number;submissions:null;approvalActions:number;redemptions:number|null;attribution:null};
export type CampaignInsight={id:string;title:string;status:string;snapshot:InsightsSnapshot;invitationCohort:InvitationCohort;periodEvents:InsightsEvents};
export type MerchantInsightsPage={asOf:string;range:{from:string;to:string};counts:{snapshot:InsightsSnapshot;invitationCohort:InvitationCohort;periodEvents:InsightsEvents};perCampaign:CampaignInsight[];nextCursor:string|null;coverage:{acceptance:string;submissions:string;redemptions:string;campaignSelection:string}};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function day(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('INVALID');const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw Error('INVALID');return time;}
export function insightsQuery(params:URLSearchParams):InsightsQuery{
 const query:InsightsQuery={};for(const[key,value]of params){if(!['from','to','campaign','after'].includes(key)||params.getAll(key).length!==1||!value)throw Error('INVALID');if(key==='campaign'){if(!uuid.test(value))throw Error('INVALID');query.campaignId=value;}else if(key==='after'){if(value.length>1500||!/^v1\.[A-Za-z0-9_-]+$/.test(value))throw Error('INVALID');query.after=value;}else query[key as 'from'|'to']=value;}
 if(Boolean(query.from)!==Boolean(query.to))throw Error('INVALID');if(query.from&&query.to){const duration=day(query.to)-day(query.from);if(duration<=0||duration>366*86400000)throw Error('INVALID');}return query;
}
export function invitationRate(cohort:InvitationCohort){return cohort.issued>0&&cohort.accepted!==null?`${cohort.accepted} / ${cohort.issued}`:'unknown';}
function cell(value:unknown){let text=value===null||value===undefined?'unknown':String(value);if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
/** Explicit projection prevents private evidence/contact fields from entering exported rows. */
export function insightsCsv(report:Pick<MerchantInsightsPage,'perCampaign'>){
 if(report.perCampaign.length>5000)throw Error('NARROW_RANGE');
 const header=['Campaign ID','Campaign title','Campaign status','Current invited','Current active','Current applications','Current submitted','Current revision requested','Current approved','Invitation records in cohort','Recorded accepted in cohort','Application records in period','Recorded approval actions in period','Campaign redemptions','Campaign attribution'];
 return[header.map(cell).join(','),...report.perCampaign.map(row=>[row.id,row.title,row.status,row.snapshot.invited,row.snapshot.active,row.snapshot.applied,row.snapshot.submitted,row.snapshot.revisionRequested,row.snapshot.approved,row.invitationCohort.issued,row.invitationCohort.accepted,row.periodEvents.applications,row.periodEvents.approvalActions,row.periodEvents.redemptions,row.periodEvents.attribution].map(cell).join(','))].join('\r\n')+'\r\n';
}
