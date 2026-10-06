import { request } from '../trips/repository';
import type {ApiResult} from '../contracts/capabilities';
export type BookmarkCursor={createdAt:string;guideId:string};
export type BookmarkRow={guide_id:string;guides:{id:string;slug:string;title:string}|null};
export const bookmarks = {
  list: async(cursor?:BookmarkCursor,guideId?:string):Promise<ApiResult<{items:BookmarkRow[];nextCursor:BookmarkCursor|null}>> => {
    const params=new URLSearchParams();if(cursor){params.set('before',cursor.createdAt);params.set('beforeGuide',cursor.guideId)}if(guideId)params.set('guideId',guideId);
    const result=await request<BookmarkRow[]>('/api/bookmarks'+(params.size?'?'+params:'')) as ApiResult<BookmarkRow[]> & {nextCursor?:BookmarkCursor|null};
    return result.ok?{ok:true,data:{items:result.data,nextCursor:result.nextCursor??null}}:result;
  },
  toggle: (guideId:string,desiredState:boolean,requestId:string) => request<{saved:boolean}>('/api/bookmarks','POST',{guideId,desiredState,requestId}),
};
