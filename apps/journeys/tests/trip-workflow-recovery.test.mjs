import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {previewLocalImport} from '../lib/trips/import.ts';

const guideId='11111111-1111-4111-8111-111111111111',tripId='22222222-2222-4222-8222-222222222222';
const snapshot=()=>({id:tripId,title:'Saved trip',destinationId:null,timezone:'Asia/Tokyo',startDate:null,status:'planning',revision:3,media:[],overrides:[],days:[{id:'day',offset:0,title:'Day',stops:[{id:'stop',title:'Stop',placeId:null,position:0,travellerNote:'Saved note',startMinuteOfDay:0,durationMinutes:30,source:null}]}]});
const tick=()=>new Promise(r=>setImmediate(r));
const compiled=await transform((await readFile(new URL('../app/travel/TripWorkspace.tsx',import.meta.url),'utf8'))+'\nexport {DayEditor,StopEditor};',{loader:'tsx',format:'cjs',jsx:'automatic'});
const compiledImport=await transform(await readFile(new URL('../app/travel/ImportPreview.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
const schedule=await import('../lib/trips/input-validation.ts').catch(()=>({}));
async function component(name='TripWorkspace',{locale='en',props={},ports={},search=''}={}){
 const state=[],refs=[],effects=[],invalidators=new Set(),writes=[],navigation=[],localWrites=[];
 let cursor=0,tree,changed=false,query=new URLSearchParams(search),inputProps={actorId:'actor-A',...props};
 const react={useState(v){const i=cursor++;if(!(i in state))state[i]=typeof v==='function'?v():v;return[state[i],v=>{const next=typeof v==='function'?v(state[i]):v;if(!Object.is(next,state[i]))changed=true;state[i]=next;}];},useRef(v){const i=cursor++;return refs[i]??(refs[i]={current:v});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,pending:true,cleanup:old?.cleanup};}};
 react.useLayoutEffect=react.useEffect;
 const jsx=(type,props)=>({type,props}),module={exports:{}},router={refresh(){},replace(path){navigation.push({replace:path});query=new URLSearchParams();}};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const tripPorts={list:async()=>({ok:true,data:{items:[],nextCursor:null}}),get:async()=>({ok:true,data:snapshot()}),create:async(...args)=>{writes.push(clone(args));return{ok:false,code:'UNAVAILABLE',retryable:true};},apply:async(...args)=>{writes.push(clone(args));return{ok:true,data:{...snapshot(),revision:4}};},remove:async()=>{writes.push('delete');return{ok:true,data:{deleted:true}};},...ports.trips};
 const drafts={synchronizeAccountCache:async()=>{},readLocalSnapshot:async()=>null,saveLocalSnapshot:async()=>{},readLocalDraft:async()=>null,saveLocalDraft:async(...args)=>localWrites.push(clone(args)),clearLocalDraft:async()=>{},...ports.drafts,subscribeAccountInvalidation(fn){invalidators.add(fn);return()=>invalidators.delete(fn);},invalidateAccountViews(owner){for(const fn of invalidators)fn(owner);}};
 runInContext((name==='ImportPreview'?compiledImport:compiled).code,createContext({module,exports:module.exports,crypto,Intl,URLSearchParams,confirm:()=>true,navigator:{onLine:true},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},fetch:()=>{throw Error('Unexpected network');},require(path){
  if(path==='react')return react;if(path==='react/jsx-runtime')return{jsx,jsxs:jsx};if(path==='next/link')return{__esModule:true,default:'a'};
  if(path==='next/navigation')return{useRouter:()=>router,useSearchParams:()=>query};if(path==='./ui')return{useApp:()=>({ready:true,locale,t:(en,zh)=>locale==='en'?en:zh,href:p=>'/'+locale+'/'+p})};
  if(path==='./UnsavedDraftGuard')return{useDraftNavigation:()=>p=>navigation.push(p)};
  if(path==='../../lib/trips/repository')return{trips:tripPorts,request:ports.request??(async(...args)=>{writes.push(clone(args));return{ok:false,code:'UNAVAILABLE',retryable:true};})};
  if(path==='./model')return{read:()=>({session:{id:'local'}}),tripsFor:()=>ports.demoTrips??[]};
  if(path==='../../lib/trips/import')return{previewLocalImport};
  if(path==='../../lib/trips/guest-drafts')return{readGuestTrips:ports.readGuestTrips??(async()=>[]),restorableDeviceDrafts:x=>x};
  if(path==='./GuestPlanner')return{};
  if(path==='../../lib/trips/local-drafts')return drafts;
  if(path==='../../lib/trips/input-validation')return schedule;
  if(['./ImportPreview','./RecordCapture','./SharePreview','./TripWarnings','../../lib/trips/export'].includes(path))return{};
  throw Error(path);
 }}));
 function render(){cursor=0;changed=false;tree=module.exports[name](inputProps);for(const e of effects)if(e?.pending){e.pending=false;e.cleanup?.();e.cleanup=e.work();}}
 async function settle(){for(let i=0;i<5;i++){await tick();if(changed)render();}}
 function nodes(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(n=>nodes(n))];}
 const text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(' '):'';
 function field(label){const l=nodes().find(n=>n.type==='label'&&text(n).startsWith(label));return l&&nodes(l).find(n=>['input','textarea','select'].includes(n.type))||nodes().find(n=>n.props?.id===l?.props.htmlFor);}
 const button=label=>nodes().find(n=>n.type==='button'&&text(n)===label);
 async function edit(label,value){const f=field(label);assert.ok(f,'field '+label);f.props.onChange({target:{value}});render();await settle();}
 async function submit(index=0){await nodes().filter(n=>n.type==='form')[index].props.onSubmit({preventDefault(){}});await settle();render();await settle();}
 render();await settle();
 return{render,settle,nodes,field,button,edit,submit,writes,navigation,localWrites,text:()=>text(tree),status:()=>nodes().find(n=>n.props?.['data-testid']==='trip-save-state')?.props.children,async invalidate(owner=null){for(const fn of invalidators)fn(owner);render();await settle();},async props(next){inputProps={...inputProps,...next};render();await settle();},unmount(){for(const e of effects)e?.cleanup?.();}};
}
for(const locale of ['en','zh-HK']){
 const label=(en,zh)=>locale==='en'?en:zh;
 test('TC01 '+locale+': unknown create retains original payload and request after form edits',async()=>{
  const h=await component('TripWorkspace',{locale});
  await h.edit(label('Trip title','行程標題'),'Original authored title');await h.submit();
  await h.edit(label('Trip title','行程標題'),'Newer text stays in the form');await h.submit();
  assert.equal(h.writes.length,2);assert.deepEqual(h.writes[1],h.writes[0]);assert.equal(h.field(label('Trip title','行程標題')).props.value,'Newer text stays in the form');
 });
 test('TC02 '+locale+': failed recovery read cannot write or replace unresolved command',async()=>{
  let broken=false;const calls=[];
  const h=await component('TripWorkspace',{locale,props:{id:tripId},ports:{drafts:{readLocalDraft:async()=>{if(broken)throw Error('LOCAL_STORAGE_UNAVAILABLE');return null;},saveLocalDraft:async()=>{if(broken)throw Error('LOCAL_STORAGE_UNAVAILABLE');}},trips:{apply:async(...args)=>{calls.push(args);return{ok:false,code:'UNAVAILABLE',retryable:true};}}}});
  await h.edit(label('Trip title','行程標題'),'Original pending edit');await h.submit();broken=true;
  await h.edit(label('Trip title','行程標題'),'Newer unsent edit');await h.submit();
  assert.equal(calls.length,1);assert.match(h.status(),locale==='en'?/draft.*(read|storage)|recovery/i:/草稿.*讀取|復原/);
  broken=false;await h.edit(label('Trip title','行程標題'),'Original pending edit');await h.submit();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);
 });
 test('TC02 '+locale+': explicit retry read failure is visible and never invokes a writer',async()=>{
  const h=await component('TripWorkspace',{locale,props:{id:tripId},ports:{drafts:{readLocalDraft:async()=>{throw Error('LOCAL_STORAGE_UNAVAILABLE');}}}});
  h.button(label('Retry local draft with revision check','以版本檢查重試本機草稿')).props.onClick();await h.settle();
  assert.equal(h.writes.length,0);assert.match(h.status(),locale==='en'?/draft.*(read|storage)|recovery/i:/草稿.*讀取|復原/);
 });
 test('TC05 '+locale+': invalid calendar or time zone never writes and preserves authored text',async()=>{
  const h=await component('TripWorkspace',{locale});
  await h.edit(label('Trip title','行程標題'),'  Original authored text  ');await h.edit(label('Time zone','時區'),'Invalid/Timezone');await h.submit();
  assert.equal(h.writes.length,0);assert.match(h.status(),locale==='en'?/time zone/i:/時區/);assert.equal(h.field(label('Trip title','行程標題')).props.value,'  Original authored text  ');
  await h.edit(label('Time zone','時區'),'Asia/Tokyo');await h.edit(label('Start date (optional)','開始日期（可選）'),'2030-02-31');await h.submit();
  assert.equal(h.writes.length,0);assert.match(h.status(),locale==='en'?/date/i:/日期/);
 });
 test('TC05 '+locale+': definite INVALID is distinct from unknown and permits corrected submission',async()=>{
  const writes=[];const h=await component('TripWorkspace',{locale,ports:{trips:{create:async(...args)=>{writes.push(args);return{ok:false,code:'INVALID',retryable:false};}}}});
  await h.edit(label('Trip title','行程標題'),'Original');await h.submit();assert.match(h.status(),locale==='en'?/invalid|check/i:/檢查|無效/);assert.doesNotMatch(h.status(),locale==='en'?/not confirmed/i:/未確認/);
  await h.edit(label('Trip title','行程標題'),'Corrected');await h.submit();assert.notEqual(writes[0][1],writes[1][1]);
 });
 test('TC06 '+locale+': details edit and older acknowledgement do not claim newer edits saved',async()=>{
  let finish;const h=await component('TripWorkspace',{locale,props:{id:tripId},ports:{trips:{apply:()=>new Promise(r=>finish=r)}}});
  await h.edit(label('Time zone','時區'),'Asia/Hong_Kong');assert.match(h.status(),locale==='en'?/not.*saved|pending/i:/尚未保存|待保存/);
  await h.submit();await h.edit(label('Trip title','行程標題'),'Newer title');finish({ok:true,data:{...snapshot(),revision:4}});await h.settle();
  assert.match(h.status(),locale==='en'?/newer|pending|not.*saved/i:/新.*待|尚未保存/);assert.equal(h.field(label('Trip title','行程標題')).props.value,'Newer title');
 });
 test('TC04 '+locale+': validated fromGuide survives create ACK and resets on invalidation',async()=>{
  const h=await component('TripWorkspace',{locale,search:'fromGuide='+guideId,ports:{trips:{create:async()=>({ok:true,data:snapshot()})}}});
  await h.edit(label('Trip title','行程標題'),'New trip');await h.submit();
  assert.ok(h.navigation.includes('/'+locale+'/trips/'+tripId+'?fromGuide='+guideId));assert.ok(h.nodes().some(n=>n.type==='a'&&n.props.href==='/'+locale+'/g/'+guideId));
  await h.invalidate('actor-B');assert.ok(!h.nodes().some(n=>n.type==='a'&&n.props.href==='/'+locale+'/g/'+guideId));
  await h.props({actorId:'actor-B'});assert.ok(!h.nodes().some(n=>n.type==='a'&&n.props.href==='/'+locale+'/g/'+guideId));
 });
}
test('TC04 rejects external, malformed, duplicated and non-UUID originating guide context',async()=>{
 for(const search of ['fromGuide=https://evil.test','fromGuide=../../secret','fromGuide=summary-slug','fromGuide='+guideId+'&fromGuide='+guideId]){
  const h=await component('TripWorkspace',{search});assert.ok(!h.nodes().some(n=>n.type==='a'&&String(n.props.href).includes('/g/')));
 }
});
for(const [name,props,label]of [
 ['DayEditor',{day:snapshot().days[0]},'Day offset (first day is 0)'],
 ['StopEditor',{stop:snapshot().days[0].stops[0],dayId:'day',days:snapshot().days},'Start minute of day (0–1439)'],
 ['StopEditor',{stop:snapshot().days[0].stops[0],dayId:'day',days:snapshot().days},'Duration in minutes']
])test('TC06 '+label+' marks an actual child edit unsaved',async()=>{
 let edits=0;const h=await component(name,{props:{...props,edited:()=>edits++,save:async()=>true}});await h.edit(label,'1');assert.equal(edits,1);
});
for(const bad of ['2030-02-31','2030-13-01','2030-2-01','not-a-date'])test('TC05 import preview rejects calendar date '+bad,()=>{
 const input={ownerId:'local',purpose:'personal',title:'  Authored text  ',timezone:'Asia/Tokyo',startDate:bad,days:[{stops:[{title:'Stop',travellerNote:'Private',startMinuteOfDay:0,durationMinutes:null}]}]};
 const result=previewLocalImport(input,'local');assert.deepEqual(result,{ok:false,reason:'date'});
});
test('TC05 import preview rejects an unknown zone without defaulting it',()=>{
 assert.deepEqual(previewLocalImport({ownerId:'local',purpose:'personal',title:'Authored',timezone:'Invalid/Timezone',startDate:null,days:[{stops:[{title:'Stop'}]}]},'local'),{ok:false,reason:'timezone'});
});
test('TC05 valid leap date, null date, authored whitespace and minute zero remain intact',()=>{
 const input={ownerId:'local',purpose:'personal',title:'  Authored  ',timezone:'Asia/Tokyo',startDate:'2032-02-29',days:[{stops:[{title:'  Stop  ',travellerNote:'  Private  ',startMinuteOfDay:0,durationMinutes:null}]}]};
 const r=previewLocalImport(input,'local');assert.equal(r.ok,true);assert.equal(r.payload.startDate,'2032-02-29');assert.equal(r.payload.title,'  Authored  ');assert.equal(r.payload.days[0].stops[0].startMinuteOfDay,0);assert.equal(r.payload.days[0].stops[0].durationMinutes,null);
 assert.equal(previewLocalImport({...input,startDate:null},'local').payload.startDate,null);
});


for(const locale of ['en','zh-HK']){
 const label=(en,zh)=>locale==='en'?en:zh;
 test('TC05 '+locale+': local import preview explains invalid date and zone without confirming a write',async()=>{
  for(const patch of [{startDate:'2030-02-31'},{timezone:'Invalid/Timezone'}]){
   const h=await component('ImportPreview',{locale,ports:{demoTrips:[{id:'demo',ownerId:'local',purpose:'personal',title:'Draft',timezone:'UTC',startDate:null,days:[{stops:[{title:'Place'}]}],...patch}]}});
   h.button(label('Preview this device’s current demo account','預覽此裝置目前的示範帳戶')).props.onClick();h.render();h.button('Draft').props.onClick();h.render();
   assert.equal(h.button(label('Confirm import to this account','確認匯入此帳戶')),undefined);assert.match(h.text(),patch.timezone?(locale==='en'?/time zone/i:/時區/):(locale==='en'?/date/i:/日期/));
  }
 });
 test('TC05 '+locale+': definite import INVALID is explained separately from an unknown import',async()=>{
  const h=await component('ImportPreview',{locale,ports:{demoTrips:[{id:'demo',ownerId:'local',purpose:'personal',title:'Draft',timezone:'UTC',days:[{stops:[{title:'Place'}]}]}],request:async()=>({ok:false,code:'INVALID',retryable:false})}});
  h.button(label('Preview this device’s current demo account','預覽此裝置目前的示範帳戶')).props.onClick();h.render();h.button('Draft').props.onClick();h.render();await h.button(label('Confirm import to this account','確認匯入此帳戶')).props.onClick();h.render();
  assert.match(h.text(),locale==='en'?/invalid|check/i:/檢查|無效/);assert.doesNotMatch(h.text(),locale==='en'?/Import was not confirmed/i:/未確認匯入/);
 });
}
test('TC01 import pins original source and request while the result is unknown',async()=>{
 const calls=[];const h=await component('ImportPreview',{ports:{demoTrips:[{id:'demo-A',ownerId:'local',purpose:'personal',title:'Draft A',timezone:'UTC',days:[{stops:[{title:'A'}]}]},{id:'demo-B',ownerId:'local',purpose:'personal',title:'Draft B',timezone:'UTC',days:[{stops:[{title:'B'}]}]}],request:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));return{ok:false,code:'UNAVAILABLE',retryable:true};}}});
 h.button('Preview this device’s current demo account').props.onClick();h.render();h.button('Draft A').props.onClick();h.render();await h.button('Confirm import to this account').props.onClick();h.render();
 assert.equal(h.button('Draft B').props.disabled,true);
 await h.button('Confirm import to this account').props.onClick();h.render();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);
});
test('TC02 failed device reread cannot unlock import of an older preview',async()=>{
 let broken=false;const h=await component('ImportPreview',{ports:{demoTrips:[{id:'demo',ownerId:'local',purpose:'personal',title:'Draft',timezone:'UTC',days:[{stops:[{title:'A'}]}]}],readGuestTrips:async()=>{if(broken)throw Error('LOCAL_STORAGE_UNAVAILABLE');return[];}}});
 h.button('Preview this device’s current demo account').props.onClick();h.render();h.button('Draft').props.onClick();h.render();broken=true;await h.button('Preview device-only drafts').props.onClick();h.render();
 const confirm=h.button('Confirm import to this account');assert.ok(!confirm||confirm.props.disabled);assert.equal(h.writes.length,0);
});
test('TC02 deleting cannot bypass failed recovery read',async()=>{
 const h=await component('TripWorkspace',{props:{id:tripId},ports:{drafts:{readLocalDraft:async()=>{throw Error('LOCAL_STORAGE_UNAVAILABLE');}}}});
 await h.edit('Trip title','Pending');await h.submit();h.button('Delete trip').props.onClick();await h.settle();assert.equal(h.writes.length,0);
});
test('TC02 failed current-version read does not authorize conflict reapply',async()=>{
 let reads=0;const calls=[],stored={command:{type:'updateStop',id:'stop',patch:{travellerNote:'Pending'}},requestId:'33333333-3333-4333-8333-333333333333',baseRevision:3};
 const h=await component('TripWorkspace',{props:{id:tripId},ports:{drafts:{readLocalDraft:async()=>stored},trips:{get:async()=>++reads===1?{ok:true,data:snapshot()}:{ok:false,code:'UNAVAILABLE',retryable:true},apply:async(...args)=>{calls.push(args);return{ok:false,code:'CONFLICT',retryable:false};}}}});
 const save=h.nodes().find(n=>n.type?.name==='StopEditor').props.save;await save(stored.command);h.render();h.button('Load current version').props.onClick();h.render();await h.settle();await h.nodes().find(n=>n.type?.name==='StopEditor').props.save({type:'updateStop',id:'stop',patch:{travellerNote:'Changed input'}});assert.equal(calls.length,1);
});


test('TC02 account change releases only the old device read lease',async()=>{
 const reads=[];const h=await component('ImportPreview',{ports:{readGuestTrips:()=>new Promise(resolve=>reads.push(resolve))}});
 h.button('Preview device-only drafts').props.onClick();h.render();assert.equal(reads.length,1);
 await h.props({actorId:'actor-B'});
 assert.equal(h.button('Preview device-only drafts').props.disabled,false,'a new actor must be able to start a fresh read');
 h.button('Preview device-only drafts').props.onClick();h.render();assert.equal(reads.length,2);
 reads[0]([]);await h.settle();assert.equal(h.button('Preview device-only drafts').props.disabled,true,'old completion cannot unlock the current read');
 reads[1]([]);await h.settle();assert.equal(h.button('Preview device-only drafts').props.disabled,false);assert.equal(h.writes.length,0);
});
test('TC04 old create acknowledgement cannot restore guide context or navigate after account change',async()=>{
 let finish;const h=await component('TripWorkspace',{search:'fromGuide='+guideId,ports:{trips:{create:()=>new Promise(r=>finish=r)}}});
 await h.edit('Trip title','Original');await h.submit();await h.invalidate('actor-B');await h.props({actorId:'actor-B'});
 finish({ok:true,data:snapshot()});await h.settle();assert.ok(!h.navigation.some(n=>typeof n==='string'&&n.includes('/trips/'+tripId)));assert.ok(!h.nodes().some(n=>n.type==='a'&&String(n.props.href).includes('/g/')));
});
test('TC04 a newly mounted trip detail uses the acknowledged guide route without an adoption write',async()=>{
 const h=await component('TripWorkspace',{props:{id:tripId},search:'fromGuide='+guideId});
 assert.ok(h.nodes().some(n=>n.type==='a'&&n.props.href==='/en/g/'+guideId));assert.equal(h.writes.length,0);
});
test('TC06 stop timing preserves midnight zero and an unset duration in the submitted command',async()=>{
 const calls=[];const h=await component('StopEditor',{props:{stop:snapshot().days[0].stops[0],dayId:'day',days:snapshot().days,edited(){},save:async c=>{calls.push(c);return true;}}});
 await h.edit('Duration in minutes','');await h.submit();assert.equal(calls[0].patch.startMinuteOfDay,0);assert.equal(calls[0].patch.durationMinutes,null);
 await h.edit('Start minute of day (0–1439)','');await h.submit();assert.equal(calls[1].patch.startMinuteOfDay,null);
});


test('TC06 saving a stop cannot label unsent trip details saved',async()=>{
 const h=await component('TripWorkspace',{props:{id:tripId}});
 await h.edit('Trip title','Authored unsent details');
 const save=h.nodes().find(n=>n.type?.name==='StopEditor').props.save;
 await save({type:'updateStop',id:'stop',patch:{travellerNote:'Submitted note'}});h.render();await h.settle();
 assert.equal(h.field('Trip title').props.value,'Authored unsent details');
 assert.match(h.status(),/not.*saved|pending/i);
});


// P2 #2: only an acknowledged request authored in this tab owns an edit generation.
async function restoredPatch(locale,route){
 const label=(en,zh)=>locale==='en'?en:zh;
 const command={type:'patchTrip',patch:{title:'OLD device title',startDate:null,timezone:'Asia/Tokyo'}};
 const requestId='33333333-3333-4333-8333-333333333333';
 let draft={command,requestId,baseRevision:3},server=snapshot();const calls=[],cleared=[];
 const h=await component('TripWorkspace',{locale,props:{id:tripId},ports:{
  drafts:{readLocalDraft:async()=>draft,clearLocalDraft:async(...args)=>{cleared.push(args);draft=null;}},
  trips:{get:async()=>({ok:true,data:server}),apply:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));server={...snapshot(),...command.patch,revision:4};return{ok:true,data:server};}}
 }});
 await h.edit(label('Trip title','行程標題'),'  NEW unsent title  ');
 await h.edit(label('Start date (optional)','開始日期（可選）'),'2032-02-29');
 await h.edit(label('Time zone','時區'),'Asia/Hong_Kong');
 if(route==='explicit retry'){h.button(label('Retry local draft with revision check','以版本檢查重試本機草稿')).props.onClick();await h.settle();}
 else{await h.nodes().find(n=>n.type?.name==='StopEditor').props.save(command);h.render();await h.settle();}
 assert.deepEqual(calls,[[tripId,3,requestId,{type:'patchTrip',patch:{title:'OLD device title',startDate:null,timezone:'Asia/Tokyo'}}]]);
 assert.deepEqual(h.localWrites,[['actor-A',tripId,3,{type:'patchTrip',patch:{title:'OLD device title',startDate:null,timezone:'Asia/Tokyo'}},requestId,false]]);
 assert.deepEqual(cleared,[['actor-A',tripId,requestId]]);
 return h;
}
for(const locale of ['en','zh-HK']){
 const label=(en,zh)=>locale==='en'?en:zh;
 for(const route of ['explicit retry','direct apply']){
  test('P2 #2 '+locale+' '+route+': restored ACK does not claim unsent details are saved',async()=>{
   const h=await restoredPatch(locale,route);
   assert.match(h.status(),locale==='en'?/not.*saved|pending/i:/尚未保存|待保存/);
   assert.notEqual(h.status(),label('Saved to your account','已保存至你的帳戶'));
  });
  test('P2 #2 '+locale+' '+route+': current-version reload retains unsent title, date and zone after restored ACK',async()=>{
   const h=await restoredPatch(locale,route);
   h.button(label('Load current version','載入目前版本')).props.onClick();h.render();await h.settle();
   assert.equal(h.field(label('Trip title','行程標題')).props.value,'  NEW unsent title  ');
   assert.equal(h.field(label('Start date (optional)','開始日期（可選）')).props.value,'2032-02-29');
   assert.equal(h.field(label('Time zone','時區')).props.value,'Asia/Hong_Kong');
  });
  test('P2 #2 '+locale+' '+route+': matching in-tab request still clears its acknowledged edits',async()=>{
   let draft=null,reads=0;const calls=[];
   const h=await component('TripWorkspace',{locale,props:{id:tripId},ports:{
    drafts:{readLocalDraft:async()=>draft,saveLocalDraft:async(_owner,_id,baseRevision,command,requestId)=>{draft={baseRevision,command,requestId};},clearLocalDraft:async()=>{draft=null;}},
    trips:{get:async()=>({ok:true,data:++reads===1?snapshot():{...snapshot(),title:'Latest account title',revision:5}}),apply:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));return calls.length===1?{ok:false,code:'UNAVAILABLE',retryable:true}:{ok:true,data:{...snapshot(),title:'Submitted in this tab',revision:4}};}}
   }});
   await h.edit(label('Trip title','行程標題'),'Submitted in this tab');await h.submit();
   if(route==='explicit retry'){h.button(label('Retry local draft with revision check','以版本檢查重試本機草稿')).props.onClick();await h.settle();}else await h.submit();
   assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.equal(h.status(),label('Saved to your account','已保存至你的帳戶'));
   h.button(label('Load current version','載入目前版本')).props.onClick();h.render();await h.settle();
   assert.equal(h.field(label('Trip title','行程標題')).props.value,'Latest account title');
  });
 }
 const guest={id:'guest-trip',ownerId:'guest-device',purpose:'personal',title:'  Authored guest trip  ',timezone:'Asia/Tokyo',startDate:null,source:{guideId,version:1},days:[{offset:0,title:'Day',stops:[{title:'Place',travellerNote:'  Private authored note  ',startMinuteOfDay:0,durationMinutes:null,source:{guideId,version:1}}]}],pendingPhotos:[]};
 const demoTrip={id:'demo-current',ownerId:'local',purpose:'personal',title:'Fresh demo trip',timezone:'UTC',startDate:null,days:[{offset:0,title:'Day',stops:[{title:'Demo place',travellerNote:'Demo note',startMinuteOfDay:0,durationMinutes:null}]}],pendingPhotos:[]};
 test('P2 #4 '+locale+': successful demo read cannot revive a guest preview after a failed guest reread',async()=>{
  let broken=false;const original=JSON.stringify(guest),calls=[];
  const h=await component('ImportPreview',{locale,ports:{demoTrips:[demoTrip],readGuestTrips:async()=>{if(broken)throw Error('LOCAL_STORAGE_UNAVAILABLE');return[guest];},request:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));return{ok:false,code:'UNAVAILABLE',retryable:true};}}});
  await h.button(label('Preview device-only drafts','預覽裝置草稿')).props.onClick();h.render();h.button(guest.title).props.onClick();h.render();
  broken=true;await h.button(label('Preview device-only drafts','預覽裝置草稿')).props.onClick();h.render();
  assert.equal(h.button(label('Confirm import to this account','確認匯入此帳戶')).props.disabled,true);
  h.button(label('Preview this device’s current demo account','預覽此裝置目前的示範帳戶')).props.onClick();h.render();
  const stale=h.button(label('Confirm import to this account','確認匯入此帳戶'));
  if(stale&&!stale.props.disabled){await stale.props.onClick();h.render();}
  assert.equal(calls.length,0,'an unrelated demo read must not enable the old guest import');
  const oldGuest=h.button(guest.title);assert.ok(!oldGuest||oldGuest.props.disabled,'the failed guest source must not be selectable through its old list');
  h.button(demoTrip.title).props.onClick();h.render();
  assert.equal(h.button(label('Confirm import to this account','確認匯入此帳戶')).props.disabled,false);
  await h.button(label('Confirm import to this account','確認匯入此帳戶')).props.onClick();h.render();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/trips/import');assert.equal(calls[0][1],'POST');assert.equal(calls[0][2].sourceId,'local:local:demo-current');
  assert.deepEqual(calls[0][2].payload,{title:'Fresh demo trip',timezone:'UTC',startDate:null,days:[{offset:0,title:'Day',stops:[{title:'Demo place',travellerNote:'Demo note',startMinuteOfDay:0,durationMinutes:null}]}],pendingPhotos:[]});
  assert.equal(JSON.stringify(guest),original,'source switching must retain the authored device copy');
 });
 test('P2 #4 '+locale+': unknown guest import keeps its exact source, payload and request across source-switch attempts',async()=>{
  let reads=0;const calls=[],original=JSON.stringify(guest);
  const h=await component('ImportPreview',{locale,ports:{demoTrips:[demoTrip],readGuestTrips:async()=>{reads++;return[guest];},request:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));return{ok:false,code:'UNAVAILABLE',retryable:true};}}});
  await h.button(label('Preview device-only drafts','預覽裝置草稿')).props.onClick();h.render();h.button(guest.title).props.onClick();h.render();
  await h.button(label('Confirm import to this account','確認匯入此帳戶')).props.onClick();h.render();
  for(const source of [label('Preview device-only drafts','預覽裝置草稿'),label('Preview this device’s current demo account','預覽此裝置目前的示範帳戶')]){assert.equal(h.button(source).props.disabled,true);await h.button(source).props.onClick();h.render();}
  assert.equal(reads,1);assert.equal(calls[0][2].sourceId,'local:guest-device:guest-trip');assert.match(calls[0][2].requestId,/^[0-9a-f-]{36}$/i);
  assert.deepEqual(calls[0][2].payload,{title:'  Authored guest trip  ',timezone:'Asia/Tokyo',startDate:null,days:[{offset:0,title:'Day',stops:[{title:'Place',travellerNote:'  Private authored note  ',startMinuteOfDay:0,durationMinutes:null}]}],pendingPhotos:[]});
  await h.button(label('Confirm import to this account','確認匯入此帳戶')).props.onClick();h.render();
  assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.equal(JSON.stringify(guest),original);
 });
}
