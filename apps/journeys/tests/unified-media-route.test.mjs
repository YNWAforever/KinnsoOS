import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// The mature service already uses sharp; exercise its real decoder and SDK.
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const owner = '00000000-0000-4000-8000-000000000001';
const media = '00000000-0000-4000-8000-000000000002';
const trip = '00000000-0000-4000-8000-000000000003';
const token = 'a'.repeat(64);
const bytes = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffff' } }).png().toBuffer();

async function handler(path) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['sharp', '@supabase/supabase-js','next/server','next/headers'],
    plugins: [{ name: 'cookie-session', setup(b) {
      b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export async function serverClient() { return {
          auth: {getUser:async()=>({data:{user:{id:'${owner}'}},error:null}),getSession:async()=>({data:{session:{access_token:'owned-user-token'}}})},
          rpc:async(name,args)=>{
            if(name==='prepare_trip_upload'){
              preparationCalls.push({name,args});
              return {data:{id:'${media}',path:'${owner}/${trip}/${media}',state:'pending'},error:null};
            }
            return {data:{id:'${owner}'},error:null};
          },
          from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{object_path:'${owner}/${trip}/${media}',mime:'image/png',state:'ready',trip_id:'${trip}'},error:null})})})})}),
          storage:{from:()=>({createSignedUploadUrl:async(path)=>{
            preparationCalls.push({name:'signed_upload',path});
            return {data:{signedUrl:'https://example.supabase.co/storage/v1/object/upload/sign/kinnso-trip-private/'+path},error:null};
          },download:async(path)=>{
            preparationCalls.push({name:'owner_download',path});
            return {data:new Blob([imageBytes],{type:'image/png'}),error:null};
          }})}
        } }`, loader: 'js' }));
    } }],
  });
  const module = { exports: {} };
  const preparationCalls=[];
  new Function('require', 'module', 'exports', 'preparationCalls', 'imageBytes', result.outputFiles[0].text)(require, module, module.exports,preparationCalls,bytes);
  return Object.assign(module.exports,{preparationCalls});
}
const { POST } = await handler('../app/api/media/finalize/route.ts');
const { GET } = await handler('../app/api/shared-media/[token]/[id]/route.ts');

function environment(t, overrides = {}) {
  const values = {
    KINNSO_ENVIRONMENT: 'production', KINNSO_SITE_URL: 'https://journeys.example',
    KINNSO_SUPABASE_URL: 'https://example.supabase.co', KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://example.supabase.co', KINNSO_LEGACY_AUTH_ORIGIN: 'https://example.supabase.co',
    KINNSO_ENABLED_CAPABILITIES: 'media,sharing', KINNSO_MEDIA_RUNTIME: 'unified',
    KINNSO_SUPABASE_SECRET_KEY: 'sb_secret_test', KINNSO_SERVICES_ORIGIN: undefined, KINNSO_APPROVED_SERVICES_ORIGIN: undefined,
    ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  t.after(() => { for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
}
function backend(t, denied = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://example.supabase.co');
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: owner });
    if (url.pathname === '/rest/v1/rpc/kinnso_actor') return Response.json({ id: owner });
    if (url.pathname === '/rest/v1/kinnso_trip_media') return Response.json({ id: media, owner_id: owner, trip_id: trip, object_path: `${owner}/${trip}/${media}`, mime: 'image/png', byte_size: bytes.length });
    if (url.pathname === '/rest/v1/rpc/get_trip_snapshot') return Response.json({ id: trip });
    if (url.pathname === '/rest/v1/rpc/get_shared_trip_media') {
      assert.deepEqual(JSON.parse(init.body), { p_token: token, p_media_id: media });
      return Response.json(denied ? null : { path: `${owner}/${trip}/${media}`, mime: 'image/png' });
    }
    if (url.pathname.startsWith('/storage/v1/object/')) return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    if (url.pathname === '/rest/v1/rpc/finalize_trip_upload') {
      assert.deepEqual(JSON.parse(init.body), { p_actor_id: owner, p_media_id: media, p_checksum: createHash('sha256').update(bytes).digest('hex') });
      assert.equal(new Headers(init.headers).get('apikey'), 'sb_secret_test');
      return Response.json({ id: media, state: 'ready', ownerId: owner, visibility: 'private' });
    }
    throw Error(`Unexpected backend request: ${url.pathname}`);
  });
  return calls;
}
const request = () => new Request('https://journeys.example/api/media/finalize', { method: 'POST', headers: { Host: 'journeys.example', Origin: 'https://journeys.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: media, checksum: createHash('sha256').update(bytes).digest('hex') }) });
const prepareRequest = () => new Request('https://journeys.example/api/media', {method:'POST',headers:{Host:'journeys.example',Origin:'https://journeys.example','Content-Type':'application/json'},body:JSON.stringify({tripId:trip,requestId:media,mime:'image/png',size:bytes.length})});

test('upload preparation with only the media flag refuses before metadata or signed URL creation',async t=>{
  environment(t,{KINNSO_MEDIA_RUNTIME:undefined,KINNSO_SUPABASE_SECRET_KEY:undefined});
  const handler=await importPrepare();
  const response=await handler.POST(prepareRequest());
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'UNAVAILABLE');
  assert.deepEqual(handler.preparationCalls,[]);
});
test('upload preparation without a unified server key refuses before metadata or signed URL creation',async t=>{
  environment(t,{KINNSO_SUPABASE_SECRET_KEY:undefined});
  const handler=await importPrepare();
  const response=await handler.POST(prepareRequest());
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'UNAVAILABLE');
  assert.deepEqual(handler.preparationCalls,[]);
});
test('configured unified upload prepares its owner-scoped pending object and signed URL',async t=>{
  environment(t);
  const handler=await importPrepare();
  const response=await handler.POST(prepareRequest());
  assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.data.state,'pending');assert.equal(body.data.id,media);
  assert.deepEqual(handler.preparationCalls,[{name:'prepare_trip_upload',args:{p_trip_id:trip,p_request_id:media,p_mime:'image/png',p_size:bytes.length}},{name:'signed_upload',path:`${owner}/${trip}/${media}`}]);
});
async function importPrepare(){return handler('../app/api/media/route.ts')}

test('owner can still read an attached private image without an upload finalizer',async t=>{
  environment(t,{KINNSO_MEDIA_RUNTIME:undefined,KINNSO_SUPABASE_SECRET_KEY:undefined});
  const ownerHandler=await handler('../app/api/media/[id]/route.ts');
  const response=await ownerHandler.GET(new Request('https://journeys.example/api/media/'+media),{params:Promise.resolve({id:media})});
  assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.deepEqual(ownerHandler.preparationCalls,[{name:'owner_download',path:`${owner}/${trip}/${media}`}]);
});

test('unified media finalize reuses owner authentication and actual image decoding without an external service origin', async t => {
  environment(t); const calls = backend(t);
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.state, 'ready');
  assert.ok(calls.includes('/auth/v1/user'));
  assert.ok(calls.includes('/rest/v1/rpc/kinnso_actor'));
  assert.ok(calls.includes('/rest/v1/rpc/finalize_trip_upload'));
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('unified shared image returns bytes only after current share authorization', async t => {
  environment(t); const calls = backend(t);
  const response = await GET(new Request('https://journeys.example/api/shared-media/' + token + '/' + media), { params: Promise.resolve({ token, id: media }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(calls[0], '/rest/v1/rpc/get_shared_trip_media');
});
test('revoked share cannot fetch a private image from unified storage', async t => {
  environment(t); const calls = backend(t, true);
  const response = await GET(new Request('https://journeys.example/api/shared-media/' + token + '/' + media), { params: Promise.resolve({ token, id: media }) });
  assert.equal(response.status, 404);
  assert.deepEqual(calls, ['/rest/v1/rpc/get_shared_trip_media']);
});
test('missing privileged configuration fails closed before contacting storage', async t => {
  environment(t, { KINNSO_SUPABASE_SECRET_KEY: undefined });
  const calls = backend(t);
  assert.equal((await POST(request())).status, 503);
  assert.equal((await GET(new Request('https://journeys.example'), { params: Promise.resolve({ token, id: media }) })).status, 404);
  assert.deepEqual(calls, []);
});

const cronSecret = 'owned-local-cron-token-with-32-characters';
const cleanupRequest = (authorization = 'Bearer ' + cronSecret, origin = 'https://journeys.example') => new Request(origin + '/api/cron/media-cleanup', { headers: { Authorization: authorization } });
async function cleanupHandler() { return (await handler('../app/api/cron/media-cleanup/route.ts')).GET; }
function cleanupBackend(t, options = {}) {
  const calls = [], paths = [`${owner}/${trip}/${media}`];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://example.supabase.co');
    assert.equal(new Headers(init.headers).get('apikey'), 'sb_secret_test');
    calls.push(url.pathname);
    if (url.pathname === '/rest/v1/rpc/claim_kinnso_media_cleanup') return options.claimFailure ? Response.json({ code: 'PGRST202', message: 'Missing claim contract' }, { status: 404 }) : Response.json(options.empty ? [] : paths);
    if (url.pathname === '/storage/v1/object/kinnso-trip-private') {
      assert.equal(init.method, 'DELETE');
      assert.deepEqual(JSON.parse(init.body), { prefixes: paths });
      return options.storageFailure ? Response.json({ message: 'unavailable' }, { status: 503 }) : Response.json([{ name: paths[0] }]);
    }
    if (url.pathname === '/rest/v1/rpc/kinnso_media_cleanup_ack') {
      assert.deepEqual(JSON.parse(init.body), { p_paths: paths });
      return options.ackFailure ? Response.json({ message: 'unavailable' }, { status: 503 }) : Response.json(null);
    }
    throw Error(`Unexpected cleanup request: ${url.pathname}`);
  });
  return calls;
}
test('cleanup rejects absent/wrong cron credentials and other origins before any backend call', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t), cleanup = await cleanupHandler();
  assert.equal((await cleanup(cleanupRequest('Bearer wrong'))).status, 401);
  assert.equal((await cleanup(cleanupRequest('', 'https://journeys.example'))).status, 401);
  assert.equal((await cleanup(cleanupRequest(undefined, 'https://preview.example'))).status, 403);
  delete process.env.CRON_SECRET;
  assert.equal((await cleanup(cleanupRequest())).status, 401);
  assert.deepEqual(calls, []);
});
test('cleanup without the approved privileged backend fails closed', async t => {
  environment(t, { CRON_SECRET: cronSecret, KINNSO_SUPABASE_SECRET_KEY: undefined });
  const calls = cleanupBackend(t), cleanup = await cleanupHandler();
  assert.equal((await cleanup(cleanupRequest())).status, 503);
  assert.deepEqual(calls, []);
});
test('cleanup removes only queued private objects and acknowledges after storage success', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t), cleanup = await cleanupHandler();
  const response = await cleanup(cleanupRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { removed: 1 } });
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(calls, ['/rest/v1/rpc/claim_kinnso_media_cleanup', '/storage/v1/object/kinnso-trip-private', '/rest/v1/rpc/kinnso_media_cleanup_ack']);
});
test('failed storage removal leaves cleanup work unacknowledged for retry', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t, { storageFailure: true }), cleanup = await cleanupHandler();
  assert.equal((await cleanup(cleanupRequest())).status, 503);
  assert.deepEqual(calls, ['/rest/v1/rpc/claim_kinnso_media_cleanup', '/storage/v1/object/kinnso-trip-private']);
});
test('failed acknowledgement reports retryable failure instead of completed cleanup', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t, { ackFailure: true }), cleanup = await cleanupHandler();
  const response = await cleanup(cleanupRequest());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).retryable, true);
  assert.equal(calls.at(-1), '/rest/v1/rpc/kinnso_media_cleanup_ack');
});
test('an empty cleanup queue does not issue a storage delete or acknowledgement', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t, { empty: true }), cleanup = await cleanupHandler();
  const response = await cleanup(cleanupRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { removed: 0 } });
  assert.deepEqual(calls, ['/rest/v1/rpc/claim_kinnso_media_cleanup']);
});
test('an unmigrated cleanup backend cannot delete any storage objects', async t => {
  environment(t, { CRON_SECRET: cronSecret }); const calls = cleanupBackend(t, { claimFailure: true }), cleanup = await cleanupHandler();
  assert.equal((await cleanup(cleanupRequest())).status, 503);
  assert.deepEqual(calls, ['/rest/v1/rpc/claim_kinnso_media_cleanup']);
});
