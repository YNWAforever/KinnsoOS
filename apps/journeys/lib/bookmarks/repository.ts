import {uuid} from '../api/validation';
import { request } from '../trips/repository';
import type {ApiResult} from '../contracts/capabilities';
export type BookmarkCursor={createdAt:string;guideId:string};
export type BookmarkRow={guide_id:string;guides:{id:string;slug:string;title:string}|null};
function missingActor():ApiResult<never>{return{ok:false,code:'AUTH_REQUIRED',retryable:false,requestId:crypto.randomUUID()}}
export const bookmarks = {
  list: async(actorId:string,cursor?:BookmarkCursor,guideId?:string):Promise<ApiResult<{items:BookmarkRow[];nextCursor:BookmarkCursor|null}>> => {
    if(!uuid(actorId))return missingActor();
    const params=new URLSearchParams();if(cursor){params.set('before',cursor.createdAt);params.set('beforeGuide',cursor.guideId)}if(guideId)params.set('guideId',guideId);
    const result=await request<BookmarkRow[]>('/api/bookmarks'+(params.size?'?'+params:''),'GET',undefined,undefined,actorId) as ApiResult<BookmarkRow[]> & {nextCursor?:BookmarkCursor|null};
    return result.ok?{ok:true,data:{items:result.data,nextCursor:result.nextCursor??null}}:result;
  },
  toggle: async(guideId:string,desiredState:boolean,requestId:string,actorId:string):Promise<ApiResult<{saved:boolean}>> => uuid(actorId)?request<{saved:boolean}>('/api/bookmarks','POST',{guideId,desiredState,requestId},undefined,actorId):missingActor(),
};
