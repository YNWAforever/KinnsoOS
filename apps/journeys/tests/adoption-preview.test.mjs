import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adoptionPreview} from '../lib/guides/adoption-preview.ts';
const stop=(version,note='')=>({id:'s'+version,title:'Saved stop',travellerNote:note,source:{guideId:'guide',guideVersion:version}});
const trip={id:'trip',title:'Private trip',revision:8,days:[{stops:[stop(1,'Keep my note'),stop(1)]},{stops:[{...stop(2,'Other note'),source:{guideId:'other',guideVersion:2}}]}]};
const guide={kind:'itinerary',id:'guide',version:2,days:[{stops:[{},{}]},{stops:[{}]}]};
test('summary content never produces a guessed itinerary comparison',()=>assert.equal(adoptionPreview({kind:'summary',id:'summary'},trip),null));
test('preview describes the actual appended authored copy and retained private notes without editing the trip',()=>{
 const before=JSON.stringify(trip);
 assert.deepEqual(adoptionPreview(guide,trip),{tripId:'trip',tripTitle:'Private trip',revision:8,guideVersion:2,existingVersions:[1],daysBefore:2,daysAfter:4,stopsAdded:3,privateNotesKept:2});
 assert.equal(JSON.stringify(trip),before);
});
test('existing source versions are unique, sorted, and restricted to this guide',()=>{
 const mixed={...trip,days:[{stops:[stop(3),stop(1),stop(3),{...stop(9),source:{guideId:'other',guideVersion:9}}]}]};
 assert.deepEqual(adoptionPreview(guide,mixed).existingVersions,[1,3]);
});
