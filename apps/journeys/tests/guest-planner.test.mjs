import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {guideDraft} from '../lib/trips/guest-drafts.ts';

// Run the real component handlers. Only hook scheduling and the asynchronous
// IndexedDB boundary are controlled, so a late transaction is deterministic.
const source=await readFile(new URL('../app/travel/GuestPlanner.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const guide={id:'guide-one',version:2,title:'Kyoto walk',days:[{offset:0,title:'Morning',stops:[{title:'Temple',startMinuteOfDay:540,durationMinutes:60}]}]};
function planner(){
 const states=[],refs=[],effects=[],writes=[],listeners=new Map();let cursor=0,tree;
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
   if(name==='../../lib/trips/guest-drafts')return{guideDraft,saveGuestTrip:trip=>new Promise((resolve,reject)=>writes.push({trip:structuredClone(trip),resolve,reject}))};
   throw Error('Unexpected dependency '+name);
  }}));
 function render(){cursor=0;tree=module.exports.GuestPlanner({guide});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}return tree;}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const button=name=>elements().find(el=>el.type==='button'&&el.props.children===name);
 const status=()=>elements().find(el=>el.props?.role==='status').props.children;
 const importLink=()=>elements().find(el=>el.type==='a'&&el.props.href?.startsWith('/en/sign-in'));
 const edit=(type,value)=>{elements().find(el=>el.type===type).props.onChange({target:{value}});render();};
 const settle=async(index,error)=>{if(error)writes[index].reject(error);else writes[index].resolve();await new Promise(resolve=>setImmediate(resolve));render();};
 render();return{render,elements,button,status,importLink,edit,settle,writes,listeners,unmount:()=>effects.forEach(effect=>effect?.cleanup?.())};
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
