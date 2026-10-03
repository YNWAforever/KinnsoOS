import type { ApiResult } from '../contracts/capabilities';
import type { TripSnapshot,TripCommand } from '../contracts/trips';
export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url,{method,headers:body ? {'Content-Type':'application/json'} : {},body:body ? JSON.stringify(body) : undefined,cache:'no-store'});
    const result = await response.json();
    if (typeof result.ok !== 'boolean' || (!response.ok && result.ok)) throw new Error('INVALID');
    return result;
  } catch { return {ok:false,code:'UNAVAILABLE',retryable:true,requestId:crypto.randomUUID()}; }
}
export const trips = {
  list: (cursor?:string) => request<{items:Pick<TripSnapshot,'id'|'title'|'revision'>[];nextCursor:string|null}>('/api/trips'+(cursor ? '?after='+encodeURIComponent(cursor) : '')),
  get: (id:string) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id)),
  create: (input:Pick<TripSnapshot,'title'|'timezone'|'startDate'>, requestId:string) => request<TripSnapshot>('/api/trips','POST',{input,requestId}),
  apply: (id:string,expectedRevision:number,requestId:string,command:TripCommand) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id)+'/commands','POST',{expectedRevision,requestId,command}),
  remove: (id:string,expectedRevision:number,requestId:string) => request<{deleted:true}>('/api/trips/'+encodeURIComponent(id),'DELETE',{expectedRevision,requestId}),
  adopt: (guideId:string,version:number,id:string,expectedRevision:number,requestId:string) => request<TripSnapshot>('/api/trips/'+encodeURIComponent(id)+'/adopt','POST',{guideId,version,expectedRevision,requestId}),
};
