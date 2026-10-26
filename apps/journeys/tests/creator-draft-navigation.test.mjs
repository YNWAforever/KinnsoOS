import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import * as operations from '../lib/creators/editor-operations.ts';

const source=await readFile(new URL('../app/travel/CreatorWorkspace.tsx',import.meta.url),'utf8');
const compiled=await transform(source+'\nexport {CreatorEditor};',{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});

// Match the existing editor tests: run the actual component and command handler,
// holding only transport acknowledgements and React's rendering scheduler.
function editor(){
 const states=[],refs=[],effects=[],writes=[],historyWrites=[],timers=new Map(),listeners=new Map();let cursor=0,tree,guard,leaving=false;
 const blank=()=>({title:'',city:'',summary:'',content:{days:[{offset:0,title:'',stops:[{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}});
 const hooks={useId:()=>':editor:',useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,cleanup:old?.cleanup,pending:true};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,
  window:{history:{state:{__NA:true,router:{tree:'retained'}},replaceState(...args){historyWrites.push(args);}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},
  setTimeout:fn=>{const id=Symbol();timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),require:name=>{
   if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
   if(name==='next/navigation')return{useRouter:()=>({replace(){}})};
   if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
   if(name==='../../lib/creators/contracts')return{emptyDraft:blank,creators:Object.fromEntries(['save','publish','withdraw'].map(action=>[action,(...args)=>new Promise(resolve=>writes.push({action,args,resolve}))]))};
   if(name==='./UnsavedDraftGuard')return{useUnsavedDraftGuard:state=>{guard=state;return()=>leaving;}};
   if(name==='../../lib/creators/editor-operations')return operations;
   if(name==='../../lib/creators/handles')return{PLATFORMS:[]};
   if(name==='../../lib/trips/local-drafts'||name==='./WorkspaceServiceState'||name==='./CreatorCollaborationTasks')return{};
   throw Error('Unexpected dependency '+name);
  }}));
 function render(){cursor=0;tree=module.exports.CreatorEditor({path:'studio/guides/new'});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 function title(){return elements().find(e=>e.type==='label'&&e.props.children?.[0]==='Guide title').props.children[1];}
 render();render();
 return {render,writes,historyWrites,setLeaving(value){leaving=value;},continueEditing(){leaving=false;guard.onContinueEditing?.();render();},autosave(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();},get guard(){return guard;},get title(){return title().props.value;},edit(value){title().props.onChange({target:{value}});render();},click(label){return elements().find(e=>e.type==='button'&&e.props.children===label).props.onClick();},
  ack(index=0,result){const write=writes[index];write.resolve(result??{ok:true,data:{id:write.args[0],revision:index+1,publishedVersion:0,sourceChanged:false,status:'draft',payload:structuredClone(write.args[3])}});},
  unload(){const event={prevented:false,preventDefault(){this.prevented=true;}};listeners.get('beforeunload')?.(event);return event.prevented;},
  unmount(){for(const effect of effects)effect?.cleanup?.();}
 };
}

test('creator navigation waits for the current server acknowledgement and then becomes clean',async()=>{
 const view=editor();assert.ok(view.guard,'creator editor must register its navigation boundary');
 assert.equal(view.guard.dirty,false);assert.equal(view.unload(),false);
 view.edit('Authored route');assert.equal(view.guard.dirty,true);assert.equal(view.guard.kind,'creator');assert.equal(view.unload(),true);
 const saving=view.guard.saveLatest();view.render();assert.equal(view.guard.busy,true);
 view.ack();assert.equal(await saving,true);view.render();assert.equal(view.guard.dirty,false);assert.equal(view.guard.busy,false);assert.equal(view.unload(),false);view.unmount();
});

test('an older acknowledgement cannot authorize leaving with newer creator edits',async()=>{
 const view=editor();view.edit('Earlier title');assert.ok(view.guard);
 const saving=view.guard.saveLatest();view.render();view.edit('Latest title');view.ack();
 assert.equal(await saving,false);view.render();assert.equal(view.title,'Latest title');assert.equal(view.guard.dirty,true);assert.equal(view.unload(),true);view.unmount();
});

test('failed saves keep creator input and an uncertain retry reuses its original command',async()=>{
 const view=editor();view.edit('Keep my work');assert.ok(view.guard);
 const saving=view.guard.saveLatest();view.ack(0,{ok:false,code:'UNAVAILABLE',retryable:true});assert.equal(await saving,false);view.render();
 assert.equal(view.title,'Keep my work');assert.equal(view.guard.dirty,true);assert.equal(view.guard.busy,false);assert.equal(view.unload(),true);
 const retry=view.guard.saveLatest();assert.equal(view.writes[1].args[2],view.writes[0].args[2]);view.ack(1);assert.equal(await retry,true);view.render();assert.equal(view.guard.dirty,false);view.unmount();
});

test('rejected or conflicted creator saves never authorize leaving',async()=>{
 for(const code of ['INVALID','CONFLICT']){
  const view=editor();view.edit('Retained title');assert.ok(view.guard);
  const saving=view.guard.saveLatest();view.ack(0,{ok:false,code,retryable:false});assert.equal(await saving,false);view.render();
  assert.equal(view.title,'Retained title');assert.equal(view.guard.dirty,true);assert.equal(view.unload(),true);view.unmount();
 }
});

test('an unmounted creator editor ignores a late save acknowledgement',async()=>{
 const view=editor();view.edit('Late save');assert.ok(view.guard);const saving=view.guard.saveLatest();
 view.unmount();view.ack();assert.equal(await saving,false);assert.equal(view.unload(),false);
});

for(const action of ['publish','withdraw'])test(`save-and-leave cannot replay an uncertain ${action} command`,async()=>{
 const view=editor();view.edit('Published route');assert.ok(view.guard);
 const saving=view.guard.saveLatest(),write=view.writes[0];
 const payload=structuredClone(write.args[3]);payload.city='Kyoto';payload.summary='Authored summary';payload.content.days[0].stops[0].title='Authored stop';
 view.ack(0,{ok:true,data:{id:write.args[0],revision:1,publishedVersion:1,sourceChanged:false,status:'published',payload}});assert.equal(await saving,true);view.render();
 const command=view.click(action==='publish'?'Publish structured version':'Withdraw adoption');
 view.ack(1,{ok:false,code:'UNAVAILABLE',retryable:true});await command;view.render();assert.equal(view.guard.dirty,true);
 const count=view.writes.length;
 const leaving=view.guard.saveLatest();
 // A broken implementation starts another network request here and never settles.
 assert.equal(view.writes.length,count,'leaving must not publish or withdraw content');
 assert.equal(await leaving,false);assert.equal(view.guard.dirty,true);
 const urlWrites=view.historyWrites.length;view.continueEditing();
 assert.equal(view.historyWrites.length,urlWrites,'an unresolved public action cannot remount the editor');view.unmount();
});


test('first creator save preserves the router state during canonicalization',async()=>{
 const view=editor();view.edit('Saved guide');const saving=view.guard.saveLatest();view.ack();await saving;
 assert.equal(view.historyWrites.length,1);
 assert.deepEqual(view.historyWrites[0][0],{__NA:true,router:{tree:'retained'}});view.unmount();
});

for(const startsBeforeLeave of [false,true])test(`autosave keeps the new-guide URL while leave is pending (startsBeforeLeave=${startsBeforeLeave})`,async()=>{
 const view=editor();view.edit('Autosaved guide');
 if(startsBeforeLeave)view.autosave();
 view.setLeaving(true);if(!startsBeforeLeave)view.autosave();
 assert.equal(view.writes.length,1);view.ack();await new Promise(resolve=>setImmediate(resolve));view.render();
 assert.equal(view.guard.dirty,false);assert.equal(view.title,'Autosaved guide');
 assert.equal(view.historyWrites.length,0,'autosave cannot change routes while the dialog is open');view.unmount();
});


test('continuing after an acknowledged autosave restores the saved new-guide URL',async()=>{
 const view=editor();view.edit('Saved while deciding');view.setLeaving(true);view.autosave();
 view.ack();await new Promise(resolve=>setImmediate(resolve));view.render();
 assert.equal(view.guard.dirty,false);assert.equal(view.historyWrites.length,0);
 view.continueEditing();
 assert.equal(view.historyWrites.length,1,'continuing must restore the acknowledged draft URL');
 assert.equal(view.historyWrites[0][2],'/en/studio/guides/'+view.writes[0].args[0]+'/edit');
 assert.deepEqual(view.historyWrites[0][0],{__NA:true,router:{tree:'retained'}});view.unmount();
});

test('continuing after an older autosave keeps newer edits until their own acknowledgement',async()=>{
 const view=editor();view.edit('Earlier saved title');view.setLeaving(true);view.autosave();
 view.edit('Newer unsaved title');view.ack();await new Promise(resolve=>setImmediate(resolve));view.render();
 view.continueEditing();
 assert.equal(view.historyWrites.length,0,'an older save cannot remount an editor with newer input');
 assert.equal(view.guard.dirty,true);assert.equal(view.title,'Newer unsaved title');assert.equal(view.unload(),true);
 view.autosave();assert.equal(view.writes.length,2);view.ack(1);await new Promise(resolve=>setImmediate(resolve));view.render();
 assert.equal(view.guard.dirty,false);assert.equal(view.historyWrites.length,1);
 assert.equal(view.historyWrites[0][2],'/en/studio/guides/'+view.writes[1].args[0]+'/edit');view.unmount();
});

for(const retryable of [false,true])test(`continuing after a failed autosave keeps its new-guide input (retryable=${retryable})`,async()=>{
 const view=editor();view.edit('Unsaved after failure');view.setLeaving(true);view.autosave();
 view.ack(0,{ok:false,code:retryable?'UNAVAILABLE':'INVALID',retryable});await new Promise(resolve=>setImmediate(resolve));view.render();
 view.continueEditing();assert.equal(view.historyWrites.length,0);assert.equal(view.guard.dirty,true);
 assert.equal(view.title,'Unsaved after failure');assert.equal(view.unload(),true);view.unmount();
});
