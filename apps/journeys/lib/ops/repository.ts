import { request } from '../trips/repository';
export type QueueRow={submissionId:string;missionId:string;missionTitle:string;missionType:string;creatorId:string;status:string;submittedAt:string|null;reviewDeadline:string|null;confidenceStatus:string|null};
export type QueueCursor={bucket:number;deadline:string;id:string;scope:string};
export type QueuePage={items:QueueRow[];nextCursor:QueueCursor|null};
export type CurrencyTotal={currency:string|null;count:number;creatorAmount:string;merchantAmount:string;paidCount:number;disputedCount:number};
export type Preview={jobId:string;selectionSnapshot:{id:string;status:string;updatedAt:string}[];scope:'explicit_selection';maximum:100};
export type BulkResult={jobId:string;results:{id:string;ok:boolean;code?:string}[];succeeded:number;failed:number};
export type SubmissionDetail={id:string;status:string;proofUrls:string[]|null;notes:string|null;submittedAt:string|null;deadline:string|null;missionTitle:string};
export const ops={
 detail:(id:string)=>request<SubmissionDetail>('/api/ops/submission?id='+encodeURIComponent(id)),
 queue:(missionId?:string,cursor?:QueueCursor)=>request<QueuePage>('/api/ops/queue?'+new URLSearchParams({...missionId?{missionId}:{},...cursor?{cursor:JSON.stringify(cursor)}:{}})),
 summary:()=>request<CurrencyTotal[]>('/api/ops/summary'),
 preview:(ids:string[])=>request<Preview>('/api/ops/bulk','POST',{ids}),
 run:(jobId:string,action:string,reasonCategory:string|null,reason:string,requestId:string)=>request<BulkResult>('/api/ops/bulk','POST',{jobId,action,reasonCategory,reason,requestId}),
};
