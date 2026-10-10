import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import * as review from '../lib/merchants/application-review.ts';
const componentPath=new URL('../app/travel/MerchantApplicationReview.tsx',import.meta.url),id='11111111-1111-4111-8111-111111111111';
const row={id,companyName:'Private company',contactName:'Company contact',contactEmail:'submitted-contact@example.test',websiteUrl:'https://company.test/about',pitch:'Company authored application',status:'pending',createdAt:'2026-10-10T12:30:00.123456+00:00',decidedAt:null,decisionReason:null};
const compiled=existsSync(componentPath)?await transform(await readFile(componentPath,'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'}):null;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function storage(){const data=new Map();return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
async function harness(port={},session=storage(),initial={}){
 assert.ok(compiled,'MerchantApplicationReview must provide a native review UI');
 const states=[],refs=[],effects=[],calls=[];let cursor=0,changed=false,tree,invalidator,props={actorId:'actor-A',enabled:true,...initial};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 const request=async(url,method='GET',body)=>{calls.push({url,method,body});return method==='POST'?(port.write?.(body)??{ok:true,data:{...row,status:body.action==='approve'?'approved':'rejected',decidedAt:'2026-10-10T13:00:00Z',decisionReason:body.reason}}):url.includes('?id=')?(port.current?.()??{ok:true,data:row}):(port.list?.(url)??{ok:true,data:{applications:[row],nextCursor:null}});};
 runInContext(compiled.code,createContext({module,exports:module.exports,URLSearchParams,window:{sessionStorage:session},require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='./ui')return{useApp:()=>({t:en=>en})};
  if(name==='../../lib/trips/repository')return{request};if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidator=fn;return()=>{};}};
  if(name==='../../lib/merchants/application-review')return review;throw Error('Unexpected dependency '+name);
 }}));
 function render(){for(let n=0;n<15;n++){cursor=0;changed=false;tree=module.exports.MerchantApplicationReview(props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));
 render();await tick();render();return{find,elements,calls,session,render,scope:next=>{props={...props,...next};render();},invalidate:()=>{invalidator?.(null);render();},unmount:()=>{for(const effect of effects)effect?.cleanup?.();}};
}
function select(h){h.find('select','Pending merchant application').props.onChange({target:{value:id}});h.render();}
function reason(h,value='Verified the submitted company details'){h.find('textarea','Decision reason').props.onChange({target:{value}});h.render();}

test('native review previews authored company data and requires reason before explicit approval or rejection',async()=>{
 const h=await harness();select(h);assert.match(JSON.stringify(h.elements()),/Company authored application/);assert.match(JSON.stringify(h.elements()),/submitted-contact@example.test/);
 const link=h.find('a','Company website');assert.equal(link.props.href,row.websiteUrl);assert.match(link.props.rel,/noreferrer/);
 assert.equal(h.find('button','Approve application').props.disabled,true);assert.equal(h.find('button','Reject application').props.disabled,true);
 reason(h);h.find('button','Approve application').props.onClick();await tick();h.render();assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(x=>x.method==='POST').body)),{id,action:'approve',reason:'Verified the submitted company details'});
 assert.equal(h.find('textarea','Decision reason'),undefined);assert.equal(h.session.data.size,0);assert.match(JSON.stringify(h.elements()),/Recorded decision: approved/);
});

test('unknown review outcome pins original intent; a pending read never unlocks an opposite decision',async()=>{
 const writes=[];const h=await harness({write:async body=>{writes.push(body);return writes.length===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{...row,status:'approved',decidedAt:'2026-10-10T13:00:00Z',decisionReason:body.reason}};}});
 select(h);reason(h);h.find('button','Approve application').props.onClick();await tick();h.render();assert.equal(h.find('button','Reject application').props.disabled,true);assert.equal(h.find('textarea','Decision reason').props.disabled,true);
 h.find('button','Check decision status').props.onClick();await tick();h.render();assert.equal(h.find('button','Reject application').props.disabled,true);assert.equal(h.find('button','Cancel review').props.disabled,true);
 h.find('button','Retry original decision').props.onClick();await tick();h.render();assert.deepEqual(writes[1],writes[0]);assert.equal(h.session.data.size,0);assert.match(JSON.stringify(h.elements()),/Recorded decision: approved/);
});

test('unknown review survives navigation and retries the identical decision without persisting applicant contact or pitch',async()=>{
 const session=storage();let current=row;
 const h=await harness({write:async()=>({ok:false,code:'UNAVAILABLE'})},session);select(h);reason(h,'Private authored reason');h.find('button','Reject application').props.onClick();await tick();h.render();h.unmount();
 assert.equal([...session.data.values()].join('').includes(row.contactEmail),false);assert.equal([...session.data.values()].join('').includes(row.pitch),false);
 const resumed=await harness({current:async()=>({ok:true,data:current}),write:async()=>({ok:false,code:'UNAVAILABLE'})},session);assert.equal(resumed.find('button','Approve application').props.disabled,true);assert.ok(resumed.find('button','Retry original decision'));assert.equal(resumed.find('textarea','Decision reason').props.value,'Private authored reason');
 resumed.find('button','Retry original decision').props.onClick();await tick();resumed.render();assert.deepEqual(JSON.parse(JSON.stringify(resumed.calls.find(call=>call.method==='POST').body)),JSON.parse(JSON.stringify(h.calls.find(call=>call.method==='POST').body)));assert.equal(resumed.find('button','Approve application').props.disabled,true);
 current={...row,status:'approved',decidedAt:'2026-10-10T13:00:00Z',decisionReason:'Another moderator reviewed'};
 resumed.find('button','Check decision status').props.onClick();await tick();resumed.render();assert.equal(session.data.size,0);assert.match(JSON.stringify(resumed.elements()),/Recorded decision: approved/);
});

test('account invalidation discards private data and ignores late decision and directory acknowledgements',async()=>{
 let finish;const h=await harness({write:()=>new Promise(resolve=>{finish=resolve;})});select(h);reason(h);h.find('button','Approve application').props.onClick();h.render();h.invalidate();finish({ok:true,data:{...row,status:'approved',decidedAt:'2026-10-10T13:00:00Z'}});await tick();h.render();assert.doesNotMatch(JSON.stringify(h.elements()),/Private company|submitted-contact|Recorded decision/);
 let loaded;const late=await harness({list:()=>new Promise(resolve=>{loaded=resolve;})});late.invalidate();loaded({ok:true,data:{applications:[row],nextCursor:null}});await tick();late.render();assert.doesNotMatch(JSON.stringify(late.elements()),/Private company|submitted-contact/);
});

test('disabled review, denied role and failed recovery persistence never submit a decision',async()=>{
 const disabled=await harness({},storage(),{enabled:false});assert.equal(disabled.calls.length,0);
 const denied=await harness({list:async()=>({ok:false,code:'FORBIDDEN'})});assert.equal(denied.find('select','Pending merchant application'),undefined);assert.match(JSON.stringify(denied.elements()),/Moderator access is required/);
 const blocked=storage();blocked.setItem=()=>{throw Error('Blocked');};const h=await harness({},blocked);select(h);reason(h);h.find('button','Reject application').props.onClick();await tick();h.render();assert.equal(h.calls.some(x=>x.method==='POST'),false);
});

test('queue pagination replaces bounded pages and does not keep an earlier application selected',async()=>{
 const next={id,createdAt:row.createdAt},h=await harness({list:async url=>({ok:true,data:url.includes('after=')?{applications:[],nextCursor:null}:{applications:[row],nextCursor:next}})});select(h);reason(h);h.find('button','Next applications').props.onClick();await tick();h.render();assert.equal(h.find('textarea','Decision reason'),undefined);assert.match(h.calls.at(-1).url,/after=/);assert.match(JSON.stringify(h.elements()),/No pending applications on this page/);
});
