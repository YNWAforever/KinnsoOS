import type { ApiResult } from '../contracts/capabilities';
import type { TripSnapshot,TripCommand } from '../contracts/trips';
import {readConsent} from '../telemetry/events';
import {pilotSession} from '../telemetry/pilot-client';
export async function request<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal, actorId?:string): Promise<ApiResult<T>> {
  try {
    let consent='denied',session:string|undefined;try{if(typeof window!=='undefined'){const c=readConsent(window.localStorage);consent=c.consent;if(c.consent==='accepted')session=c.anonymousSessionId;}}catch{/* Consent remains denied when local storage is unavailable. */}
    const pilot=consent==='accepted'?pilotSession():null;
    const response = await fetch(url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...actorId?{'X-Kinnso-Intent-Actor':actorId}:{},'X-Kinnso-Analytics-Consent':consent,...session?{'X-Kinnso-Anonymous-Session':session}:{},...pilot?{'X-Kinnso-Pilot-Session':pilot}:{}},body:body ? JSON.stringify(body) : undefined,cache:'no-store',signal});
    const result = await response.json();
    if (typeof result.ok !== 'boolean' || (!response.ok && result.ok)) throw new Error('INVALID');
    return result;
  } catch { return {ok:false,code:'UNAVAILABLE',retryable:true,requestId:crypto.randomUUID()}; }
}
export const trips = {
  list: (cursor?:string,actorId?:string) => request<{items:Pick<TripSnapshot,'id'|'title'|'revision'>[];nextCursor:string|null}>('/api/trips'+(cursor ? '?after='+encodeURIComponent(cursor) : ''),'GET',undefined,undefined,actorId),
  get: (id:string,actorId?:string) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id),'GET',undefined,undefined,actorId),
  creation: (requestId:string,actorId:string) => request<{tripId:string|null}>('/api/trips/creation?requestId='+encodeURIComponent(requestId),'GET',undefined,undefined,actorId),
  create: (input:Pick<TripSnapshot,'title'|'timezone'|'startDate'>, requestId:string,actorId?:string) => request<TripSnapshot>('/api/trips','POST',{input,requestId},undefined,actorId),
  apply: (id:string,expectedRevision:number,requestId:string,command:TripCommand,actorId?:string) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id)+'/commands','POST',{expectedRevision,requestId,command},undefined,actorId),
  remove: (id:string,expectedRevision:number,requestId:string,actorId?:string) => request<{deleted:true}>('/api/trips/'+encodeURIComponent(id),'DELETE',{expectedRevision,requestId},undefined,actorId),
  adopt: (guideId:string,version:number,id:string,expectedRevision:number,requestId:string,flowId?:string,actorId?:string) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id)+'/adopt','POST',{guideId,version,expectedRevision,requestId,...flowId?{flowId}:{}},undefined,actorId),
};
