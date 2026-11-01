import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {discoveryModule} from './helpers/discovery-load.mjs';import {backend,cmd,actor,now} from './helpers/discovery-fixture.mjs';
const p=await discoveryModule('intents');
export const input={cityKey:'city:hk:hong-kong',dateSpec:{kind:'fixed',start:'2026-11-07',end:'2026-11-09'},budget:{currency:'HKD',maxPerPersonMinor:20000},interestTags:['散步'],languages:['zh-HK']};
test('trip validation exists',()=>assert.equal(typeof p.validateTripIntent,'function'));
test('favorite_city_is_not_trip_destination; date_window_never_exceeds_90_days',()=>{
 const prefs=p.validatePreferences({favoriteCityKeys:['city:hk:hong-kong'],interestTags:[],languages:[]});assert.equal(prefs.cityKey,undefined);
 assert.throws(()=>p.validateTripIntent({...input,cityKey:'unknown'}),/UNSUPPORTED/);
 assert.throws(()=>p.validateTripIntent({...input,dateSpec:{kind:'window',earliest:'2026-11-01',latest:'2027-02-01'}}),/INVALID/);
 assert.throws(()=>p.validateTripIntent({...input,budget:{currency:'HKD',maxPerPersonMinor:100000001}}),/INVALID/);
});
test('validates_leap_day_and_order; rejects nested authority',()=>{
 for(const dateSpec of [{kind:'fixed',start:'2026-02-29',end:'2026-03-01'},{kind:'fixed',start:'2026-12-10',end:'2026-12-01'},{kind:'undecided',ownerId:actor}])assert.throws(()=>p.validateTripIntent({...input,dateSpec}),/INVALID/);
 assert.equal(p.validateTripIntent({...input,dateSpec:{kind:'fixed',start:'2028-02-29',end:'2028-03-01'}}).dateSpec.start,'2028-02-29');
});
test('guest cannot persist and linked trip must belong to actor',async()=>{
 assert.equal((await backend({actorId:null,now}).command(cmd('saveIntent',randomUUID(),input))).code,'AUTH_REQUIRED');
 const b=backend({actorId:actor,now});assert.equal((await b.command(cmd('saveIntent',randomUUID(),{...input,linkedTripId:randomUUID()}))).code,'FORBIDDEN');
});
test('delete intent removes body, replay cannot resurrect; separately saved trip is untouched',async()=>{
 const trips=new Map([['mine',{note:'private kept'}]]),b=backend({actorId:actor,now,ownedTrip:()=>true}),id=randomUUID(),save=cmd('saveIntent',id,input);
 assert.equal((await b.command(save)).ok,true);assert.equal((await b.read({kind:'intent',id})).data.ownerActorId,actor);
 assert.equal((await b.command(cmd('deleteIntent',id,{},1))).ok,true);assert.equal((await b.command(save)).ok,true);assert.equal((await b.receipt(save.requestId)).resourceState,'deleted');assert.equal((await b.read({kind:'intent',id})).code,'NOT_FOUND');assert.equal(trips.get('mine').note,'private kept');
 assert.deepEqual(b.sme.effects,[]);
});
test('clear_preferences_is_owner_only',async()=>{
 const b=backend({actorId:actor,now});assert.equal((await b.command(cmd('savePreferences',actor,{favoriteCityKeys:['city:hk:hong-kong'],interestTags:[],languages:[]}))).ok,true);
 assert.equal((await b.command(cmd('clearPreferences',randomUUID(),{},1))).code,'FORBIDDEN');assert.equal((await b.command(cmd('clearPreferences',actor,{},1))).ok,true);assert.equal((await b.read({kind:'preferences'})).data,null);
});
