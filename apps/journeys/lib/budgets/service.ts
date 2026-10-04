import {units,services} from './contracts.ts';
import type {ReserveInput,Reservation} from './contracts.ts';
export type BudgetStore={reserve:(input:ReserveInput)=>Promise<Reservation>;settle:(id:string,actual:number,successful:boolean)=>Promise<{status:'settled'}>;release:(id:string)=>Promise<{status:'released'}>};
/** Call only from a server handler with separately authorized provider transport. */
export async function runBudgeted<T>(store:Pick<BudgetStore,'reserve'>&Partial<BudgetStore>,input:ReserveInput,operation:()=>Promise<{value:T;actual:number;successful:boolean}>):Promise<{ok:true;value:T}|{ok:false;reason:string}> {
 units(input.estimate);if(!services.includes(input.service))throw new Error('INVALID_SERVICE');
 const reservation=await store.reserve(input);
 if(!reservation.allowed)return{ok:false,reason:reservation.reason};
 if(!store.settle)return{ok:false,reason:'reconciliation_required'};
 try {
  const result=await operation();units(result.actual,true);
  if(typeof result.successful!=='boolean'||!store.settle)throw new Error('INVALID_OUTCOME');
  await store.settle(reservation.reservationId,result.actual,result.successful);
  return result.successful?{ok:true,value:result.value}:{ok:false,reason:'workflow_failed'};
 }catch{
  // A timeout can mean the provider charged us. Keep the reservation until trusted reconciliation.
  return{ok:false,reason:'reconciliation_required'};
 }
}
