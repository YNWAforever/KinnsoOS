import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import * as validation from '../lib/api/validation.ts';
import * as capabilityContract from '../lib/contracts/capabilities.ts';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherActor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = '11111111-1111-4111-8111-111111111111';
const tripId = '22222222-2222-4222-8222-222222222222';
const migrationName = '20261016054409_kinnso_trip_creation_receipt.sql';
const sources = {};
for (const [name, path] of [
  ['server', '../lib/api/server.ts'],
  ['creation', '../app/api/trips/creation/route.ts'],
  ['trips', '../app/api/trips/route.ts'],
  ['adopt', '../app/api/trips/[id]/adopt/route.ts'],
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8').catch(error => {
    if (name === 'creation' && error.code === 'ENOENT') return null;
    throw error;
  });
  if (source !== null) sources[name] = (await transform(source, {loader:'ts', format:'cjs', target:'es2022'})).code;
}

// Execute actual BFF/context code; only external auth, RPC and telemetry are fake.
function harness(options = {}) {
  const state = {events:[], user:{id:actorId}, actor:{id:actorId, roles:['traveller']},
    receipt:{tripId}, rpcError:null, rpcThrows:false, ...options};
  const env = {
    KINNSO_SUPABASE_URL:'https://offline.example.test',
    KINNSO_APPROVED_SUPABASE_ORIGIN:'https://offline.example.test',
    KINNSO_LEGACY_AUTH_ORIGIN:'https://offline.example.test',
    KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_offline',
    KINNSO_ENABLED_CAPABILITIES:'trips', KINNSO_SITE_URL:'https://journeys.test',
    ...options.env,
  };
  const client = {
    auth:{getUser:async () => {
      state.events.push(['getUser']);
      return {data:{user:state.user}, error:state.authError ?? null};
    }},
    rpc:async (name, args) => {
      state.events.push([name, args]);
      if (name === 'kinnso_actor') return {data:state.actor, error:state.actorError ?? null};
      if (state.rpcThrows) throw Error('PRIVATE connection detail');
      if (name === 'get_trip_creation_receipt') return {data:state.receipt, error:state.rpcError};
      if (name === 'create_trip_v2') return {data:{id:tripId, revision:1}, error:state.rpcError};
       if (name === 'adopt_guide_to_trip') return {data:{id:tripId, revision:3}, error:state.rpcError};
      throw Error('Unexpected RPC '+name);
    },
    from:() => { throw Error('Receipt lookup must never query tables or snapshots'); },
  };
  const telemetry = {
    observeRequest:() => state.events.push(['observeRequest']),
    timedRpc:(port, name, args) => port.rpc(name, args),
    successEvent:async () => {if(state.telemetryThrows)throw Error('PRIVATE optional measurement');},
  };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    if (!sources[name]) return {};
    const module = {exports:{}};
    runInContext(sources[name], createContext({
      module, exports:module.exports, Request, Response, URL, Buffer, performance,
      crypto:webcrypto, process:{env},
      fetch:() => { throw Error('Network is forbidden in offline BFF tests'); },
      require:specifier => {
        if (specifier.endsWith('/supabase/server')) return {serverClient:async () => {
          state.events.push(['serverClient']);
          return state.noClient ? null : client;
        }};
        if (specifier.endsWith('/contracts/capabilities')) return capabilityContract;
        if (specifier.endsWith('/api/validation') || specifier === './validation') return validation;
        if (specifier.endsWith('/telemetry/server')) return telemetry;
         if (specifier.endsWith('/telemetry/pilot-server')) return {pilotEvent:async(actor,event)=>{if(state.pilotThrows===event.phase)throw Error('PRIVATE optional pilot measurement');}};
        if (specifier.endsWith('/api/server')) return load('server');
        throw Error('Unapproved dependency '+specifier);
      },
    }));
    return cache[name] = module.exports;
  }
  return {...state, state, env, context:load('server').apiContext, creation:load('creation'), trips:load('trips'), adopt:load('adopt')};
}
const get = (query = 'requestId='+requestId, actor = actorId) => new Request(
  'https://journeys.test/api/trips/creation'+(query ? '?'+query : ''),
  {headers:actor === null ? {} : {'X-Kinnso-Intent-Actor':actor}},
);
const post = actor => new Request('https://journeys.test/api/trips', {
  method:'POST', headers:{host:'journeys.test', origin:'https://journeys.test', 'content-type':'application/json',
    ...(actor === null ? {} : {'X-Kinnso-Intent-Actor':actor})},
  body:JSON.stringify({requestId, input:{title:'Offline create', timezone:'UTC'}}),
});
const eventNames = h => h.state.events.map(event => event[0]);
async function denied(response, code, status) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  assert.equal('data' in body, false);
  assert.equal(JSON.stringify(body).includes('PRIVATE'), false);
}

for (const actor of [otherActor, '', 'invalid', actorId+', '+otherActor, actorId+'/other', 'x'.repeat(1000)]) {
  test('intent actor '+JSON.stringify(actor.slice(0, 45))+' stops before actor RPC, data, mutation or telemetry', async () => {
    const h = harness();
    const ctx = await h.context(get(undefined, actor), 'trips');
    assert.ok(ctx.response, 'Invalid or changed actor must be rejected');
    await denied(ctx.response, 'AUTH_REQUIRED', 401);
    assert.deepEqual(eventNames(h), ['serverClient', 'getUser']);
  });
}

for (const actor of [actorId, actorId.toUpperCase(), null]) {
  test('matching or absent intent actor '+actor+' preserves fresh authoritative actor validation', async () => {
    const h = harness();
    const ctx = await h.context(get(undefined, actor), 'trips');
    assert.equal(ctx.response, undefined);
    assert.equal(ctx.actor.id, actorId);
    assert.deepEqual(eventNames(h), ['serverClient', 'getUser', 'kinnso_actor', 'observeRequest']);
  });
}

test('actual existing trip POST cannot mutate under another intent actor', async () => {
  const h = harness();
  await denied(await h.trips.POST(post(otherActor)), 'AUTH_REQUIRED', 401);
  assert.deepEqual(eventNames(h), ['serverClient', 'getUser']);
});

test('actual existing trip POST keeps no-header backward compatibility', async () => {
  const h = harness();
  const response = await h.trips.POST(post(null));
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).data, {id:tripId, revision:1});
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.events.find(event => event[0] === 'create_trip_v2')[1])),
    {p_request_id:requestId, p_payload:{title:'Offline create', timezone:'UTC'}});
});

test('creation GET gates authentication before validation and never returns a private payload on denial', async () => {
  for (const options of [{user:null}, {authError:{message:'PRIVATE auth detail'}},
    {actor:null, actorError:{message:'unauthenticated'}}, {actor:{id:otherActor}}]) {
    const h = harness(options);
    assert.equal(typeof h.creation.GET, 'function');
    await denied(await h.creation.GET(get('requestId=bad')), 'AUTH_REQUIRED', 401);
    assert.equal(eventNames(h).includes('get_trip_creation_receipt'), false);
    if (!options.actorError && !options.actor) assert.equal(eventNames(h).includes('kinnso_actor'), false);
  }
  const h = harness();
  assert.equal(typeof h.creation.GET, 'function');
  await denied(await h.creation.GET(get(undefined, otherActor)), 'AUTH_REQUIRED', 401);
  assert.deepEqual(eventNames(h), ['serverClient', 'getUser']);
});

test('creation GET returns only a trip ID or null in a private no-store ApiResult', async () => {
  for (const actor of [actorId, null]) {
    const h = harness({receipt:{tripId, title:'PRIVATE saved title', notes:'PRIVATE saved notes'}});
    assert.equal(typeof h.creation.GET, 'function');
    const response = await h.creation.GET(get(undefined, actor));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok:true, data:{tripId}});
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('vary'), /Cookie/);
    assert.deepEqual(JSON.parse(JSON.stringify(h.state.events.find(event => event[0] === 'get_trip_creation_receipt')[1])), {p_request_id:requestId});
    h.state.receipt = {tripId:null};
    assert.deepEqual(await (await h.creation.GET(get(undefined, actor))).json(), {ok:true, data:{tripId:null}});
  }
});

test('creation GET rejects missing, malformed, duplicate, extra and unbounded query params before receipt RPC', async () => {
  const h = harness();
  assert.equal(typeof h.creation.GET, 'function');
  for (const query of ['', 'requestId=', 'requestId=bad', 'requestId='+requestId+'/x',
    'requestId='+requestId+'&requestId='+requestId, 'requestId='+requestId+'&actorId='+otherActor,
    'requestId='+requestId+'&input=PRIVATE', 'requestId='+'x'.repeat(20000)]) {
    await denied(await h.creation.GET(get(query)), 'INVALID', 400);
  }
  assert.equal(eventNames(h).includes('get_trip_creation_receipt'), false);
});

test('creation GET sanitizes RPC errors and thrown failures without snapshot or credential fallback', async () => {
  for (const [options, code, status] of [
    [{rpcError:{message:'PRIVATE backend detail'}}, 'UNAVAILABLE', 503],
    [{rpcThrows:true}, 'UNAVAILABLE', 503],
    [{rpcError:{message:'unauthenticated PRIVATE'}}, 'AUTH_REQUIRED', 401],
    [{rpcError:{message:'forbidden PRIVATE'}}, 'FORBIDDEN', 403],
  ]) {
    const h = harness(options);
    assert.equal(typeof h.creation.GET, 'function');
    await denied(await h.creation.GET(get()), code, status);
    assert.deepEqual(eventNames(h), ['serverClient', 'getUser', 'kinnso_actor', 'observeRequest', 'get_trip_creation_receipt']);
  }
});

test('creation GET fails closed for malformed successful RPC payloads', async () => {
  for (const receipt of [null, {}, {tripId:42}, {tripId:'PRIVATE'}, {tripId:[]}, [tripId]]) {
    const h = harness({receipt});
    assert.equal(typeof h.creation.GET, 'function');
    await denied(await h.creation.GET(get()), 'UNAVAILABLE', 503);
  }
});

test('creation GET never falls back to service, legacy or ambient credentials when disconnected', async () => {
  for (const options of [
    {noClient:true},
    {env:{KINNSO_ENABLED_CAPABILITIES:''}},
    {env:{KINNSO_SUPABASE_PUBLISHABLE_KEY:''}},
    {env:{KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_secret_forbidden'}},
    {env:{KINNSO_LEGACY_AUTH_ORIGIN:'https://foreign.test'}},
  ]) {
    const h = harness(options);
    Object.assign(h.env, {SUPABASE_URL:'https://fallback.test', SUPABASE_ANON_KEY:'legacy_forbidden',
      SUPABASE_SERVICE_ROLE_KEY:'service_forbidden', KINNSO_SUPABASE_SECRET_KEY:'sb_secret_forbidden'});
    assert.equal(typeof h.creation.GET, 'function');
    await denied(await h.creation.GET(get()), 'UNAVAILABLE', 503);
    assert.deepEqual(eventNames(h), options.noClient ? ['serverClient'] : []);
  }
});

async function receiptSql() {
  const extracted = await readFile(new URL('../SOURCE_METADATA.json', import.meta.url)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error});
  const path = new URL((extracted?'./contracts/':'../../../supabase/migrations/')+migrationName, import.meta.url);
  const source = await readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  assert.ok(source, 'Source-only creation receipt migration must exist');
  return source.replace(/--[^\n]*/g, '');
}

test('SQL source contract authenticates a real session and shares the create actor/request lock before reading receipts', async () => {
  const sql = await receiptSql();
  assert.match(sql, /create function public\.get_trip_creation_receipt\(p_request_id uuid\)/i);
  assert.match(sql, /v_actor uuid\s*:=\s*kinnso_internal\.actor\(\)/);
  assert.match(sql, /if p_request_id is null then raise exception 'invalid_command'/);
  const lock = 'pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0))';
  assert.ok(sql.includes(lock));
  assert.ok(sql.indexOf(lock) < sql.indexOf('from kinnso_internal.trip_requests'));
  assert.match(sql, /actor_id\s*=\s*v_actor and request_id\s*=\s*p_request_id/);
});

test('SQL source contract requires a create digest, initial receipt identity and current ownership without exposing snapshots', async () => {
  const sql = await receiptSql();
  assert.match(sql, /v_prior\.result->'revision' is distinct from '1'::jsonb/);
  assert.match(sql, /v_prior\.result->>'id' is distinct from v_prior\.trip_id::text/);
  assert.match(sql, /for v_mask in 0\.\.7 loop/);
  assert.match(sql, /jsonb_build_object\('title',v_prior\.result->'title'\)/);
  for (const [key, bit] of [['timezone', 1], ['startDate', 2], ['destinationId', 4]]) {
    assert.ok(sql.includes(`(v_mask & ${bit}) <> 0`));
    assert.ok(sql.includes(`jsonb_build_object('${key}',v_prior.result->'${key}')`));
  }
  assert.match(sql, /v_prior\.digest = kinnso_internal\.request_digest\(jsonb_build_object\('type','create','payload',v_payload\)::text\)/);
  assert.match(sql, /select t\.id into v_trip_id from public\.trips t[\s\S]*t\.id\s*=\s*v_prior\.trip_id and t\.owner_user_id\s*=\s*v_actor/);
  assert.match(sql, /return jsonb_build_object\('tripId',v_trip_id\)/);
  assert.doesNotMatch(sql, /return\s+v_prior\.result|snapshot\(|get_trip_snapshot/);
});

test('SQL source contract exposes only authenticated receipt execution and adds no data/schema/role rewrites', async () => {
  const sql = await receiptSql();
  assert.match(sql, /language plpgsql security definer set search_path\s*=\s*''/i);
  assert.match(sql, /revoke all on function public\.get_trip_creation_receipt\(uuid\) from public,anon,authenticated,service_role/i);
  assert.match(sql, /grant execute on function public\.get_trip_creation_receipt\(uuid\) to authenticated/i);
  assert.equal((sql.match(/create function /gi) ?? []).length, 1);
  assert.doesNotMatch(sql, /\b(insert\s+into|update\s+(?:public|kinnso_internal)\.|delete\s+from|alter\s+(?:table|role)|create\s+(?:table|schema)|drop\s+|set\s+role)\b/i);
});


test('create POST transport failure is unknown and never a definite INVALID',async()=>{
 const h=harness({rpcThrows:true});const response=await h.trips.POST(post(actorId));
 await denied(response,'UNAVAILABLE',503);
 assert.equal(eventNames(h).filter(name=>name==='create_trip_v2').length,1);
});
test('create POST malformed input is rejected before a writer is invoked',async()=>{
 const h=harness();const request=new Request('https://journeys.test/api/trips',{method:'POST',
  headers:{host:'journeys.test',origin:'https://journeys.test','content-type':'application/json','X-Kinnso-Intent-Actor':actorId},body:'{'});
 await denied(await h.trips.POST(request),'INVALID',400);
 assert.equal(eventNames(h).includes('create_trip_v2'),false);
});
test('create POST a database validation error retains its explicit invalid classification',async()=>{
 const h=harness({rpcError:{message:'invalid_trip_title',code:'P0001'}});
 await denied(await h.trips.POST(post(actorId)),'INVALID',400);
});
test('create POST keeps a known successful acknowledgement when optional measurement fails',async()=>{
 const h=harness({telemetryThrows:true});const response=await h.trips.POST(post(actorId));
 assert.equal(response.status,201);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.data.id,tripId);
 assert.equal(eventNames(h).filter(name=>name==='create_trip_v2').length,1);
});


test('create POST invalid-looking gateway errors without PostgreSQL proof remain unknown',async()=>{
 for(const code of [undefined,'PGRST000']){
  const h=harness({rpcError:{message:'invalid_gateway_response',...(code?{code}:{})}});
  await denied(await h.trips.POST(post(actorId)),'UNAVAILABLE',503);
 }
});


const adoptPost=()=>new Request('https://journeys.test/api/trips/'+tripId+'/adopt',{
 method:'POST',headers:{host:'journeys.test',origin:'https://journeys.test','content-type':'application/json','X-Kinnso-Intent-Actor':actorId},
 body:JSON.stringify({guideId:otherActor,version:1,expectedRevision:2,requestId,flowId:requestId})
});
const adoptParams={params:Promise.resolve({id:tripId})};
test('adoption POST transport failure is unknown rather than terminal INVALID',async()=>{
 const h=harness({rpcThrows:true});await denied(await h.adopt.POST(adoptPost(),adoptParams),'UNAVAILABLE',503);
 assert.equal(eventNames(h).filter(name=>name==='adopt_guide_to_trip').length,1);
});
for(const phase of ['confirmed','adopted'])test('adoption POST optional '+phase+' measurement cannot lose the durable result',async()=>{
 const h=harness({pilotThrows:phase});const response=await h.adopt.POST(adoptPost(),adoptParams);
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.data.id,tripId);
 assert.equal(eventNames(h).filter(name=>name==='adopt_guide_to_trip').length,1);
});
test('adoption POST invalid-looking gateway responses cannot supply no-write proof',async()=>{
 const h=harness({rpcError:{message:'invalid_gateway_response',code:'PGRST000'}});
 await denied(await h.adopt.POST(adoptPost(),adoptParams),'UNAVAILABLE',503);
});
test('adoption POST PostgreSQL validation rejection remains explicit',async()=>{
 const h=harness({rpcError:{message:'invalid_guide_version',code:'P0001'}});
 await denied(await h.adopt.POST(adoptPost(),adoptParams),'INVALID',400);
});
