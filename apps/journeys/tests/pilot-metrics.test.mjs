import test from 'node:test';
import assert from 'node:assert/strict';
const pilot=await import('../lib/telemetry/pilot.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111';
const event={phase:'started',flowId:id,guideId:id,sessionId:id,requestId:id};
test('pilot events accept only fixed dimensions and bounded revisions; no personal payloads',()=>{
 assert.equal(typeof pilot.parsePilotEvent,'function');
 assert.deepEqual(pilot.parsePilotEvent(event),event);
 for(const patch of [{note:'private'},{title:'private'},{email:'a@example.test'},{phase:'free text'},{tripId:'not-a-uuid'},{revision:-1},{sessionId:''},{occurredAt:'client timestamp'}])assert.equal(pilot.parsePilotEvent({...event,...patch}),null);
 assert.equal(pilot.parsePublicPilotEvent({...event,phase:'adopted'}),null);
 assert.equal(pilot.parsePublicPilotEvent({...event,phase:'experience_referral',experienceId:id}).phase,'experience_referral');
});
test('disabled, synthetic, denied and admin contexts produce no transport',async()=>{
 assert.equal(typeof pilot.recordPilotEvent,'function');
 let calls=0;const service={rpc:async()=>{calls++;return{data:{accepted:true},error:null}}};
 for(const context of [{environment:'local'},{synthetic:true},{consent:'denied'},{context:'admin'},{mode:'unavailable'}]){
  assert.deepEqual(await pilot.recordPilotEvent(service,null,event,{mode:'connected',environment:'hosted',synthetic:false,consent:'accepted',context:'traveller',...context}),{accepted:false});
 }
 assert.equal(calls,0);
});
test('real events reuse the existing server RPC transport and a sink failure remains optional',async()=>{
 const calls=[],service={rpc:async(...args)=>{calls.push(args);return{data:{accepted:true},error:null}}};
 assert.equal((await pilot.recordPilotEvent(service,id,event,{mode:'connected',environment:'hosted',synthetic:false,consent:'accepted',context:'traveller'})).accepted,true);
 assert.equal(calls[0][0],'record_kinnso_pilot_event');
 assert.deepEqual(calls[0][1].p_event,event);
 assert.equal(calls[0][1].p_actor_id,id);
});
