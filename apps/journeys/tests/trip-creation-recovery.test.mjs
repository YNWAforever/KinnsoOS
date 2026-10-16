import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from './helpers/guide-workspace-harness.mjs';
const guideId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',tripId='33333333-3333-4333-8333-333333333333',flowId='44444444-4444-4444-8444-444444444444';
const guide={kind:'itinerary',id:guideId,title:'Authored Kyoto days',version:1,days:[]};
const intent={guideId,version:1,requestId,flowId,tripId:null};
const input={title:'My Kyoto',timezone:'Asia/Tokyo',startDate:'2026-11-01'};
const search='?next='+encodeURIComponent(`/en/g/${guideId}?adopt=1&flow=${flowId}&version=1`);
const submit=async view=>{view.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await view.settle();};
const ports={guidesGet:async()=>({ok:true,data:guide})};
test('late original-field mismatch from A cannot repaint account B',async()=>{
 let reject;const held=new Promise((resolve,no)=>{reject=no}),props={actorId:'A'};
 const view=await mount('TripWorkspace',props,{...ports,readCreation:async owner=>owner==='A'?{intent:{...intent,inputHash:'a'.repeat(64)},input:null}:null,restoreCreation:async()=>held},search);
 await submit(view);await submit(view);
 props.actorId='B';view.render();await view.settle();reject(Error('ORIGINAL_INPUT_MISMATCH'));await view.settle();
 assert.doesNotMatch(view.text(),/These fields do not match/);
});
test('after sign-out before creation, explicit original-field review resumes the same request',async()=>{
 const calls=[],restored=[];
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,readCreation:async()=>({intent:{...intent,inputHash:'a'.repeat(64)},input:null}),restoreCreation:async(...args)=>{restored.push(args);return input},tripsCreate:async(...args)=>{calls.push(args);return{ok:true,data:{id:tripId}}}},search);
 await submit(view);assert.equal(calls.length,0);
 const fields=view.elements().filter(n=>n.type==='input');
 fields.find(n=>n.props.maxLength===200).props.onChange({target:{value:input.title}});
 fields.find(n=>n.props.type==='date').props.onChange({target:{value:input.startDate}});
 fields.find(n=>n.props.required&&n.props.maxLength===undefined).props.onChange({target:{value:input.timezone}});
 await view.settle();await submit(view);
 assert.equal(restored.length,1);assert.deepEqual(JSON.parse(JSON.stringify(restored[0])),['A',guideId,requestId,input]);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),[input,requestId,'A']);
});
test('same-prop session invalidation clears creation UI and explains how to sign in again',async()=>{
 let invalidate,writes=0;
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,readCreation:async()=>({intent,input}),subscribeInvalidation:callback=>{invalidate=callback;return()=>{}},tripsCreate:async()=>{writes++;return{ok:false,code:'UNAVAILABLE'}}},search);
 invalidate('B');await view.settle();
 assert.match(view.text(),/Account changed|Session ended/);
 assert.equal(view.elements().filter(node=>node.type==='form').length,0);
 assert.doesNotMatch(view.text(),/My Kyoto|An earlier creation/);assert.equal(writes,0);
});
test('guide creation pre-fills the source title and preserves reviewed version in the return',async()=>{
 const navigation=[];
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,tripsCreate:async()=>({ok:true,data:{id:tripId}}),navigate:path=>navigation.push(path)},search);
 assert.equal(view.elements().find(n=>n.type==='input'&&n.props.maxLength===200).props.value,guide.title);
 await submit(view);
 assert.match(navigation[0],/version=1/);assert.match(navigation[0],/creation=/);assert.match(navigation[0],new RegExp('trip='+tripId));
});
test('an unknown creation is journalled before sending, cannot change payload, and survives remount',async()=>{
 let stored=null;const calls=[],journalled=[],navigation=[];
 const boundary={...ports,readCreation:async()=>stored,saveCreation:async(owner,next,value)=>{stored={intent:next,input:value}},tripsCreate:async(...args)=>{journalled.push(!!stored);calls.push(args);return{ok:false,code:'UNAVAILABLE'}},navigate:p=>navigation.push(p)};
 let view=await mount('TripWorkspace',{actorId:'A'},boundary,search);
 await submit(view);assert.equal(journalled[0],true,'persist before submitting');const original=structuredClone(calls[0]);
 const title=view.elements().find(n=>n.type==='input'&&n.props.maxLength===200);
 title.props.onChange({target:{value:'Changed while response unknown'}});
 await view.settle();await submit(view);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),original,'retry must use original request and payload');
 view=await mount('TripWorkspace',{actorId:'A'},boundary,search);await submit(view);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[2])),original);assert.equal(navigation.length,0);
});
test('lost create acknowledgement is reconciled to its original trip without another POST',async()=>{
 let writes=0;const navigation=[],recorded=[];
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,readCreation:async()=>({intent,input}),creationReceipt:async(id,actor)=>{assert.equal(id,requestId);assert.equal(actor,'A');return{ok:true,data:{tripId}}},recordCreated:async(...args)=>recorded.push(args),tripsCreate:async()=>{writes++;return{ok:false,code:'UNAVAILABLE'}},navigate:p=>navigation.push(p)},search);
 await submit(view);assert.equal(writes,0);assert.equal(recorded.length,1);assert.match(navigation[0],new RegExp('trip='+tripId));
});
test('failure to persist recovery prevents creation and tells the traveller nothing was sent',async()=>{
 let writes=0;
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,saveCreation:async()=>{throw Error('disk')},tripsCreate:async()=>{writes++;return{ok:false,code:'UNAVAILABLE'}}},search);
 await submit(view);assert.equal(writes,0);assert.match(view.text(),/Nothing was submitted/);
});
test('an account change while journal storage is pending cannot submit the old creation',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve});let writes=0;
 const props={actorId:'A'},view=await mount('TripWorkspace',props,{...ports,saveCreation:async()=>held,tripsCreate:async()=>{writes++;return{ok:false,code:'UNAVAILABLE'}}},search);
 await submit(view);props.actorId='B';view.render();await view.settle();release();await view.settle();assert.equal(writes,0);
});
test('logout-retained opaque receipt requires an explicit check and never fabricates a new payload',async()=>{
 let checks=0,writes=0;
 const view=await mount('TripWorkspace',{actorId:'A'},{...ports,readCreation:async()=>({intent,input:null}),creationReceipt:async()=>{checks++;return{ok:true,data:{tripId:null}}},tripsCreate:async()=>{writes++;return{ok:false,code:'UNAVAILABLE'}}},search);
 assert.equal(checks,0);await submit(view);assert.equal(checks,1);assert.equal(writes,0);assert.match(view.text(),/original fields|original input/i);
});
