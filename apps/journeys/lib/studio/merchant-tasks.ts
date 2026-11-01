import type {Membership} from '../merchants/repository';
import type {MerchantProfile} from '../merchants/onboarding';
import type {ProfileInput} from '../merchants/onboarding-validation';
import type {CampaignDetail} from '../merchants/campaign-repository';
import {campaignCommand,type CampaignInput,type CampaignCommand} from '../merchants/campaigns.ts';
import type {MerchantInsightsPage,InsightsQuery} from '../merchants/insights';
import type {SupportCase} from '../notifications/repository';
import type {StudioResponse} from './contracts';

export type MerchantTaskId='M1'|'M2'|'M3'|'M4'|'M5';
export type MerchantDocument={id:string;companyId:string;ownerId:string;title:string;text:string;visibility:'company'|'private';state:'active'|'restricted';version:number;aclVersion:number;hash:string;rights:'own'};
export type MerchantSource=
 | {kind:'profile';value:MerchantProfile}
 | {kind:'case';value:SupportCase}
 | {kind:'campaign';value:CampaignDetail}
 | {kind:'materials';value:{companyId:string;documents:MerchantDocument[]}}
 | {kind:'insights';query:InsightsQuery;value:MerchantInsightsPage};
export type MerchantOperation=
 | {kind:'profile';requestId:string;expectedUpdatedAt:string;input:ProfileInput}
 | {kind:'reply';requestId:string;command:{type:'reply';id:string;expectedRevision:number;message:string}}
 | {kind:'campaign';requestId:string;command:CampaignCommand};
export type MerchantBrief={id:string;ownerId:string;companyId:string;templateId:MerchantTaskId;visibility:'private';title:string;question:string;notes:string;createdAt:string;source:MerchantSource;evidence:string[];findings:string[];materials:{channel:string;text:string}[];privateSourceConsent:string[];operation:MerchantOperation|null};
export type MerchantTaskCatalogue={cases:{id:string;subject:string}[];documents:MerchantDocument[]};
export type MerchantTaskStore={
 catalogue:(companyId:string,task:MerchantTaskId)=>Promise<StudioResponse<MerchantTaskCatalogue>>;
 list:(companyId:string)=>Promise<StudioResponse<{items:MerchantBrief[]}>>;
 get:(id:string,companyId:string)=>Promise<StudioResponse<MerchantBrief>>;
 stage:(brief:MerchantBrief)=>Promise<StudioResponse<MerchantBrief>>;
 intent:(id:string,companyId:string)=>Promise<StudioResponse<MerchantBrief>>;
 save:(brief:MerchantBrief)=>Promise<StudioResponse<MerchantBrief>>;
};
/** Explanatory UI gate only. The existing server/RPC remains authoritative. */
export function merchantTaskAllowed(task:MerchantTaskId,role:Membership['role']|null|undefined):boolean {
 if(!role)return false;
 if(task==='M1'||task==='M5')return role==='owner';
 if(task==='M3'||task==='M4')return role==='owner'||role==='marketing';
 return ['owner','marketing','clerk','finance'].includes(role);
}
export function merchantDocumentReadable(doc:Pick<MerchantDocument,'companyId'|'ownerId'|'visibility'|'state'>,actor:string,company:string):boolean {
 return doc.companyId===company&&doc.state==='active'&&(doc.visibility==='company'||doc.ownerId===actor);
}
const labels:Record<keyof ProfileInput,string>={companyName:'公司名稱',tagline:'公司簡介',city:'城市',websiteUrl:'網站',logoUrl:'標誌網址',contactName:'私人聯絡人',contactEmail:'私人聯絡電郵'};
export function merchantProfileInput(profile:ProfileInput):ProfileInput{return {companyName:profile.companyName,contactName:profile.contactName,contactEmail:profile.contactEmail,websiteUrl:profile.websiteUrl,tagline:profile.tagline,city:profile.city,logoUrl:profile.logoUrl};}
export function merchantProfileDiff(before:Partial<ProfileInput>,after:Partial<ProfileInput>){return (Object.keys(labels) as (keyof ProfileInput)[]).filter(k=>before[k]!==after[k]).map(key=>({key,label:labels[key],before:before[key]??'',after:after[key]??'',visibility:['contactName','contactEmail'].includes(key)?'private':'public'}));}
export function merchantCampaignInput(detail:CampaignInput):CampaignInput {return {title:detail.title,summary:detail.summary,couponCode:detail.couponCode,couponUrl:detail.couponUrl,affiliateRate:detail.affiliateRate,kinnsoRate:detail.kinnsoRate,creatorRate:detail.creatorRate,requirements:[...detail.requirements],deliverables:[...detail.deliverables],milestones:detail.milestones.map(m=>({...m})),applicationOpensAt:detail.applicationOpensAt,applicationClosesAt:detail.applicationClosesAt,scheduleTimeZone:detail.scheduleTimeZone};}
export function merchantPublicationChecks(detail:Partial<CampaignDetail>):string[]{
 if(detail.status!=='draft'||detail.canEdit!==true)return ['此活動已發佈或不可編輯，既有條款保持原樣。'];
 const missing:string[]=[];
 for(const [field,label] of [['title','活動名稱'],['summary','活動內容'],['couponCode','優惠碼'],['couponUrl','優惠網址']] as const)if(!detail[field]?.trim())missing.push('補上'+label);
 if([detail.affiliateRate,detail.kinnsoRate,detail.creatorRate].some(r=>r===null||r===undefined))missing.push('逐項填寫原佣金條件；不代表付款');
 if(!detail.milestones?.length)missing.push('補上至少一個交付里程碑');
 if(detail.milestones?.some(m=>!m.title.trim()||!m.description.trim()))missing.push('補齊每個里程碑的標題與描述');
 try{campaignCommand({type:'createDraft',id:detail.id??'10000000-0000-4000-8000-000000000001',reason:'Check saved campaign only',publish:true,input:merchantCampaignInput(detail as CampaignInput)});}catch{missing.push('原活動檢查尚未通過：核對日期、時區、網址及欄位格式');}
 return missing;
}
export function merchantInsightCards(report:MerchantInsightsPage){
 const {invitationCohort:c,periodEvents:e,snapshot:s}=report.counts,known=(n:number|null|undefined)=>n===null||n===undefined?'未知／未驗證':String(n);
 return [{label:'已記錄接受／同一邀請群組',value:c.accepted===null||!c.issued?'未知／未驗證':`${c.accepted} / ${c.issued}`},{label:'當前已提交作品',value:known(s.submitted)},{label:'當前已核准作品',value:known(s.approved)},{label:'推廣核銷',value:known(e.redemptions)},{label:'歸因到訪',value:known(e.attribution)},{label:'營收／金額／幣別',value:'原彙總未提供，未驗證'},{label:'WhatsApp／Instagram／Search Console',value:'未連接'}];
}
