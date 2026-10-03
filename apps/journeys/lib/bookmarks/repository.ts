import { request } from '../trips/repository';
export const bookmarks = {
  list: () => request<{guide_id:string;guides:{id:string;slug:string;title:string}|null}[]>('/api/bookmarks'),
  toggle: (guideId:string,desiredState:boolean,requestId:string) => request<{saved:boolean}>('/api/bookmarks','POST',{guideId,desiredState,requestId}),
};
