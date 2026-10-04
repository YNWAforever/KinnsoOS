import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPrivateTripHeading} from '../lib/trips/private-heading.ts';
const tripId='11111111-1111-4111-8111-111111111111', actorId='22222222-2222-4222-8222-222222222222';
test('server heading uses the authenticated trip RPC and binds its identity to actor and trip',async()=>{
 const client={rpc:async(name,args)=>{assert.equal(name,'get_trip_snapshot');assert.deepEqual(args,{p_trip_id:tripId});return{data:{id:tripId,title:'My private trip',days:[{travellerNote:'never serialize here'}]},error:null}}};
 assert.deepEqual(await readPrivateTripHeading(client,actorId,tripId),{actorId,tripId,title:'My private trip'});
});
test('anonymous, malformed, denied or mismatched snapshots disclose no heading',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return{data:{id:tripId,title:'Private'},error:null}}};
 assert.equal(await readPrivateTripHeading(client,null,tripId),null);
 assert.equal(await readPrivateTripHeading(client,actorId,'not-a-uuid'),null);assert.equal(calls,0);
 for(const result of [{error:{message:'trip_not_found'}},{error:null,data:{id:actorId,title:'Wrong trip'}},{error:null,data:{id:tripId,title:''}},{error:null,data:{id:tripId,title:'x'.repeat(201)}}])
  assert.equal(await readPrivateTripHeading({rpc:async()=>result},actorId,tripId),null);
 assert.equal(await readPrivateTripHeading({rpc:async()=>{throw Error('offline')}},actorId,tripId),null);
});
