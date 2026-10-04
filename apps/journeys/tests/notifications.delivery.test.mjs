import{test}from'node:test';import assert from'node:assert/strict';import{deliverNext,completeDelivery}from'../lib/notifications/delivery.ts';
test('disabled delivery never claims or sends; failed attempts retry the same event without business mutations',async()=>{
 const calls=[],claim={id:'id',eventId:'event',recipientId:'actor',channel:'email',type:'submission.rejected',entityType:'mission',entityId:'mission',templateVersion:'approved-v1',provider:'sandbox',attempts:1,leaseToken:'lease'};
 const store={claim:async()=>{calls.push('claim');return claim;},authorizeSend:async()=>({authorized:true,state:'sending'}),finish:async(id,lease,delivered)=>{calls.push({id,lease,delivered});return{state:delivered?'delivered':'retry',attempts:1};}};
 assert.deepEqual(await deliverNext(store,null),{state:'unconfigured'});assert.equal(calls.length,0);
 const failed=await deliverNext(store,{name:'sandbox',templateVersion:'approved-v1',send:async(event,key)=>{assert.equal(key,'event:email');assert.equal(event.eventId,'event');throw new Error('provider timeout');}});assert.equal(failed.state,'retry');
 const done=await deliverNext(store,{name:'sandbox',templateVersion:'approved-v1',send:async(event,key)=>{assert.equal(key,'event:email');return{receipt:'provider-receipt'};}});assert.equal(done.state,'delivered');assert.equal(calls.filter(x=>typeof x==='object').length,2);
});
test('a revoked claim is checked immediately before sending and never reaches the provider',async()=>{
 let sent=0,authorized=0,finished=0;
 const store={claim:async()=>({id:'o',eventId:'e',channel:'email',provider:'p',templateVersion:'v',leaseToken:'l'}),authorizeSend:async(id,lease,name,version)=>{assert.deepEqual([id,lease,name,version],['o','l','p','v']);authorized++;return{authorized:false,state:'suppressed'};},finish:async()=>{finished++;return{state:'retry',attempts:1};}};
 const result=await deliverNext(store,{name:'p',templateVersion:'v',send:async()=>{sent++;return{receipt:'r'};}});
 assert.equal(result.state,'suppressed');assert.equal(authorized,1);assert.equal(sent,0);assert.equal(finished,0);
});
test('a lost successful completion acknowledgement stays unknown instead of recording send failure',async()=>{
 const completions=[];let sent=0;
 const store={claim:async()=>({id:'o',eventId:'e',channel:'email',provider:'p',templateVersion:'v',leaseToken:'l'}),authorizeSend:async()=>({authorized:true,state:'sending'}),finish:async(id,lease,delivered,receipt)=>{completions.push({id,lease,delivered,receipt});throw new Error('acknowledgement lost');}};
 const result=await deliverNext(store,{name:'p',templateVersion:'v',send:async()=>{sent++;return{receipt:'r'};}});
 assert.equal(result.state,'acknowledgement_unknown');assert.equal(sent,1);assert.deepEqual(completions,[{id:'o',lease:'l',delivered:true,receipt:'r'}]);
 assert.deepEqual(result.completion,{id:'o',leaseToken:'l',delivered:true,receipt:'r'});
 const acknowledged=await completeDelivery({finish:async(...args)=>{assert.deepEqual(args,['o','l',true,'r']);return{state:'delivered',attempts:1};}},result.completion);
 assert.equal(acknowledged.state,'delivered');assert.equal(sent,1,'completion retry must not call the provider again');
});
test('stale or failed authorization cannot fall through to provider send',async()=>{
 let sent=0,finished=0;const provider={name:'p',templateVersion:'v',send:async()=>{sent++;return{receipt:'r'};}};
 const store={claim:async()=>({id:'o',eventId:'e',channel:'email',provider:'p',templateVersion:'v',leaseToken:'l'}),authorizeSend:async()=>({authorized:false,state:'stale'}),finish:async()=>{finished++;return{state:'retry',attempts:1};}};
 assert.equal((await deliverNext(store,provider)).state,'stale');
 await assert.rejects(deliverNext({...store,authorizeSend:async()=>{throw Error('authorization unavailable');}},provider),/authorization unavailable/);
 assert.equal(sent,0);assert.equal(finished,0);
});
test('unapproved provider/template cannot send',async()=>{
 let sent=0;const store={claim:async()=>({id:'id',eventId:'event',channel:'email',provider:'one',templateVersion:'v1',leaseToken:'lease'}),finish:async()=>({state:'retry',attempts:1})};
 await deliverNext(store,{name:'two',templateVersion:'v1',send:async()=>{sent++;return{receipt:'r'};}});assert.equal(sent,0);
});
