import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import * as storage from '../lib/trips/guest-drafts.ts';
import {previewLocalImport} from '../lib/trips/import.ts';

const compiled=await transform(await readFile(new URL('../app/travel/ImportPreview.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const draft=()=>storage.guideDraft({id:'guide-one',version:1,title:'My saved device walk',days:[{offset:0,title:'Day one',stops:[{title:'Temple',startMinuteOfDay:null,durationMinutes:null}]}]},'device-one','guest-one','UTC');
function surface(rows,actorId=null){
 const states=[],refs=[],effects=[],responses=[],bodies=[];let cursor=0,tree,reads=0,requests=0;
 const editor=()=>null;
 const jsx=(type,props,key)=>({type,props:{...props,...(key===undefined?{}:{key})}}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,require:name=>{
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef:initial=>{const i=cursor++;return refs[i]??(refs[i]={current:initial})},useLayoutEffect:(run,deps)=>{const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))effects[i]={run,deps,cleanup:old?.cleanup,pending:true}}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
  if(name==='./GuestPlanner')return{GuestPlanner:editor};
  if(name==='../../lib/trips/import')return{previewLocalImport};
  if(name==='../../lib/trips/guest-drafts')return{...storage,readGuestTrips:async()=>{reads++;return rows}};
  if(name==='../../lib/trips/repository')return{request:(_path,_method,body)=>{requests++;bodies.push(body);return new Promise(resolve=>responses.push(resolve))}};
  return{};
 }}));
 const render=()=>{cursor=0;tree=module.exports.ImportPreview({actorId});for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.run()}};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 render();return{render,nodes:()=>nodes(tree),editor:()=>nodes(tree).find(el=>el.type===editor),reads:()=>reads,requests:()=>requests,bodies,responses,actor:next=>{actorId=next;render();render()}};
}
test('explicit device preview keeps valid drafts and reports unreadable copies without importing',async()=>{
 const good=draft(),bad={...good,id:'device-bad',title:{not:'text'}},foreign={...good,id:'account-copy',ownerId:'account-A'};
 const view=surface([null,bad,foreign,good]);assert.equal(view.reads(),0,'device copies require an explicit user action');
 await view.nodes().find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.onClick();
 const {render}=view,nodes=view.nodes;
 assert.doesNotThrow(render,'damaged IndexedDB rows cannot crash the recovery surface');
 assert.deepEqual(nodes().filter(el=>el.type==='li').map(el=>el.props.children.props.children),['My saved device walk']);
 assert.match(nodes().find(el=>el.props?.role==='status').props.children,/could not be previewed/i);
 nodes().find(el=>el.type==='button'&&el.props.children==='My saved device walk').props.onClick();render();
 assert.ok(nodes().find(el=>el.type==='a'&&el.props.href==='/en/sign-in?next=%2Fen%2Ftrips'));
 assert.equal(nodes().some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),false);
 assert.equal(view.requests(),0,'preview and cancellation cannot perform an import');
});
for(const kind of ['incomplete','large'])test(`${kind} safe device copies stay selectable but cannot import before repair`,async()=>{
 const row=draft();if(kind==='incomplete')row.days[0].stops[0].title='   ';
 else{const stop={...row.days[0].stops[0],travellerNote:'x'.repeat(4000)};row.days=Array.from({length:3},(_,offset)=>({offset,title:'Day',stops:Array.from({length:25},()=>structuredClone(stop))}));}
 const view=surface([row],'account-A');await view.nodes().find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.onClick();view.render();
 const select=view.nodes().find(el=>el.type==='button'&&el.props.children===row.title);assert.ok(select,'saved editing drafts cannot silently disappear');
 select.props.onClick();view.render();assert.ok(view.nodes().find(el=>el.props?.role==='alert'));
 assert.ok(view.nodes().find(el=>el.type==='button'&&el.props.children==='Edit this saved device draft'),'repair must not depend on a readable source guide');
 assert.equal(view.nodes().some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),false);
 assert.equal(view.requests(),0);assert.equal(row.days[0].stops[0].travellerNote,kind==='large'?'x'.repeat(4000):'');
});

for(const actorId of [null,'account-A'])test(`explicit ${actorId?'signed-in':'anonymous'} repair keeps the selected device identity and refreshes preview without importing`,async()=>{
 const row=draft();row.days[0].stops[0].title='';row.days[0].stops[0].travellerNote='Personal note retained after source withdrawal';
 const view=surface([row],actorId);await view.nodes().find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.onClick();view.render();
 view.nodes().find(el=>el.type==='button'&&el.props.children===row.title).props.onClick();view.render();
 const repair=view.nodes().find(el=>el.type==='button'&&el.props.children==='Edit this saved device draft');assert.ok(repair,'source-independent editor entry is required');repair.props.onClick();view.render();
 const editor=view.editor();assert.ok(editor);assert.equal(editor.props.initialDraft.id,row.id);assert.equal(editor.props.initialDraft.ownerId,'guest-one');assert.equal(editor.props.initialDraft.source.version,1);assert.equal(editor.props.actorId,actorId);assert.equal(editor.props.guide,undefined,'do not invent a published guide from stored client source claims');
 assert.equal(view.nodes().some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),false);
 assert.equal(view.nodes().find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.disabled,true,'another read cannot replace an active editor');
 const saved=structuredClone(editor.props.initialDraft);saved.days[0].stops[0].title='My repaired personal stop';editor.props.onSaved(saved);view.render();
 assert.equal(view.editor(),undefined);assert.equal(view.nodes().some(el=>el.props?.role==='alert'),false);
 assert.equal(view.nodes().some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),Boolean(actorId));
 assert.equal(view.requests(),0,'storage acknowledgement returns to review, never imports automatically');assert.equal(row.days[0].stops[0].title,'','the supplied original is never mutated');
 view.nodes().find(el=>el.type==='button'&&el.props.children==='Edit this saved device draft').props.onClick();view.render();assert.equal(view.editor().props.initialDraft.days[0].stops[0].title,'My repaired personal stop');
});

test('account changes hide the preserved device editor until explicit resume without changing its local key',async()=>{
 const row=draft(),view=surface([row],'account-A');await view.nodes().find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.onClick();view.render();view.nodes().find(el=>el.type==='button'&&el.props.children===row.title).props.onClick();view.render();view.nodes().find(el=>el.type==='button'&&el.props.children==='Edit this saved device draft').props.onClick();view.render();
 const key=view.editor().props.key;view.actor(null);assert.ok(view.editor(),'device editor remains mounted outside account invalidation');assert.equal(view.editor().props.key,key,'account changes cannot replace local editing state');assert.ok(view.nodes().find(el=>el.type==='div'&&el.props.hidden===true),'unsaved notes are hidden after an identity change');
 const resume=view.nodes().find(el=>el.type==='button'&&el.props.children==='Continue editing this device draft');assert.ok(resume,'the next identity must explicitly choose to recover');resume.props.onClick();view.render();assert.equal(view.nodes().some(el=>el.type==='div'&&el.props.hidden===true),false);
 view.actor('account-B');assert.equal(view.editor().props.key,key);assert.ok(view.nodes().find(el=>el.type==='div'&&el.props.hidden===true));assert.equal(view.requests(),0);
});

test('a completed account import cannot report the previous actor receipt after a session change',async()=>{
 const row=draft(),view=surface([row],'account-A');const button=name=>view.nodes().find(el=>el.type==='button'&&el.props.children===name);
 await button('Preview device-only drafts').props.onClick();view.render();button(row.title).props.onClick();view.render();const pending=button('Confirm import to this account').props.onClick();view.render();assert.equal(view.requests(),1);
 view.actor('account-B');view.responses[0]({ok:true,data:{pendingPhotos:[]}});await pending;view.render();assert.equal(view.nodes().some(el=>el.props?.role==='status'&&/imported to your account/.test(el.props.children)),false,'late A receipt cannot appear in B');assert.equal(button('Confirm import to this account'),undefined,'new actor must make a new explicit selection');
 await button('Preview device-only drafts').props.onClick();view.render();button(row.title).props.onClick();view.render();const next=button('Confirm import to this account').props.onClick();assert.notEqual(view.bodies[0].requestId,view.bodies[1].requestId);view.responses[1]({ok:true,data:{pendingPhotos:[]}});await next;
});
