import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const ops=await import('../lib/creators/editor-operations.ts').catch(()=>({}));
const content=()=>({days:[0,2,5].map(offset=>({offset,title:`Day ${offset}`,stops:[{title:'Same',description:'First'},{title:'Same',description:'Second'}]}))});
test('HH:mm accepts only actual minute boundaries and an unset value',()=>{
 assert.equal(typeof ops.parseTimeOfDay,'function');
 for(const [input,minutes] of [['',null],['00:00',0],['23:59',1439]])assert.deepEqual(ops.parseTimeOfDay(input),{ok:true,minutes});
 for(const value of ['24:00','9:99','9:00','12:60','-1',' 09:00'])assert.deepEqual(ops.parseTimeOfDay(value),{ok:false});
 assert.equal(ops.formatTimeOfDay(null),'');assert.equal(ops.formatTimeOfDay(0),'00:00');assert.equal(ops.formatTimeOfDay(1439),'23:59');
});
test('day reorder keeps intentional gaps, stop identity and the immutable input',()=>{
 const original=content(),before=structuredClone(original);assert.equal(typeof ops.moveDay,'function');
 const moved=ops.moveDay(original,0,2);assert.deepEqual(moved.days.map(d=>d.offset),[0,2,5]);assert.deepEqual(moved.days.map(d=>d.title),['Day 2','Day 5','Day 0']);
 assert.deepEqual(original,before);assert.equal(ops.moveDay(original,-1,2),original);assert.equal(ops.moveDay(original,0,99),original);
 const stops=ops.moveStop(original,0,0,1);assert.deepEqual(stops.days[0].stops.map(s=>s.description),['Second','First']);assert.deepEqual(original,before);
 assert.equal(ops.moveStop(original,0,0,99),original);assert.equal(ops.moveStop(original,99,0,1),original);
});
test('deleting the last stop produces an empty authored day and Undo restores the exact input',()=>{
 assert.equal(typeof ops.removeStop,'function');const original=content();const first=ops.removeStop(original,0,0),empty=ops.removeStop(first,0,0);
 assert.equal(empty.days[0].stops.length,0);assert.equal(original.days[0].stops.length,2);
 const undo=structuredClone(first);assert.equal(undo.days[0].stops[0].description,'Second');
});

for(const item of ['day','stop'])for(const selectedAnotherField of [false,true]){
 test(`${item} reorder ${selectedAnotherField?'respects a field selected before its deferred focus':'focuses the moved item while the author stays on its control'}`,async()=>{
  const source=await readFile(new URL('../app/travel/CreatorWorkspace.tsx',import.meta.url),'utf8');
  const compiled=await transform(source+'\nexport {CreatorEditor};',{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
  const states=[],refs=[],effects=[],frames=[];let cursor=0,tree;
  const hooks={useId:()=>':editor:',useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={work,deps,pending:true};}};
  const origin={},chosenField={},document={activeElement:origin,querySelector:()=>movedField},movedField={focus(){document.activeElement=movedField;}};
  const blank=()=>({title:'',city:'',summary:'',content:{days:[0,2].map(offset=>({offset,title:`Day ${offset}`,stops:['First','Second'].map(description=>({title:'Same',description,placeId:null,startMinuteOfDay:null,durationMinutes:null}))}))}});
  const jsx=(type,props)=>({type,props}),module={exports:{}};
  runInContext(compiled.code,createContext({module,exports:module.exports,crypto,document,CSS:{escape:key=>key},requestAnimationFrame:callback=>frames.push(callback),setTimeout:()=>0,clearTimeout(){},require:name=>{
   if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
   if(name==='next/navigation')return{useRouter:()=>({replace(){}})};if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
   if(name==='../../lib/creators/contracts')return{emptyDraft:blank,creators:{}};
   if(name==='../../lib/creators/handles')return{PLATFORMS:[]};if(name==='../../lib/trips/local-drafts')return{};if(name==='../../lib/creators/editor-operations')return ops;
   throw Error('Unexpected dependency '+name);
  }}));
  function render(){cursor=0;tree=module.exports.CreatorEditor({path:'studio/guides/new'});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.work();}}
  function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
  render();render();const button=elements().find(element=>element.type==='button'&&element.props.children===(item==='day'?'Move day down':'Move stop down')&&!element.props.disabled);
  assert.ok(button);button.props.onClick();render();assert.equal(frames.length,1);
  if(selectedAnotherField)document.activeElement=chosenField;
  frames[0](0);
  assert.equal(document.activeElement,selectedAnotherField?chosenField:movedField,'a delayed reorder must not steal an explicit next-field choice');
 });
}

test('a non-retryable save cannot restart autosave until correction or an explicit retry',async()=>{
 const source=await readFile(new URL('../app/travel/CreatorWorkspace.tsx',import.meta.url),'utf8');
 const compiled=await transform(source+'\nexport {CreatorEditor};',{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
 const states=[],refs=[],effects=[],timers=[],writes=[];let cursor=0,tree;
 const hooks={useId:()=>':editor:',useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,cleanup:old?.cleanup,pending:true};}};
 const blank=()=>({title:'',city:'',summary:'',content:{days:[{offset:0,title:'',stops:[{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}});
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,
  setTimeout:fn=>{const timer={fn,active:true};timers.push(timer);return timer;},clearTimeout:timer=>timer.active=false,
  require:name=>{
   if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
   if(name==='next/navigation')return{useRouter:()=>({replace(){}})};if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
   if(name==='../../lib/creators/contracts')return{emptyDraft:blank,creators:{save:(...args)=>new Promise(resolve=>writes.push({args,resolve}))}};
   if(name==='../../lib/creators/handles')return{PLATFORMS:[]};if(name==='../../lib/trips/local-drafts')return{};if(name==='../../lib/creators/editor-operations')return ops;
   throw Error('Unexpected dependency '+name);
  }}));
 function render(){cursor=0;tree=module.exports.CreatorEditor({path:'studio/guides/new'});for(const e of effects)if(e?.pending){e.pending=false;e.cleanup?.();e.cleanup=e.work();}}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(n=>elements(n))];}
 const button=()=>elements().find(e=>e.type==='button'&&e.props.children==='Save draft');render();render();
 const title=elements().find(e=>e.type==='label'&&e.props.children?.[0]==='Guide title').props.children[1];title.props.onChange({target:{value:'Retained input'}});render();
 const action=button().props.onClick();render();writes[0].resolve({ok:false,code:'INVALID',retryable:false});await action;render();
 assert.equal(timers.filter(t=>t.active).length,0,'invalid writes must not automatically repeat');assert.equal(elements().find(e=>e.type==='label'&&e.props.children?.[0]==='Guide title').props.children[1].props.value,'Retained input');
 const retry=button().props.onClick();render();assert.equal(writes.length,2);assert.notEqual(writes[0].args[2],writes[1].args[2]);writes[1].resolve({ok:false,code:'INVALID',retryable:false});await retry;
});
