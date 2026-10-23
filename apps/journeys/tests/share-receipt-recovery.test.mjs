import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareFactsHarness as componentHarness,deferred,ok,unavailable,tripFixture,linkFixture,memoryStorage,requestFixture,receiptFixture,receiptRow,receiptPage} from './helpers/share-facts-harness.mjs';

class FixtureClock extends Date{static now(){return Date.parse('2026-10-23T00:00:00.000Z');}}
const shareFactsHarness=(name,options={})=>componentHarness(name,{clock:FixtureClock,...options});

const create='Create read-only link',retry='Retry original request',read='Read request receipt',recover='Recover link';
const key='kinnso:unconfirmed-share:v1:'+tripFixture().id;
const boxes=h=>h.elements().filter(node=>node.type==='input'&&node.props.type==='checkbox');
const urls=h=>h.elements().filter(node=>node.type==='input'&&node.props.readOnly).map(node=>node.props.value);
async function click(h,label){const button=h.button(label);assert.ok(button,'accessible action: '+label);await button.props.onClick();await h.settle();}
function select(h){boxes(h)[0].props.onChange({target:{checked:true}});h.render();}
function heldStorage(intent=requestFixture(),version=2){const storage=memoryStorage();const value={version,...intent};if(version===1)delete value.requestId;storage.setItem(key,JSON.stringify(value));return storage;}
function transport({rows=[],page=receiptPage(),receipt=ok(null),post=unavailable(),remove=ok({revoked:true}),calls=[]}={}){
 return async(url,method='GET',body)=>{
  calls.push({url,method,body:body&&structuredClone(body)});
  if(method==='POST')return typeof post==='function'?post(body):post;
  if(method==='DELETE')return typeof remove==='function'?remove(url):remove;
  const params=new URL(url,'https://fixture.test').searchParams;
  if(url.startsWith('/api/shares/receipts?'))return params.has('requestId')?(typeof receipt==='function'?receipt(params):receipt):(typeof page==='function'?page(params):page);
  assert.equal(url,'/api/shares?tripId='+tripFixture().id);
  return ok(rows);
 };
}

for(const locale of ['en','zh-HK'])test('v2 persists a genuine UUID before POST and lost ACK retry keeps the original intent: '+locale,async()=>{
 const storage=memoryStorage(),calls=[],persistedAtDispatch=[];let now=Date.parse('2026-10-23T00:00:00.000Z'),posts=0;
 class Clock extends Date{static now(){return now;}}
 const request=transport({calls,post:body=>{
  persistedAtDispatch.push(JSON.parse(storage.getItem(key)));
  return ++posts===1?unavailable():ok(receiptFixture(body));
 }});
 const h=await shareFactsHarness('SharePreview',{locale,request,storage,clock:Clock,stateBailouts:true});await h.settle();select(h);
 await click(h,locale==='en'?create:'建立唯讀連結');
 const original=calls.find(call=>call.method==='POST').body;
 assert.equal(typeof original,'object','the real transport must send ShareIntent');
 assert.match(original.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
 assert.equal(persistedAtDispatch[0].version,2,'the request identity must be durable before dispatch');
 assert.deepEqual(Object.fromEntries(Object.entries(persistedAtDispatch[0]).filter(([name])=>name!=='version')),original);
 assert.equal(JSON.parse(storage.getItem(key)).version,2);
 assert.equal(h.button(locale==='en'?create:'建立唯讀連結').props.disabled,true);
 now+=86400000;await click(h,locale==='en'?retry:'重試原來請求');
 assert.equal(posts,2);assert.deepEqual(persistedAtDispatch[1],persistedAtDispatch[0]);assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.body),[original,original]);
 assert.deepEqual(urls(h),['https://www.kinnso.ai/share/token-once']);assert.equal(storage.getItem(key),null);
});

for(const outcome of ['null','failure','throw','malformed'])test('explicit receipt '+outcome+' retains the exact v2 hold and blocks new creation',async()=>{
 const storage=heldStorage(),original=storage.getItem(key),calls=[];
 const receipt=outcome==='null'?ok(null):outcome==='failure'?unavailable():outcome==='malformed'?ok({requestId:requestFixture().requestId}):()=>{throw Error('offline')};
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({receipt,calls})});await h.settle();
 await click(h,read);assert.equal(storage.getItem(key),original);assert.deepEqual(urls(h),[]);assert.equal(h.button(create).props.disabled,true);
 assert.match(h.text(),/unconfirmed|unknown|could not|not found/i);await click(h,create);
 assert.equal(calls.filter(call=>call.method==='POST').length,0);
 assert.equal(new URL(calls.find(call=>call.url.includes('requestId=')).url,'https://fixture.test').searchParams.get('requestId'),requestFixture().requestId);
});

for(const mismatch of ['requestId','tripId','stopIds','mediaIds','expiresAt','row-expiry','active-null-url','terminal-url','invalid-projection'])test('a '+mismatch+' receipt cannot settle or expose a held request',async()=>{
 const intent=requestFixture(),storage=heldStorage(intent),original=storage.getItem(key);
 const receipt=receiptFixture(intent);
 if(mismatch==='requestId')receipt.requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if(mismatch==='tripId')receipt.intent.tripId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if(mismatch==='stopIds')receipt.intent.stopIds=[];
 if(mismatch==='mediaIds')receipt.intent.mediaIds=['66666666-6666-4666-8666-666666666666'];
 if(mismatch==='expiresAt')receipt.intent.expiresAt='2026-10-30T00:00:00.000Z';
 if(mismatch==='row-expiry')receipt.expiresAt='2026-10-30T00:00:00.000Z';
 if(mismatch==='active-null-url')receipt.url=null;
 if(mismatch==='terminal-url')receipt.state='revoked';
 if(mismatch==='invalid-projection')receipt.projection={title:'PRIVATE NOTE',days:null,approvedMediaIds:[]};
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({receipt:ok(receipt)})});await h.settle();await click(h,read);
 assert.equal(storage.getItem(key),original);assert.deepEqual(urls(h),[]);assert.equal(h.button(create).props.disabled,true);assert.doesNotMatch(h.text(),/PRIVATE NOTE/);
});

for(const state of ['revoked','expired'])test('a matching '+state+' receipt settles without a URL or revival POST',async()=>{
 const intent=requestFixture(),storage=heldStorage(intent),calls=[];
 const receipt=receiptFixture(intent,{state,url:null});
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,receipt:ok(receipt)})});await h.settle();await click(h,read);
 assert.equal(storage.getItem(key),null);assert.deepEqual(urls(h),[]);assert.equal(h.button('Copy link'),undefined);assert.match(h.text(),new RegExp(state,'i'));
 assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.equal(h.button(create).props.disabled,false);
});

test('receipt replay after reload uses the held original intent even after local expiry',async()=>{
 const storage=heldStorage(),calls=[];
 class Later extends Date{static now(){return Date.parse('2027-10-23T00:00:00.000Z');}}
 const h=await shareFactsHarness('SharePreview',{storage,clock:Later,request:transport({calls,post:body=>ok(receiptFixture(body,{state:'expired',url:null}))})});await h.settle();
 await click(h,retry);assert.deepEqual(calls.find(call=>call.method==='POST').body,requestFixture());assert.deepEqual(urls(h),[]);assert.equal(storage.getItem(key),null);
});

test('a fresh session lists metadata only, then recovers the exact owner URL explicitly',async()=>{
 const receipt=receiptFixture(),calls=[],copies=[],storage=memoryStorage();
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,page:receiptPage([receiptRow(receipt)]),receipt:ok(receipt)}),clipboard:async url=>copies.push(url)});await h.settle();
 assert.deepEqual(urls(h),[]);assert.equal(calls.some(call=>call.url.includes('requestId=')),false,'listing cannot automatically decrypt receipts');
 assert.equal(storage.getItem(key),null);await click(h,recover);assert.deepEqual(urls(h),[receipt.url]);await click(h,'Copy link');assert.deepEqual(copies,[receipt.url]);
 assert.doesNotMatch(h.text(),/PRIVATE NOTE|PRIVATE MANUAL NOTE|Private reason/);assert.equal(calls.filter(call=>call.method==='POST').length,0);
});

for(const state of ['revoked','expired'])test('fresh '+state+' metadata offers View receipt and never exposes a token',async()=>{
 const receipt=receiptFixture(requestFixture(),{state,url:null});
 const h=await shareFactsHarness('SharePreview',{request:transport({page:receiptPage([receiptRow(receipt)]),receipt:ok(receipt)})});await h.settle();
 assert.equal(h.button(recover),undefined);await click(h,'View receipt');assert.deepEqual(urls(h),[]);assert.match(h.text(),new RegExp(state,'i'));
});

for(const failure of ['foreign-trip','other-request','other-link','other-createdAt','null','read-error'])test('fresh receipt recovery denies '+failure+' and cannot unlock creation from a failed read',async()=>{
 const receipt=receiptFixture(),wrong=structuredClone(receipt),calls=[];
 if(failure==='foreign-trip')wrong.intent.tripId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if(failure==='other-request')wrong.requestId=wrong.intent.requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if(failure==='other-link')wrong.id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if(failure==='other-createdAt')wrong.createdAt='2026-10-22T00:00:00.000Z';
 const result=failure==='null'?ok(null):failure==='read-error'?unavailable():ok(wrong);
 const h=await shareFactsHarness('SharePreview',{request:transport({calls,page:receiptPage([receiptRow(receipt)]),receipt:result})});await h.settle();await click(h,recover);
 assert.deepEqual(urls(h),[]);assert.equal(h.button(create).props.disabled,true);await click(h,create);assert.equal(calls.filter(call=>call.method==='POST').length,0);
 await click(h,'Refresh existing links');assert.equal(h.button(create).props.disabled,true,'metadata reads cannot repair an unsuccessful receipt read');
});

test('only the held request can be recovered while a v2 hold is unresolved',async()=>{
 const storage=heldStorage(),other=receiptFixture(requestFixture({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})),calls=[];
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,page:receiptPage([receiptRow(other)]),receipt:ok(other)})});await h.settle();
 const recoverOther=h.button(recover);assert.ok(recoverOther);assert.equal(recoverOther.props.disabled,true);await recoverOther.props.onClick();await h.settle();
 assert.equal(calls.some(call=>call.url.includes('requestId=')),false);assert.ok(storage.getItem(key));assert.deepEqual(urls(h),[]);
});

test('receipt preview projects public fields rather than rendering private extras from a response',async()=>{
 const receipt=receiptFixture();receipt.projection.travellerNote='PRIVATE NOTE';receipt.projection.days[0].stops[0].travellerNote='PRIVATE MANUAL NOTE';
 const h=await shareFactsHarness('SharePreview',{request:transport({page:receiptPage([receiptRow(receipt)]),receipt:ok(receipt)})});await h.settle();await click(h,recover);
 assert.deepEqual(urls(h),[receipt.url]);assert.doesNotMatch(h.text(),/PRIVATE NOTE|PRIVATE MANUAL NOTE/);
 const preview=h.elements().find(node=>node.type==='pre');assert.equal(JSON.parse(h.text(preview)).days[0].stops[0].startMinuteOfDay,0);
});

test('older receipt rows use the explicit keyset cursor and preserve the recent page',async()=>{
 const recent=Array.from({length:20},(_,i)=>receiptRow(receiptFixture(requestFixture({requestId:(i+1).toString(16).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),{id:(i+1).toString(16).padStart(8,'0')+'-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})));
 const cursor={createdAt:recent[19].createdAt,requestId:recent[19].requestId},older=receiptRow(receiptFixture(requestFixture({requestId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}))),calls=[];
 const h=await shareFactsHarness('SharePreview',{request:transport({calls,page:params=>params.has('before')?receiptPage([older]):receiptPage(recent,cursor)})});await h.settle();
 assert.equal(h.elements().filter(node=>node.type==='button'&&h.text(node)===recover).length,20);assert.match(h.text(),/recent|20|older/i);
 await click(h,'Load older receipts');assert.equal(h.elements().filter(node=>node.type==='button'&&h.text(node)===recover).length,21);
 const pageCall=calls.find(call=>call.url.includes('before='));assert.ok(pageCall);const params=new URL(pageCall.url,'https://fixture.test').searchParams;
 assert.equal(params.get('before'),cursor.createdAt);assert.equal(params.get('beforeRequestId'),cursor.requestId);assert.equal(h.button('Load older receipts'),undefined);
});

for(const invalid of [[],{items:[],nextCursor:{}},{items:[{id:'x'}],nextCursor:null},{items:[],nextCursor:{createdAt:'bad',requestId:requestFixture().requestId}}])test('malformed receipt pages remain unknown instead of authorizing creation: '+JSON.stringify(invalid),async()=>{
 const h=await shareFactsHarness('SharePreview',{request:transport({page:ok(invalid)})});await h.settle();assert.equal(h.button(create).props.disabled,true);assert.match(h.text(),/could not.*receipt/i);
});

test('a failed older receipt page locks creation and explicit page retry keeps prior rows',async()=>{
 const receipt=receiptFixture(),rows=Array.from({length:20},(_,i)=>receiptRow(receiptFixture(requestFixture({requestId:(i+1).toString(16).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})))),last=rows[19],cursor={createdAt:last.createdAt,requestId:last.requestId};let fail=true;
 const h=await shareFactsHarness('SharePreview',{request:transport({page:params=>!params.has('before')?receiptPage(rows,cursor):fail?unavailable():receiptPage([])})});await h.settle();
 await click(h,'Load older receipts');assert.equal(h.button(create).props.disabled,true);assert.ok(h.button(recover));fail=false;await click(h,'Retry loading receipts');
 assert.ok(h.button(recover));assert.equal(h.button(create).props.disabled,false);
});

for(const recoveryEnabled of [false,undefined])test('recovery '+recoveryEnabled+' blocks writes and receipt reads while legacy list/revoke remains usable',async()=>{
 const calls=[],h=await shareFactsHarness('SharePreview',{props:{recoveryEnabled},request:transport({calls,rows:[linkFixture()]})});await h.settle();
 assert.equal(h.button(create).props.disabled,true);await click(h,create);assert.equal(h.button(read),undefined);assert.equal(h.button(recover),undefined);
 await click(h,'Revoke existing link');assert.equal(calls.filter(call=>call.method==='DELETE').length,1);assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.equal(calls.some(call=>call.url.startsWith('/api/shares/receipts?')),false);
});

for(const recoveryEnabled of [true,false])test('v1 unreceipted holds remain manual through list, revoke, reload and expiry: '+recoveryEnabled,async()=>{
 const storage=heldStorage(requestFixture({expiresAt:'2020-01-01T00:00:00.000Z'}),1),original=storage.getItem(key),calls=[];
 const request=transport({calls,rows:[linkFixture()]});
 const h=await shareFactsHarness('SharePreview',{storage,request,props:{recoveryEnabled}});await h.settle();await click(h,'Refresh existing links');await click(h,'Revoke existing link');
 assert.equal(h.button(retry),undefined);assert.equal(h.button(read),undefined);assert.equal(storage.getItem(key),original);assert.equal(h.button(create).props.disabled,true);h.unmount();
 const reloaded=await shareFactsHarness('SharePreview',{storage,request,props:{recoveryEnabled}});await reloaded.settle();assert.equal(storage.getItem(key),original);assert.equal(reloaded.button(create).props.disabled,true);
 assert.equal(calls.filter(call=>call.method==='POST').length,0);assert.match(reloaded.text(),/manual recovery/i);
});

for(const boundary of ['actor','trip','disabled','recovery-disabled','unmount','lifetime'])test('late receipt responses and captured recovery commands are fenced on '+boundary,async()=>{
 const storage=heldStorage(),original=storage.getItem(key),pending=deferred(),calls=[],h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,receipt:pending.promise})});await h.settle();
 const readButton=h.button(read),retryButton=h.button(retry);assert.ok(readButton);assert.ok(retryButton);
 const reading=readButton.props.onClick();h.render();
 if(boundary==='actor')h.invalidate(null);
 if(boundary==='trip'){h.props.trip=tripFixture('dddddddd-dddd-4ddd-8ddd-dddddddddddd');h.render();}
 if(boundary==='disabled'){h.props.enabled=false;h.render();}
 if(boundary==='recovery-disabled'){h.props.recoveryEnabled=false;h.render();}
 if(boundary==='unmount')h.unmount();
 if(boundary==='lifetime')h.replayEffects();
 pending.resolve(ok(receiptFixture()));await reading;await h.settle();await retryButton.props.onClick();await readButton.props.onClick();await h.settle();
 assert.deepEqual(urls(h),[]);assert.equal(storage.getItem(key),original);assert.equal(calls.filter(call=>call.method==='POST').length,0);
});

test('a captured receipt row cannot read after the authoritative receipt list failed',async()=>{
 const receipt=receiptFixture(),calls=[];let fail=false;
 const h=await shareFactsHarness('SharePreview',{request:transport({calls,page:()=>fail?unavailable():receiptPage([receiptRow(receipt)]),receipt:ok(receipt)})});await h.settle();const stale=h.button(recover);assert.ok(stale);
 fail=true;await click(h,'Refresh receipts');await stale.props.onClick();await h.settle();assert.deepEqual(urls(h),[]);assert.equal(calls.some(call=>call.url.includes('requestId=')),false);
});

test('old receipt page results cannot replace rows from a fresh effect lifetime',async()=>{
 const old=deferred(),fresh=deferred();let reads=0;
 const h=await shareFactsHarness('SharePreview',{request:transport({page:()=>++reads===1?old.promise:fresh.promise})});h.replayEffects();
 old.resolve(receiptPage([receiptRow(receiptFixture())]));fresh.resolve(receiptPage());await h.settle();assert.equal(reads,2);assert.equal(h.button(recover),undefined);assert.equal(h.button(create).props.disabled,false);
});


test('timestamp-equivalent SQL expiry settles a hold without replacing its original retry payload',async()=>{
 const intent=requestFixture(),storage=heldStorage(intent),receipt=receiptFixture(intent),calls=[];
 receipt.intent.expiresAt='2026-10-29T00:00:00.000000+00:00';receipt.expiresAt='2026-10-29T00:00:00+00:00';
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,receipt:ok(receipt)})});await h.settle();await click(h,read);
 assert.equal(storage.getItem(key),null);assert.deepEqual(urls(h),[receipt.url]);assert.equal(calls.filter(call=>call.method==='POST').length,0);
});

test('receipt identity compares UUIDs case-insensitively while retry retains the original spelling',async()=>{
 const intent=requestFixture({requestId:'abcdefab-cdef-4abc-8def-abcdefabcdef'}),storage=heldStorage(intent),receipt=receiptFixture(intent);
 receipt.requestId=receipt.requestId.toUpperCase();receipt.intent.requestId=receipt.intent.requestId.toUpperCase();
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({receipt:ok(receipt)})});await h.settle();await click(h,read);
 assert.equal(storage.getItem(key),null);assert.deepEqual(urls(h),[receipt.url]);
});

test('existing UUIDs with arbitrary version and variant bits remain valid receipt identities',async()=>{
 const receipt=receiptFixture(requestFixture({requestId:'abcdefab-cdef-0abc-0def-abcdefabcdef'}),{id:'abcdefab-cdef-0abc-0def-abcdefabcdef'});
 const h=await shareFactsHarness('SharePreview',{request:transport({page:receiptPage([receiptRow(receipt)]),receipt:ok(receipt)})});await h.settle();await click(h,recover);
 assert.deepEqual(urls(h),[receipt.url]);
});

test('receipt createdAt may use a timestamp-equivalent SQL spelling of the selected row',async()=>{
 const receipt=receiptFixture(),row=receiptRow(receipt);receipt.createdAt='2026-10-23T00:00:00.000000+00:00';
 const h=await shareFactsHarness('SharePreview',{request:transport({page:receiptPage([row]),receipt:ok(receipt)})});await h.settle();await click(h,recover);assert.deepEqual(urls(h),[receipt.url]);
});

test('a next cursor on a short receipt page is malformed and cannot unlock creation',async()=>{
 const row=receiptRow(receiptFixture()),cursor={createdAt:row.createdAt,requestId:row.requestId};
 const h=await shareFactsHarness('SharePreview',{request:transport({page:receiptPage([row],cursor)})});await h.settle();
 assert.equal(h.button(create).props.disabled,true);assert.match(h.text(),/could not.*receipt/i);
});


test('changing recovery capability retains an unknown legacy revocation and its same-ID retry',async()=>{
 const calls=[],link=linkFixture();let rows=[link],confirmed=false;
 const request=async(url,method='GET',body)=>{
  calls.push({url,method,body});if(method==='DELETE'){rows=[];return confirmed?ok({revoked:true}):unavailable();}
  if(url.startsWith('/api/shares/receipts?'))return receiptPage();return ok(rows);
 };
 const h=await shareFactsHarness('SharePreview',{request});await h.settle();await click(h,'Revoke existing link');
 h.props.recoveryEnabled=false;h.render();await h.settle();h.props.recoveryEnabled=true;h.render();await h.settle();
 assert.equal(h.button(create).props.disabled,true,'changing recovery capability cannot resolve an uncertain legacy revoke');
 confirmed=true;await click(h,'Retry revoking same link');assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.url),['/api/shares/'+link.id,'/api/shares/'+link.id]);
 assert.equal(h.button(create).props.disabled,false);
});

test('a captured older-page action cannot use a cursor from a superseded receipt list',async()=>{
 const rows=Array.from({length:20},(_,i)=>receiptRow(receiptFixture(requestFixture({requestId:(i+1).toString(16).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})))),last=rows[19],cursor={createdAt:last.createdAt,requestId:last.requestId},calls=[];let refreshed=false;
 const h=await shareFactsHarness('SharePreview',{request:transport({calls,page:()=>refreshed?receiptPage():receiptPage(rows,cursor)})});await h.settle();
 const stale=h.button('Load older receipts');assert.ok(stale);refreshed=true;await click(h,'Refresh receipts');const before=calls.length;
 await stale.props.onClick();await h.settle();assert.equal(calls.length,before,'an abandoned cursor cannot issue another page read');
});


test('lost ACK can be recovered by an explicit receipt read and replayed in a second empty session',async()=>{
 const storage=memoryStorage(),calls=[];let receipt;
 const request=transport({calls,post:body=>{receipt=receiptFixture(body);return unavailable();},page:()=>receiptPage(receipt?[receiptRow(receipt)]:[]),receipt:()=>ok(receipt)});
 const first=await shareFactsHarness('SharePreview',{storage,request});await first.settle();select(first);await click(first,create);
 assert.ok(storage.getItem(key));await click(first,read);assert.equal(storage.getItem(key),null);assert.deepEqual(urls(first),[receipt.url]);first.unmount();
 const second=await shareFactsHarness('SharePreview',{request,storage:memoryStorage()});await second.settle();assert.deepEqual(urls(second),[]);await click(second,recover);assert.deepEqual(urls(second),[receipt.url]);
 await click(second,recover);assert.deepEqual(urls(second),[receipt.url]);assert.equal(calls.filter(call=>call.method==='POST').length,1);
});

test('a genuinely different microsecond expiry cannot settle an original millisecond intent',async()=>{
 const storage=heldStorage(),original=storage.getItem(key),receipt=receiptFixture();receipt.expiresAt=receipt.intent.expiresAt='2026-10-29T00:00:00.000001+00:00';
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({receipt:ok(receipt)})});await h.settle();await click(h,read);
 assert.equal(storage.getItem(key),original);assert.deepEqual(urls(h),[]);assert.equal(h.button(create).props.disabled,true);
});

for(const boundary of ['actor','trip','disabled','recovery-disabled','unmount','lifetime'])test('late receipt-bearing POST ACK cannot clear the persisted hold on '+boundary,async()=>{
 const storage=memoryStorage(),pending=deferred(),calls=[];let intent;
 const h=await shareFactsHarness('SharePreview',{storage,request:transport({calls,post:body=>{intent=structuredClone(body);return pending.promise;}})});await h.settle();select(h);
 const originalCreate=h.button(create),writing=originalCreate.props.onClick();h.render();assert.ok(intent);const original=storage.getItem(key);
 if(boundary==='actor')h.invalidate(null);
 if(boundary==='trip'){h.props.trip=tripFixture('dddddddd-dddd-4ddd-8ddd-dddddddddddd');h.render();}
 if(boundary==='disabled'){h.props.enabled=false;h.render();}
 if(boundary==='recovery-disabled'){h.props.recoveryEnabled=false;h.render();}
 if(boundary==='unmount')h.unmount();
 if(boundary==='lifetime')h.replayEffects();
 pending.resolve(ok(receiptFixture(intent)));await writing;await h.settle();await originalCreate.props.onClick();
 assert.equal(storage.getItem(key),original);assert.deepEqual(urls(h),[]);assert.equal(calls.filter(call=>call.method==='POST').length,1);
});
