import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../lib/creators/editor-operations.ts';
const stop=()=>({title:'Authored stop',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null});
const ready=()=>({title:'Original route',city:'Kyoto',summary:'A route authored with permission',content:{days:[{offset:0,title:'',stops:[stop()]}]}});

test('publication guidance identifies missing metadata without inventing route content',()=>{
 assert.equal(typeof ops.publicationReadiness,'function');
 const draft=ready();draft.title=' ';draft.city='';draft.summary='';const before=structuredClone(draft);
 assert.deepEqual(ops.publicationReadiness(draft),{dayCount:1,stopCount:1,issues:[{code:'title'},{code:'city'},{code:'summary'}]});assert.deepEqual(draft,before);
});
test('publication guidance points to empty days and unnamed stops while optional detail stays optional',()=>{
 assert.equal(typeof ops.publicationReadiness,'function');const draft=ready();
 assert.deepEqual(ops.publicationReadiness(draft),{dayCount:1,stopCount:1,issues:[]});
 draft.content.days.push({offset:2,title:'',stops:[]});draft.content.days[0].stops[0].title=' ';
 assert.deepEqual(ops.publicationReadiness(draft),{dayCount:2,stopCount:1,issues:[{code:'stopTitle',day:0,stop:0},{code:'stops',day:1}]});
 draft.content.days=[];assert.deepEqual(ops.publicationReadiness(draft),{dayCount:0,stopCount:0,issues:[{code:'days'}]});
});

// Exercise the actual editor at its framework/network boundaries, as the existing editor suite does.
import {readFile} from 'node:fs/promises';import {createContext,runInContext} from 'node:vm';import {transform} from 'esbuild';
async function editor(payload,locale='en'){
 const source=await readFile(new URL('../app/travel/CreatorWorkspace.tsx',import.meta.url),'utf8');
 const compiled=await transform(source+'\nexport {CreatorEditor};',{loader:'tsx',format:'cjs',jsx:'automatic'});
 const states=[],refs=[],effects=[],writes=[];let cursor=0,tree;
 const hooks={useId:()=>':readiness:',useState(v){const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(v){const i=cursor++;return refs[i]??(refs[i]={current:v});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects[i]={work,deps,pending:true};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,window:{addEventListener(){},removeEventListener(){}},setTimeout:()=>0,clearTimeout(){},require:name=>{
  if(name==='./UnsavedDraftGuard')return{useUnsavedDraftGuard(){}};if(name==='react')return hooks;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};if(name==='next/navigation')return{useRouter:()=>({refresh(){}})};
  if(name==='./ui')return{useApp:()=>({t:(en,zh)=>locale==='zh-HK'?zh:en,href:p=>'/'+locale+'/'+p})};
  if(name==='../../lib/creators/contracts')return{emptyDraft:()=>ready(),creators:{get:async()=>({ok:true,data:{id:'guide',payload,revision:1,publishedVersion:0,sourceChanged:false}}),publish:async(...args)=>{writes.push(args);return{ok:false,code:'UNAVAILABLE',retryable:true};}}};
  if(name==='../../lib/creators/editor-operations')return ops;
  if(name==='./WorkspaceServiceState')return{WorkspaceServiceState(){throw Error('Editor must not render the entry service state');}};
  if(name==='../../lib/creators/handles')return{PLATFORMS:[]};if(name==='../../lib/trips/local-drafts'||name==='./CreatorCollaborationTasks')return{};
  throw Error(name);
 }}));
 function render(){cursor=0;tree=module.exports.CreatorEditor({path:'studio/guides/guide/edit'});for(const e of effects)if(e?.pending){e.pending=false;e.work();}}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(n=>elements(n))];}
 const text=n=>typeof n==='string'||typeof n==='number'?String(n):n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(' '):'';
 render();await new Promise(r=>setImmediate(r));render();return{render,elements,text:()=>text(tree),writes};
}
for(const locale of ['en','zh-HK'])test(`actual editor gives field destinations and blocks incomplete publication (${locale})`,async()=>{
 const draft=ready();draft.title='';draft.content.days[0].stops[0].title='';const h=await editor(draft,locale);
 const publish=h.elements().find(n=>n.type==='button'&&n.props.children===(locale==='en'?'Publish structured version':'發布結構化版本'));
 assert.equal(publish.props.disabled,true);
 const links=h.elements().filter(n=>n.type==='a'&&n.props.href?.startsWith('#'));
 assert.equal(links.length,2);for(const a of links)assert.ok(h.elements().some(n=>n.props.id===a.props.href.slice(1)),'missing field link resolves to an actual editor control');
 assert.ok(h.text().includes(locale==='en'?'Before publishing':'發布前檢查'));
});
test('a complete saved route publishes once and an uncertain retry retains its original request',async()=>{
 const h=await editor(ready());const button=label=>h.elements().find(n=>n.type==='button'&&n.props.children===label);
 assert.equal(button('Publish structured version').props.disabled,false);
 await button('Publish structured version').props.onClick();h.render();
 await button('Retry same action').props.onClick();h.render();
 assert.equal(h.writes.length,2);assert.deepEqual(h.writes[0],h.writes[1]);
});
