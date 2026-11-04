import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {restorableDeviceDrafts,guideDraft} from '../lib/trips/guest-drafts.ts';
const path=new URL('../lib/trips/device-trip-editor.ts',import.meta.url);
const editor=existsSync(path)?await import(path):{};
const stop=(title,note='')=>({title,travellerNote:note,startMinuteOfDay:null,durationMinutes:null});
const trip=()=>({id:'structure-copy',ownerId:'guest-structure',origin:'manual',purpose:'personal',title:'Weekend',startDate:'2026-11-07',timezone:'UTC',pendingPhotos:[],days:[{offset:0,title:'Harbour',stops:[stop('Ferry','PRIVATE FERRY NOTE'),stop('Tea')]},{offset:3,title:'Market',stops:[{...stop('Market','PRIVATE MARKET NOTE'),startMinuteOfDay:600,durationMinutes:30}]}]});
let sequence=0;
const key=()=>`editor-${++sequence}`;
function begin(value=trip()){assert.equal(typeof editor.beginGuestTripEdit,'function');return editor.beginGuestTripEdit(value,key);}
function change(value,command){assert.equal(typeof editor.changeManualTripStructure,'function');return editor.changeManualTripStructure(value,command,key);}
function snapshot(value){assert.equal(typeof editor.guestTripEditSnapshot,'function');return editor.guestTripEditSnapshot(value);}
function timing(value,stopKey,field,text){assert.equal(typeof editor.changeManualStopSchedule,'function');return editor.changeManualStopSchedule(value,stopKey,field,text);}

test('manual stop timing distinguishes blank, midnight and maximum duration in saved snapshots',()=>{
 const original=begin(),key=original.days[0].stops[0].editorKey;
 for(const [time,duration,start,minutes] of [['','',null,null],['00:00','1',0,1],['23:59','1440',1439,1440],['09:05','045',545,45]]){
  const edited=timing(timing(original,key,'startTime',time),key,'duration',duration);
  assert.equal(editor.manualTripStopScheduleIssue(edited),null);
  const saved=snapshot(edited).days[0].stops[0];
  assert.deepEqual(saved,{title:'Ferry',travellerNote:'PRIVATE FERRY NOTE',startMinuteOfDay:start,durationMinutes:minutes});
  assert.deepEqual(restorableDeviceDrafts([snapshot(edited)]),[snapshot(edited)]);
 }
 assert.equal(original.days[0].stops[0].startMinuteOfDay,null);
});

test('invalid schedule text is kept and cannot become an apparently valid time',()=>{
 const original=begin(),key=original.days[1].stops[0].editorKey;
 for(const [field,invalid,code] of [
  ...['9:00','24:00','12:60','12:',' 10:00','10:00:30'].map(value=>['startTime',value,'STOP_TIME']),
  ...['0','1441','-1','1.5','1e2','Infinity','NaN',' 30'].map(value=>['duration',value,'STOP_DURATION']),
 ]){
  const edited=timing(original,key,field,invalid),stop=edited.days[1].stops[0];
  assert.equal(editor.stopScheduleInput(stop)[field],invalid);
  assert.equal(editor.manualTripStopScheduleIssue(edited),code);
  assert.equal(stop.startMinuteOfDay,600);assert.equal(stop.durationMinutes,30);
  assert.equal(JSON.stringify(snapshot(edited)).includes('scheduleInput'),false);
 }
});

test('partial timing follows a transferred stop and clearing it preserves notes and day gaps',()=>{
 let editing=begin();const source=editing.days[1],key=source.stops[0].editorKey;
 editing=timing(editing,key,'startTime','12:');
 editing=change(editing,{type:'transferStop',dayKey:source.editorKey,stopKey:key,targetDayKey:editing.days[0].editorKey});
 assert.equal(editor.stopScheduleInput(editing.days[0].stops[2]).startTime,'12:');
 assert.equal(editor.manualTripStopScheduleIssue(editing),'STOP_TIME');
 editing=timing(timing(editing,key,'startTime',''),key,'duration','');
 assert.equal(editor.manualTripStopScheduleIssue(editing),null);
 assert.deepEqual(snapshot(editing).days[0].stops[2],stop('Market','PRIVATE MARKET NOTE'));
 assert.deepEqual(editing.days.map(day=>day.offset),[0,3]);
 assert.equal(timing(editing,'removed-stop','startTime','09:00'),editing);
});

test('guide-derived stop schedules cannot be edited through manual commands',()=>{
 const original=guideDraft({id:'guide',version:2,title:'Guide',days:[{offset:0,title:'Day',stops:[{title:'Stop',startMinuteOfDay:600,durationMinutes:30}]}]},'guide-copy','guest-guide','UTC');
 const editing=begin(original);
 assert.throws(()=>timing(editing,editing.days[0].stops[0].editorKey,'startTime','11:00'),/MANUAL_ONLY/);
 assert.deepEqual(snapshot(editing),original);
});

test('editor keys clone input nodes and disappear from a canonical snapshot',()=>{
 const original=trip(),before=structuredClone(original),editing=begin(original);
 const keys=editing.days.flatMap(day=>[day.editorKey,...day.stops.map(stop=>stop.editorKey)]);
 assert.equal(new Set(keys).size,5);assert.deepEqual(snapshot(editing),original);
 assert.equal(JSON.stringify(snapshot(editing)).includes('editorKey'),false);
 editing.days[0].stops[0].travellerNote='Edited';assert.deepEqual(original,before);
});
test('moving a day keeps its keys, private notes and times while renumbering dates',()=>{
 const editing=begin(),before=structuredClone(editing),day=editing.days[1];
 const moved=change(editing,{type:'moveDay',dayKey:day.editorKey,direction:-1});
 assert.deepEqual(moved.days.map(value=>[value.offset,value.title]),[[0,'Market'],[1,'Harbour']]);
 assert.equal(moved.days[0].editorKey,day.editorKey);assert.equal(moved.days[0].stops[0].editorKey,day.stops[0].editorKey);
 assert.deepEqual(moved.days[0].stops,day.stops);assert.deepEqual(editing,before);
 assert.deepEqual(restorableDeviceDrafts([snapshot(moved)]),[snapshot(moved)]);
});
test('stop moves and removal preserve surviving notes, keys and existing date gaps',()=>{
 const editing=begin(),day=editing.days[0],before=structuredClone(editing);
 const moved=change(editing,{type:'moveStop',dayKey:day.editorKey,stopKey:day.stops[1].editorKey,direction:-1});
 assert.deepEqual(moved.days[0].stops.map(value=>value.title),['Tea','Ferry']);assert.equal(moved.days[1].offset,3);
 assert.equal(moved.days[0].stops[1].travellerNote,'PRIVATE FERRY NOTE');assert.equal(moved.days[0].editorKey,day.editorKey);
 const removed=change(moved,{type:'removeStop',dayKey:day.editorKey,stopKey:day.stops[1].editorKey});
 assert.equal(removed.days[0].stops.length,1);assert.equal(removed.days[1].stops[0].travellerNote,'PRIVATE MARKET NOTE');assert.deepEqual(editing,before);
});
test('new days and stops invent no place, note or time and empty days can be recovered',()=>{
 const editing=begin(),added=change(editing,{type:'addDay',title:'Rest day'}),last=added.days.at(-1);
 assert.equal(last.title,'Rest day');assert.deepEqual(last.stops,[]);assert.equal(last.offset,2);
 assert.deepEqual(restorableDeviceDrafts([snapshot(added)]),[snapshot(added)]);
 const next=change(added,{type:'addStop',dayKey:last.editorKey});
 assert.deepEqual(snapshot(next).days[2].stops,[stop('')]);
 assert.equal(next.days[2].editorKey,last.editorKey);assert.notEqual(next.days[2].stops[0].editorKey,last.editorKey);
});
test('removing a day keeps the surviving note and the last day cannot be removed',()=>{
 const editing=begin(),remaining=change(editing,{type:'removeDay',dayKey:editing.days[0].editorKey});
 assert.equal(remaining.days.length,1);assert.equal(remaining.days[0].offset,0);assert.equal(remaining.days[0].stops[0].travellerNote,'PRIVATE MARKET NOTE');
 assert.throws(()=>change(remaining,{type:'removeDay',dayKey:remaining.days[0].editorKey}),/LAST_DAY/);
});
test('structure operations reject guide-derived copies without changing source credit',()=>{
 const original=guideDraft({id:'guide-one',version:2,title:'Guide',days:[{offset:0,title:'Day',stops:[{title:'Stop',startMinuteOfDay:null,durationMinutes:null}]}]},'guide-copy','guest-guide','UTC');
 const editing=begin(original);assert.throws(()=>change(editing,{type:'addDay',title:'Extra'}),/MANUAL_ONLY/);
 assert.deepEqual(snapshot(editing),original);assert.equal(snapshot(editing).days[0].stops[0].source.version,2);
});
test('thirty days, fifty stops per day and two hundred total are enforced without mutation',()=>{
 const manyDays=begin({...trip(),days:Array.from({length:30},(_,offset)=>({offset,title:'Day',stops:[]}))});
 assert.throws(()=>change(manyDays,{type:'addDay',title:'Extra'}),/DAY_LIMIT/);assert.equal(manyDays.days.length,30);
 const fullDay=begin({...trip(),days:[{offset:0,title:'Day',stops:Array.from({length:50},()=>stop('Own stop'))}]});
 assert.throws(()=>change(fullDay,{type:'addStop',dayKey:fullDay.days[0].editorKey}),/STOP_LIMIT/);
 const fullTrip=begin({...trip(),days:Array.from({length:5},(_,offset)=>({offset,title:'Day',stops:Array.from({length:40},()=>stop('Own stop'))}))});
 assert.throws(()=>change(fullTrip,{type:'addStop',dayKey:fullTrip.days[0].editorKey}),/STOP_LIMIT/);
 const near=begin({...trip(),days:[{offset:0,title:'Day',stops:Array.from({length:49},()=>stop('Own stop'))}]});
 assert.equal(change(near,{type:'addStop',dayKey:near.days[0].editorKey}).days[0].stops.length,50);
 assert.equal(snapshot(fullTrip).days.flatMap(day=>day.stops).length,200);
});
test('stale targets and boundary moves cannot mutate another day or stop',()=>{
 const editing=begin();assert.equal(change(editing,{type:'removeStop',dayKey:'gone',stopKey:'gone'}),editing);
 assert.equal(change(editing,{type:'moveDay',dayKey:editing.days[0].editorKey,direction:-1}),editing);
 assert.equal(change(editing,{type:'moveStop',dayKey:editing.days[0].editorKey,stopKey:editing.days[0].stops[0].editorKey,direction:-1}),editing);
});

test('transferring a stop preserves its key, note, times and date gaps without mutating the input',()=>{
 const editing=begin(),before=structuredClone(editing),moving=editing.days[1].stops[0];
 const result=change(editing,{type:'transferStop',dayKey:editing.days[1].editorKey,stopKey:moving.editorKey,targetDayKey:editing.days[0].editorKey});
 assert.deepEqual(result.days.map(day=>day.offset),[0,3]);assert.equal(result.days[1].stops.length,0);
 assert.deepEqual(result.days[0].stops.map(stop=>stop.title),['Ferry','Tea','Market']);
 assert.deepEqual(result.days[0].stops[2],moving);assert.equal(result.days[0].stops[2].travellerNote,'PRIVATE MARKET NOTE');
 assert.equal(result.days[0].stops[2].startMinuteOfDay,600);assert.equal(result.days[0].stops[2].durationMinutes,30);
 assert.deepEqual(editing,before);assert.deepEqual(restorableDeviceDrafts([snapshot(result)]),[snapshot(result)]);
});
test('transfers reject full destinations but remain available at the two hundred-stop total limit',()=>{
 const full=begin({...trip(),days:[{offset:0,title:'Source',stops:[stop('Move me','Private')]},{offset:1,title:'Full',stops:Array.from({length:50},()=>stop('Own stop'))}]});
 const before=structuredClone(full);
 assert.throws(()=>change(full,{type:'transferStop',dayKey:full.days[0].editorKey,stopKey:full.days[0].stops[0].editorKey,targetDayKey:full.days[1].editorKey}),/STOP_LIMIT/);assert.deepEqual(full,before);
 const capped=begin({...trip(),days:Array.from({length:5},(_,offset)=>({offset,title:'Day',stops:Array.from({length:40},()=>stop('Own stop'))}))});
 const moved=change(capped,{type:'transferStop',dayKey:capped.days[0].editorKey,stopKey:capped.days[0].stops[0].editorKey,targetDayKey:capped.days[1].editorKey});
 assert.equal(moved.days[0].stops.length,39);assert.equal(moved.days[1].stops.length,41);assert.equal(moved.days.flatMap(day=>day.stops).length,200);
});
test('self, missing and repeated cross-day targets cannot duplicate or lose a stop',()=>{
 const editing=begin(),day=editing.days[0],command={type:'transferStop',dayKey:day.editorKey,stopKey:day.stops[0].editorKey,targetDayKey:editing.days[1].editorKey};
 assert.equal(change(editing,{...command,targetDayKey:day.editorKey}),editing);
 assert.equal(change(editing,{...command,targetDayKey:'removed-day'}),editing);
 assert.equal(change(editing,{...command,stopKey:'removed-stop'}),editing);
 const moved=change(editing,command);assert.equal(change(moved,command),moved);assert.equal(moved.days.flatMap(day=>day.stops).length,3);
});
