import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import * as consent from '../lib/telemetry/events.ts';
import * as validation from '../lib/api/validation.ts';

const sources = {};
for (const [name, path] of [['trips','../lib/trips/repository.ts'], ['bookmarks','../lib/bookmarks/repository.ts']]) {
  sources[name] = (await transform(await readFile(new URL(path, import.meta.url), 'utf8'), {loader:'ts', format:'cjs'})).code;
}
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Each test gets its own fetch and browser state; no globals or real HTTP are used.
function harness({respond = () => Response.json({ok:true, data:{id}}), browser} = {}) {
  const calls = [], cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const module = {exports:{}};
    runInContext(sources[name], createContext({module, exports:module.exports, URLSearchParams,
      crypto:webcrypto, ...(browser ? {window:browser} : {}),
      fetch:async (...args) => {calls.push(args); return respond(...args);},
      require:specifier => {
        if (specifier === '../api/validation') return validation;
        if (specifier === '../trips/repository') return load('trips');
        if (specifier === '../telemetry/events') return consent;
        if (specifier === '../telemetry/pilot-client') return {pilotSession:() => id};
        throw Error('Unexpected dependency '+specifier);
      }}));
    return cache[name] = module.exports;
  }
  return {...load('trips'), ...load('bookmarks'), calls};
}
const plain = value => JSON.parse(JSON.stringify(value));

test('trip command retries retain actor, revision and request identity without caching', async () => {
  const h = harness(), command = {type:'patchTrip', patch:{title:'A saved trip'}};
  for (let attempt = 0; attempt < 2; attempt++) await h.trips.apply(id, 7, requestId, command, owner);
  assert.equal(h.calls.length, 2);
  for (const [url, options] of h.calls) {
    assert.equal(url, '/api/trips/'+id+'/commands');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers['X-Kinnso-Intent-Actor'], owner);
    assert.deepEqual(JSON.parse(options.body), {expectedRevision:7, requestId, command});
  }
});

test('trip reads encode path and cursor input and forward cancellation without a body', async () => {
  const h = harness(), controller = new AbortController();
  await h.trips.get('id/with?reserved#text', owner);
  await h.trips.list('cursor&other=1', owner);
  await h.request('/api/trips', 'GET', undefined, controller.signal, owner);
  assert.equal(h.calls[0][0], '/api/trips/id%2Fwith%3Freserved%23text');
  assert.equal(h.calls[1][0], '/api/trips?after=cursor%26other%3D1');
  assert.equal(h.calls[2][1].signal, controller.signal);
  for (const [, options] of h.calls) {
    assert.equal(options.body, undefined);
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.headers['X-Kinnso-Intent-Actor'], owner);
  }
});

test('bookmark repository preserves the composite cursor and returns explicit terminal pagination', async () => {
  const items = [{guide_id:id, guides:null}], cursor = {createdAt:'2026-10-01T12:00:00+08:00', guideId:id};
  const h = harness({respond:() => Response.json({ok:true, data:items, nextCursor:cursor})});
  assert.deepEqual(plain(await h.bookmarks.list(owner, cursor)), {ok:true, data:{items, nextCursor:cursor}});
  const query = new URL(h.calls[0][0], 'https://offline.test').searchParams;
  assert.equal(query.get('before'), cursor.createdAt);
  assert.equal(query.get('beforeGuide'), id);
  assert.equal(h.calls[0][1].headers['X-Kinnso-Intent-Actor'], owner);
  const end = harness({respond:() => Response.json({ok:true, data:[]})});
  assert.deepEqual(plain(await end.bookmarks.list(owner)), {ok:true, data:{items:[], nextCursor:null}});
  await end.bookmarks.list(owner, undefined, id);
  assert.equal(end.calls[1][0], '/api/bookmarks?guideId='+id);
});

test('bookmark toggle transports false as an explicit desired state with the original request ID', async () => {
  const h = harness();
  await h.bookmarks.toggle(id, false, requestId, owner);
  assert.equal(h.calls[0][0], '/api/bookmarks');
  assert.equal(h.calls[0][1].method, 'POST');
  assert.equal(h.calls[0][1].headers['X-Kinnso-Intent-Actor'], owner);
  assert.deepEqual(JSON.parse(h.calls[0][1].body), {guideId:id, desiredState:false, requestId});
});

test('API denials remain explicit and never turn into empty bookmark success or automatic retries', async () => {
  for (const [status, code] of [[401,'AUTH_REQUIRED'],[403,'FORBIDDEN'],[409,'CONFLICT'],[503,'UNAVAILABLE']]) {
    const error = {ok:false, code, retryable:status === 503, requestId};
    const h = harness({respond:() => Response.json(error, {status})});
    assert.deepEqual(plain(await h.bookmarks.list(owner)), error);
    assert.equal(h.calls.length, 1);
  }
});

test('transport, malformed JSON, missing result tag and contradictory HTTP success fail as retryable unavailable', async () => {
  for (const respond of [() => {throw Error('PRIVATE network detail');},
    () => {throw new DOMException('Aborted', 'AbortError');},
    () => new Response('<html>Unavailable</html>', {status:502}),
    () => Response.json(null), () => Response.json({data:[]}),
    () => Response.json({ok:true, data:[]}, {status:500})]) {
    const h = harness({respond});
    const result = plain(await h.request('/api/trips'));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UNAVAILABLE');
    assert.equal(result.retryable, true);
    assert.match(result.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(h.calls.length, 1);
  }
});

test('missing, denied or unreadable browser consent sends no analytics or pilot identity', async () => {
  for (const browser of [undefined, {localStorage:{getItem:() => null}},
    {get localStorage(){throw Error('Storage denied');}}]) {
    const h = harness({browser});
    assert.equal((await h.request('/api/trips')).ok, true);
    const headers = h.calls[0][1].headers;
    assert.equal(headers['X-Kinnso-Analytics-Consent'], 'denied');
    assert.equal(headers['X-Kinnso-Anonymous-Session'], undefined);
    assert.equal(headers['X-Kinnso-Pilot-Session'], undefined);
  }
});

test('only current versioned consent attaches analytics and pilot identity', async () => {
  for (const accepted of [true, false]) {
    const values = {'kinnso.analytics.journey.v1':requestId, 'kinnso.analytics.consent.v1':'accepted',
      'kinnso.analytics.consent-version.v1':'v1:'+(accepted ? Date.now()+60000 : 1)};
    const h = harness({browser:{localStorage:{getItem:key => values[key] ?? null}}});
    await h.request('/api/trips');
    const headers = h.calls[0][1].headers;
    assert.equal(headers['X-Kinnso-Analytics-Consent'], accepted ? 'accepted' : 'denied');
    assert.equal(headers['X-Kinnso-Anonymous-Session'], accepted ? requestId : undefined);
    assert.equal(headers['X-Kinnso-Pilot-Session'], accepted ? id : undefined);
  }
});
