import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareFactsHarness,deferred,ok,unavailable,tripFixture,linkFixture,shareFixture,memoryStorage} from './helpers/share-facts-harness.mjs';

const labels={
 en:{create:'Create read-only link',refresh:'Refresh existing links',retry:'Retry loading links',revoke:'Revoke existing link',loading:/loading.*links/i,error:/could not load.*links/i,held:/unknown|unconfirmed/i},
 'zh-HK':{create:'建立唯讀連結',refresh:'重新整理現有連結',retry:'重試載入連結',revoke:'撤銷現有連結',loading:/載入.*連結/,error:/未能載入.*連結/,held:/未知|未確認/}
};
const checkboxes=h=>h.elements().filter(node=>node.type==='input'&&node.props.type==='checkbox');
const selectFirst=h=>{checkboxes(h)[0].props.onChange({target:{checked:true}});h.render();};

for(const locale of ['en','zh-HK']){
 const l=labels[locale];
 test('share loading blocks creation until an authoritative read: '+locale,async()=>{
  const read=deferred(),writes=[];const h=await shareFactsHarness('SharePreview',{locale,request:async(url,method='GET',body)=>{if(method==='GET')return read.promise;writes.push(body);return ok(shareFixture());}});
  const stale=h.button(l.create);assert.equal(stale.props.disabled,true,'loading must not look like an empty successful list');
  await stale.props.onClick();assert.equal(writes.length,0,'disabled handler also fences direct invocation');assert.match(h.text(),l.loading);
  read.resolve(ok([]));await h.settle();assert.equal(h.button(l.create).props.disabled,false);
 });
 test('share read failure stays unknown and retry cannot create: '+locale,async()=>{
  let readFails=true;const writes=[];const h=await shareFactsHarness('SharePreview',{locale,request:async(_url,method='GET',body)=>{if(method==='GET')return readFails?unavailable():ok([linkFixture()]);writes.push(body);return ok(shareFixture());}});
  await h.settle();assert.match(h.text(),l.error);assert.equal(h.button(l.create).props.disabled,true);
  await h.button(l.create).props.onClick();assert.equal(writes.length,0);
  readFails=false;await h.button(l.retry).props.onClick();await h.settle();assert.ok(h.button(l.revoke));assert.equal(h.button(l.create).props.disabled,false);
 });
 test('lost share ACK pins selection and expiry and never re-creates after reconciliation: '+locale,async()=>{
  const calls=[],write=deferred();let readResult=ok([]);
  const h=await shareFactsHarness('SharePreview',{locale,request:async(url,method='GET',body)=>{calls.push({url,method,body:body&&structuredClone(body)});return method==='GET'?readResult:write.promise;}});
  await h.settle();selectFirst(h);const original=h.button(l.create),oldToggle=checkboxes(h)[0];const first=original.props.onClick();h.render();
  const pinned=calls.find(call=>call.method==='POST').body;
  const duplicate=original.props.onClick();oldToggle.props.onChange({target:{checked:false}});h.render();
  assert.equal(calls.filter(call=>call.method==='POST').length,1,'same-render double click cannot mint a second token');
  assert.equal(checkboxes(h)[0].props.checked,true,'unknown selection stays pinned');assert.equal(checkboxes(h)[0].props.disabled,true);
  assert.deepEqual(Object.keys(pinned).sort(),['expiresAt','mediaIds','stopIds','tripId'],'the API has no replay field');
  assert.deepEqual(pinned.stopIds,['33333333-3333-4333-8333-333333333333']);assert.ok(Number.isFinite(Date.parse(pinned.expiresAt)));
  write.resolve(unavailable());await Promise.all([first,duplicate]);await h.settle();
  assert.match(h.text(),l.held);assert.equal(h.button(l.create).props.disabled,true);
  readResult=unavailable();await h.button(l.refresh).props.onClick();await h.settle();assert.match(h.text(),l.error);
  await original.props.onClick();await h.button(l.create).props.onClick();assert.equal(calls.filter(call=>call.method==='POST').length,1);
  readResult=ok([]);await h.button(l.retry).props.onClick();await h.settle();
  assert.equal(h.button(l.create).props.disabled,true,'an empty list cannot prove that an unknown create failed');
  assert.match(h.text(),locale==='en'?/support|manual recovery/i:/支援|手動復原/);assert.ok(h.text().includes(pinned.expiresAt),'show the original fixed expiry for recovery');
 });
 test('unknown share exposes current owned-link revoke without releasing the unknown request: '+locale,async()=>{
  let rows=[];const deletes=[];const h=await shareFactsHarness('SharePreview',{locale,request:async(url,method='GET')=>{
   if(method==='GET')return ok(rows);if(method==='POST')return unavailable();deletes.push(url);rows=[];return ok({revoked:true});
  }});
  await h.settle();selectFirst(h);await h.button(l.create).props.onClick();await h.settle();rows=[linkFixture()];
  await h.button(l.refresh).props.onClick();await h.settle();
  const revoke=h.button(l.revoke);assert.ok(revoke);await revoke.props.onClick();await h.settle();
  assert.deepEqual(deletes,['/api/shares/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  assert.equal(h.button(l.create).props.disabled,true,'revoking metadata does not settle the unreceipted create');
 });
}

test('rejected share reads are readable and cannot unlock create',async()=>{
 const h=await shareFactsHarness('SharePreview',{request:async()=>{throw Error('offline')}});await h.settle();
 assert.match(h.text(),/could not load.*links/i);assert.equal(h.button(labels.en.create).props.disabled,true);
});

for(const boundary of ['actor','trip','disabled','unmount']){
 test('stale share read and create handlers cannot cross '+boundary,async()=>{
  const read=deferred(),calls=[];const h=await shareFactsHarness('SharePreview',{request:async(url,method='GET',body)=>{calls.push({url,method,body});return method==='GET'?(url.includes('dddddddd')?new Promise(()=>{}):read.promise):ok(shareFixture())}});
  const create=h.button(labels.en.create);
  if(boundary==='actor')h.invalidate('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  if(boundary==='trip'){h.props.trip=tripFixture('dddddddd-dddd-4ddd-8ddd-dddddddddddd');h.render();}
  if(boundary==='disabled'){h.props.enabled=false;h.render();}
  if(boundary==='unmount')h.unmount();
  await create.props.onClick();read.resolve(ok([linkFixture()]));await h.settle();
  assert.equal(calls.filter(call=>call.method==='POST').length,0);
  if(boundary!=='unmount')assert.equal(h.text().includes('2026-10-29'),false,'old metadata cannot enter a later scope');
 });
}

test('late share ACK and captured revoke/copy handlers are fenced on account invalidation',async()=>{
 const pending=deferred(),calls=[],copies=[];
 const h=await shareFactsHarness('SharePreview',{request:async(url,method='GET')=>{calls.push({url,method});return method==='GET'?ok([]):pending.promise},clipboard:async url=>copies.push(url)});
 await h.settle();const create=h.button(labels.en.create),writing=create.props.onClick();h.render();h.invalidate(null);pending.resolve(ok(shareFixture()));await writing;await h.settle();
 assert.equal(h.elements().some(node=>node.type==='input'&&node.props.value==='https://www.kinnso.ai/share/token-once'),false,'a stale acknowledgement must not expose its token');await create.props.onClick();assert.equal(calls.filter(c=>c.method==='POST').length,1);
 const current=await shareFactsHarness('SharePreview',{request:async(_url,method='GET')=>method==='GET'?ok([]):ok(shareFixture()),clipboard:async url=>copies.push(url)});
 await current.settle();await current.button(labels.en.create).props.onClick();current.render();
 const revoke=current.button('Revoke link'),copy=current.button('Copy link');current.invalidate(null);
 await revoke.props.onClick();await copy.props.onClick();assert.equal(copies.length,0);
});

test('a captured revoke cannot write after a failed owned-link refresh',async()=>{
 let readFails=false,deletes=0;const h=await shareFactsHarness('SharePreview',{request:async(_url,method='GET')=>method==='GET'?(readFails?unavailable():ok([linkFixture()])):(deletes++,ok({revoked:true}))});
 await h.settle();const revoke=h.button(labels.en.revoke);readFails=true;await h.button(labels.en.refresh).props.onClick();await h.settle();
 await revoke.props.onClick();assert.equal(deletes,0,'failed source read cannot authorize a different write');
});

test('known share revoke refreshes metadata before another create and preserves public numeric zero',async()=>{
 const reads=deferred();let count=0;const writes=[];const h=await shareFactsHarness('SharePreview',{request:async(_url,method='GET',body)=>{
  if(method==='GET')return ++count===1?ok([]):reads.promise;writes.push({method,body});return method==='POST'?ok(shareFixture()):ok({revoked:true});
 }});
 await h.settle();selectFirst(h);await h.button(labels.en.create).props.onClick();h.render();
 const preview=h.elements().find(node=>node.type==='pre');const publicData=JSON.parse(h.text(preview));
 assert.equal(publicData.days[0].stops[0].startMinuteOfDay,0);assert.equal(publicData.days[0].stops[0].durationMinutes,0);assert.equal(h.text(preview).includes('PRIVATE NOTE'),false);
 await h.button('Revoke link').props.onClick();h.render();assert.equal(h.button(labels.en.create).props.disabled,true);
 reads.resolve(ok([]));await h.settle();assert.equal(h.button(labels.en.create).props.disabled,false);assert.equal(writes.length,2);
});


test('unknown share retains its exact selection and expiry after reload and even after expiry',async()=>{
 const storage=memoryStorage(),calls=[];let clockNow=Date.parse('2026-10-23T00:00:00.000Z');
 class TestClock extends Date{static now(){return clockNow;}}
 const request=async(url,method='GET',body)=>{calls.push({url,method,body});return method==='GET'?ok([]):unavailable();};
 const first=await shareFactsHarness('SharePreview',{storage,request,clock:TestClock});await first.settle();selectFirst(first);
 checkboxes(first)[2].props.onChange({target:{checked:true}});first.render();await first.button(labels.en.create).props.onClick();await first.settle();
 const intent=structuredClone(calls.find(call=>call.method==='POST').body);first.unmount();clockNow+=365*86400000;
 const reloaded=await shareFactsHarness('SharePreview',{storage,request,clock:TestClock});await reloaded.settle();
 assert.equal(reloaded.button(labels.en.create).props.disabled,true);await reloaded.button(labels.en.create).props.onClick();
 assert.equal(calls.filter(call=>call.method==='POST').length,1);assert.equal(checkboxes(reloaded)[0].props.checked,true);assert.equal(checkboxes(reloaded)[2].props.checked,true);
 assert.deepEqual(intent.mediaIds,['66666666-6666-4666-8666-666666666666']);assert.ok(reloaded.text().includes(intent.expiresAt),'expiry is retained rather than recomputed or used to unlock');
});

test('failed share recovery storage read blocks creation until a successful explicit read',async()=>{
 const underlying=memoryStorage();let readFails=true,writes=0;
 const storage={...underlying,getItem:key=>{if(readFails)throw Error('storage unavailable');return underlying.getItem(key);}};
 const h=await shareFactsHarness('SharePreview',{storage,request:async(_url,method='GET')=>{if(method==='GET')return ok([]);writes++;return ok(shareFixture());}});
 await h.settle();assert.equal(h.button(labels.en.create).props.disabled,true);await h.button(labels.en.create).props.onClick();assert.equal(writes,0);
 assert.match(h.text(),/recovery could not be read/i);readFails=false;await h.button(labels.en.refresh).props.onClick();await h.settle();
 assert.equal(h.button(labels.en.create).props.disabled,false);assert.doesNotMatch(h.text(),/recovery could not be read/i,'a recovered read must clear the obsolete failure label');
});

for(const problem of ['corrupt-read','failed-write']){
 test('unusable share recovery '+problem+' never sends a new POST',async()=>{
  const storage=memoryStorage(),writes=[];
  if(problem==='corrupt-read')storage.setItem('kinnso:unconfirmed-share:v1:11111111-1111-4111-8111-111111111111','broken JSON');
  else storage.setItem=()=>{throw Error('quota');};
  const h=await shareFactsHarness('SharePreview',{storage,request:async(_url,method='GET',body)=>{if(method==='GET')return ok([]);writes.push(body);return ok(shareFixture());}});
  await h.settle();await h.button(labels.en.create).props.onClick();await h.settle();await h.button(labels.en.create).props.onClick();
  assert.equal(writes.length,0);assert.equal(h.button(labels.en.create).props.disabled,true);assert.match(h.text(),/manual recovery|support/i);
 });
}

test('a thrown share creation retains its hold through an empty successful refresh',async()=>{
 let writes=0;const h=await shareFactsHarness('SharePreview',{request:async(_url,method='GET')=>{if(method==='GET')return ok([]);writes++;throw Error('response lost')}});
 await h.settle();await h.button(labels.en.create).props.onClick();await h.settle();await h.button(labels.en.refresh).props.onClick();await h.settle();
 await h.button(labels.en.create).props.onClick();assert.equal(writes,1);assert.match(h.text(),/unconfirmed/i);assert.equal(h.button(labels.en.create).props.disabled,true);
});

for(const locale of ['en','zh-HK']){
 test('unconfirmed revocation offers only the same owned link after an empty refresh: '+locale,async()=>{
  let rows=[linkFixture()],confirmed=false;const deletes=[];
  const h=await shareFactsHarness('SharePreview',{locale,request:async(url,method='GET')=>{
   if(method==='GET')return ok(rows);if(method==='POST')throw Error('Creation must stay locked');deletes.push(url);rows=[];return confirmed?ok({revoked:true}):unavailable();
  }});
  await h.settle();await h.button(labels[locale].revoke).props.onClick();await h.settle();assert.equal(h.button(labels[locale].create).props.disabled,true);
  const retry=h.button(locale==='en'?'Retry revoking same link':'重試撤銷同一連結');assert.ok(retry,'an uncertain owned-link revoke needs a concrete recovery action');
  confirmed=true;await retry.props.onClick();await h.settle();
  assert.deepEqual(deletes,['/api/shares/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','/api/shares/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  assert.equal(h.button(labels[locale].create).props.disabled,false);
 });
}

test('a second mounted share surface must read the current tab hold before any POST',async()=>{
 const storage=memoryStorage(),calls=[];
 const request=async(url,method='GET',body)=>{calls.push({url,method,body});return method==='GET'?ok([]):unavailable();};
 const first=await shareFactsHarness('SharePreview',{request,storage}),second=await shareFactsHarness('SharePreview',{request,storage});
 await first.settle();await second.settle();const staleSecond=second.button(labels.en.create);
 await first.button(labels.en.create).props.onClick();await first.settle();
 await staleSecond.props.onClick();await second.settle();
 assert.equal(calls.filter(call=>call.method==='POST').length,1,'a previously ready surface cannot ignore a newer unresolved hold');
 assert.equal(second.button(labels.en.create).props.disabled,true);
});

test('a captured revocation retry cannot target a later owned link',async()=>{
 const firstLink=linkFixture(),secondLink=linkFixture('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 let rows=[firstLink],confirmed=false;const deletes=[];
 const h=await shareFactsHarness('SharePreview',{request:async(url,method='GET')=>{
  if(method==='GET')return ok(rows);deletes.push(url);return confirmed?ok({revoked:true}):unavailable();
 }});
 await h.settle();await h.button(labels.en.revoke).props.onClick();await h.settle();
 const staleRetry=h.button('Retry revoking same link');
 confirmed=true;rows=[secondLink];await staleRetry.props.onClick();await h.settle();
 confirmed=false;await h.button(labels.en.revoke).props.onClick();await h.settle();
 await staleRetry.props.onClick();await h.settle();
 assert.deepEqual(deletes,['/api/shares/'+firstLink.id,'/api/shares/'+firstLink.id,'/api/shares/'+secondLink.id]);
});

test('effect cleanup and setup starts a fresh share read instead of leaving loading stuck',async()=>{
 const old=deferred(),fresh=deferred();let reads=0;
 const h=await shareFactsHarness('SharePreview',{request:async()=>++reads===1?old.promise:fresh.promise});
 h.replayEffects();assert.equal(reads,2,'Strict Mode effect replay must not retain the abandoned reading lock');
 old.resolve(ok([linkFixture()]));fresh.resolve(ok([]));await h.settle();
 assert.equal(h.button(labels.en.create).props.disabled,false);assert.equal(h.button(labels.en.revoke),undefined);
});

test('an ACK from a previous effect lifetime cannot expose a token or clear its hold',async()=>{
 const pending=deferred(),storage=memoryStorage();const h=await shareFactsHarness('SharePreview',{storage,request:async(_url,method='GET')=>method==='GET'?ok([]):pending.promise});
 await h.settle();const writing=h.button(labels.en.create).props.onClick();h.render();h.replayEffects();pending.resolve(ok(shareFixture()));await writing;await h.settle();
 assert.equal(h.elements().some(node=>node.type==='input'&&node.props.value==='https://www.kinnso.ai/share/token-once'),false,'a stale acknowledgement must not expose its token');assert.equal(h.button(labels.en.create).props.disabled,true);assert.match(h.text(),/unknown/i);
 const reloaded=await shareFactsHarness('SharePreview',{storage,request:async()=>ok([])});await reloaded.settle();assert.equal(reloaded.button(labels.en.create).props.disabled,true);
});


test('an incomplete share ACK remains held and cannot authorize another creation',async()=>{
 let posts=0;const h=await shareFactsHarness('SharePreview',{request:async(_url,method='GET')=>{
  if(method==='GET')return ok([]);posts++;return ok({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',projection:shareFixture().projection});
 }});
 await h.settle();await h.button(labels.en.create).props.onClick();await h.settle();
 assert.ok(h.button(labels.en.create),'missing token URL is an unresolved receipt, not a usable share');
 assert.equal(h.button(labels.en.create).props.disabled,true);await h.button(labels.en.create).props.onClick();assert.equal(posts,1);assert.match(h.text(),/unconfirmed|unknown/i);
});

test('an empty persisted recovery record is a read error rather than absence',async()=>{
 const storage=memoryStorage();storage.setItem('kinnso:unconfirmed-share:v1:11111111-1111-4111-8111-111111111111','');
 const h=await shareFactsHarness('SharePreview',{storage,request:async()=>ok([])});await h.settle();
 assert.equal(h.button(labels.en.create).props.disabled,true);assert.match(h.text(),/recovery could not be read/i);
});
