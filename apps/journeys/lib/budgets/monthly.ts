import {rpc,type RpcClient} from '../telemetry/repository.ts';
import {uuid} from '../telemetry/events.ts';
import {units,type Reservation} from './contracts.ts';
export const monthlyServices=['ai','scan','maps','storage','jobs'] as const;
export type MonthlyService=typeof monthlyServices[number];
export type MonthlyCosts={month:string;currency:'USD';unit:'USD_micro';limit:number|null;spent:number|null;reserved:number|null;status:'disabled'|'available'|'exhausted'|'overrun';services:{service:MonthlyService;enabled:boolean;rateVersion:string|null;spent:number|null;successfulFlows:number|null;costPerSuccessfulFlow:number|null}[]};
export type MonthlyBudgetStore={accounting:'USD_calendar_month';rateVersion:string;reserve:(input:{service:MonthlyService;requestId:string;estimate:number})=>Promise<Reservation>;settle:(id:string,actual:number,successful:boolean)=>Promise<{status:'settled'}>;release:(id:string)=>Promise<{status:'released'}>};
/** Server-only binding. Estimate/actual are USD micros from a separately verified provider conversion. */
export function monthlyBudgetStore(service:RpcClient,actorId:string,requestId:string,sessionId:string,rateVersion:string):MonthlyBudgetStore {
 if(![actorId,requestId,sessionId].every(id=>uuid.test(id))||!validRateVersion(rateVersion))throw new Error('INVALID_BUDGET');
 return {accounting:'USD_calendar_month',rateVersion,
  async reserve(input){
   units(input.estimate);if(input.requestId!==requestId||!monthlyServices.includes(input.service))throw new Error('INVALID_BUDGET');
   const result=await rpc<Reservation>(service,'reserve_kinnso_monthly_cost',{p_actor_id:actorId,p_session_id:sessionId,p_service:input.service,p_request_id:requestId,p_estimate_usd_micros:input.estimate,p_rate_version:rateVersion});
   if(!result||typeof result.allowed!=='boolean'||(result.allowed&&!uuid.test(result.reservationId))||(!result.allowed&&(!['disabled','exhausted','in_flight','already_finished'].includes(result.reason)||result.stopBehavior!=='stop')))throw new Error('INVALID_BUDGET_RESPONSE');return result;
  },
  async settle(id,actual,successful){units(actual,true);if(!uuid.test(id)||typeof successful!=='boolean')throw new Error('INVALID_BUDGET');const result=await rpc<{status:'settled'}>(service,'finish_kinnso_monthly_cost',{p_actor_id:actorId,p_request_id:requestId,p_reservation_id:id,p_actual_usd_micros:actual,p_successful:successful,p_release:false});if(result?.status!=='settled')throw new Error('INVALID_BUDGET_RESPONSE');return result;},
  async release(id){if(!uuid.test(id))throw new Error('INVALID_BUDGET');const result=await rpc<{status:'released'}>(service,'finish_kinnso_monthly_cost',{p_actor_id:actorId,p_request_id:requestId,p_reservation_id:id,p_actual_usd_micros:0,p_successful:false,p_release:true});if(result?.status!=='released')throw new Error('INVALID_BUDGET_RESPONSE');return result;},
 };
}
export function validRateVersion(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(value);}
