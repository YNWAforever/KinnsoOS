import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const id='11111111-1111-4111-8111-111111111111',stamp='2026-10-10T19:00:00.123456+00:00';
const tick=()=>new Promise(r=>setImmediate(r));
const detail=()=>({id,title:'Authored collaboration',summary:'Read the authored brief.',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',merchantName:'Local merchant',eligible:true,joinAvailable:true,acceptAvailable:false,evidenceAvailable:false,minTier:null,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',startsAt:null,endsAt:null,participant:null,requirements:[],deliverables:[],couponCode:null,couponUrl:null,milestones:[{id,title:'Original route',description:'Write your own route',dueAt:null,repeatable:false}],milestonesTruncated:false,submissions:[],submissionsNextCursor:null,partnerLinks:[],maxReceipts:null});
async function harness(port={},name='CreatorMissionsWorkspace'){
 const source=await readFile(new URL('../app/travel/'+name+'.tsx',import.meta.url),'utf8').catch(()=> '');assert.notEqual(source,'','The connected creator workspace must exist');
 const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'}),states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidate;
 const props={path:'studio/missions/'+id,actorId:'creator-A',enabled:true};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};let sequence=0;
 const validation=await import('../lib/creators/collaboration-validation.ts');
 runInContext(compiled.code,createContext({module,exports:module.exports,Date,URL,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({t:en=>en,locale:'en',href:path=>'/en/'+path})};
  if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidate=fn;return()=>{};}};
  if(name==='../../lib/creators/collaboration-validation')return validation;
  if(name==='../../lib/creators/collaboration')return{creatorMissions:{get:async()=>({ok:true,data:detail()}),list:async()=>({ok:true,data:{items:[],nextCursor:null}}),...port},creatorEarnings:{get:async()=>({ok:true,data:{section:'settled',totals:[],items:[],nextCursor:null}}),...port}};
  throw Error('Unexpected import '+name);
 }}));
 function render(){for(let n=0;n<12;n++){cursor=0;changed=false;tree=module.exports[name](props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 function text(node){if(arguments.length===0)node=tree;return typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(child=>text(child)).join(' '):'';}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));
 render();await tick();render();return{render,find,elements,text,invalidate:()=>invalidate?.(null),props};
}

test('creator unknown join retries one immutable command and clears private work on account invalidation',async()=>{
 const calls=[],h=await harness({command:async(...args)=>{calls.push(args);return{ok:false,code:'UNAVAILABLE',retryable:true};}});
 const consent=h.find('input','I have read the collaboration requirements.');assert.ok(consent);consent.props.onChange({target:{checked:true}});h.render();
 await h.find('button','Join collaboration').props.onClick();await tick();h.render();assert.equal(calls.length,1);
 assert.ok(h.find('button','Retry the same request'));assert.equal(h.find('button','Join collaboration').props.disabled,true);
 await h.find('button','Retry the same request').props.onClick();await tick();h.render();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);
 h.invalidate();h.render();assert.doesNotMatch(h.text(),/Authored collaboration/);assert.ok(h.find('a','Sign in to continue'));
});

test('creator evidence conflict retains authored input and does not silently retry or replace the reviewed version',async()=>{
 const dto=detail();dto.participant={id,status:'active',updatedAt:stamp};dto.joinAvailable=false;dto.evidenceAvailable=true;let writes=0;
 const h=await harness({get:async()=>({ok:true,data:dto}),command:async()=>{writes++;return{ok:false,code:'CONFLICT',retryable:false};}});
 h.find('button','Prepare evidence').props.onClick();h.render();
 h.find('textarea','Evidence links (one HTTPS link per line)').props.onChange({target:{value:'https://example.test/my-work'}});h.render();
 h.find('textarea','Notes for reviewer').props.onChange({target:{value:'My retained authored details'}});h.render();
 await h.elements().find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await tick();h.render();
 assert.equal(writes,1);assert.equal(h.find('textarea','Notes for reviewer').props.value,'My retained authored details');
 assert.match(h.text(),/changed/);assert.equal(h.find('button','Retry the same request'),undefined);await tick();assert.equal(writes,1);
});

test('authored coupon campaigns ask for an application while mature immediate-join offers keep their existing CTA',async()=>{
 const dto=detail();dto.requiresApplication=true;
 const h=await harness({get:async()=>({ok:true,data:dto})});
 assert.ok(h.find('button','Send application'));assert.equal(h.find('button','Join collaboration'),undefined);
});

test('earnings show exact separate-currency totals and distinguish tracked volume from payout records',async()=>{
 const pages={settled:{section:'settled',totals:[{currency:'HKD',pending:'9999999999.99',paid:'0.10'},{currency:'USD',pending:'1.20',paid:'0.00'}],items:[],nextCursor:null},tracked:{section:'tracked',totals:[],items:[{id,kind:'affiliate',title:'Tracked campaign',amount:'750.00',currency:'USD',status:'processing'}],nextCursor:null}};
 const h=await harness({get:async section=>({ok:true,data:pages[section]})},'CreatorEarningsWorkspace');
 assert.match(h.text(),/HKD 9999999999\.99/);assert.match(h.text(),/USD 1\.20/);
 await h.find('button','Tracked activity').props.onClick();await tick();h.render();assert.match(h.text(),/USD 750\.00/);assert.match(h.text(),/not yet payable/);
 h.invalidate();h.render();assert.doesNotMatch(h.text(),/750\.00/);
});
