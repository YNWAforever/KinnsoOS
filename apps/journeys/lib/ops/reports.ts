import{request}from'../trips/repository';
export type PlaceReport={id:string;placeId:string;reason:string;status:'open'|'reviewed'|'resolved';createdAt:string;updatedAt:string;reviewReason:string|null;assignedTo:string|null;revision:number};
export const reports={list:(opsMode:boolean,after?:string)=>request<{items:PlaceReport[];nextCursor:string|null}>('/api/reports?'+new URLSearchParams({ops:String(opsMode),...after?{after}:{}})),command:(row:PlaceReport,command:Record<string,unknown>,requestId:string)=>request('/api/reports','POST',{id:row.id,revision:row.revision,command,requestId})};
