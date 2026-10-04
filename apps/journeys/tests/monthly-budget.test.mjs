import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAgent,groundedResult} from '../lib/agent/service.ts';
import {requestScan} from '../lib/creators/scan-service.ts';
const subject=await import('../lib/budgets/monthly.ts').catch(()=>({}));
const actorId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',sessionId='33333333-3333-4333-8333-333333333333';
test('monthly cost transport uses USD micros and current actor/session/request/rate binding for all five services',async()=>{
 assert.equal(typeof subject.monthlyBudgetStore,'function');const calls=[];
 const client={rpc:async(name,args)=>{calls.push([name,args]);return {error:null,data:name==='reserve_kinnso_monthly_cost'?{allowed:true,reservationId:sessionId}:{status:args.p_release?'released':'settled'}};}};
 const store=subject.monthlyBudgetStore(client,actorId,requestId,sessionId,'approved-rate-v1');assert.equal(store.accounting,'USD_calendar_month');assert.equal(store.rateVersion,'approved-rate-v1');
 for(const service of ['ai','scan','maps','storage','jobs'])await store.reserve({service,requestId,estimate:1});
 assert.equal(calls[0][0],'reserve_kinnso_monthly_cost');assert.deepEqual(calls[1][1],{p_actor_id:actorId,p_session_id:sessionId,p_service:'scan',p_request_id:requestId,p_estimate_usd_micros:1,p_rate_version:'approved-rate-v1'});
 await store.settle(sessionId,3,false);await store.release(sessionId);assert.equal(calls[5][0],'finish_kinnso_monthly_cost');assert.equal(calls[5][1].p_actual_usd_micros,3);assert.equal(calls[6][1].p_release,true);
 await assert.rejects(store.reserve({service:'ai',requestId:sessionId,estimate:1}),/INVALID_BUDGET/);await assert.rejects(store.reserve({service:'ai',requestId,estimate:0.5}),/INVALID_COST/);assert.throws(()=>subject.monthlyBudgetStore(client,actorId,requestId,sessionId,''),/INVALID_BUDGET/);
});
test('AI cannot call paid provider with a daily unit store or unverified USD conversion',async()=>{
 let called=0;const input={actor:{id:actorId,roles:['traveller']},task:'sourceQA',prompt:'Read',requestId,sources:[{url:'https://www.kinnso.ai/en/guides/a',title:'Source',excerpt:'Authored excerpt',verifiedAt:null,state:'unknown'}]};
 const provider={authorized:true,estimate:1,costUnit:'USD_micro',rateVersion:'approved-rate-v1',generate:async()=>{called++;return {value:groundedResult(input),actual:1,successful:true}}};
 const store={reserve:async()=>({allowed:true,reservationId:sessionId}),settle:async()=>({status:'settled'})};
 assert.equal((await executeAgent(input,{provider,store})).providerStatus,'budget_disabled');
 assert.equal((await executeAgent(input,{provider:{...provider,costUnit:'requests'},store:{...store,accounting:'USD_calendar_month',rateVersion:'approved-rate-v1'}})).providerStatus,'budget_disabled');
 assert.equal((await executeAgent(input,{provider:{...provider,rateVersion:'other'},store:{...store,accounting:'USD_calendar_month',rateVersion:'approved-rate-v1'}})).providerStatus,'budget_disabled');assert.equal(called,0);
});
test('scan dispatch cannot bypass the combined monthly cost fence',async()=>{
 let called=0;const env={KINNSO_SCAN_WORKER_AUTHORIZED:'true',KINNSO_SCAN_WORKER_ORIGIN:'https://scan.example.test',KINNSO_APPROVED_SCAN_WORKER_ORIGIN:'https://scan.example.test'};
 const result=await requestScan({jobId:null,requestId,estimate:1},env,{authorize:async()=>({actorId,creatorStatus:'active',accessToken:'synthetic'}),ownedJob:async()=>({id:sessionId,status:'queued'}),budget:{reserve:async()=>({allowed:true,reservationId:sessionId}),settle:async()=>({status:'settled'})},transport:async()=>{called++;return Response.json({jobId:sessionId},{status:202})}});
 assert.equal(result.reason,'budget_disabled');assert.equal(called,0);
});
