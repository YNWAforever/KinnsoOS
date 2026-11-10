import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {guideDraft,restorableGuideDrafts} from '../lib/trips/guest-drafts.ts';
import * as manual from '../lib/studio/manual-trip.ts';
import {sameValue} from '../lib/studio/contracts.ts';
import * as editor from '../lib/trips/device-trip-editor.ts';

// Run the real component handlers. Only hook scheduling and the asynchronous
// IndexedDB boundary are controlled, so a late transaction is deterministic.
const source=await readFile(new URL('../app/travel/GuestPlanner.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const guide={id:'guide-one',version:2,title:'Kyoto walk',days:[{offset:0,title:'Morning',stops:[{title:'Temple',startMinuteOfDay:540,durationMinutes:60}]}]};
function planner(actorId=null,initialDraft=null,onSaved=undefined,locale='en',onDeleted=undefined){
 const states=[],refs=[],effects=[],writes=[],reads=[],deletes=[],listeners=new Map();let cursor=0,tree,guard;
 const react={
  useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
  useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},
  useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,cleanup:old?.cleanup,pending:true};},
 };
 react.useLayoutEffect=react.useEffect;
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,Intl,AbortController,
  window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},
  require:name=>{
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
   if(name==='next/link')return{__esModule:true,default:'a'};
   if(name==='./ui')return{Modal:'dialog',useApp:()=>({t:(en,zh)=>locale==='zh-HK'?zh:en,href:path=>'/'+locale+'/'+path})};
   if(name==='./UnsavedDraftGuard')return{useUnsavedDraftGuard:value=>{guard=value;}};
   if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:()=>()=>{}};
   if(name==='../../lib/studio/manual-trip')return manual;
   if(name==='../../lib/studio/contracts')return{sameValue};
   if(name==='../../lib/trips/device-trip-editor')return editor;
   if(name==='../../lib/trips/guest-drafts')return{guideDraft,restorableGuideDrafts,readGuestTrips:()=>new Promise((resolve,reject)=>reads.push({resolve,reject})),saveGuestTrip:(trip,signal)=>new Promise((resolve,reject)=>writes.push({trip:structuredClone(trip),signal,resolve,reject})),deleteGuestTrip:async(id,ownerId)=>{deletes.push({id,ownerId});}};
   if(name==='./AvailabilityPanel')return{AvailabilityPanel:()=>null};
    throw Error('Unexpected dependency '+name);
  }}));
 function render(){cursor=0;tree=module.exports.GuestPlanner({...(initialDraft?{initialDraft,onSaved}:{guide}),actorId,onDeleted});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}return tree;}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const button=name=>elements().find(el=>el.type==='button'&&el.props.children===name);
 const status=()=>elements().find(el=>el.props?.role==='status').props.children;
 const importLink=()=>elements().find(el=>el.type==='a'&&el.props.href?.startsWith('/en/sign-in'));
 const edit=(type,value)=>{elements().find(el=>el.type===type).props.onChange({target:{value}});render();};
 const settle=async(index,error,autoRead=true)=>{const before=reads.length;if(error)writes[index].reject(error);else writes[index].resolve();await new Promise(resolve=>setImmediate(resolve));if(autoRead&&reads.length>before){reads.at(-1).resolve([structuredClone(writes[index].trip)]);await new Promise(resolve=>setImmediate(resolve));}render();};
 const settleRead=async(index,rows,error)=>{if(error)reads[index].reject(error);else reads[index].resolve(rows);await new Promise(resolve=>setImmediate(resolve));render();};
 const fields=name=>elements().filter(el=>el.type==='label'&&[el.props.children].flat().includes(name)).map(el=>el.props.children.find(child=>child?.type==='input'));
 const field=name=>fields(name)[0],buttons=name=>elements().filter(el=>el.type==='button'&&el.props.children===name);
 render();return{render,elements,button,buttons,status,importLink,edit,field,fields,settle,settleRead,writes,reads,deletes,listeners,guard:()=>guard,changeActor:next=>{actorId=next;render();},unmount:()=>effects.forEach(effect=>effect?.cleanup?.())};
}

const manualCopy=()=>({id:'manual-details',ownerId:'guest-manual',origin:'manual',purpose:'personal',title:'Original trip',timezone:'UTC',startDate:'2026-11-07',pendingPhotos:[],days:[{offset:0,title:'First day',stops:[{title:'Harbour',travellerNote:'Keep my private note',startMinuteOfDay:null,durationMinutes:null}]}]});
const crossDayCopy=()=>({...manualCopy(),days:[...manualCopy().days,{offset:3,title:'Later',stops:[]}]});
const timeLabel='Start time (HH:mm, optional)',durationLabel='Duration in minutes (optional)';
function setTiming(p,label,value){const field=p.field(label);assert.ok(field,'manual stops need timing inputs');field.props.onChange({target:{value}});p.render();}

test('manual times save only on explicit Save and clearing persists unknown instead of zero',async()=>{
 const original=manualCopy(),saved=[],p=planner(null,original,copy=>saved.push(copy));p.render();
 setTiming(p,timeLabel,'00:00');setTiming(p,durationLabel,'90');
 assert.equal(p.writes.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.importLink(),undefined);
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(saved[0].id,original.id);assert.equal(saved[0].ownerId,original.ownerId);
 assert.deepEqual(saved[0].days[0].stops[0],{...original.days[0].stops[0],startMinuteOfDay:0,durationMinutes:90});
 assert.equal(JSON.stringify(saved[0]).includes('scheduleInput'),false);assert.ok(p.importLink());
 setTiming(p,timeLabel,'');setTiming(p,durationLabel,'');
 p.button('Save device draft').props.onClick();p.render();await p.settle(1);
 assert.deepEqual(saved[1],original);
 const guideEditor=planner(null,guideDraft(guide,'guide-copy','guest-guide','UTC'));
 assert.equal(guideEditor.field(timeLabel),undefined);assert.equal(guideEditor.field(durationLabel),undefined);
});

test('invalid timing blocks Save and save-and-leave while preserving the authored input',async()=>{
 const p=planner(null,manualCopy());p.render();
 for(const [label,value] of [[timeLabel,'24:00'],[durationLabel,'1.5']]){
  setTiming(p,label,value);p.button('Save device draft').props.onClick();p.render();
  assert.equal(p.writes.length,0);assert.equal(p.field(label).props.value,value);
  assert.equal(p.field(label).props['aria-invalid'],true);assert.equal(p.guard().dirty,true);
  assert.equal(await p.guard().saveLatest(),false);assert.equal(p.writes.length,0);
  assert.equal(p.importLink(),undefined);setTiming(p,label,'');
 }
 assert.equal(p.elements().find(node=>node.type==='textarea').props.value,'Keep my private note');
});

test('a corrected time retries the same copy after an unconfirmed save readback',async()=>{
 const p=planner(null,manualCopy());p.render();setTiming(p,timeLabel,'09:');
 assert.equal(await p.guard().saveLatest(),false);setTiming(p,timeLabel,'09:30');setTiming(p,durationLabel,'1440');
 p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);
 await p.settleRead(0,[],new Error('readback unavailable'));
 assert.equal(p.guard().dirty,true);assert.equal(p.field(timeLabel).props.value,'09:30');assert.equal(p.field(durationLabel).props.value,'1440');
 p.button('Save device draft').props.onClick();p.render();await p.settle(1);
 assert.deepEqual(p.writes[1].trip,p.writes[0].trip);assert.equal(p.writes[1].trip.days[0].stops[0].startMinuteOfDay,570);assert.equal(p.guard().dirty,false);
});

test('timing input and its captured handler follow the same stop across days',async()=>{
 const p=planner(null,crossDayCopy());p.render();setTiming(p,timeLabel,'10:');
 const field=p.field(timeLabel);chooseOtherDay(p);p.button('Move stop to day').props.onClick();p.render();
 assert.equal(p.field(timeLabel).props.value,'10:');field.props.onChange({target:{value:'10:15'}});p.render();
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(p.writes[0].trip.days[0].stops.length,0);assert.equal(p.writes[0].trip.days[1].stops[0].startMinuteOfDay,615);
 assert.equal(p.writes[0].trip.days[1].stops[0].travellerNote,'Keep my private note');
});

for(const state of ['account','unmount'])test(`captured timing handlers cannot edit after ${state}`,()=>{
 const p=planner('account-A',manualCopy());p.render();setTiming(p,timeLabel,'08:');const old=p.field(timeLabel);
 if(state==='account'){p.changeActor('account-B');p.render();p.changeActor('account-A');p.render();}else p.unmount();
 old.props.onChange({target:{value:'22:00'}});p.render();assert.equal(p.field(timeLabel).props.value,'08:');
 assert.equal(p.writes.length,0);
});

test('timing edits are blocked through both the device write and its readback',async()=>{
 const p=planner(null,manualCopy());p.render();setTiming(p,timeLabel,'08:00');const old=p.field(timeLabel);
 p.button('Save device draft').props.onClick();p.render();assert.equal(p.field(timeLabel).props.disabled,true);
 old.props.onChange({target:{value:'09:00'}});p.render();await p.settle(0,undefined,false);
 old.props.onChange({target:{value:'10:00'}});p.render();assert.equal(p.field(timeLabel).props.value,'08:00');
 await p.settleRead(0,[p.writes[0].trip]);assert.equal(p.guard().dirty,false);assert.equal(p.writes[0].trip.days[0].stops[0].startMinuteOfDay,480);
});

test('invalid unsaved timing does not prevent deleting its selected device copy',async()=>{
 const original=manualCopy(),deleted=[],p=planner(null,original,undefined,'en',copy=>deleted.push(copy));p.render();
 setTiming(p,durationLabel,'bad');p.button('Delete this device draft').props.onClick();p.render();
 p.button('Delete device copy').props.onClick();await new Promise(resolve=>setImmediate(resolve));p.render();
 assert.deepEqual(p.deletes,[{id:original.id,ownerId:original.ownerId}]);assert.deepEqual(deleted,[original]);
 assert.equal(p.guard().dirty,false);assert.equal(p.writes.length,0);assert.match(p.status(),/deleted/);
});

function chooseOtherDay(p){
 const select=p.elements().find(node=>node.type==='select');assert.ok(select,'a manual stop needs an explicit destination picker');
 const option=p.elements(select).find(node=>node.type==='option'&&node.props.value);assert.ok(option);
 assert.equal(option.props.children,'Day 4 · Later');select.props.onChange({target:{value:option.props.value}});p.render();return select;
}

test('a destination selection alone does not edit the trip; moving keeps its note and existing day dates',async()=>{
 const original=crossDayCopy(),completed=[],p=planner(null,original,copy=>completed.push(copy));chooseOtherDay(p);
 assert.equal(p.guard().dirty,false);assert.equal(p.writes.length,0);assert.ok(p.importLink());
 p.button('Move stop to day').props.onClick();p.render();assert.equal(p.guard().dirty,true);assert.equal(p.writes.length,0);
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(completed.length,1);assert.deepEqual(completed[0].days.map(day=>day.offset),[0,3]);assert.equal(completed[0].days[0].stops.length,0);
 assert.deepEqual(completed[0].days[1].stops,original.days[0].stops);assert.equal(completed[0].id,original.id);assert.equal(JSON.stringify(completed[0]).includes('editorKey'),false);
 assert.equal(original.days[0].stops.length,1);assert.equal(p.elements().find(node=>node.type==='select').props.value,'');
});

for(const state of ['account','busy'])test(`captured cross-day move is blocked during ${state} changes`,async()=>{
 const p=planner('account-A',crossDayCopy()),select=chooseOtherDay(p),move=p.button('Move stop to day');
 if(state==='account'){
  p.changeActor('account-B');p.render();select.props.onChange({target:{value:'old-target'}});move.props.onClick();p.render();
  assert.equal(p.elements().find(node=>node.type==='select').props.value,'');assert.equal(p.writes.length,0);
 }else{
  p.button('Save device draft').props.onClick();p.render();assert.equal(p.button('Move stop to day').props.disabled,true);
  move.props.onClick();p.render();await p.settle(0,undefined,false);move.props.onClick();p.render();
  assert.equal(p.reads.length,1);await p.settleRead(0,[p.writes[0].trip]);
 }
 assert.equal(p.fields('Draft stop title').length,1);assert.equal(p.elements().find(node=>node.type==='textarea').props.value,'Keep my private note');
});

test('removing a selected destination clears the choice and a stale move cannot remove its source stop',()=>{
 const p=planner(null,crossDayCopy());chooseOtherDay(p);const move=p.button('Move stop to day');
 p.buttons('Remove day')[1].props.onClick();p.render();const dialog=p.elements().find(node=>node.type==='dialog'&&node.props.title==='Remove this day?');
 p.elements(dialog).find(node=>node.type==='button'&&node.props.children==='Remove day').props.onClick();p.render();
 move.props.onClick();p.render();assert.equal(p.fields('Draft day title').length,1);assert.equal(p.fields('Draft stop title').length,1);
 assert.equal(p.elements().find(node=>node.type==='select').props.value,'');assert.equal(p.button('Move stop to day').props.disabled,true);assert.equal(p.writes.length,0);
});

test('saved manual days and stops can be arranged without writing until Save or persisting editor keys',async()=>{
 const original=manualCopy(),completed=[],p=planner(null,original,copy=>completed.push(copy));
 assert.ok(p.button('Add day'),'manual copies need a day action');p.button('Add day').props.onClick();p.render();
 p.fields('Draft day title')[1].props.onChange({target:{value:'Market day'}});p.render();
 p.button('Add stop').props.onClick();p.render();p.fields('Draft stop title')[1].props.onChange({target:{value:'Coffee'}});p.render();
 p.buttons('Move day earlier').find(button=>!button.props.disabled).props.onClick();p.render();
 p.button('Add stop').props.onClick();p.render();p.fields('Draft stop title')[0].props.onChange({target:{value:'Night market'}});p.render();
 assert.equal(p.writes.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.importLink(),undefined);
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(completed.length,1);assert.equal(completed[0].id,original.id);assert.equal(completed[0].ownerId,original.ownerId);
 assert.deepEqual(completed[0].days.map(day=>[day.offset,day.title,day.stops.map(stop=>stop.title)]),[[0,'Market day',['Night market']],[1,'First day',['Harbour','Coffee']]]);
 assert.equal(completed[0].days[1].stops[0].travellerNote,'Keep my private note');assert.equal(original.days.length,1);
 assert.equal(JSON.stringify(p.writes[0].trip).includes('editorKey'),false);assert.equal(JSON.stringify(completed[0]).includes('editorKey'),false);
});

test('removing a stop requires confirmation, cancellation preserves its note, and guide controls stay absent',async()=>{
 const original=manualCopy(),completed=[],p=planner(null,original,copy=>completed.push(copy));
 assert.ok(p.button('Remove stop'));p.button('Remove stop').props.onClick();p.render();
 let dialog=p.elements().find(node=>node.type==='dialog'&&node.props.title==='Remove this stop?');assert.ok(dialog);
 p.elements(dialog).find(node=>node.type==='button'&&node.props.children==='Keep stop').props.onClick();p.render();
 assert.equal(p.elements().find(node=>node.type==='textarea').props.value,'Keep my private note');assert.equal(p.guard().dirty,false);
 p.button('Remove stop').props.onClick();p.render();dialog=p.elements().find(node=>node.type==='dialog'&&node.props.title==='Remove this stop?');
 p.elements(dialog).find(node=>node.type==='button'&&node.props.children==='Remove stop').props.onClick();p.render();
 assert.equal(p.writes.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.fields('Draft stop title').length,0);
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);assert.equal(completed[0].days[0].stops.length,0);
 const guideEditor=planner(null,guideDraft(guide,'guide-copy','guest-guide','UTC'));
 assert.equal(guideEditor.button('Add day'),undefined);assert.equal(guideEditor.button('Remove stop'),undefined);
});

test('captured removal confirmation cannot change the retained draft after an account switch',()=>{
 const p=planner('account-A',manualCopy());p.button('Remove stop').props.onClick();p.render();
 const dialog=p.elements().find(node=>node.type==='dialog'&&node.props.title==='Remove this stop?');
 const confirm=p.elements(dialog).find(node=>node.type==='button'&&node.props.children==='Remove stop');
 p.changeActor('account-B');p.render();assert.equal(p.elements().some(node=>node.type==='dialog'),false);
 confirm.props.onClick();p.render();assert.equal(p.fields('Draft stop title').length,1);assert.equal(p.elements().find(node=>node.type==='textarea').props.value,'Keep my private note');assert.equal(p.writes.length,0);
});

test('a captured removal request cannot reopen the old actor prompt after switching accounts',()=>{
 const p=planner('account-A',manualCopy()),request=p.button('Remove stop');
 p.changeActor('account-B');p.render();request.props.onClick();p.render();
 assert.equal(p.elements().some(node=>node.type==='dialog'),false);assert.equal(p.fields('Draft stop title').length,1);assert.equal(p.writes.length,0);
});

test('structural actions stay blocked through write and readback, including captured earlier handlers',async()=>{
 const p=planner(null,manualCopy()),add=p.button('Add day');
 p.field('Draft trip title').props.onChange({target:{value:'Saving copy'}});p.render();p.button('Save device draft').props.onClick();p.render();
 assert.equal(p.button('Add day').props.disabled,true);add.props.onClick();p.render();assert.equal(p.fields('Draft day title').length,1);
 await p.settle(0,undefined,false);add.props.onClick();p.render();assert.equal(p.fields('Draft day title').length,1);
 await p.settleRead(0,[p.writes[0].trip]);assert.equal(p.button('Add day').props.disabled,false);
 p.button('Add day').props.onClick();p.render();assert.equal(p.fields('Draft day title').length,2);assert.equal(p.guard().dirty,true);
});

test('manual trip details stay editable and saving preserves identity, notes and stop order',async()=>{
 const original=manualCopy(),completed=[],p=planner(null,original,copy=>completed.push(copy));
 for(const [label,value] of [['Draft trip title','Renamed trip'],['Draft start date (optional)','2026-12-01'],['Draft time zone','Asia/Tokyo'],['Draft day title','Arrival day']]){
  assert.ok(p.field(label),label+' must be editable');p.field(label).props.onChange({target:{value}});p.render();
 }
 assert.equal(p.writes.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.importLink(),undefined);
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(completed.length,1);assert.equal(completed[0].id,original.id);assert.equal(completed[0].ownerId,original.ownerId);
 assert.equal(completed[0].title,'Renamed trip');assert.equal(completed[0].startDate,'2026-12-01');assert.equal(completed[0].timezone,'Asia/Tokyo');assert.equal(completed[0].days[0].title,'Arrival day');
 assert.deepEqual(completed[0].days[0].stops,original.days[0].stops);assert.equal(original.title,'Original trip');
});

test('a transaction acknowledgement alone cannot complete a device edit or enable import',async()=>{
 const original=guideDraft(guide,'verify-device','guest-verify','UTC'),completed=[],p=planner(null,original,copy=>completed.push(copy));
 p.edit('textarea','Verified note');p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);
 assert.equal(completed.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.importLink(),undefined);assert.equal(p.reads.length,1);
 await p.settleRead(0,[p.writes[0].trip]);assert.equal(completed.length,1);assert.ok(p.importLink());
});

for(const fault of ['missing','mismatch','error'])test(`device ${fault} readback keeps edits and retry uses the original identity`,async()=>{
 const original=guideDraft(guide,'same-copy','guest-same','UTC'),completed=[],p=planner(null,original,copy=>completed.push(copy));
 p.edit('textarea','Unconfirmed note');p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);
 assert.equal(p.reads.length,1);
 await p.settleRead(0,fault==='missing'?[]:[original],fault==='error'?new Error('Read unavailable'):undefined);
 assert.equal(completed.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.importLink(),undefined);assert.match(p.status(),/not confirmed/i);
 assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'Unconfirmed note');
 p.button('Save device draft').props.onClick();p.render();await p.settle(1);assert.equal(completed.length,1);
 assert.equal(p.writes[1].trip.id,original.id);assert.equal(p.writes[1].trip.ownerId,original.ownerId);
});

test('newer edits during readback cannot be acknowledged by the older snapshot',async()=>{
 const original=guideDraft(guide,'pending-read','guest-read','UTC'),completed=[],p=planner(null,original,copy=>completed.push(copy));
 p.edit('textarea','Older note');p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);
 assert.equal(p.reads.length,1);p.edit('textarea','Newer note');await p.settleRead(0,[p.writes[0].trip]);
 assert.equal(completed.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'Newer note');
 p.button('Save device draft').props.onClick();p.render();await p.settle(1);assert.equal(completed[0].days[0].stops[0].travellerNote,'Newer note');
});

for(const label of ['Draft trip title','Draft day title'])test(`newer ${label} input during readback stays unsaved until its own retry`,async()=>{
 const completed=[],p=planner(null,manualCopy(),copy=>completed.push(copy));
 p.field(label).props.onChange({target:{value:'Older title'}});p.render();p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);
 assert.equal(p.reads.length,1);p.field(label).props.onChange({target:{value:'Newer title'}});p.render();await p.settleRead(0,[p.writes[0].trip]);
 assert.equal(completed.length,0);assert.equal(p.guard().dirty,true);assert.equal(p.field(label).props.value,'Newer title');assert.equal(p.importLink(),undefined);
 p.button('Save device draft').props.onClick();p.render();await p.settle(1);assert.equal(completed.length,1);
 assert.equal(label==='Draft trip title'?completed[0].title:completed[0].days[0].title,'Newer title');
});

test('unmount during manual metadata readback cannot approve navigation or notify the parent',async()=>{
 const completed=[],p=planner(null,manualCopy(),copy=>completed.push(copy));
 p.field('Draft trip title').props.onChange({target:{value:'Pending title'}});p.render();
 const pending=p.guard().saveLatest();p.render();await p.settle(0,undefined,false);assert.equal(p.reads.length,1);
 p.unmount();await p.settleRead(0,[p.writes[0].trip]);assert.equal(await pending,false);assert.equal(completed.length,0);
});

test('an account change during readback cannot finish the old actor save or unlock a newer save',async()=>{
 const original=guideDraft(guide,'actor-read','guest-read','UTC'),completed=[],p=planner('account-A',original,copy=>completed.push(copy));
 p.edit('textarea','A note');p.button('Save device draft').props.onClick();p.render();await p.settle(0,undefined,false);assert.equal(p.reads.length,1);
 p.changeActor('account-B');p.render();p.edit('textarea','Reviewed B note');p.button('Save device draft').props.onClick();p.render();
 await p.settleRead(0,[p.writes[0].trip]);assert.equal(completed.length,0);assert.equal(p.button('Save device draft').props.disabled,true);
 await p.settle(1);assert.equal(completed.length,1);assert.equal(completed[0].days[0].stops[0].travellerNote,'Reviewed B note');
});

test('an actor change cancels the old save and releases the retained editor without acknowledging stale work',async()=>{
 const original=guideDraft(guide,'retained-editor','guest-retained','UTC'),completed=[];
 const p=planner('account-A',original,copy=>completed.push(copy));
 p.edit('textarea','Unconfirmed old-account edit');p.button('Save device draft').props.onClick();p.render();
 assert.equal(p.button('Save device draft').props.disabled,true);
 p.changeActor('account-B');p.render();
 assert.equal(p.writes[0].signal.aborted,true);
 assert.equal(p.button('Save device draft').props.disabled,false);
 assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'Unconfirmed old-account edit');
 p.edit('textarea','Reviewed after account change');p.button('Save device draft').props.onClick();p.render();
 await p.settle(0);
 assert.equal(p.button('Save device draft').props.disabled,true,'old finally cannot unlock a newer save');
 assert.equal(completed.length,0);
 await p.settle(1);
 assert.equal(completed.length,1);assert.equal(completed[0].days[0].stops[0].travellerNote,'Reviewed after account change');
 assert.equal(original.days[0].stops[0].travellerNote,'');p.unmount();
});

test('navigation waits for the latest acknowledged snapshot without closing the repair editor',async()=>{
 const original=guideDraft(guide,'device-navigation','guest-original','UTC'),completed=[];
 const p=planner('account-A',original,copy=>completed.push(copy));p.edit('textarea','First revision');
 assert.equal(p.guard()?.dirty,true,'register unsaved device work');
 const older=p.guard().saveLatest();p.render();assert.equal(await p.guard().saveLatest(),false,'a pending write cannot acknowledge navigation');
 p.edit('textarea','Latest revision');await p.settle(0);assert.equal(await older,false);
 const latest=p.guard().saveLatest();p.render();await p.settle(1);assert.equal(await latest,true);
 assert.equal(p.writes[1].trip.days[0].stops[0].travellerNote,'Latest revision');assert.equal(completed.length,0,'guard save does not close a cancelled navigation editor');
 p.edit('textarea','Quota failure');const failed=p.guard().saveLatest();p.render();await p.settle(2,new Error('quota'));assert.equal(await failed,false);
 const closed=p.guard().saveLatest();p.render();p.unmount();await p.settle(3);assert.equal(await closed,false,'unmounted writes cannot authorize navigation');
});

for(const [field,value] of [['input','A later stop title'],['textarea','Keep this newer private note']]){
 test(`a late device save cannot acknowledge newer ${field} edits`,async()=>{
  const p=planner();p.button('Plan as a device-only draft').props.onClick();p.render();
  p.edit(field,value);await p.settle(0);
  assert.match(p.status(),/not saved yet/i);
  assert.equal(p.elements().find(el=>el.type===field).props.value,value);
  assert.equal(p.importLink(),undefined,'unsaved edits must not be abandoned for sign-in');
  assert.equal(p.button('Save device draft').props.disabled,false);
  p.button('Save device draft').props.onClick();p.render();await p.settle(1);
  assert.match(p.status(),/draft saved/i);
  assert.equal(p.writes[1].trip.days[0].stops[0][field==='input'?'title':'travellerNote'],value);
  assert.equal(p.writes[1].trip.id,p.writes[0].trip.id,'retry updates the same device draft');
  assert.equal(p.importLink().props.href,'/en/sign-in?next=%2Fen%2Ftrips');
 });
}
test('sign-in is unavailable until the first IndexedDB transaction completes',async()=>{
 const p=planner();p.button('Plan as a device-only draft').props.onClick();p.render();
 assert.equal(p.importLink(),undefined);assert.equal(p.button('Save device draft').props.disabled,true);
 await p.settle(0);assert.ok(p.importLink());
});
test('failed storage keeps editable content and requires a successful retry before import',async()=>{
 const p=planner();p.button('Plan as a device-only draft').props.onClick();p.render();await p.settle(0);
 p.edit('textarea','Offline note');p.button('Save device draft').props.onClick();p.render();await p.settle(1,new Error('quota'));
 assert.match(p.status(),/not confirmed/i);assert.equal(p.importLink(),undefined);
 assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'Offline note');
 p.button('Save device draft').props.onClick();p.render();await p.settle(2);
 assert.ok(p.importLink());assert.equal(p.writes[2].trip.days[0].stops[0].travellerNote,'Offline note');
});
test('a repeated click in the same render creates only one device draft',()=>{
 const p=planner(),button=p.button('Plan as a device-only draft');button.props.onClick();button.props.onClick();p.render();
 assert.equal(p.writes.length,1);
});

test('selected device repair returns to preview only after the latest edits are acknowledged',async()=>{
 const original=guideDraft({...guide,version:1},'device-withdrawn','guest-original','Asia/Tokyo'),completed=[];
 original.days[0].stops[0].title='';original.days[0].stops[0].travellerNote='My original private note';
 const p=planner('account-A',original,copy=>completed.push(copy));assert.equal(p.reads.length,0);assert.equal(p.writes.length,0);
 assert.equal(p.elements().find(el=>el.type==='textarea')?.props.value,'My original private note','render the selected copy without fetching a guide');
 p.edit('input','Repaired personal stop');p.button('Save device draft').props.onClick();p.render();p.edit('textarea','A later unsaved note');await p.settle(0);
 assert.equal(completed.length,0,'an older transaction cannot close an editor with newer edits');assert.match(p.status(),/not saved yet/i);
 p.button('Save device draft').props.onClick();p.render();await p.settle(1,new Error('quota'));assert.equal(completed.length,0);assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'A later unsaved note');
 p.button('Save device draft').props.onClick();p.render();await p.settle(2);assert.equal(completed.length,1);
 assert.equal(completed[0].id,'device-withdrawn');assert.equal(completed[0].ownerId,'guest-original');assert.equal(completed[0].source.version,1);assert.equal(completed[0].days[0].stops[0].travellerNote,'A later unsaved note');assert.equal(original.days[0].stops[0].travellerNote,'My original private note');
});

test('a selected-copy save completed after editor unmount cannot replace the parent import preview',async()=>{
 const original=guideDraft(guide,'device-old-editor','guest-original','UTC'),completed=[];
 const p=planner('account-A',original,copy=>completed.push(copy)),save=p.button('Save device draft');assert.ok(save,'selected copy must have a save handler');
 p.edit('textarea','Started saving before account/navigation changed');save.props.onClick();p.render();p.unmount();await p.settle(0);
 assert.equal(completed.length,0,'a closed editor must not deliver its copy to a newer preview');assert.equal(p.writes[0].trip.id,original.id);
});
test('reload protection follows unsaved work and is removed after save or unmount',async()=>{
 const p=planner();p.button('Plan as a device-only draft').props.onClick();p.render();
 let prevented=false;const event={preventDefault(){prevented=true;},returnValue:undefined};
 assert.equal(typeof p.listeners.get('beforeunload'),'function');p.listeners.get('beforeunload')(event);assert.equal(prevented,true);
 await p.settle(0);assert.equal(p.listeners.has('beforeunload'),false);
 p.edit('textarea','Unsaved note');assert.equal(p.listeners.has('beforeunload'),true);
 p.unmount();assert.equal(p.listeners.has('beforeunload'),false);
});

test('explicit recovery keeps an old saved copy and updates the same ID after a new edit',async()=>{
 const original=guideDraft({...guide,version:1},'device-old','guest-old','Asia/Tokyo');
 original.days[0].stops[0].title='My stored stop';original.days[0].stops[0].travellerNote='My stored note';
 const p=planner();assert.equal(p.reads.length,0,'device notes are not read automatically');
 const restore=p.button('Find saved device drafts');assert.ok(restore,'reloading needs a recovery action');
 restore.props.onClick();p.render();await p.settleRead(0,[original]);
 const resume=p.elements().find(el=>el.type==='button'&&el.props['data-draft-id']==='device-old');assert.ok(resume);
 resume.props.onClick();p.render();assert.equal(p.writes.length,0,'recovery must not create or import a copy');
 assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'My stored note');
 assert.ok(p.importLink());assert.match(p.status(),/restored/i);
 p.edit('textarea','Edited after reload');p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 assert.equal(p.writes[0].trip.id,'device-old');assert.equal(p.writes[0].trip.ownerId,'guest-old');
 assert.equal(p.writes[0].trip.days[0].stops[0].source.version,1,'the current v2 guide cannot rewrite an old copy');
 assert.equal(p.writes[0].trip.days[0].stops[0].travellerNote,'Edited after reload');
 assert.equal(original.days[0].stops[0].travellerNote,'My stored note');
});
test('failed recovery can be retried and cannot be reported as an empty device',async()=>{
 const p=planner(),restore=p.button('Find saved device drafts');assert.ok(restore);
 restore.props.onClick();p.render();await p.settleRead(0,[],new Error('storage unavailable'));
 assert.match(p.status(),/could not be read/i);assert.equal(p.writes.length,0);
 p.button('Find saved device drafts').props.onClick();p.render();await p.settleRead(1,[]);
 assert.match(p.status(),/no saved device drafts/i);assert.equal(p.writes.length,0);
});
test('a pending recovery cannot race creation or be applied after unmount',async()=>{
 const p=planner(),restore=p.button('Find saved device drafts');assert.ok(restore);
 restore.props.onClick();restore.props.onClick();p.render();
 assert.equal(p.reads.length,1);assert.equal(p.button('Plan as a device-only draft').props.disabled,true);
 p.button('Plan as a device-only draft').props.onClick();assert.equal(p.writes.length,0);
 p.unmount();await p.settleRead(0,[guideDraft(guide,'old-copy','guest-old','UTC')]);
 assert.equal(p.elements().some(el=>el.props?.['data-draft-id']==='old-copy'),false);
});
for(const title of ['', '   '])test(`saving and reloading an incomplete ${JSON.stringify(title)} stop keeps the note editable`,async()=>{
 const first=planner();first.button('Plan as a device-only draft').props.onClick();first.render();await first.settle(0);
 first.edit('textarea','Keep this unfinished private note');first.edit('input',title);
 first.button('Save device draft').props.onClick();first.render();await first.settle(1);
 assert.match(first.status(),/draft saved/i);
 const stored=first.writes[1].trip,next=planner();next.button('Find saved device drafts').props.onClick();next.render();await next.settleRead(0,[stored]);
 const resume=next.elements().find(el=>el.type==='button'&&el.props['data-draft-id']===stored.id);assert.ok(resume);
 resume.props.onClick();next.render();assert.equal(next.elements().find(el=>el.type==='input').props.value,title);
 assert.equal(next.elements().find(el=>el.type==='textarea').props.value,'Keep this unfinished private note');
 next.edit('input','Completed stop');next.button('Save device draft').props.onClick();next.render();await next.settle(0);
 assert.equal(next.writes[0].trip.id,stored.id);assert.equal(next.writes[0].trip.days[0].stops[0].travellerNote,'Keep this unfinished private note');
});
test('a signed-in traveller can explicitly repair a device copy and return directly to import preview',async()=>{
 const p=planner('account-A');assert.equal(p.reads.length,0);assert.equal(p.button('Plan as a device-only draft'),undefined);
 const row=guideDraft(guide,'unfinished-copy','guest-local','UTC');row.days[0].stops[0].title='';row.days[0].stops[0].travellerNote='Retain my note';
 p.button('Find saved device drafts').props.onClick();p.render();await p.settleRead(0,[row]);
 p.elements().find(el=>el.props?.['data-draft-id']===row.id).props.onClick();p.render();p.edit('input','Repaired stop');
 p.button('Save device draft').props.onClick();p.render();await p.settle(0);
 const link=p.elements().find(el=>el.type==='a'&&el.props.children==='Review import to your account');assert.ok(link);assert.equal(link.props.href,'/en/trips');
 assert.equal(p.writes[0].trip.ownerId,'guest-local','repair does not assign an account owner or import automatically');assert.equal(p.writes[0].trip.days[0].stops[0].travellerNote,'Retain my note');
});

for(const locale of ['en','zh-HK'])test(`device planning ${locale}: saved time zone is visible without rewriting the copy or minute values`,()=>{
 const original=guideDraft({...guide,days:[{offset:0,title:'Original day',stops:[{title:'Midnight',startMinuteOfDay:0,durationMinutes:0},{title:'Unscheduled',startMinuteOfDay:null,durationMinutes:null}]}]},'saved-zone','guest-original','Asia/Tokyo');
 const before=JSON.stringify(original),p=planner(null,original,undefined,locale);
 const text=node=>typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(text).join(' '):'';
 assert.match(text(p.render()),/Asia\/Tokyo/);assert.equal(JSON.stringify(original),before);assert.equal(p.writes.length,0);
 assert.equal(original.days[0].stops[0].startMinuteOfDay,0);assert.equal(original.days[0].stops[1].startMinuteOfDay,null);
});
