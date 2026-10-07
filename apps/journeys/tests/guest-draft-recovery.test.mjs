import test from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../lib/trips/guest-drafts.ts';

const draft=()=>({id:'device-original',ownerId:'guest-local-owner',purpose:'personal',title:'Saved Kyoto walk',timezone:'Asia/Tokyo',startDate:null,pendingPhotos:[],days:[{offset:0,title:'Saved first day',stops:[{title:'My edited temple',travellerNote:'My saved private note',startMinuteOfDay:600,durationMinutes:30,source:{guideId:'guide-one',version:1}}]}]});
function recover(rows){
 assert.equal(typeof storage.restorableGuideDrafts,'function','saved device copies need a validated recovery path');
 return storage.restorableGuideDrafts(rows,'guide-one');
}

test('recovering an old guide copy preserves its identity, edits and source version',()=>{
 const original=draft(),rows=recover([original]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'device-original');
 assert.equal(rows[0].ownerId,'guest-local-owner');assert.equal(rows[0].timezone,'Asia/Tokyo');
 assert.equal(rows[0].days[0].stops[0].title,'My edited temple');
 assert.equal(rows[0].days[0].stops[0].travellerNote,'My saved private note');
 assert.deepEqual(rows[0].days[0].stops[0].source,{guideId:'guide-one',version:1});
 rows[0].days[0].stops[0].travellerNote='Changed after recovery';
 assert.equal(original.days[0].stops[0].travellerNote,'My saved private note','reading cannot mutate the stored input');
});
test('recovery offers multiple matching copies without merging them or including another guide',()=>{
 const first=draft(),second=draft(),other=draft();second.id='device-second';
 other.id='device-other';other.days[0].stops[0].source.guideId='guide-two';
 assert.deepEqual(recover([first,other,second]).map(row=>row.id),['device-original','device-second']);
});
test('an explicitly tagged empty itinerary can be resumed without guessing stops',()=>{
 const row=draft();row.source={guideId:'guide-one',version:2};row.days[0].stops=[];
 const result=recover([row]);assert.equal(result.length,1);assert.deepEqual(result[0].days[0].stops,[]);
 assert.deepEqual(result[0].source,{guideId:'guide-one',version:2});
 delete row.source;assert.deepEqual(recover([row]),[],'unidentified legacy empty copies cannot be attributed by title');
});
test('malformed, oversized and cyclic local copies are excluded without hiding valid copies',()=>{
 const bad=draft(),large=draft(),cycle=draft();bad.days[0].stops[0].travellerNote={secret:'invalid'};
 large.days[0].stops[0].travellerNote='x'.repeat(262145);cycle.extra=cycle;
 assert.deepEqual(recover([null,{},bad,large,cycle,draft()]).map(row=>row.id),['device-original']);
 assert.deepEqual(recover(null),[]);
});
test('account, business, photo-bearing and non-guest shapes cannot become a device planner copy',()=>{
 const rows=[{purpose:'business'},{ownerId:'account-A'},{startDate:'2026-10-07'},{pendingPhotos:[{name:'photo.jpg',mime:'image/jpeg',size:1}]},{id:'../../elsewhere'}].map(patch=>({...draft(),...patch}));
 assert.deepEqual(recover(rows),[]);
});
test('mismatched or invalid source tags never inherit the current guide identity',()=>{
 const rows=[0,1.5,'1',null].map(version=>{const row=draft();row.days[0].stops[0].source.version=version;return row;});
 const mixed=draft();mixed.days[0].stops.push({...mixed.days[0].stops[0],source:{guideId:'guide-two',version:1}});rows.push(mixed);
 const changed=draft();changed.source={guideId:'guide-one',version:2};rows.push(changed);
 assert.deepEqual(recover(rows),[]);
});
test('recovery drops unrelated stored fields instead of propagating roles or business records',()=>{
 const row={...draft(),role:'ops',payout:{amount:100},sourceSecret:'private'};
 const recovered=recover([row])[0];assert.equal(recovered.role,undefined);assert.equal(recovered.payout,undefined);assert.equal(recovered.sourceSecret,undefined);
});
