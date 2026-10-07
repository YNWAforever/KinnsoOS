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
 const states=[];let cursor=0,tree,reads=0,requests=0;
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,require:name=>{
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=value}]},useRef:initial=>({current:initial})};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
  if(name==='../../lib/trips/import')return{previewLocalImport};
  if(name==='../../lib/trips/guest-drafts')return{...storage,readGuestTrips:async()=>{reads++;return rows}};
  if(name==='../../lib/trips/repository')return{request:()=>{requests++;throw Error('Anonymous import must not run')}};
  return{};
 }}));
 const render=()=>{cursor=0;tree=module.exports.ImportPreview({actorId})};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 render();return{render,nodes:()=>nodes(tree),reads:()=>reads,requests:()=>requests};
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
 assert.ok(view.nodes().find(el=>el.type==='a'&&el.props.href==='/en/g/guide-one'),'offer the device editor for repair');
 assert.equal(view.nodes().some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),false);
 assert.equal(view.requests(),0);assert.equal(row.days[0].stops[0].travellerNote,kind==='large'?'x'.repeat(4000):'');
});
