import {request} from '../trips/repository';
export type InboxCursor={createdAt:string;id:string};
export type InboxItem={id:string;type:string;entityType:string;entityId:string;readAt:string|null;createdAt:string;payload:{missionTitle?:string;currency?:string}};
export type InboxPage={items:InboxItem[];nextCursor:InboxCursor|null;unreadCount:number;externalDelivery:'unconfigured'};
export type SupportMessage={id:string;message:string;createdAt:string;mine:boolean};
export type SupportCase={id:string;subject:string;status:'open'|'in_progress'|'waiting_customer'|'resolved';ownerId:string|null;revision:number;linkedEventId:string|null;updatedAt:string;messages:SupportMessage[];messagesNextCursor:InboxCursor|null};
export type DeliveryFailure={id:string;eventId:string;channel:string;attempts:number;revision:number;updatedAt:string};
export const inbox={get:(cursor?:InboxCursor)=>request<InboxPage>('/api/inbox'+(cursor?'?cursor='+encodeURIComponent(JSON.stringify(cursor)):'')),command:(command:Record<string,unknown>,requestId:string)=>request('/api/inbox','POST',{command,requestId})};
export const support={list:(ops=false,after?:string)=>request<{items:SupportCase[];nextCursor:string|null}>('/api/support?'+new URLSearchParams({ops:String(ops),...after?{after}:{}})),messages:(id:string,cursor:InboxCursor,ops=false)=>request<{items:SupportMessage[];nextCursor:InboxCursor|null}>(`/api/support/${id}/messages?`+new URLSearchParams({ops:String(ops),cursor:JSON.stringify(cursor)})),command:(command:Record<string,unknown>,requestId:string)=>request<{id:string;revision:number;status:string}>('/api/support','POST',{command,requestId})};
export const deliveryFailures={list:(after?:string)=>request<{items:DeliveryFailure[];nextCursor:string|null}>('/api/inbox/deliveries'+(after?'?after='+encodeURIComponent(after):'')),retry:(command:{id:string;expectedRevision:number;reason:string},requestId:string)=>request<{id:string;state:'retry';revision:number}>('/api/inbox/deliveries','POST',{...command,requestId})};
export function entityLink(item:InboxItem,locale:'en'|'zh-HK'){
 if(!/^[0-9a-f-]{36}$/i.test(item.entityId))return null;
 if(item.entityType==='support_case')return `/${locale}/support`;
 if(item.entityType==='place_report')return `/${locale}/reports`;
 const oldLocale=locale==='zh-HK'?'zh-hk':'en';
 const path=item.entityType==='mission'?`studio/missions/${item.entityId}`:item.entityType==='mission_settlement'||item.entityType==='payout_batch'?'studio/earnings':null;
 return path?`https://remix-kinnso-web.vercel.app/${oldLocale}/${path}`:null;
}
