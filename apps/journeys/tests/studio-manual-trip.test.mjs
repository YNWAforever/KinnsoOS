import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
import {restorableDeviceDrafts,restorableGuideDrafts,saveGuestTrip} from '../lib/trips/guest-drafts.ts';
import {previewLocalImport} from '../lib/trips/import.ts';
const manual=await studioModule('manual-trip');
const identity={id:'manual-copy-one',ownerId:'guest-manual-owner'};
const input=()=>({title:'My harbour walk',timezone:'Asia/Hong_Kong',startDate:'2026-11-07',days:[{title:'First day',stops:['Harbour','Coffee']}],note:'PRIVATE: leave time to rest'});
const draft=()=>({id:'manual-copy-one',ownerId:'guest-manual-owner',origin:'manual',purpose:'personal',title:'My harbour walk',timezone:'Asia/Hong_Kong',startDate:'2026-11-07',pendingPhotos:[],days:[{offset:0,title:'First day',stops:[{title:'Harbour',travellerNote:'PRIVATE: leave time to rest',startMinuteOfDay:null,durationMinutes:null},{title:'Coffee',travellerNote:'',startMinuteOfDay:null,durationMinutes:null}]}]});
function prepare(value=input(),scope=identity){assert.equal(typeof manual.prepareManualTripDraft,'function');return manual.prepareManualTripDraft(value,scope);}

test('saved manual metadata validation preserves the complete draft and accepts an unset date',()=>{
 assert.equal(typeof manual.manualTripDetailsIssue,'function');
 const value=draft(),before=structuredClone(value);
 assert.equal(manual.manualTripDetailsIssue(value),null);assert.deepEqual(value,before);
 assert.equal(manual.manualTripDetailsIssue({...value,startDate:null}),null);
});
for(const [patch,code] of [[{title:' '},'TITLE'],[{title:'x'.repeat(201)},'TITLE'],[{startDate:'2026-02-30'},'DATE'],[{timezone:'Invalid/Nowhere'},'TIMEZONE'],[{days:[{...draft().days[0],title:' '}]},'DAY_TITLE']])test(`saved manual details reject ${JSON.stringify(patch).slice(0,45)}`,()=>{
 assert.equal(typeof manual.manualTripDetailsIssue,'function');assert.equal(manual.manualTripDetailsIssue({...draft(),...patch}),code);
});

test('a manual itinerary contains only entered stops and has no invented guide credit or times',()=>{
 const value=input(),result=prepare(value);
 assert.deepEqual(result,draft());
 result.days[0].stops[0].title='Changed';
 assert.equal(value.days[0].stops[0],'Harbour');
});
test('an optional date stays unset and whitespace is normalized without dropping note content',()=>{
 const result=prepare({...input(),title:'  Weekend  ',startDate:'',days:[{title:'  Weekend morning  ',stops:['  Harbour  ']}],note:'  Keep this private note  '});
 assert.equal(result.title,'Weekend');assert.equal(result.startDate,null);
 assert.equal(result.days[0].stops[0].title,'Harbour');assert.equal(result.days[0].stops[0].travellerNote,'  Keep this private note  ');
 assert.equal(result.days[0].title,'Weekend morning');
});
for(const [patch,code] of [
 [{title:' '},'TITLE'],[{title:'x'.repeat(201)},'TITLE'],
 [{timezone:'Invalid/Nowhere'},'TIMEZONE'],[{startDate:'2026-02-30'},'DATE'],
 [{days:[]},'DAYS'],[{days:Array.from({length:31},()=>({title:'Day',stops:['Stop']}))},'DAYS'],
 [{days:[null]},'DAYS'],
 [{days:[{title:'Day',stops:[]}]},'STOPS'],[{days:[{title:'Day',stops:Array(21).fill('Stop')}]},'STOPS'],
 [{days:[{title:'Day',stops:['Good',' ']}]},'STOPS'],[{days:[{title:'Day',stops:['x'.repeat(201)]}]},'STOPS'],
 [{note:'x'.repeat(4001)},'NOTE'],[{days:[{title:'x'.repeat(201),stops:['Stop']}]},'DAY_TITLE'],
 [{days:[{title:'',stops:['Stop']}]},'DAY_TITLE'],
 [{days:[{title:'Valid first day',stops:['Stop']},{title:'Later day',stops:[]}]},'STOPS'],
])test(`manual preparation rejects ${JSON.stringify(Object.keys(patch))}: ${code}`,()=>{
 assert.throws(()=>prepare({...input(),...patch}),new RegExp(code));
});
test('multiple days keep the entered order, consecutive offsets and the private note exactly once',()=>{
 const value={...input(),days:[{title:'Markets',stops:['Night market','Tea']},{title:'Harbour day',stops:['Ferry','Coffee']}]};
 const snapshot=structuredClone(value),result=prepare(value);
 assert.deepEqual(result.days,[
  {offset:0,title:'Markets',stops:[{title:'Night market',travellerNote:'PRIVATE: leave time to rest',startMinuteOfDay:null,durationMinutes:null},{title:'Tea',travellerNote:'',startMinuteOfDay:null,durationMinutes:null}]},
  {offset:1,title:'Harbour day',stops:[{title:'Ferry',travellerNote:'',startMinuteOfDay:null,durationMinutes:null},{title:'Coffee',travellerNote:'',startMinuteOfDay:null,durationMinutes:null}]},
 ]);
 assert.deepEqual(value,snapshot);
 result.days[1].stops[0].title='Edited copy';assert.equal(value.days[1].stops[0],'Ferry');
});
test('thirty days remain recoverable by the existing device and account-import contracts',()=>{
 const result=prepare({...input(),days:Array.from({length:30},(_,index)=>({title:'Day '+(index+1),stops:['Own stop '+index]}))});
 assert.equal(result.days.length,30);assert.equal(result.days[29].offset,29);
 assert.deepEqual(restorableDeviceDrafts([result]),[result]);assert.equal(previewLocalImport(result,result.ownerId).ok,true);
});
test('two hundred stops are valid but the next stop cannot create an unrecoverable draft',()=>{
 const days=Array.from({length:10},(_,index)=>({title:'Day '+index,stops:Array.from({length:20},(_,stop)=>'Stop '+stop)}));
 const result=prepare({...input(),days});assert.equal(result.days.flatMap(day=>day.stops).length,200);
 assert.deepEqual(restorableDeviceDrafts([result]),[result]);assert.equal(previewLocalImport(result,result.ownerId).ok,true);
 assert.throws(()=>prepare({...input(),days:[...days,{title:'One too many',stops:['Extra stop']}]}),/TOTAL_STOPS/);
});
test('manual preparation cannot use an account identity or a path as a device identifier',()=>{
 for(const scope of [{...identity,ownerId:'account-A'},{...identity,id:'../../elsewhere'}])assert.throws(()=>prepare(input(),scope),/IDENTITY/);
});
test('a manual draft survives device recovery and the existing import preview unchanged',()=>{
 const value=draft(),rows=restorableDeviceDrafts([value]);
 assert.deepEqual(rows,[value]);assert.deepEqual(restorableGuideDrafts([value],'guide-one'),[]);
 const preview=previewLocalImport(rows[0],value.ownerId);assert.equal(preview.ok,true);
 assert.equal(preview.unverifiedSources,0);assert.equal(preview.payload.startDate,'2026-11-07');
 assert.equal(preview.payload.days[0].stops[0].travellerNote,'PRIVATE: leave time to rest');
 assert.equal(previewLocalImport(rows[0],'guest-other-owner').ok,false);
});
test('manual storage validation rejects mixed source claims and invalid calendar data',()=>{
 const withSource=draft();withSource.days[0].stops[0].source={guideId:'guide-one',version:1};
 const bad=[withSource,{...draft(),source:{guideId:'guide-one',version:1}},{...draft(),startDate:'2026-02-30'},{...draft(),timezone:'Invalid/Nowhere'}];
 assert.deepEqual(restorableDeviceDrafts(bad),[]);
 const unmarked=draft();delete unmarked.origin;
 assert.deepEqual(restorableDeviceDrafts([unmarked]),[],'legacy copies cannot become manual copies by dropping their attribution');
});
test('an aborted save cannot open device storage',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');let opened=0;
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){opened++;throw Error('Unexpected storage access');}});
 try{await assert.rejects(saveGuestTrip(draft(),AbortSignal.abort()),/abort/i);assert.equal(opened,0);}
 finally{if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else delete globalThis.indexedDB;}
});
