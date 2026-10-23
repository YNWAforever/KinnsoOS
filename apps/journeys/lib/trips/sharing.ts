import {request} from './repository';
import type {ShareIntent,ShareReceipt,ShareReceiptPage,ShareReceiptCursor} from '../contracts/share-receipts';
export type {ShareIntent,ShareReceipt,ShareReceiptPage,ShareReceiptCursor,ShareReceiptRow} from '../contracts/share-receipts';
export type ShareMetadata={id:string;createdAt:string;expiresAt:string};
export const sharing={
 list:(tripId:string)=>request<ShareMetadata[]>('/api/shares?tripId='+encodeURIComponent(tripId)),
 create:(intent:ShareIntent)=>request<ShareReceipt>('/api/shares','POST',intent),
 receipt:(tripId:string,requestId:string)=>request<ShareReceipt|null>('/api/shares/receipts?'+new URLSearchParams({tripId,requestId})),
 receipts:(tripId:string,cursor?:ShareReceiptCursor)=>request<ShareReceiptPage>('/api/shares/receipts?'+new URLSearchParams({tripId,...cursor?{before:cursor.createdAt,beforeRequestId:cursor.requestId}:{}})),
 revoke:(id:string)=>request<{revoked:true}>('/api/shares/'+encodeURIComponent(id),'DELETE')
};
