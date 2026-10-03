import {request} from './repository';
import type {PublicTripProjection} from '../contracts/trips';
export type ShareMetadata={id:string;createdAt:string;expiresAt:string};
export const sharing={list:(tripId:string)=>request<ShareMetadata[]>('/api/shares?tripId='+encodeURIComponent(tripId)),create:(tripId:string,stopIds:string[],mediaIds:string[],expiresAt:string)=>request<{id:string;url:string;projection:PublicTripProjection}>('/api/shares','POST',{tripId,stopIds,mediaIds,expiresAt}),revoke:(id:string)=>request<{revoked:true}>('/api/shares/'+encodeURIComponent(id),'DELETE')};
