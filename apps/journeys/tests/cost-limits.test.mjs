import test from 'node:test';
import assert from 'node:assert/strict';
const budgets=await import('../lib/budgets/contracts.ts').catch(()=>({}));
const execution=await import('../lib/budgets/service.ts').catch(()=>({}));

test('missing and malformed limits disable every paid service; exact boundary can reserve',()=>{
 assert.equal(typeof budgets.budgetDecision,'function');
 for(const service of ['ai','maps','storage','jobs'])assert.deepEqual(budgets.budgetDecision(null,1),{allowed:false,reason:'disabled',stopBehavior:'stop'});
 const budget={service:'ai',period:'2026-10-04',limit:10,spent:4,reserved:2,stopBehavior:'degrade'};
 assert.deepEqual(budgets.budgetDecision(budget,4),{allowed:true});
 assert.deepEqual(budgets.budgetDecision(budget,5),{allowed:false,reason:'exhausted',stopBehavior:'degrade'});
 for(const value of [NaN,Infinity,-1,0,0.5])assert.throws(()=>budgets.budgetDecision(budget,value));
 assert.deepEqual(budgets.budgetDecision({...budget,limit:NaN},1),{allowed:false,reason:'disabled',stopBehavior:'stop'});
});
test('denied durable reservation never executes a provider operation',async()=>{
 assert.equal(typeof execution.runBudgeted,'function');
 let called=0;
 const result=await execution.runBudgeted({reserve:async()=>({allowed:false,reason:'disabled',stopBehavior:'stop'})}, {service:'ai',requestId:'22222222-2222-4222-8222-222222222222',estimate:1},async()=>{called++;return{value:'unsafe',actual:1,successful:true}});
 assert.equal(called,0);assert.equal(result.ok,false);assert.equal(result.reason,'disabled');
});
test('successful cost and failed workflow charge settle; uncertain provider failure retains reservation',async()=>{
 assert.equal(typeof execution.runBudgeted,'function');
 const settled=[];let released=0;
 const store={reserve:async()=>({allowed:true,reservationId:'reservation'}),settle:async(...args)=>{settled.push(args);return{status:'settled'}},release:async()=>{released++}};
 const input={service:'jobs',requestId:'22222222-2222-4222-8222-222222222222',estimate:10};
 const success=await execution.runBudgeted(store,input,async()=>({value:42,actual:7,successful:true}));
 assert.deepEqual(success,{ok:true,value:42});assert.deepEqual(settled,[['reservation',7,true]]);
 const failed=await execution.runBudgeted(store,input,async()=>({value:null,actual:3,successful:false}));
 assert.equal(failed.ok,false);assert.deepEqual(settled[1],['reservation',3,false]);
 const unknown=await execution.runBudgeted(store,input,async()=>{throw Error('private provider receipt')});
 assert.deepEqual(unknown,{ok:false,reason:'reconciliation_required'});assert.equal(released,0);
});
test('settlement failure cannot report successful provider output',async()=>{
 const result=await execution.runBudgeted({reserve:async()=>({allowed:true,reservationId:'x'}),settle:async()=>{throw Error('down')}},{service:'maps',requestId:'22222222-2222-4222-8222-222222222222',estimate:3},async()=>({value:'route',actual:2,successful:true}));
 assert.deepEqual(result,{ok:false,reason:'reconciliation_required'});
});

test('missing settlement transport never calls provider after reservation',async()=>{
 let calls=0;
 const result=await execution.runBudgeted({reserve:async()=>({allowed:true,reservationId:'x'})},{service:'ai',requestId:'22222222-2222-4222-8222-222222222222',estimate:1},async()=>{calls++;return{value:1,actual:1,successful:true}});
 assert.equal(calls,0);assert.deepEqual(result,{ok:false,reason:'reconciliation_required'});
});
