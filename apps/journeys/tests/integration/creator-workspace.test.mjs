import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, admin, anonymous } from './local-fixtures.mjs';

const payload = () => ({ title: 'Authored Kyoto walk', city: 'Kyoto', summary: 'A route authored for the local contract test', content: { days: [{ offset: 0, title: 'A real authored day', stops: [{ title: 'Public square', description: 'Creator description', placeId: null, startMinuteOfDay: 600, durationMinutes: 45 }] }] } });
const rpc = async (actor, name, args) => { const result = await actor.client.rpc(name, args); assert.equal(result.error, null, JSON.stringify(result.error)); return result.data; };

test('empty editing days/stops persist and remain unpublishable without inventing content',async()=>{
 const f=await fixture();try{
  const a=await f.actor(true),id=randomUUID(),input=payload();input.content.days[0].stops=[];
  const saved=await rpc(a,'save_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:0,p_request_id:randomUUID(),p_payload:input});
  assert.deepEqual(saved.payload.content.days[0].stops,[]);
  assert.ok((await a.client.rpc('publish_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:1,p_request_id:randomUUID()})).error);
  input.content.days=[];
  const empty=await rpc(a,'save_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:1,p_request_id:randomUUID(),p_payload:input});assert.deepEqual(empty.payload.content.days,[]);
  assert.ok((await a.client.rpc('publish_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:2,p_request_id:randomUUID()})).error);
  const restored=await rpc(a,'save_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:2,p_request_id:randomUUID(),p_payload:payload()});assert.equal(restored.revision,3);
  const result=await rpc(a,'publish_kinnso_guide_draft',{p_draft_id:id,p_expected_revision:3,p_request_id:randomUUID()});assert.equal(result.snapshot.days.length,1);
 }finally{await f.cleanup();}
});

test('creator drafts persist with atomic revision and request replay; published sources keep traveller notes', async () => {
 const f = await fixture();
 try {
  const a = await f.actor(true), b = await f.actor(true), traveller = await f.actor();
  const id = randomUUID(), requestId = randomUUID(), input = payload();
  const args = { p_draft_id: id, p_expected_revision: 0, p_request_id: requestId, p_payload: input };
  const draft = await rpc(a, 'save_kinnso_guide_draft', args);
  assert.equal(draft.revision, 1); assert.equal(draft.publishedVersion, 0);
  assert.deepEqual(await rpc(a, 'save_kinnso_guide_draft', args), draft);
  assert.equal((await a.client.rpc('save_kinnso_guide_draft', { ...args, p_payload: { ...input, title: 'Different' } })).error?.message, 'idempotency_conflict');
  assert.equal((await b.client.rpc('get_kinnso_guide_draft', { p_draft_id: id })).error?.message, 'guide_not_found');
  assert.equal((await anonymous.from('guides').select('id').eq('id', id)).data.length, 0);
  assert.equal((await anonymous.rpc('get_kinnso_guide_draft', { p_draft_id: id })).error?.code, '42501');
  const edits = await Promise.all([1, 2].map(n => a.client.rpc('save_kinnso_guide_draft', { ...args, p_expected_revision: 1, p_request_id: randomUUID(), p_payload: { ...input, title: `Edit ${n}` } })));
  assert.equal(edits.filter(r => !r.error).length, 1); assert.equal(edits.filter(r => r.error?.message === 'revision_conflict').length, 1);
  const current = await rpc(a, 'get_kinnso_guide_draft', { p_draft_id: id }); assert.equal(current.revision, 2);
  const pubArgs = { p_draft_id: id, p_expected_revision: 2, p_request_id: randomUUID() };
  const published = await rpc(a, 'publish_kinnso_guide_draft', pubArgs);
  assert.equal(published.draft.revision, 3); assert.equal(published.snapshot.kind, 'itinerary'); assert.equal(published.snapshot.version, 1);
  assert.deepEqual(await rpc(a, 'publish_kinnso_guide_draft', pubArgs), published);
  const trip = await rpc(traveller, 'create_trip_v2', { p_request_id: randomUUID(), p_payload: { title: 'Private traveller copy', timezone: 'Asia/Tokyo', startDate: null } });
  const adopted = await rpc(traveller, 'adopt_guide_to_trip', { p_guide_id: id, p_version: 1, p_trip_id: trip.id, p_expected_revision: 1, p_request_id: randomUUID() });
  const stop = adopted.days[0].stops[0];
  const noted = await rpc(traveller, 'apply_trip_command', { p_trip_id: trip.id, p_expected_revision: 2, p_request_id: randomUUID(), p_command: { type: 'updateStop', id: stop.id, patch: { travellerNote: 'Private memory' } } });
  await rpc(a, 'withdraw_guide_versions', { p_guide_id: id });
  const after = await rpc(traveller, 'get_trip_snapshot', { p_trip_id: trip.id });
  assert.equal(after.days[0].stops[0].travellerNote, 'Private memory'); assert.equal(after.days[0].stops[0].source.withdrawn, true); assert.equal(after.revision, noted.revision + 1);
  await admin.from('creators').update({ status: 'suspended' }).eq('id', a.id);
  assert.equal((await a.client.rpc('save_kinnso_guide_draft', { ...args, p_expected_revision: 3, p_request_id: randomUUID() })).error?.message, 'creator_required');
  const direct = await a.client.schema('kinnso_internal').from('guide_drafts').update({ revision: 999 }).eq('guide_id', id); assert.ok(direct.error);
 } finally { await f.cleanup(); }
});

test('manual creator confirmation is explicit, atomic, replayable and cannot reinstate a suspended account', async () => {
 const f = await fixture();
 try {
  const a = await f.actor(); const requestId = randomUUID();
  const args = { p_request_id: requestId, p_profile: { bio: 'Manual profile', niches: ['Walking'], content_pillars: [], tone: [], languages: ['en'] }, p_confirmed: true };
  assert.ok((await a.client.rpc('confirm_kinnso_creator_profile', { ...args, p_confirmed: false })).error);
  const result = await rpc(a, 'confirm_kinnso_creator_profile', args); assert.equal(result.status, 'active');
  assert.deepEqual(await rpc(a, 'confirm_kinnso_creator_profile', args), result);
  const dna = await a.client.from('creator_dna').select('final,status,ai_draft').eq('creator_id', a.id).single();
  assert.equal(dna.data.status, 'published'); assert.equal(dna.data.final.bio, 'Manual profile'); assert.equal(dna.data.ai_draft, null);
  await admin.from('creators').update({ status: 'suspended' }).eq('id', a.id);
  assert.equal((await a.client.rpc('confirm_kinnso_creator_profile', { ...args, p_request_id: randomUUID() })).error?.message, 'forbidden');
  assert.equal((await a.client.rpc('confirm_kinnso_creator_profile', { ...args, p_profile: { ...args.p_profile, verified: true } })).error?.message, 'forbidden');
 } finally { await f.cleanup(); }
});

test('incomplete authored drafts persist without publishing or inventing stops; legacy versions remain editable', async () => {
 const f = await fixture(); try {
  const a = await f.actor(true), id = randomUUID(); const incomplete = payload(); incomplete.title = ''; incomplete.content.days[0].stops[0].title = '';
  const draft = await rpc(a, 'save_kinnso_guide_draft', { p_draft_id: id, p_expected_revision: 0, p_request_id: randomUUID(), p_payload: incomplete });
  assert.equal(draft.payload.content.days[0].stops[0].title, '');
  assert.ok((await a.client.rpc('publish_kinnso_guide_draft', { p_draft_id: id, p_expected_revision: 1, p_request_id: randomUUID() })).error);
  const after = await rpc(a, 'get_kinnso_guide_draft', { p_draft_id: id }); assert.equal(after.revision, 1); assert.equal(after.publishedVersion, 0);
  const legacyId = await f.guide(a); await rpc(a, 'publish_guide_version', { p_guide_id: legacyId, p_expected_version: 0, p_request_id: randomUUID(), p_content: payload().content });
  const legacy = await rpc(a, 'get_kinnso_guide_draft', { p_draft_id: legacyId }); assert.equal(legacy.revision, 0); assert.equal(legacy.publishedVersion, 1);
  assert.deepEqual(legacy.payload.content, payload().content);
  const saved = await rpc(a, 'save_kinnso_guide_draft', { p_draft_id: legacyId, p_expected_revision: 0, p_request_id: randomUUID(), p_payload: legacy.payload }); assert.equal(saved.revision, 1);
  await rpc(a, 'publish_guide_version', { p_guide_id: legacyId, p_expected_version: 1, p_request_id: randomUUID(), p_content: payload().content });
  assert.equal((await a.client.rpc('publish_kinnso_guide_draft', { p_draft_id: legacyId, p_expected_revision: 1, p_request_id: randomUUID() })).error?.message, 'revision_conflict');
  const reviewed = await rpc(a, 'save_kinnso_guide_draft', { p_draft_id: legacyId, p_expected_revision: 1, p_request_id: randomUUID(), p_payload: legacy.payload }); assert.equal(reviewed.revision, 2);
  const next = await rpc(a, 'publish_kinnso_guide_draft', { p_draft_id: legacyId, p_expected_revision: 2, p_request_id: randomUUID() }); assert.equal(next.snapshot.version, 3);
 } finally { await f.cleanup(); }
});
