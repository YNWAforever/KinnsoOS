import {request} from '../trips/repository';
export type Membership={merchantId:string;name:string;role:'owner'|'marketing'|'clerk'|'finance';branchIds:string[]};
export type MerchantWorkspaceDTO={merchantId:string;role:Membership['role'];branches:{id:string;name:string}[];missions:{id:string;title:string;summary:string;status:string;missionType:string}[];nextCursor:string|null;applicationsNextCursor:string|null;outcomesNextCursor:string|null;applications:{id:string;creatorId:string;missionTitle:string;status:string;note:string|null}[];outcomes:{id:string;redeemedAt:string;state:'redeemed'|'settled'|'paid';currency:string|null;creatorAmount:string|null;branchId:string|null}[];moneyCapability:'historical_records_only'};
export type Redemption={redemption_id?:string;redeemed_at?:string;already_redeemed?:boolean;expired?:boolean};
export type MerchantTeamMember={userId:string;name:string;role:'marketing'|'clerk'|'finance';active:boolean;branchIds:string[];branches:{id:string;name:string;active:boolean}[]};
export type MerchantTeamDirectory={merchantId:string;members:MerchantTeamMember[];nextCursor:string|null};
export const merchantTeam=(merchantId:string,after?:string)=>request<MerchantTeamDirectory>('/api/merchant/team?'+new URLSearchParams({id:merchantId,...after?{after}:{}}));
export type MerchantInvitation={id:string;label:string;role:'marketing'|'clerk'|'finance';branchIds:string[];expiresAt:string;status:'pending'|'accepted'|'revoked'|'invalidated'|'expired'};
export type InvitationDirectory={merchantId:string;invitations:MerchantInvitation[];nextCursor:string|null};
export type InvitationPreview={id:string;merchantId:string;name:string;role:MerchantInvitation['role'];branchIds:string[];expiresAt:string;branches:{id:string;name:string}[]};
export type InvitationReceipt={id:string;status:'pending'|'revoked'|'accepted';expiresAt?:string;merchantId?:string;role?:MerchantInvitation['role'];branchIds?:string[]};
export const merchantInvitations={
 list:(id:string,after?:string)=>request<InvitationDirectory>('/api/merchant/invitations?'+new URLSearchParams({id,...after?{after}:{}})),
 command:(merchantId:string,command:Record<string,unknown>,requestId:string)=>request<InvitationReceipt>('/api/merchant/invitations','POST',{merchantId,command,requestId}),
 preview:(token:string)=>request<InvitationPreview>('/api/merchant/invitations/recipient','POST',{action:'preview',token}),
 accept:(token:string,requestId:string)=>request<InvitationReceipt>('/api/merchant/invitations/recipient','POST',{action:'accept',token,requestId}),
};
export const merchants={memberships:()=>request<Membership[]>('/api/merchant'),workspace:(id:string,cursors:{after?:string;applicationsAfter?:string;outcomesAfter?:string}={})=>request<MerchantWorkspaceDTO>('/api/merchant?'+new URLSearchParams({id,...cursors})),command:(merchantId:string,command:Record<string,unknown>,requestId:string)=>request<{id?:string;status?:string}>('/api/merchant','POST',{merchantId,command,requestId}),redeem:(code:string,branchId:string,requestId:string,amountSpent:number|null)=>request<Redemption>('/api/merchant/redeem','POST',{code,branchId,requestId,amountSpent})};
