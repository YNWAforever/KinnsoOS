import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import {canonicalUrl} from '../lib/agent/result-contract.ts';

// Exercise the actual component's handlers and effect dependencies without a browser,
// network, DOM polyfill or copied implementation. Hook scheduling is explicit so a
// same-snapshot parent rerender and a delayed context reset can be tested deterministically.
const source=await readFile(new URL('../app/agent/AgentWorkspace.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const pageSource=await readFile(new URL('../app/agent/AgentPage.tsx',import.meta.url),'utf8');
const compiledPage=await transform(pageSource,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function workspace(props,request=async()=>({ok:false,code:'UNAVAILABLE'}),options={}){
 const states=[],effects=[],refs=[];let cursor=0,changed=false,tree,unsubscribe,latestProps=props;
 const react={
  useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{const next=typeof value==='function'?value(states[index]):value;if(!Object.is(next,states[index])){states[index]=next;changed=true;}}];},
  useRef(initial){const index=cursor++;return refs[index]??(refs[index]={current:initial});},
  useEffect(work,deps){const index=cursor++,previous=effects[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i])))effects[index]={deps,work,cleanup:previous?.cleanup,pending:true};},
 };
 const jsx=(type,props)=>({type,props});const module={exports:{}};const context=createContext({module,exports:module.exports,console,crypto,require:name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./AgentWorkspace')return{__esModule:true,default:'agent-workspace'};
  if(name==='../../lib/merchants/repository')return{merchants:{memberships:async()=>({ok:true,data:[]})}};
  if(name==='../travel/ui')return{useApp:()=>({locale:'en',t:(en)=>en})};
  if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:callback=>{unsubscribe=callback;return()=>{unsubscribe=undefined;};}};
  if(name==='../../lib/agent/repository')return{agentRequest:request};
  if(name==='../../lib/trips/repository')return{trips:options.tripPorts??{apply:async()=>{throw Error('unexpected write');},get:async()=>{throw Error('unexpected read');}}};
  if(name==='../../lib/agent/result-contract')return{canonicalUrl};
  throw Error('Unexpected dependency '+name);
 }});runInContext(options.page?compiledPage.code:compiled.code,context);const Component=options.page?module.exports.AgentPage:module.exports.default;
 function render(next=latestProps,flush=true){latestProps=next;changed=false;cursor=0;tree=Component(latestProps);if(flush){for(let attempts=0;attempts<10;attempts++){for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;changed=false;cursor=0;tree=Component(latestProps);}}return tree;}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 render();return{render,elements,find:type=>elements().find(node=>node.type===type),invalidate:actor=>unsubscribe?.(actor)};
}
const actor='11111111-1111-4111-8111-111111111111';
const trip={id:'22222222-2222-4222-8222-222222222222',revision:4,days:[],title:'Owned'};
const props={actorId:actor,roles:['traveller'],initialTrip:trip,connected:true};
const query='A private source question';
function enter(instance,value=query){const field=instance.find('textarea');field.props.onChange({target:{value},currentTarget:{value}});instance.render();}
test('query stays controlled and enables preview across an equivalent backend snapshot replacement',()=>{
 const instance=workspace(props);enter(instance);assert.equal(instance.find('textarea').props.value,query);
 instance.render({...props,initialTrip:structuredClone(trip),roles:[...props.roles]});
 assert.equal(instance.find('textarea').props.value,query);
 assert.equal(instance.elements().find(node=>node.type==='button'&&node.props.children==='Read sources and preview').props.disabled,false);
});
test('query keeps its explicit accessible name after controlled text changes',()=>{
 const instance=workspace(props);assert.equal(instance.find('textarea').props['aria-label'],'Query');
 enter(instance);assert.equal(instance.find('textarea').props.value,query);
 assert.equal(instance.find('textarea').props['aria-label'],'Query');
});
test('pending owned-trip selection locks input until the snapshot and context reset commit',()=>{
 const loading={...props,initialTrip:null,contextLoading:true};const instance=workspace(loading);
 assert.equal(instance.find('textarea').props.disabled,true);
 assert.equal(instance.find('select').props.disabled,true);
 assert.equal(instance.elements().find(node=>node.type==='button'&&node.props.children==='Read sources and preview').props.disabled,true);
 instance.render({...props,contextLoading:false},false);
 assert.equal(instance.find('textarea').props.disabled,true);
 instance.render();assert.equal(instance.find('textarea').props.disabled,false);
 enter(instance);instance.render({...props,contextLoading:false});
 assert.equal(instance.find('textarea').props.value,query);
});
test('AgentPage propagates loading through the real owned-trip read before enabling query context',async()=>{
 let resolve;const read=new Promise(r=>{resolve=r;});const instance=workspace({actorId:actor,roles:['traveller'],enabled:true},undefined,{page:true,tripPorts:{list:async()=>({ok:true,data:{items:[trip],nextCursor:null}}),get:()=>read}});
 await new Promise(resolve=>setImmediate(resolve));instance.render();assert.equal(instance.find('agent-workspace').props.contextLoading,false);
 instance.find('select').props.onChange({target:{value:trip.id}});instance.render();
 assert.equal(instance.find('agent-workspace').props.contextLoading,true);
 assert.equal(instance.find('agent-workspace').props.initialTrip,null);
 resolve({ok:true,data:trip});await new Promise(resolve=>setImmediate(resolve));instance.render();
 assert.equal(instance.find('agent-workspace').props.contextLoading,false);
 assert.equal(instance.find('agent-workspace').props.initialTrip.id,trip.id);
});
test('role ordering alone preserves input; real owner, role, trip revision and availability changes clear it',()=>{
 const both={...props,roles:['traveller','creator']};const same=workspace(both);enter(same);same.render({...both,roles:['creator','traveller']});assert.equal(same.find('textarea').props.value,query);
 for(const next of [{...props,actorId:'33333333-3333-4333-8333-333333333333'},{...props,roles:['traveller','creator']},{...props,initialTrip:{...trip,revision:5}},{...props,initialTrip:{...trip,id:'44444444-4444-4444-8444-444444444444'}},{...props,connected:false},{...props,merchantId:'55555555-5555-4555-8555-555555555555'}]){
  const instance=workspace(props);enter(instance);instance.render(next);assert.equal(instance.find('textarea').props.value,'');
 }
});
test('query is locked until a new context reset has committed; account invalidation clears private input',()=>{
 const instance=workspace(props);enter(instance);
 instance.render({...props,initialTrip:{...trip,revision:5}},false);assert.equal(instance.find('textarea').props.disabled,true);
 instance.render();assert.equal(instance.find('textarea').props.value,'');
 enter(instance);instance.invalidate(null);instance.render();assert.equal(instance.find('textarea').props.value,'');assert.equal(instance.find('textarea').props.disabled,true);
});
test('a source result arriving after an owner change cannot restore previous private query or preview',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const instance=workspace(props,()=>pending);enter(instance);
 const button=instance.elements().find(node=>node.type==='button'&&node.props.children==='Read sources and preview');const run=button.props.onClick();
 instance.render({...props,actorId:'33333333-3333-4333-8333-333333333333',initialTrip:null});
 resolve({ok:true,data:{answer:'PRIVATE_OLD_RESULT',sources:[],proposedActions:[],capabilityMode:'sources_only',providerStatus:'unconfigured'}});
 await pending;await Promise.resolve();instance.render();
 assert.equal(instance.find('textarea').props.value,'');assert.equal(JSON.stringify(instance.elements()).includes('PRIVATE_OLD_RESULT'),false);
});
