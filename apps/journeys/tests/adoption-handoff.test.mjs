import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from './helpers/guide-workspace-harness.mjs';
import {adoptionPreview} from '../lib/guides/adoption-preview.ts';
const id='11111111-1111-4111-8111-111111111111',tripId='22222222-2222-4222-8222-222222222222',flow='33333333-3333-4333-8333-333333333333';
const guide={kind:'itinerary',id,title:'Published route',version:1,days:[{id,offset:0,title:'Authored day',stops:[{id:tripId,title:'Authored stop'}]}]};
const trip={id:tripId,title:'Private destination',revision:4,days:[]};
const ports={guidesGet:async()=>({ok:true,data:guide}),bookmarksList:async()=>({ok:true,data:{items:[]}}),tripsList:async()=>({ok:true,data:{items:[trip],nextCursor:null}}),tripsGet:async()=>({ok:true,data:trip}),adoptionPreview};
test('cancel preview discloses a created empty trip and sends no adoption',async()=>{
 let writes=0;
 const view=await mount('GuideWorkspace',{id,actorId:'A',initialGuide:guide},{...ports,readCreation:async()=>({intent:{guideId:id,version:1,flowId:flow,requestId:flow,tripId},input:null}),tripsAdopt:async()=>{writes++}},`?adopt=1&trip=${tripId}&flow=${flow}&version=1&creation=${flow}`);
 assert.match(view.text(),/empty trip.*created/i);
 const cancel=view.button('Cancel preview');assert.ok(cancel);cancel.props.onClick();await view.settle();
 assert.doesNotMatch(view.text(),/Review before applying/);assert.match(view.text(),/empty trip.*created/i);assert.equal(writes,0);
});
test('a changed source version cannot auto-preview a different itinerary after trip creation',async()=>{
 const view=await mount('GuideWorkspace',{id,actorId:'A',initialGuide:{...guide,version:2}},{...ports,guidesGet:async()=>({ok:true,data:{...guide,version:2}})},`?adopt=1&trip=${tripId}&flow=${flow}&version=1`);
 assert.match(view.text(),/source version changed/i);assert.doesNotMatch(view.text(),/Review before applying/);
});
test('anonymous account adoption links through login back to this guide, without writing',async()=>{
 const view=await mount('GuideWorkspace',{id,actorId:null,initialGuide:guide},ports);
 const signIn=view.elements().find(node=>node.type==='a'&&node.props.href?.includes('/sign-in?')&&node.props.children?.includes('Sign in to apply'));
 assert.ok(signIn,'anonymous guide needs an explicit account adoption entry');
 const next=new URL(signIn.props.href,'https://local.test').searchParams.get('next');
 assert.match(next,new RegExp('^/en/g/'+id+'\\?adopt=1'));
});
test('a newly selected trip returns to a read-only preview with the actual incoming stop names',async()=>{
 let writes=0;
 const view=await mount('GuideWorkspace',{id,actorId:'actor-A',initialGuide:guide},{...ports,tripsAdopt:async()=>{writes++;return{ok:true,data:trip}}},`?adopt=1&trip=${tripId}&flow=${flow}`);
 assert.match(view.text(),/Review before applying/);
 assert.match(view.text(),/Authored stop/);
 assert.equal(writes,0);
 const create=view.elements().find(node=>node.type==='a'&&node.props.children==='Create a new trip and apply');
 assert.match(create.props.href,/\/en\/trips\?next=/);
});
test('a remounted unknown adoption replays the stored version, revision and request ID',async()=>{
 const original={guideId:id,tripId,version:1,revision:2,requestId:flow,flowId:flow},calls=[],navigation=[];
 const view=await mount('GuideWorkspace',{id,actorId:'actor-A',initialGuide:guide},{...ports,readPending:async()=>original,tripsAdopt:async(...args)=>{calls.push(args);return{ok:true,data:trip}},navigate:path=>navigation.push(path)});
 const retry=view.button('Retry original application');assert.ok(retry);
 retry.props.onClick();await view.settle();
 assert.deepEqual(calls[0].slice(0,5),[id,1,tripId,2,flow]);
 assert.deepEqual(navigation,['/en/trips/'+tripId]);
});
test('failed journal storage prevents a new uncertain adoption from being submitted',async()=>{
 let writes=0;
 const view=await mount('GuideWorkspace',{id,actorId:'actor-A',initialGuide:guide},{...ports,savePending:async()=>{throw Error('storage failed')},tripsAdopt:async()=>{writes++;return{ok:true,data:trip}}},`?adopt=1&trip=${tripId}&flow=${flow}`);
 const confirm=view.button('Confirm apply');assert.ok(confirm);confirm.props.onClick();await view.settle();
 assert.equal(writes,0);assert.match(view.text(),/could not be saved|cannot be saved/i);
});
test('a freshly created owned return target remains selectable when it is outside the first trip page',async()=>{
 const view=await mount('GuideWorkspace',{id,actorId:'actor-A',initialGuide:guide},{...ports,tripsList:async()=>({ok:true,data:{items:[],nextCursor:null}})},`?adopt=1&trip=${tripId}&flow=${flow}`);
 const picker=view.elements().find(node=>node.type==='select');
 assert.equal(picker.props.value,tripId);
 assert.ok(view.elements().some(node=>node.type==='option'&&node.props.value===tripId&&node.props.children===trip.title));
});
for(const actorId of [null,'actor-A'])test(`the adoption start precedes login or trip creation (${actorId})`,async()=>{
 const events=[],view=await mount('GuideWorkspace',{id,actorId,initialGuide:guide},{...ports,trackPilotEvent:event=>events.push(event)});
 const label=actorId?'Create a new trip and apply':'Sign in to apply this itinerary';
 const link=view.elements().find(node=>node.type==='a'&&node.props.children===label);
 assert.ok(link);
 assert.equal(events.filter(event=>event.phase==='started').length,0);
 link.props.onClick?.();
 const starts=events.filter(event=>event.phase==='started');assert.equal(starts.length,1);
 const next=new URL(link.props.href,'https://app.test').searchParams.get('next');
 assert.equal(new URL(next,'https://app.test').searchParams.get('flow'),starts[0].flowId);
});
test('a late published-version refresh cannot replace the content of an already reviewed adoption',async()=>{
 let release;const refreshed=new Promise(resolve=>{release=resolve});
 const original={...guide,days:[{...guide.days[0],stops:[{...guide.days[0].stops[0],description:'Original version instructions'}]}]};
 const view=await mount('GuideWorkspace',{id,actorId:'actor-A',initialGuide:original},{...ports,guidesGet:()=>refreshed},`?adopt=1&trip=${tripId}&flow=${flow}`);
 assert.match(view.text(),/Review before applying/);
 release({ok:true,data:{...original,version:2,days:[{...original.days[0],stops:[{...original.days[0].stops[0],title:'Unreviewed new version stop',description:'Unreviewed instructions'}]}]}});
 await view.settle();
 assert.match(view.text(),/Authored stop/);
 assert.match(view.text(),/Original version instructions/);
 assert.doesNotMatch(view.text(),/Unreviewed new version stop/);
});
for(const [result,failClear] of [[{ok:true,data:trip},false],[{ok:true,data:trip},true],[{ok:false,code:'CONFLICT'},true]])test(`late account A journal cleanup cannot unlock account B (${result.ok}/${failClear})`,async()=>{
 const nextTrip='44444444-4444-4444-8444-444444444444',nextRequest='55555555-5555-4555-8555-555555555555';
 const original={guideId:id,tripId,version:1,revision:2,requestId:flow,flowId:flow};
 const replacement={...original,tripId:nextTrip,requestId:nextRequest};
 let release,rejectClear;const held=new Promise((resolve,reject)=>{release=resolve;rejectClear=reject}),calls=[],navigations=[];
 const props={id,actorId:'actor-A',initialGuide:guide};
 const view=await mount('GuideWorkspace',props,{...ports,readPending:async owner=>owner==='actor-A'?original:replacement,
  clearPending:async owner=>{if(owner==='actor-A')await held},
  tripsAdopt:async(...args)=>{calls.push(args);return args[2]===tripId?result:new Promise(()=>{})},
  navigate:path=>navigations.push(path)});
 view.button('Retry original application').props.onClick();await view.settle();
 props.actorId='actor-B';view.render();await view.settle();
 view.button('Retry original application').props.onClick();await view.settle();
 assert.equal(calls.length,2);assert.equal(view.button('Retry original application').props.disabled,true);
 if(failClear)rejectClear(Error('delayed device failure'));else release();
 await view.settle();
 assert.equal(view.button('Retry original application').props.disabled,true,'A cleanup cannot repaint or unlock the active B request');
 assert.deepEqual(navigations,[]);
 assert.doesNotMatch(view.text(),/The action ended, but its recovery record could not be cleared/);
});
