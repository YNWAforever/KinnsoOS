import { request } from '../trips/repository';
import { queueFilterParams, type QueueFilter } from './queue-filters';
export type QueueRow={submissionId:string;missionId:string;missionTitle:string;missionType:string;creatorId:string;status:string;submittedAt:string|null;reviewDeadline:string|null;confidenceStatus:string|null};
export type QueueCursor={bucket:number;deadline:string;id:string;scope:string};
export type QueuePage={items:QueueRow[];nextCursor:QueueCursor|null};
export type CurrencyTotal={currency:string|null;count:number;creatorAmount:string;merchantAmount:string;paidCount:number;disputedCount:number};
export type Preview={jobId:string;selectionSnapshot:{id:string;status:string;updatedAt:string}[];scope:'explicit_selection';maximum:100};
export type BulkResult={jobId:string;results:{id:string;ok:boolean;code?:string}[];succeeded:number;failed:number};
export type SubmissionDetail={id:string;status:string;proofUrls:string[]|null;notes:string|null;submittedAt:string|null;deadline:string|null;missionTitle:string};
export const ops={
 detail:(id:string)=>request<SubmissionDetail>('/api/ops/submission?id='+encodeURIComponent(id)),
 queue:(filter:QueueFilter={},cursor?:QueueCursor)=>{const params=queueFilterParams(filter);if(cursor)params.set('cursor',JSON.stringify(cursor));return request<QueuePage>('/api/ops/queue?'+params);},
 summary:(missionId?:string)=>request<CurrencyTotal[]>('/api/ops/summary'+(missionId?'?missionId='+encodeURIComponent(missionId):'')),
 preview:(ids:string[])=>request<Preview>('/api/ops/bulk','POST',{ids}),
 run:(jobId:string,action:string,reasonCategory:string|null,reason:string,requestId:string)=>request<BulkResult>('/api/ops/bulk','POST',{jobId,action,reasonCategory,reason,requestId}),
};
