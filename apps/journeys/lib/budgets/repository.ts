import {rpc} from '../telemetry/repository.ts';
import type {RpcClient} from '../telemetry/repository.ts';
import {uuid} from '../telemetry/events.ts';
import {services,units} from './contracts.ts';
import type {Reservation,ReserveInput} from './contracts.ts';
import type {BudgetStore} from './service.ts';
/** Bind a server request to its authenticated actor; never expose service RPC transport to the browser. */
export function budgetStore(_user:RpcClient,service:RpcClient,actorId:string,requestId:string,sessionId:string):BudgetStore {
 if(!uuid.test(actorId)||!uuid.test(requestId)||!uuid.test(sessionId))throw new Error('INVALID_BUDGET');
 return {
  async reserve(input:ReserveInput) {
   units(input.estimate);if(input.requestId!==requestId||!services.includes(input.service))throw new Error('INVALID_BUDGET');
   const result=await rpc<Reservation>(service,'reserve_kinnso_budget',{p_actor_id:actorId,p_session_id:sessionId,p_service:input.service,p_request_id:requestId,p_estimate:input.estimate});
   if(!result||typeof result.allowed!=='boolean'||(result.allowed&&!uuid.test(result.reservationId))||(!result.allowed&&(!['disabled','exhausted','in_flight','already_finished'].includes(result.reason)||!['stop','degrade'].includes(result.stopBehavior))))throw new Error('INVALID_BUDGET_RESPONSE');
   return result;
  },
  async settle(id:string,actual:number,successful:boolean) {
   units(actual,true);if(!uuid.test(id)||typeof successful!=='boolean')throw new Error('INVALID_BUDGET');
   const result=await rpc<{status:'settled'}>(service,'finish_kinnso_budget',{p_actor_id:actorId,p_request_id:requestId,p_reservation_id:id,p_actual:actual,p_successful:successful,p_release:false});
   if(result?.status!=='settled')throw new Error('INVALID_BUDGET_RESPONSE');return result;
  },
  async release(id:string) {
   if(!uuid.test(id))throw new Error('INVALID_BUDGET');
   const result=await rpc<{status:'released'}>(service,'finish_kinnso_budget',{p_actor_id:actorId,p_request_id:requestId,p_reservation_id:id,p_actual:0,p_successful:false,p_release:true});
   if(result?.status!=='released')throw new Error('INVALID_BUDGET_RESPONSE');return result;
  },
 };
}
