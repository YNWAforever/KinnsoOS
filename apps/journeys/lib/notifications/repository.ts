import {scheduleTimestamp} from '../merchants/campaign-schedule';
import type {SupportContext,SupportContextView} from '../collaboration/support-context';
import {request} from '../trips/repository';
export type InboxCursor={createdAt:string;id:string};
export type InboxItem={id:string;type:string;entityType:string;entityId:string;readAt:string|null;createdAt:string;payload:{missionTitle?:string;currency?:string;milestoneId?:string;milestoneTitle?:string;dueAt?:string;deadlineVersion?:string}};
export type InboxPage={items:InboxItem[];nextCursor:InboxCursor|null;unreadCount:number;externalDelivery:'unconfigured'};
export type SupportMessage={id:string;message:string;createdAt:string;mine:boolean};
export type SupportCase={id:string;subject:string;status:'open'|'in_progress'|'waiting_customer'|'resolved';ownerId:string|null;revision:number;linkedEventId:string|null;context?:SupportContext|null;updatedAt:string;messages:SupportMessage[];messagesNextCursor:InboxCursor|null};
export type DeliveryFailure={id:string;eventId:string;channel:string;attempts:number;revision:number;updatedAt:string};
export const inbox={get:(cursor?:InboxCursor)=>request<InboxPage>('/api/inbox'+(cursor?'?cursor='+encodeURIComponent(JSON.stringify(cursor)):'')),command:(command:Record<string,unknown>,requestId:string)=>request('/api/inbox','POST',{command,requestId})};
export const support={context:(id:string)=>request<SupportContextView>('/api/support/context?mission='+encodeURIComponent(id)),receipt:(command:Record<string,unknown>,requestId:string)=>request<{result:{id:string;revision:number;status:string}|null}>('/api/support/receipt','POST',{command,requestId}),list:(ops=false,after?:string)=>request<{items:SupportCase[];nextCursor:string|null}>('/api/support?'+new URLSearchParams({ops:String(ops),...after?{after}:{}})),messages:(id:string,cursor:InboxCursor,ops=false)=>request<{items:SupportMessage[];nextCursor:InboxCursor|null}>(`/api/support/${id}/messages?`+new URLSearchParams({ops:String(ops),cursor:JSON.stringify(cursor)})),command:(command:Record<string,unknown>,requestId:string)=>request<{id:string;revision:number;status:string}>('/api/support','POST',{command,requestId})};
export const deliveryFailures={list:(after?:string)=>request<{items:DeliveryFailure[];nextCursor:string|null}>('/api/inbox/deliveries'+(after?'?after='+encodeURIComponent(after):'')),retry:(command:{id:string;expectedRevision:number;reason:string},requestId:string)=>request<{id:string;state:'retry';revision:number}>('/api/inbox/deliveries','POST',{...command,requestId})};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Context is an event snapshot; never infer an old notification's deadline from creation time. */
export function reminderContext(item:InboxItem){
 if(!item.payload)return null;
 const {milestoneId,milestoneTitle,dueAt,deadlineVersion}=item.payload;
 if(item.entityType!=='mission'||!uuid.test(item.entityId)||!['collaboration.due_soon','collaboration.overdue'].includes(item.type)||
  typeof milestoneId!=='string'||!uuid.test(milestoneId)||typeof milestoneTitle!=='string'||!milestoneTitle.trim()||
  !scheduleTimestamp(dueAt)||!scheduleTimestamp(deadlineVersion)||dueAt!==deadlineVersion)return null;
 return {milestoneId,milestoneTitle,dueAt,deadlineVersion};
}
export function entityLink(item:InboxItem,locale:'en'|'zh-HK'){
 if(!uuid.test(item.entityId))return null;
 if(item.entityType==='support_case')return `/${locale}/support`;
 if(item.entityType==='place_report')return `/${locale}/reports`;
 const path=item.entityType==='mission'?`studio/missions/${item.entityId}`:item.entityType==='mission_settlement'||item.entityType==='payout_batch'?'studio/earnings':null;
 const context=reminderContext(item);
 return path?`/${locale}/${path}${context?'#milestone-'+context.milestoneId:''}`:null;
}
