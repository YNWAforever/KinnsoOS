import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from './helpers/guide-workspace-harness.mjs';
import {listShareHolds,parseShareHold,shareHoldKey,shareIntent} from '../lib/trips/share-hold.ts';

const guideId='11111111-1111-4111-8111-111111111111';
const tripId='22222222-2222-4222-8222-222222222222';
const adoptRequest='33333333-3333-4333-8333-333333333333';
const flowId='44444444-4444-4444-8444-444444444444';
const shareRequest='77777777-7777-4777-8777-777777777777';
const transportRequest='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherShare='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stopId='66666666-6666-4666-8666-666666666666';
const adoption={guideId,tripId,version:2,revision:4,requestId:adoptRequest,flowId};
const shareBody={requestId:shareRequest,tripId,stopIds:[stopId],mediaIds:[],expiresAt:'2026-11-02T00:00:00.000Z'};
const share={version:2,...shareBody};
const holdKey=shareHoldKey(tripId);
const live=['./PendingAdoptionRecovery','./TripIndexShareHolds'];
const trip={id:tripId,title:'Private Kyoto trip',destinationId:null,timezone:'UTC',startDate:null,status:'planning',revision:4,media:[],overrides:[],days:[]};

function memoryStorage(rows={}){
 const map=new Map(Object.entries(rows));
 return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),key:index=>[...map.keys()][index]??null,get length(){return map.size;}};
}
const label=(locale,en,zh)=>locale==='en'?en:zh;
function ports(extra={}){
 return {tripsList:async()=>({ok:true,data:{items:[{id:tripId,title:'Private Kyoto trip'}],nextCursor:null}}),tripsGet:async()=>({ok:true,data:trip}),readPendingAdoptions:async()=>[adoption],...extra};
}
async function openIndex(locale,store,extra={},props={}){
 return mount('TripWorkspace',{actorId:'actor-A',sharingEnabled:true,locale,...props},ports(extra),'',{live,storage:store});
}
const guideLinks=view=>view.elements().filter(node=>node.type==='a'&&String(node.props.href??'').includes('/g/'));

test('a v1 share hold and a corrupt record stay unknown and do not gain a request id',()=>{
 const v1={version:1,tripId,stopIds:['kept stop'],mediaIds:[],expiresAt:'2026-11-02T00:00:00.000Z'};
 const parsed=parseShareHold(JSON.stringify(v1),tripId);
 assert.equal(parsed.version,1);assert.equal('requestId' in parsed,false);
 const listed=listShareHolds(memoryStorage({[holdKey]:JSON.stringify(share),[shareHoldKey('not-a-trip')]:'{}','kinnso:unconfirmed-share:v1:99999999-9999-4999-8999-999999999999':'{'}));
 assert.equal(listed.readable,true);
 assert.equal(listed.items.find(item=>item.hold?.version===2).hold.requestId,shareRequest);
 assert.equal(listed.items.some(item=>item.hold===null),true);
 assert.equal(JSON.stringify(listed).includes(transportRequest),false);
 assert.throws(()=>parseShareHold('broken JSON',tripId));
});

for(const locale of ['en','zh-HK']){
 const copy={
  adoptRetry:label(locale,'Retry original application','重試原套用操作'),
  shareRetry:label(locale,'Retry original request','重試原來請求'),
  create:label(locale,'Create trip','建立行程'),
  unknownTitle:label(locale,'Trip title unknown','行程名稱未知'),
  adoptRequestLabel:label(locale,'Original application request','原套用請求'),
  shareRequestLabel:label(locale,'Original share request','原分享請求'),
  shareHeld:locale==='en'?/outcome is unknown/:/結果未知/,
  adoptUnknown:locale==='en'?/outcome stays unknown/:/結果仍然未知/,
  noRequest:locale==='en'?/no original request id/:/沒有原請求編號/,
  unreadable:locale==='en'?/could not be read/:/未能讀取/,
  unavailable:locale==='en'?/currently unavailable/:/尚未接通/,
 };
 test('the trips index states a held adopt and share with their original request ids: '+locale,async()=>{
  const store=memoryStorage({[holdKey]:JSON.stringify(share)}),adopts=[],posts=[];
  const view=await openIndex(locale,store,{tripsAdopt:async(...args)=>{adopts.push(args);return {ok:false,code:'UNAVAILABLE',retryable:true,requestId:transportRequest};},request:async(...args)=>{posts.push(args);return {ok:false,code:'UNAVAILABLE',retryable:true,requestId:transportRequest};},clearPending:()=>{throw Error('unknown adopt must stay');}});
  assert.ok(view.button(copy.create),'the trips index is open');
  assert.equal(guideLinks(view).length,0,'the held state is stated without opening a guide');
  assert.match(view.text(),new RegExp(copy.adoptRequestLabel+'\\s+'+adoptRequest));
  assert.match(view.text(),new RegExp(copy.shareRequestLabel+'\\s+'+shareRequest));
  assert.match(view.text(),/Private Kyoto trip/);
  assert.match(view.text(),copy.shareHeld);
  assert.equal(view.text().includes(transportRequest),false);
  assert.equal(view.text().includes('secret.example'),false);
  await view.button(copy.adoptRetry).props.onClick();await view.settle();
  await view.button(copy.shareRetry).props.onClick();await view.settle();
  assert.equal(adopts[0][4],adoptRequest);assert.equal(adopts[0][5],flowId);
  assert.deepEqual(JSON.parse(JSON.stringify(posts[0].slice(0,3))),['/api/shares','POST',shareIntent(share)]);
  assert.match(view.text(),copy.adoptUnknown);
  assert.match(view.text(),copy.shareHeld);
  assert.equal(store.getItem(holdKey),JSON.stringify(share),'an unknown share response keeps the original hold');
  await view.button(copy.adoptRetry).props.onClick();await view.settle();
  await view.button(copy.shareRetry).props.onClick();await view.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(adopts[1])),JSON.parse(JSON.stringify(adopts[0])));
  assert.deepEqual(JSON.parse(JSON.stringify(posts[1])),JSON.parse(JSON.stringify(posts[0])));
  assert.equal(posts.every(call=>call[2].requestId===shareRequest&&call[2].requestId!==transportRequest),true);
 });
 test('an unknown trip title still keeps the original adoption request: '+locale,async()=>{
  const adopts=[];
  const view=await openIndex(locale,memoryStorage(),{tripsGet:async()=>({ok:false,code:'NOT_FOUND',retryable:false}),tripsAdopt:async(...args)=>{adopts.push(args);return {ok:false,code:'UNAVAILABLE',retryable:true,requestId:transportRequest};}});
  assert.match(view.text(),new RegExp(copy.unknownTitle));
  assert.match(view.text(),new RegExp(adoptRequest));
  assert.equal(view.text().includes('Published guide'),false);
  await view.button(copy.adoptRetry).props.onClick();await view.settle();
  assert.equal(adopts[0][4],adoptRequest);
  assert.match(view.text(),copy.adoptUnknown);
  assert.match(view.text(),new RegExp(adoptRequest));
 });
 test('a share without a request id and a corrupt hold stay unknown: '+locale,async()=>{
  const posts=[],corruptKey=shareHoldKey('99999999-9999-4999-8999-999999999999');
  const v1={version:1,tripId,stopIds:['kept stop'],mediaIds:[],expiresAt:shareBody.expiresAt};
  const view=await openIndex(locale,memoryStorage({[holdKey]:JSON.stringify(v1),[corruptKey]:'broken JSON'}),{readPendingAdoptions:async()=>[],request:async(...args)=>{posts.push(args);return {ok:true,data:{url:'https://secret.example/share/token',requestId:transportRequest}};}});
  assert.match(view.text(),copy.noRequest);
  assert.match(view.text(),copy.unreadable);
  assert.equal(view.button(copy.shareRetry),undefined);
  assert.equal(view.text().includes(transportRequest),false);
  assert.equal(view.text().includes('broken JSON'),false);
  assert.equal(view.text().includes('secret.example'),false);
  assert.equal(posts.length,0);
  assert.equal(guideLinks(view).length,0);
 });
 test('sharing unavailable still lists the original share request and does not retry it: '+locale,async()=>{
  const posts=[];
  const view=await openIndex(locale,memoryStorage({[holdKey]:JSON.stringify(share)}),{readPendingAdoptions:async()=>[],request:async(...args)=>{posts.push(args);throw Error('must not send');}},{sharingEnabled:false});
  assert.match(view.text(),new RegExp(shareRequest));
  assert.match(view.text(),copy.unavailable);
  assert.equal(view.button(copy.shareRetry),undefined);
  assert.equal(posts.length,0);
  assert.equal(guideLinks(view).length,0);
 });
}

test('a held share for a trip outside this page stays on the index with its original request',async()=>{
 const view=await openIndex('en',memoryStorage({[holdKey]:JSON.stringify(share)}),{readPendingAdoptions:async()=>[],tripsList:async()=>({ok:true,data:{items:[],nextCursor:'more'}})});
 assert.match(view.text(),/Trip title unknown/);
 assert.match(view.text(),new RegExp('Original share request\\s+'+shareRequest));
 assert.equal(guideLinks(view).length,0);
 assert.ok(view.button('More trips'));
});

test('retry refuses a changed share hold and a confirmed-looking body does not reveal a link',async()=>{
 const store=memoryStorage({[holdKey]:JSON.stringify(share)}),posts=[];
 const view=await openIndex('en',store,{readPendingAdoptions:async()=>[],request:async(...args)=>{posts.push(structuredClone(args));return {ok:true,data:{url:'https://secret.example/share/token',requestId:shareRequest,state:'active'}};}});
 store.setItem(holdKey,JSON.stringify({...share,requestId:otherShare}));
 await view.button('Retry original request').props.onClick();await view.settle();
 assert.equal(posts.length,0);
 assert.match(view.text(),/No request was sent/);
 assert.match(view.text(),/stays unknown/);
 assert.equal(view.text().includes(otherShare),false);
 store.setItem(holdKey,JSON.stringify(share));
 await view.button('Retry original request').props.onClick();await view.settle();
 assert.equal(posts.length,1);
 assert.equal(posts[0][2].requestId,shareRequest);
 assert.equal(view.text().includes('secret.example'),false);
 assert.match(view.text(),/stays unknown/);
 assert.equal(store.getItem(holdKey),JSON.stringify(share));
});

test('a second click while the original share retry is in flight does not mint another request',async()=>{
 let release,posts=0;const bodies=[];const pending=new Promise(resolve=>{release=resolve;});
 const view=await openIndex('en',memoryStorage({[holdKey]:JSON.stringify(share)}),{readPendingAdoptions:async()=>[],request:async(...args)=>{posts++;bodies.push(args[2]);return pending;}});
 const button=view.button('Retry original request');
 const first=button.props.onClick();button.props.onClick();
 assert.equal(posts,1);
 release({ok:false,code:'UNAVAILABLE',retryable:true,requestId:transportRequest});
 await first;await view.settle();
 await view.button('Retry original request').props.onClick();await view.settle();
 assert.equal(posts,2);
 assert.deepEqual(bodies[1],bodies[0]);
 assert.equal(bodies[0].requestId,shareRequest);
});

test('an account change removes held request ids from the trips index',async()=>{
 const listeners=[];
 const view=await openIndex('en',memoryStorage({[holdKey]:JSON.stringify(share)}),{subscribeInvalidation:fn=>{listeners.push(fn);return ()=>{};}});
 assert.match(view.text(),new RegExp(adoptRequest));
 assert.match(view.text(),new RegExp(shareRequest));
 for(const listener of listeners)listener('actor-B');
 view.render();await view.settle();
 assert.equal(view.text().includes(adoptRequest),false);
 assert.equal(view.text().includes(shareRequest),false);
});

test('opening a trip does not move the index share hold onto that page',async()=>{
 const view=await mount('TripWorkspace',{actorId:'actor-A',id:tripId,sharingEnabled:true},{...ports(),readPendingAdoptions:async()=>[adoption]},'',{live,storage:memoryStorage({[holdKey]:JSON.stringify(share)})});
 assert.equal(view.text().includes('Held share requests'),false);
 assert.equal(view.text().includes(shareRequest),false);
 assert.match(view.text(),new RegExp(adoptRequest));
});

test('an unreadable share-hold store stays unknown',async()=>{
 const store={get length(){throw Error('blocked');},key(){return null;},getItem(){return null;}};
 const view=await openIndex('zh-HK',store,{readPendingAdoptions:async()=>[]});
 assert.match(view.text(),/未能讀取分享鎖定，結果仍然未知/);
 assert.equal(view.text().includes(shareRequest),false);
 assert.equal(view.button('重試原來請求'),undefined);
});
