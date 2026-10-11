import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const id='11111111-1111-4111-8111-111111111111';
const report={items:[],totals:[],nextCursor:null,scope:{mode:'merchant',merchantId:id,role:'owner',branchIds:[]},capabilities:{livePayment:false,refund:false,feeAdjustment:false,disputeMoneyResolution:false}};
const membership={merchantId:id,name:'Owned finance company',role:'owner',branchIds:[]};
const refresh=async h=>{await tick();h.render();await tick();h.render();};
for(const locale of ['en','zh-HK'])test('initial '+locale+' finance membership outage retries its read and filters authorized roles before loading records',async()=>{
 let reads=0,resolve;const financeReads=[],writes=[];
 const h=await workspaceHarness('FinanceWorkspace',{merchants:{memberships:async()=>++reads===1?{ok:false,code:'UNAVAILABLE'}:new Promise(r=>{resolve=r;})},finance:{get:async filter=>{financeReads.push(filter);return{ok:true,data:report};},review:async command=>{writes.push(command);return{ok:true};}}},{locale});
 const retry=h.find('button',locale==='en'?'Retry loading':'重試載入');assert.ok(retry,'initial membership outage must offer an actual read retry');
 assert.ok(!h.text().includes(locale==='en'?'No merchant finance membership':'沒有可用的商戶財務成員'));
 retry.props.onClick();retry.props.onClick();h.render();assert.equal(reads,2,'same pending membership read is not duplicated');assert.equal(financeReads.length,0);assert.ok(!h.find('button',locale==='en'?'Retry loading':'重試載入'));
 resolve({ok:true,data:[membership,{...membership,merchantId:'22222222-2222-4222-8222-222222222222',name:'Marketing only',role:'marketing'}]});await refresh(h);
 assert.deepEqual(JSON.parse(JSON.stringify(financeReads)),[{merchantId:id,exceptionsOnly:false}]);assert.equal(writes.length,0);assert.match(h.text(),/Owned finance company/);assert.ok(!h.text().includes('Marketing only'));assert.ok(!h.find('button',locale==='en'?'Retry loading':'重試載入'));
});
test('a second membership outage stays retryable without inventing a no-membership result',async()=>{
 let reads=0;const h=await workspaceHarness('FinanceWorkspace',{merchants:{memberships:async()=>{reads++;return{ok:false,code:'UNAVAILABLE'};}}});
 const retry=h.find('button','Retry loading');assert.ok(retry);retry.props.onClick();await refresh(h);assert.equal(reads,2);assert.ok(h.find('button','Retry loading'));assert.ok(!h.text().includes('No merchant finance membership'));
});
test('membership authentication denial returns to this finance task and cannot retry a business command',async()=>{
 const calls=[];const h=await workspaceHarness('FinanceWorkspace',{merchants:{memberships:async()=>({ok:false,code:'AUTH_REQUIRED'})},finance:{get:async()=>{calls.push('get');return{ok:true,data:report};},review:async()=>{calls.push('review');return{ok:true};}}});
 const sign=h.find('a','Sign in');assert.ok(sign);assert.equal(new URL(sign.props.href,'https://owned.test').searchParams.get('next'),'/en/merchant/reconciliation');assert.ok(!h.find('button','Retry loading'));assert.deepEqual(calls,[]);
});
test('account invalidation during membership retry prevents stale company selection and financial reads',async()=>{
 let count=0,resolve;const calls=[];const h=await workspaceHarness('FinanceWorkspace',{merchants:{memberships:async()=>++count===1?{ok:false,code:'UNAVAILABLE'}:new Promise(r=>{resolve=r;})},finance:{get:async()=>{calls.push('get');return{ok:true,data:report};}}});
 const retry=h.find('button','Retry loading');assert.ok(retry);retry.props.onClick();h.invalidate('actor-B');h.render();resolve({ok:true,data:[membership]});await refresh(h);assert.ok(!h.text().includes('Owned finance company'));assert.deepEqual(calls,[]);assert.ok(h.find('a','Sign in'));
});
test('successful empty membership result alone shows the no-membership explanation',async()=>{
 const h=await workspaceHarness('FinanceWorkspace',{merchants:{memberships:async()=>({ok:true,data:[]})}});assert.match(h.text(),/No merchant finance membership/);assert.ok(!h.find('button','Retry loading'));
});
