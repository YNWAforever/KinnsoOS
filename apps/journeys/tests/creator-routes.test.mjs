import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url), owner = '00000000-0000-4000-8000-000000000001', id = '00000000-0000-4000-8000-000000000002';
async function handler(path) {
 const r = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'author-session', setup(b) {
  b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: 'fixture', namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: `export async function serverClient(){return globalThis.__creatorRouteClient}` }));
 } }] });
 const module = { exports: {} }; new Function('require', 'module', 'exports', r.outputFiles[0].text)(require, module, module.exports); return module.exports;
}
const guide = await handler('../app/api/creator/guides/[id]/route.ts'), publish = await handler('../app/api/creator/guides/[id]/publish/route.ts'), profile = await handler('../app/api/creator/profile/route.ts');
function setup(t, { enabled = true, revoked = false, error = null } = {}) {
 const env = { KINNSO_SUPABASE_URL: 'https://test.supabase.co', KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://test.supabase.co', KINNSO_LEGACY_AUTH_ORIGIN: 'https://test.supabase.co', KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', KINNSO_SITE_URL: 'https://journeys.example', KINNSO_ENABLED_CAPABILITIES: enabled ? 'creator' : '' };
 const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
 const calls = [];
 globalThis.__creatorRouteClient = { auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, rpc: async (name, args) => { calls.push({ name, args }); return name === 'kinnso_actor' ? { data: revoked ? null : { id: owner }, error: revoked ? { message: 'unauthenticated' } : null } : { data: { id, revision: 2 }, error }; } };
 t.after(() => { delete globalThis.__creatorRouteClient; for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }); return calls;
}
const context = { params: Promise.resolve({ id }) };
const request = (body, origin = 'https://journeys.example', method = 'PUT') => new Request('https://journeys.example/api/creator/guides/' + id, { method, headers: { Host: 'journeys.example', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const body = () => ({ requestId: id, expectedRevision: 1, payload: { title: 'Own authored route' } });
test('creator write rechecks authoritative session and delegates its bounded payload to the atomic draft command', async t => {
 const calls = setup(t), r = await guide.PUT(request(body()), context); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /private, no-store/);
 assert.deepEqual(calls.map(c => c.name), ['kinnso_actor', 'save_kinnso_guide_draft']); assert.equal(calls[1].args.p_draft_id, id); assert.equal(calls[1].args.p_expected_revision, 1); assert.equal(calls[1].args.p_request_id, id);
});
test('creator origin and capability gates deny writes before contacting the backend', async t => {
 let calls = setup(t); assert.equal((await guide.PUT(request(body(), 'https://foreign.example'), context)).status, 403); assert.equal(calls.length, 0);
 process.env.KINNSO_ENABLED_CAPABILITIES = ''; assert.equal((await guide.PUT(request(body()), context)).status, 503); assert.equal(calls.length, 0);
});
test('revoked server session cannot replay a previously successful creator request', async t => {
 const calls = setup(t, { revoked: true }); assert.equal((await publish.POST(request({ requestId: id, expectedRevision: 1 }, undefined, 'POST'), context)).status, 401); assert.deepEqual(calls.map(c => c.name), ['kinnso_actor']);
});
test('draft revision conflict stays a conflict and does not expose backend metadata', async t => {
 setup(t, { error: { message: 'revision_conflict private audit detail', code: 'P0001' } }); const r = await guide.PUT(request(body()), context); assert.equal(r.status, 409); const text = await r.text(); assert.match(text, /CONFLICT/); assert.doesNotMatch(text, /private audit/);
});
test('creator identity injection and oversized chunked payloads never reach a write command', async t => {
 const calls = setup(t); assert.equal((await guide.PUT(request({ ...body(), actorId: owner }), context)).status, 400);
 assert.equal((await guide.PUT(request({ ...body(), payload: { title: 'x'.repeat(262145) } }), context)).status, 400); assert.equal(calls.filter(c => c.name !== 'kinnso_actor').length, 0);
});
test('manual profile submission requires an explicit confirmation and never auto-publishes an AI draft', async t => {
 const calls = setup(t); assert.equal((await profile.POST(request({ requestId: id, profile: {}, confirmed: false }, undefined, 'POST'))).status, 400); assert.equal(calls.filter(c => c.name !== 'kinnso_actor').length, 0);
});
