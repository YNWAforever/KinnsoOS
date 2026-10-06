import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {executeAgent,groundedResult} from '../../lib/agent/service.ts';
import {monthlyBudgetStore} from '../../lib/budgets/monthly.ts';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import {fixture,admin} from './local-fixtures.mjs';

const target=verifyTestTarget();
const ok=async promise=>{const result=await promise;assert.equal(result.error,null,JSON.stringify(result.error));return result.data;};
function sql(input){
 const container=JSON.parse(execFileSync('docker',['inspect',target.dbContainer],{encoding:'utf8'}))[0];
 assert.equal(container.Config.Labels['com.supabase.cli.project'],target.projectRef);
 return execFileSync('docker',['exec','-i',target.dbContainer,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input,encoding:'utf8'}).trim();
}

test('rejected AI output is charged without successful-flow credit in the real monthly aggregate',async()=>{
 const f=await fixture(),month=new Date().toISOString().slice(0,7)+'-01';let ownerId,ownedMonth=false;
 try{
  const owner=await f.actor(),actor=await f.actor();ownerId=owner.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:owner.id,display_name:'Synthetic agent accounting owner',role:'owner'}));
  assert.equal(sql(`select count(*) from kinnso_internal.monthly_cost_limits where month='${month}';`),'0','preserve any preexisting monthly configuration');
  await ok(admin.rpc('configure_kinnso_monthly_cost_limit',{p_owner_id:owner.id,p_month:month,p_limit_usd_micros:5000000,p_rates:{ai:'synthetic-fixed-usd-v1'}}));ownedMonth=true;
  const token=(await actor.client.auth.getSession()).data.session.access_token;
  const sessionId=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
  const input={actor:{id:actor.id,roles:['traveller']},task:'sourceQA',prompt:'Read the supplied excerpt',sources:[{url:'https://www.kinnso.ai/en/guides/accounting',title:'Synthetic accounting source',excerpt:'Explicit synthetic source.',verifiedAt:null,state:'unknown'}]};
  async function run(value,actual){
   const requestId=randomUUID();
   return executeAgent({...input,requestId},{
    store:monthlyBudgetStore(admin,actor.id,requestId,sessionId,'synthetic-fixed-usd-v1'),
    // Synthetic transport only; real local Auth/RPC/reservation/settlement and aggregate.
    provider:{authorized:true,costUnit:'USD_micro',rateVersion:'synthetic-fixed-usd-v1',estimate:1,generate:async()=>({value,actual,successful:true})},
   });
  }
  const rejected=await run({...groundedResult(input),answer:'Invented opening hours with no source.'},7);
  assert.equal(rejected.providerStatus,'unavailable');assert.equal(rejected.capabilityMode,'sources_only');
  const failedReport=await ok(owner.client.rpc('get_kinnso_monthly_costs'));
  const failedAi=failedReport.services.find(service=>service.service==='ai');
  assert.equal(failedReport.spent,7);assert.equal(failedReport.reserved,0);
  assert.equal(failedAi.successfulFlows,0);assert.equal(failedAi.costPerSuccessfulFlow,null);
  const accepted=await run(groundedResult(input),3);
  assert.equal(accepted.providerStatus,'available');assert.equal(accepted.capabilityMode,'connected');
  const report=await ok(owner.client.rpc('get_kinnso_monthly_costs'));
  const ai=report.services.find(service=>service.service==='ai');
  assert.equal(report.spent,10);assert.equal(report.reserved,0);
  assert.equal(ai.successfulFlows,1);assert.equal(ai.costPerSuccessfulFlow,10);
 }finally{
  if(ownedMonth)sql(`delete from kinnso_internal.monthly_cost_reservations where month='${month}';delete from kinnso_internal.monthly_cost_limits where month='${month}';`);
  if(ownerId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',ownerId));
  await f.cleanup();
 }
});
