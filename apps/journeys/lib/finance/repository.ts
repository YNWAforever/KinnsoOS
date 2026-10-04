import {request} from '../trips/repository';
import type {FinanceCursor,FinanceFilter,FinanceWorkspace,ReviewState} from './contracts';
export const finance = {
  get:(filter:FinanceFilter={},cursor?:FinanceCursor)=>request<FinanceWorkspace>('/api/reconciliation?'+new URLSearchParams({filter:JSON.stringify(filter),...cursor?{cursor:JSON.stringify(cursor)}:{}})),
  review:(command:{type:'open';sourceKey:string;reason:string}|{type:'review';id:string;expectedRevision:number;status:ReviewState;reason:string},requestId:string)=>request<{id:string;revision:number}>('/api/reconciliation','POST',{command,requestId}),
};
