import {request} from '../trips/repository';
import type {CampaignInput,CampaignCommand} from './campaigns';
export type CampaignSummary={id:string;title:string;summary:string;status:string;missionType:string;updatedAt:string};
export type CampaignParticipant={id:string;creatorId:string;creatorName:string|null;creatorHandle:string|null;status:string;note:string|null;reviewNote:string|null;updatedAt:string};
export type CampaignSubmission={id:string;participantId:string;creatorId:string;creatorName:string|null;milestoneTitle:string;status:string;notes:string|null;proofUrls:string[];feedback:string|null;submittedAt:string|null;reviewedAt:string|null;updatedAt:string};
export type CampaignDetail=CampaignSummary&CampaignInput&{requiresApplication:boolean;participants:CampaignParticipant[];participantsNextCursor:string|null;submissions:CampaignSubmission[];submissionsNextCursor:string|null;canEdit:boolean;canClose:boolean;canReviewSubmissions:boolean};
export type CampaignDirectory={merchantId:string;role:'owner'|'marketing';items:CampaignSummary[];nextCursor:string|null;detail:CampaignDetail|null;summary:{draft:number;published:number;closed:number;applications:number;activeCreators:number;submitted:number;approved:number};branches:{id:string;name:string;active:boolean}[];branchesNextCursor:string|null};
export type CampaignQuery={after?:string;campaignId?:string;participantsAfter?:string;submissionsAfter?:string;branchesAfter?:string};
export const merchantCampaigns={
 list:(merchantId:string,query:CampaignQuery={})=>request<CampaignDirectory>('/api/merchant/campaigns?'+new URLSearchParams([['id',merchantId],...Object.entries(query).filter((entry):entry is [string,string]=>typeof entry[1]==='string')])),
 command:(merchantId:string,command:CampaignCommand,requestId:string)=>request<{id:string;status?:string;updatedAt?:string}>('/api/merchant/campaigns','POST',{merchantId,command,requestId}),
};
