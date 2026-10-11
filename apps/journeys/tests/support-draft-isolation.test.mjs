import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const cases=[a,b].map((id,i)=>({id,subject:`Case ${i+1}`,status:'open',ownerId:null,revision:1,linkedEventId:null,updatedAt:'2026-10-11T00:00:00Z',messages:[],messagesNextCursor:null}));
const article=(h,id)=>h.elements().find(n=>n.type==='article'&&h.text(n).includes(cases.find(c=>c.id===id).subject));
const field=(h,id,label)=>h.elements(article(h,id)).find(n=>n.type==='label'&&[n.props.children].flat(Infinity).includes(label));
const input=(h,id,label)=>h.elements(field(h,id,label)).find(n=>['textarea','select'].includes(n.type));
const edit=(h,id,label,value)=>{input(h,id,label).props.onChange({target:{value}});h.render();};
const submit=(h,id)=>h.elements(article(h,id)).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
async function settle(h){for(let i=0;i<6;i++){await tick();h.render();}}
const reads=()=>({ok:true,data:{items:cases,nextCursor:null}});

test('a case reply cannot populate another case or the new-case message',async()=>{
 const writes=[];const h=await workspaceHarness('SupportWorkspace',{request:async(url,method,body)=>{if(method==='POST'){writes.push(body);return{ok:true,data:{id:a,revision:2,status:'open'}};}return reads();}});
 edit(h,a,'Reply to this case','Only case A');
 assert.equal(input(h,b,'Reply to this case').props.value,'');
 assert.equal(h.field('Message to support').props.value,'');
 edit(h,b,'Reply to this case','Keep case B');
 h.field('Message to support').props.onChange({target:{value:'Separate new case'}});h.render();
 submit(h,a);await settle(h);
 assert.equal(writes[0].command.id,a);assert.equal(writes[0].command.message,'Only case A');
 assert.equal(input(h,a,'Reply to this case').props.value,'');
 assert.equal(input(h,b,'Reply to this case').props.value,'Keep case B');
 assert.equal(h.field('Message to support').props.value,'Separate new case');
});

test('ops decisions and private reasons belong to the selected case',async()=>{
 const writes=[];const h=await workspaceHarness('SupportWorkspace',{request:async(url,method,body)=>{if(method==='POST'){writes.push(body);return{ok:true,data:{id:a,revision:2,status:'resolved'}};}return reads();}},{opsMode:true});
 assert.ok(field(h,a,'Internal decision reason'),'each case has its own decision form');
 edit(h,a,'Internal decision reason','A verified internal reason');edit(h,a,'Case decision','resolved');edit(h,a,'Response visible to the customer','Case A is resolved');
 assert.equal(input(h,b,'Internal decision reason').props.value,'');assert.equal(input(h,b,'Case decision').props.value,'in_progress');
 edit(h,b,'Internal decision reason','Keep this other private reason');
 submit(h,a);await settle(h);
 assert.equal(writes[0].command.reason,'A verified internal reason');assert.equal(writes[0].command.status,'resolved');assert.equal(writes[0].command.message,'Case A is resolved');
 assert.equal(input(h,b,'Internal decision reason').props.value,'Keep this other private reason');
});

test('an unknown reply reconciles its original command and preserves other drafts on the device',async()=>{
 let stored=null;const events=[];
 const recovery={read:async()=>stored,save:async(actor,scope,value)=>{stored=structuredClone(value);},release:async()=>{stored.pending=null;},clear:async()=>{stored=null;}};
 const ports={workspaceRecovery:recovery,request:async(url,method,body)=>{if(method==='POST'){events.push({url,body});return url.endsWith('/receipt')?{ok:true,data:{result:{id:a,revision:2,status:'open'}}}:{ok:false,code:'UNAVAILABLE'};}return reads();}};
 const h=await workspaceHarness('SupportWorkspace',ports);
 edit(h,b,'Reply to this case','Retain across reload');edit(h,a,'Reply to this case','Original uncertain reply');submit(h,a);await settle(h);
 h.find('button','Retry the same request').props.onClick();await settle(h);
 assert.deepEqual(events.map(x=>x.url),['/api/support','/api/support/receipt']);assert.deepEqual(events[0].body,events[1].body);
 assert.equal(input(h,b,'Reply to this case').props.value,'Retain across reload');
 const restored=await workspaceHarness('SupportWorkspace',ports);await settle(restored);
 assert.equal(input(restored,b,'Reply to this case').props.value,'Retain across reload');
 assert.equal(input(restored,a,'Reply to this case').props.value,'');
 restored.invalidate();assert.equal(restored.text().includes('Retain across reload'),false);
});

test('legacy unscoped recovery text is available to copy but is not assigned to any case',async()=>{
 const h=await workspaceHarness('SupportWorkspace',{request:async()=>reads(),workspaceRecovery:{read:async()=>({version:1,draft:{subject:'Old subject',message:'Unscoped old reply',reason:'Old internal reason',status:'resolved'},pending:null}),save:async()=>{},clear:async()=>{}}});
 assert.equal(input(h,a,'Reply to this case').props.value,'');assert.equal(input(h,b,'Reply to this case').props.value,'');
 assert.equal(h.field('Message to support').props.value,'');
 assert.ok(h.elements().some(n=>n.type==='textarea'&&n.props.readOnly&&n.props.value.includes('Unscoped old reply')));
});
