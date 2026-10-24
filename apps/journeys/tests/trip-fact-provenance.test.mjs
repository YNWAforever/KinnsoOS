import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareFactsHarness,deferred,ok,unavailable,tripFixture,factFixture} from './helpers/share-facts-harness.mjs';

for(const locale of ['en','zh-HK']){
 const refresh=locale==='en'?'Refresh loaded facts':'重新整理已載入資料';
 test('loaded fact provenance shows the recorded timestamp and source independently: '+locale,async()=>{
  const trip=tripFixture(),original=structuredClone(trip);
  const h=await shareFactsHarness('TripWarnings',{locale,props:{trip},facts:async()=>ok([factFixture()])});await h.settle();
  const recorded=h.elements().find(node=>node.type==='time');assert.equal(recorded?.props.dateTime,'2020-01-02T03:04:05.000Z');
  assert.ok(h.text().includes('2020-01-02T03:04:05.000Z'),'preserve the recorded timestamp rather than publication/now');
  const link=h.elements().find(node=>node.type==='a'&&node.props.href==='https://venue.test/opening-hours');
  assert.ok(link);assert.match(link.props.rel,/noreferrer/);assert.deepEqual(trip,original);
  assert.match(h.text(),locale==='en'?/private.*reason.*not.*verif/i:/私人.*理由.*不.*核實/);
  const reasons=h.elements().filter(node=>typeof node.type==='function'&&node.type.name==='WarningReason');
  assert.ok(reasons.some(node=>node.props.trip.overrides[0].reason==='Private reason kept exactly.'));
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/trips/11111111-1111-4111-8111-111111111111/facts');
 });
 for(const missing of ['verifiedAt','sourceUrl']){
  test('fact '+missing+' stays independently unknown: '+locale,async()=>{
   const h=await shareFactsHarness('TripWarnings',{locale,facts:async()=>ok([factFixture({[missing]:null})])});await h.settle();
   if(missing==='verifiedAt'){
    assert.equal(h.elements().filter(node=>node.type==='time').length,0);assert.ok(h.elements().some(node=>node.type==='a'&&node.props.href==='https://venue.test/opening-hours'));
    assert.match(h.text(),locale==='en'?/verification date.*unknown/i:/核實日期.*未知/);
   }else{
    assert.ok(h.elements().some(node=>node.type==='time'&&node.props.dateTime==='2020-01-02T03:04:05.000Z'));assert.match(h.text(),locale==='en'?/source.*unknown/i:/來源.*未知/);
   }
  });
 }
 test('failed fact refresh retains a labelled old snapshot then explicit retry distinguishes empty: '+locale,async()=>{
  let result=ok([factFixture()]);const h=await shareFactsHarness('TripWarnings',{locale,facts:async()=>result});await h.settle();
  result=unavailable();h.props.trip={...h.props.trip,revision:2};h.render();await h.settle();
  assert.match(h.text(),locale==='en'?/could not refresh.*facts/i:/未能重新整理.*資料/);
  assert.match(h.text(),locale==='en'?/previously loaded|retained.*stale/i:/先前載入|保留.*過期/);
  assert.ok(h.text().includes('2020-01-02T03:04:05.000Z'));
  result=ok([]);await h.button(refresh).props.onClick();await h.settle();
  assert.match(h.text(),locale==='en'?/no loaded place facts/i:/沒有已載入的地點資料/);assert.equal(h.elements().filter(node=>node.type==='time').length,0);
  assert.doesNotMatch(h.text(),locale==='en'?/could not refresh/i:/未能重新整理/);
 });
 test('initial failed fact read is different from a successful empty result: '+locale,async()=>{
  const h=await shareFactsHarness('TripWarnings',{locale,facts:async()=>{throw Error('offline')}});await h.settle();
  assert.match(h.text(),locale==='en'?/could not load.*facts/i:/未能載入.*資料/);
  assert.doesNotMatch(h.text(),locale==='en'?/no loaded place facts/i:/沒有已載入的地點資料/);
  assert.ok(h.button(refresh));
 });
}

for(const sourceUrl of ['javascript:alert(1)','data:text/html,unsafe','//venue.test/hours','https://user:secret@venue.test/hours','http://127.0.0.1/hours','https://localhost/hours','https://[::1]/hours']){
 test('unsafe fact source is non-clickable: '+sourceUrl,async()=>{
  const h=await shareFactsHarness('TripWarnings',{facts:async()=>ok([factFixture({sourceUrl})])});await h.settle();
  assert.equal(h.elements().filter(node=>node.type==='a').length,0);
  assert.match(h.text(),/source.*unavailable|unsafe/i);assert.ok(h.elements().some(node=>node.type==='time'),'unsafe source does not erase a known timestamp');
 });
}

test('only facts relevant to authorized trip stops render, and null arrival differs from midnight zero',async()=>{
 const h=await shareFactsHarness('TripWarnings',{facts:async()=>ok([factFixture(),factFixture({placeId:'not-in-this-trip',sourceUrl:'https://unrelated.test/'})])});await h.settle();
 assert.equal(h.elements().filter(node=>node.type==='a').length,1);
 const missing=h.elements().filter(node=>node.type==='li'&&h.text(node).includes('No arrival time is set.'));
 assert.equal(missing.length,1);assert.match(h.text(missing[0]),/Manual stop/);assert.doesNotMatch(h.text(missing[0]),/Temple/);
 assert.equal(h.props.trip.days[0].stops[0].durationMinutes,0);assert.equal(h.props.trip.days[0].stops[1].durationMinutes,null);
});

for(const boundary of ['actor','trip','unmount']){
 test('late facts and stale refresh/reason handlers cannot cross '+boundary,async()=>{
  const pending=deferred(),saves=[];const h=await shareFactsHarness('TripWarnings',{props:{save:async command=>{saves.push(command);return true}},facts:async url=>url.includes('dddddddd')?new Promise(()=>{}):pending.promise});
  const refresh=h.button('Refresh loaded facts'),reason=h.elements().find(node=>typeof node.type==='function'&&node.type.name==='WarningReason');
  assert.ok(refresh);assert.ok(reason);
  if(boundary==='actor')h.invalidate('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  if(boundary==='trip'){h.props.trip=tripFixture('dddddddd-dddd-4ddd-8ddd-dddddddddddd');h.render();}
  if(boundary==='unmount')h.unmount();
  await refresh.props.onClick();assert.equal(await reason.props.save({type:'overrideWarning',id:reason.props.stopId,code:reason.props.code,reason:'New private reason.'}),false);
  pending.resolve(ok([factFixture()]));await h.settle();assert.equal(saves.length,0);
  if(boundary!=='unmount')assert.equal(h.elements().filter(node=>node.type==='time').length,0);
 });
}

for(const locale of ['en','zh-HK']){
 test('actual private reason control preserves the reason and never claims verification: '+locale,async()=>{
  const trip=tripFixture(),saved=[];
  const h=await shareFactsHarness('WarningReason',{locale,props:{trip,stopId:trip.days[0].stops[0].id,code:'UNVERIFIED_HOURS',save:async command=>{saved.push(structuredClone(command));return true;}}});
  const input=h.elements().find(node=>node.type==='input'&&node.props.id?.startsWith('reason-'));
  assert.equal(input.props.value,'Private reason kept exactly.');
  const form=h.elements().find(node=>node.type==='form');
  await form.props.onSubmit({preventDefault(){}});h.render();
  assert.deepEqual(saved,[{type:'overrideWarning',id:'33333333-3333-4333-8333-333333333333',code:'UNVERIFIED_HOURS',reason:'Private reason kept exactly.'}]);
  assert.match(h.text(),locale==='en'?/warning remains unverified/i:/提醒仍屬未核實/);assert.equal(h.calls.length,0);
 });
}

test('a superseded fact refresh cannot replace the latest loaded provenance',async()=>{
 const old=deferred(),newer=deferred();let reads=0;
 const h=await shareFactsHarness('TripWarnings',{facts:async()=>++reads===1?old.promise:newer.promise});
 h.props.trip={...h.props.trip,revision:2};h.render();
 newer.resolve(ok([factFixture({verifiedAt:'2021-02-03T04:05:06.000Z'})]));await h.settle();
 old.resolve(ok([factFixture()]));await h.settle();
 assert.deepEqual(h.elements().filter(node=>node.type==='time').map(node=>node.props.dateTime),['2021-02-03T04:05:06.000Z']);
});

test('invalid verification dates remain unknown without discarding a valid independent source',async()=>{
 const h=await shareFactsHarness('TripWarnings',{facts:async()=>ok([factFixture({verifiedAt:'not-a-date'})])});await h.settle();
 assert.equal(h.elements().filter(node=>node.type==='time').length,0);assert.match(h.text(),/verification date.*unknown/i);
 assert.ok(h.elements().some(node=>node.type==='a'&&node.props.href==='https://venue.test/opening-hours'));
});

test('a private reason callback from an earlier effect lifetime cannot save',async()=>{
 const saves=[];const h=await shareFactsHarness('TripWarnings',{props:{save:async command=>{saves.push(command);return true;}},facts:async()=>ok([])});
 await h.settle();const reason=h.elements().find(node=>typeof node.type==='function'&&node.type.name==='WarningReason');
 h.replayEffects();await h.settle();
 assert.equal(await reason.props.save({type:'overrideWarning',id:reason.props.stopId,code:reason.props.code,reason:'Stale lifetime reason.'}),false);
 assert.equal(saves.length,0);
});
