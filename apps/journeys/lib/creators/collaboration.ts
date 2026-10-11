import {request} from '../trips/repository';

export type MissionScope = 'available' | 'mine';
export type Participation = {
 id: string; status: 'invited'|'applied'|'rejected'|'active'|'completed'|'cancelled';
 source: string; applicationNote: string|null; merchantReviewNote: string|null; updatedAt: string;
};
export type CreatorMission = {
 id:string; title:string; summary:string; merchantName:string|null;
 missionType:'coupon_affiliate'|'hybrid'|'paid'|'receipt_cashback'; missionSource:string;
 status:string; visibility:string; minTier:string|null; eligible:boolean; joinAvailable:boolean;
 acceptAvailable:boolean; evidenceAvailable:boolean; requiresApplication:boolean;
 paidFeeAmount:string|null; paidFeeCurrency:string|null; creatorRate:string|null;
 startsAt:string|null; endsAt:string|null; participant:Participation|null;
};
export type Evidence = {
 id:string; milestoneId:string; status:'pending'|'submitted'|'revision_requested'|'approved'|'rejected';
 proofUrls:string[]; notes:string|null; merchantFeedback:string|null; submittedAt:string|null; updatedAt:string;
 reviews:{id:string;action:string;reason:string|null;createdAt:string}[];
};
export type CreatorMissionDetail = CreatorMission & {
 requirements:string[]; deliverables:string[]; couponCode:string|null; couponUrl:string|null;
 milestones:{id:string;title:string;description:string;dueAt:string|null;repeatable:boolean}[];
 milestonesTruncated:boolean; submissions:Evidence[]; submissionsNextCursor:string|null;
 partnerLinks:{id:string;url:string}[]; maxReceipts:number|null;
};
export type CreatorMissionCommand =
 | {type:'join';applicationNote?:string}
 | {type:'acceptInvite'|'withdrawApplication';expectedUpdatedAt:string}
 | {type:'submitEvidence';milestoneId:string;submissionId:string|null;expectedUpdatedAt:string|null;proofUrls:string[];notes:string};
export type MissionCommandReceipt = {id:string;status:string;updatedAt:string};
export const creatorMissions = {
 list:(scope:MissionScope='available',after?:string)=>request<{items:CreatorMission[];nextCursor:string|null}>('/api/creator/missions?'+new URLSearchParams({scope,...after?{after}:{}})),
 get:(id:string,after?:string)=>request<CreatorMissionDetail>('/api/creator/missions/'+encodeURIComponent(id)+(after?'?after='+encodeURIComponent(after):'')),
 command:(id:string,command:CreatorMissionCommand,requestId:string)=>request<MissionCommandReceipt>('/api/creator/missions/'+encodeURIComponent(id),'POST',{command,requestId}),
};

export type EarningsSection = 'settled'|'tracked'|'payouts';
export type EarningsPage = {
 section:EarningsSection;
 totals:{currency:string|null;pending:string;paid:string}[];
 items:{id:string;kind:'mission'|'booking'|'affiliate'|'payout_batch';title:string;missionId:string|null;amount:string;currency:string|null;status:string;updatedAt:string|null;targetAt:string|null}[];
 nextCursor:string|null;
};
export const creatorEarnings = {get:(section:EarningsSection='settled',after?:string)=>request<EarningsPage>('/api/creator/earnings?'+new URLSearchParams({section,...after?{after}:{}}))};
