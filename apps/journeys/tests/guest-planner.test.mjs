import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {guideDraft,restorableGuideDrafts} from '../lib/trips/guest-drafts.ts';

// Run the real component handlers. Only hook scheduling and the asynchronous
// IndexedDB boundary are controlled, so a late transaction is deterministic.
const source=await readFile(new URL('../app/travel/GuestPlanner.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const guide={id:'guide-one',version:2,title:'Kyoto walk',days:[{offset:0,title:'Morning',stops:[{title:'Temple',startMinuteOfDay:540,durationMinutes:60}]}]};
function planner(){
 const states=[],refs=[],effects=[],writes=[],reads=[],listeners=new Map();let cursor=0,tree;
 const react={
  useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
  useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},
  useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,cleanup:old?.cleanup,pending:true};},
 };
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,Intl,
  window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},
  require:name=>{
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
   if(name==='next/link')return{__esModule:true,default:'a'};
   if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
   if(name==='../../lib/trips/guest-drafts')return{guideDraft,restorableGuideDrafts,readGuestTrips:()=>new Promise((resolve,reject)=>reads.push({resolve,reject})),saveGuestTrip:trip=>new Promise((resolve,reject)=>writes.push({trip:structuredClone(trip),resolve,reject}))};
   throw Error('Unexpected dependency '+name);
  }}));
 function render(){cursor=0;tree=module.exports.GuestPlanner({guide});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}return tree;}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const button=name=>elements().find(el=>el.type==='button'&&el.props.children===name);
 const status=()=>elements().find(el=>el.props?.role==='status').props.children;
 const importLink=()=>elements().find(el=>el.type==='a'&&el.props.href?.startsWith('/en/sign-in'));
 const edit=(type,value)=>{elements().find(el=>el.type===type).props.onChange({target:{value}});render();};
 const settle=async(index,error)=>{if(error)writes[index].reject(error);else writes[index].resolve();await new Promise(resolve=>setImmediate(resolve));render();};
 const settleRead=async(index,rows,error)=>{if(error)reads[index].reject(error);else reads[index].resolve(rows);await new Promise(resolve=>setImmediate(resolve));render();};
 render();return{render,elements,button,status,importLink,edit,settle,settleRead,writes,reads,listeners,unmount:()=>effects.forEach(effect=>effect?.cleanup?.())};
}

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
 assert.match(p.status(),/not saved/i);assert.equal(p.importLink(),undefined);
 assert.equal(p.elements().find(el=>el.type==='textarea').props.value,'Offline note');
 p.button('Save device draft').props.onClick();p.render();await p.settle(2);
 assert.ok(p.importLink());assert.equal(p.writes[2].trip.days[0].stops[0].travellerNote,'Offline note');
});
test('a repeated click in the same render creates only one device draft',()=>{
 const p=planner(),button=p.button('Plan as a device-only draft');button.props.onClick();button.props.onClick();p.render();
 assert.equal(p.writes.length,1);
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
