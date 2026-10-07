import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {guideDraft} from '../lib/trips/guest-drafts.ts';
import {previewLocalImport} from '../lib/trips/import.ts';

const compiled=await transform(await readFile(new URL('../app/travel/ImportPreview.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
test('explicit device preview keeps valid drafts and reports unreadable copies without importing',async()=>{
 const good=guideDraft({id:'guide-one',version:1,title:'My saved device walk',days:[{offset:0,title:'Day one',stops:[{title:'Temple',startMinuteOfDay:null,durationMinutes:null}]}]},'device-one','guest-one','UTC');
 const bad={...good,id:'device-bad',title:{not:'text'}},foreign={...good,id:'account-copy',ownerId:'account-A'};
 const states=[];let cursor=0,tree,reads=0,requests=0;
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,require:name=>{
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=value}]},useRef:initial=>({current:initial})};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};
  if(name==='../../lib/trips/import')return{previewLocalImport};
  if(name==='../../lib/trips/guest-drafts')return{readGuestTrips:async()=>{reads++;return[null,bad,foreign,good]}};
  if(name==='../../lib/trips/repository')return{request:()=>{requests++;throw Error('Anonymous import must not run')}};
  return{};
 }}));
 const render=()=>{cursor=0;tree=module.exports.ImportPreview({actorId:null})};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 render();assert.equal(reads,0,'device copies require an explicit user action');
 await nodes(tree).find(el=>el.type==='button'&&el.props.children==='Preview device-only drafts').props.onClick();
 assert.doesNotThrow(render,'damaged IndexedDB rows cannot crash the recovery surface');
 assert.deepEqual(nodes(tree).filter(el=>el.type==='li').map(el=>el.props.children.props.children),['My saved device walk']);
 assert.match(nodes(tree).find(el=>el.props?.role==='status').props.children,/could not be previewed/i);
 nodes(tree).find(el=>el.type==='button'&&el.props.children==='My saved device walk').props.onClick();render();
 assert.ok(nodes(tree).find(el=>el.type==='a'&&el.props.href==='/en/sign-in?next=%2Fen%2Ftrips'));
 assert.equal(nodes(tree).some(el=>el.type==='button'&&el.props.children==='Confirm import to this account'),false);
 assert.equal(requests,0,'preview and cancellation cannot perform an import');
});
