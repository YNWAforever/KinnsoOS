import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import * as validation from '../lib/api/validation.ts';
import * as capabilities from '../lib/contracts/capabilities.ts';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const guide = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sources = {};
for (const [name, file] of [['server', '../lib/api/server.ts'], ['route', '../app/api/bookmarks/route.ts']]) {
  sources[name] = (await transform(await readFile(new URL(file, import.meta.url), 'utf8'), {loader:'ts', format:'cjs'})).code;
}

// Execute the actual context/route. These ports cannot instantiate a real SDK client.
function harness(options = {}) {
  const calls = [], events = [];
  const state = {rows:[], result:{saved:true}, ...options};
  const env = {KINNSO_SUPABASE_URL:'https://offline.example.test',
    KINNSO_APPROVED_SUPABASE_ORIGIN:'https://offline.example.test',
    KINNSO_LEGACY_AUTH_ORIGIN:'https://offline.example.test',
    KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_offline',
    KINNSO_ENABLED_CAPABILITIES:'bookmarks', KINNSO_SITE_URL:'https://journeys.test', ...options.env};
  const query = {then:resolve => resolve({data:state.rows, error:state.error ?? null})};
  for (const method of ['select', 'eq', 'order', 'limit', 'or']) {
    query[method] = (...args) => {calls.push([method, ...args]); return query;};
  }
  const client = {
    auth:{getUser:async () => ({data:{user:state.anonymous ? null : {id:owner}}, error:null})},
    from:table => {calls.push(['from', table]); return query;},
    rpc:async (name, args) => {
      if (name === 'kinnso_actor') return {data:{id:owner}, error:null};
      calls.push([name, args]);
      if (state.rpcThrows) throw Error('PRIVATE acknowledgement lost after commit');
      return {data:state.result, error:state.error ?? null};
    },
  };
  const telemetry = {observeRequest(){}, timedRpc:(port, ...args) => port.rpc(...args),
    successEvent:async (...args) => events.push(args)};
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const module = {exports:{}};
    runInContext(sources[name], createContext({module, exports:module.exports, Request, Response,
      URL, Buffer, performance, crypto:webcrypto, process:{env},
      fetch:() => {throw Error('Network forbidden in offline bookmark tests');},
      require:specifier => {
        if (specifier.endsWith('/supabase/server')) return {serverClient:async () => client};
        if (specifier.endsWith('/contracts/capabilities')) return capabilities;
        if (specifier.endsWith('/api/validation') || specifier === './validation') return validation;
        if (specifier.endsWith('/api/server')) return load('server');
        if (specifier.endsWith('/telemetry/server')) return telemetry;
        throw Error('Unexpected dependency '+specifier);
      }}));
    return cache[name] = module.exports;
  }
  return {route:load('route'), calls, events};
}
const get = query => new Request('https://journeys.test/api/bookmarks'+(query ? '?'+query : ''));
const post = (body, headers = {}) => new Request('https://journeys.test/api/bookmarks', {
  method:'POST', headers:{host:'journeys.test', origin:'https://journeys.test', ...headers},
  body:typeof body === 'string' ? body : JSON.stringify(body),
});
const command = {guideId:guide, desiredState:true, requestId};
async function failure(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal(result.retryable, code === 'UNAVAILABLE');
  assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  assert.equal('data' in result, false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
}

test('bookmark reads and writes require capability and fresh identity before database access', async () => {
  for (const [options, status, code] of [[{anonymous:true}, 401, 'AUTH_REQUIRED'],
    [{env:{KINNSO_ENABLED_CAPABILITIES:''}}, 503, 'UNAVAILABLE']]) {
    const h = harness(options);
    await failure(await h.route.GET(get()), status, code);
    await failure(await h.route.POST(post(command)), status, code);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
});

test('cross-origin or stale-account bookmark intent cannot mutate or emit success', async () => {
  for (const headers of [{origin:'https://evil.test'}, {origin:'null'}, {host:'evil.test'},
    {'sec-fetch-site':'cross-site'}, {'X-Kinnso-Intent-Actor':guide}]) {
    const h = harness();
    const actorMismatch = 'X-Kinnso-Intent-Actor' in headers;
    await failure(await h.route.POST(post(command, headers)), actorMismatch ? 401 : 403,
      actorMismatch ? 'AUTH_REQUIRED' : 'FORBIDDEN');
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
});

test('bookmark page is owner-scoped, bounded and ordered across timestamp ties', async () => {
  const rows = Array.from({length:101}, (_, i) => ({guide_id:`guide-${i}`, created_at:'2026-10-01T12:00:00Z', guides:null}));
  const h = harness({rows});
  const response = await h.route.GET(get());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const body = await response.json();
  assert.deepEqual(body.data, rows.slice(0, 100));
  assert.deepEqual(body.nextCursor, {createdAt:rows[99].created_at, guideId:rows[99].guide_id});
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.filter(([name]) => ['from','eq','order','limit'].includes(name)))), [
    ['from','guide_saves'], ['eq','traveler_user_id',owner],
    ['order','created_at',{ascending:false}], ['order','guide_id'], ['limit',101],
  ]);
});

test('empty and exactly full terminal bookmark pages have no next cursor', async () => {
  for (const count of [0, 1, 100]) {
    const rows = Array.from({length:count}, () => ({guide_id:guide, guides:null}));
    const h = harness({rows});
    assert.deepEqual(await (await h.route.GET(get())).json(), {ok:true, data:rows, nextCursor:null});
  }
});

test('composite cursor and single-guide lookup use validated filters without changing account scope', async () => {
  const before = '2026-10-01T12:00:00.123456+08:00';
  const h = harness();
  await h.route.GET(get(new URLSearchParams({before, beforeGuide:guide}).toString()));
  assert.deepEqual(h.calls.find(([name]) => name === 'or'),
    ['or',`created_at.lt.${before},and(created_at.eq.${before},guide_id.gt.${guide})`]);
  const one = harness();
  await one.route.GET(get('guideId='+guide));
  assert.deepEqual(one.calls.filter(([name]) => name === 'eq'),
    [['eq','traveler_user_id',owner], ['eq','guide_id',guide]]);
  assert.deepEqual(one.calls.at(-1), ['limit',1]);
});

test('malformed, partial and injected bookmark cursors fail before query construction', async () => {
  const valid = {before:'2026-10-01T12:00:00Z', beforeGuide:guide};
  for (const params of [{guideId:'bad'}, {before:valid.before}, {beforeGuide:guide},
    {...valid, guideId:guide}, {...valid, beforeGuide:guide+',traveler_user_id.eq.other'},
    {...valid, before:'2026-10-01'}, {...valid, before:'2026-99-01T12:00:00Z'},
    {...valid, before:'2026-10-01T12:00:00Z),traveler_user_id.eq.other'}]) {
    const h = harness();
    await failure(await h.route.GET(get(new URLSearchParams(params).toString())), 400, 'INVALID');
    assert.deepEqual(h.calls, []);
  }
});

test('bookmark writes reject malformed JSON, forged ownership and non-boolean state before RPC', async () => {
  for (const body of ['{', [], null, {...command, ownerId:owner}, {...command, requestId:'bad'},
    {...command, guideId:'bad'}, {...command, desiredState:'true'}, {...command, desiredState:undefined}]) {
    const h = harness();
    await failure(await h.route.POST(post(body)), 400, 'INVALID');
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
});

test('save and unsave forward desired state and stable retry identity; only saves emit success', async () => {
  for (const desiredState of [true, false]) {
    const h = harness({result:{saved:desiredState}});
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await h.route.POST(post({...command, desiredState}));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {ok:true, data:{saved:desiredState}});
    }
    assert.equal(h.calls.length, 2);
    for (const [name, args] of h.calls) {
      assert.equal(name, 'kinnso_bookmark');
      assert.deepEqual(JSON.parse(JSON.stringify(args)), {p_guide_id:guide, p_desired_state:desiredState, p_request_id:requestId});
    }
    assert.deepEqual(h.events.map(([, name, id]) => [name, id]),
      desiredState ? [['bookmark_saved',requestId], ['bookmark_saved',requestId]] : []);
  }
});

test('bookmark backend denials preserve status and never disclose private error details or emit success', async () => {
  for (const [message, status, code] of [['guide_not_found',404,'NOT_FOUND'],
    ['idempotency_conflict',409,'CONFLICT'], ['forbidden',403,'FORBIDDEN'],
    ['PRIVATE database connection',503,'UNAVAILABLE']]) {
    const h = harness({error:{message}});
    await failure(await h.route.GET(get()), status, code);
    await failure(await h.route.POST(post(command)), status, code);
    assert.deepEqual(h.events, []);
  }
});

test('unknown bookmark write outcome is retryable and preserves the original command identity', async () => {
  const h = harness({rpcThrows:true});
  for (let attempt = 0; attempt < 2; attempt++) {
    await failure(await h.route.POST(post(command)), 503, 'UNAVAILABLE');
  }
  assert.equal(h.calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), JSON.parse(JSON.stringify(h.calls[1])));
  assert.deepEqual(h.events, []);
});
