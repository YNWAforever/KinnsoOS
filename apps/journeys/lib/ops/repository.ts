import { request } from '../trips/repository';
import { queueFilterParams, type QueueFilter } from './queue-filters';
export type QueueRow={submissionId:string;missionId:string;missionTitle:string;missionType:string;creatorId:string;status:string;submittedAt:string|null;reviewDeadline:string|null;confidenceStatus:string|null;assignedMemberId?:string|null;assignmentRevision?:number;assigneeAvailable?:boolean};
export type QueuePreset={id:string;name:string;filter:QueueFilter;revision:number};
export type Routing={memberId:string;canAssign:boolean;members:{id:string;name:string|null;role:string;status:string}[];membersTruncated:boolean;presets:QueuePreset[]};
export type AssignmentResult={submissionId:string;memberId:string|null;revision:number;requestId:string};
export type QueueCursor={bucket:number;deadline:string;id:string;scope:string};
export type QueuePage={items:QueueRow[];nextCursor:QueueCursor|null};
export type CurrencyTotal={currency:string|null;count:number;creatorAmount:string;merchantAmount:string;paidCount:number;disputedCount:number};
export type Preview={jobId:string;selectionSnapshot:{id:string;status:string;updatedAt:string}[];scope:'explicit_selection';maximum:100};
export type BulkResult={jobId:string;results:{id:string;ok:boolean;code?:string}[];succeeded:number;failed:number};
export type SubmissionDetail={id:string;status:string;proofUrls:string[]|null;notes:string|null;submittedAt:string|null;deadline:string|null;missionTitle:string};
export const ops={
 routing:()=>request<Routing>('/api/ops/routing'),
 assign:(submissionId:string,memberId:string|null,expectedRevision:number,reason:string,requestId:string)=>request<AssignmentResult>('/api/ops/assignments','POST',{submissionId,memberId,expectedRevision,reason,requestId}),
 preset:(id:string,expectedRevision:number,requestId:string,command:{type:'save';name:string;filter:QueueFilter}|{type:'delete'})=>request<QueuePreset>('/api/ops/presets','POST',{id,expectedRevision,requestId,command}),
 detail:(id:string)=>request<SubmissionDetail>('/api/ops/submission?id='+encodeURIComponent(id)),
 queue:(filter:QueueFilter={},cursor?:QueueCursor)=>{const params=queueFilterParams(filter);if(cursor)params.set('cursor',JSON.stringify(cursor));return request<QueuePage>('/api/ops/queue?'+params);},
 summary:(missionId?:string)=>request<CurrencyTotal[]>('/api/ops/summary'+(missionId?'?missionId='+encodeURIComponent(missionId):'')),
 preview:(ids:string[])=>request<Preview>('/api/ops/bulk','POST',{ids}),
 run:(jobId:string,action:string,reasonCategory:string|null,reason:string,requestId:string)=>request<BulkResult>('/api/ops/bulk','POST',{jobId,action,reasonCategory,reason,requestId}),
};
