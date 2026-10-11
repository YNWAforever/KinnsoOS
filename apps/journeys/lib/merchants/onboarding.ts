import {request} from '../trips/repository';
import type {ApplicationInput,ProfileInput} from './onboarding-validation';
export type MerchantApplication=ApplicationInput&{id:string;status:'pending'|'approved'|'rejected';createdAt:string;decidedAt:string|null;decisionReason:string|null};
export type MerchantOnboarding={applications:MerchantApplication[];merchant:{id:string;name:string;status:string}|null};
export type MerchantProfile=ProfileInput&{id:string;slug:string;status:string;tier:string;updatedAt:string};
export const merchantOnboarding={
 get:()=>request<MerchantOnboarding>('/api/merchant/application'),
 submit:(input:ApplicationInput,requestId:string)=>request<{id:string;status:string}>('/api/merchant/application','POST',{input,requestId}),
 profile:(merchantId:string)=>request<MerchantProfile>('/api/merchant/profile?id='+encodeURIComponent(merchantId)),
 save:(merchantId:string,input:ProfileInput,expectedUpdatedAt:string,requestId:string)=>request<MerchantProfile>('/api/merchant/profile','PUT',{merchantId,input,expectedUpdatedAt,requestId}),
};
