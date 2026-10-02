/**
 * Run: node --test frontend-model-tests.mjs
 * Override source: KINNSO_MODEL_PATH=/absolute/path/app/travel/model.ts node --test ...
 * The Site is read only: only the temporary transpiled module and in-memory state change.
 */
import assert from 'node:assert/strict';
import {after, beforeEach, test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourcePath = resolve(process.env.KINNSO_MODEL_PATH || new URL('../app/travel/model.ts', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch {
  try { ts = createRequire(pathToFileURL(sourcePath))('typescript'); }
  catch {
    if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install typescript or set CODEX_PRIMARY_RUNTIME_NODE_MODULES.');
    ts = require(join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'typescript'));
  }
}
const temporary = await mkdtemp(join(tmpdir(), 'kinnso-model-tests-'));
const compiledPath = join(temporary, 'model.mjs');
const transpiled = ts.transpileModule(await readFile(sourcePath, 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
  fileName: sourcePath,
  reportDiagnostics: true,
});
assert.equal((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, 'TypeScript transpilation errors');
await writeFile(compiledPath, transpiled.outputText);
const m = await import(pathToFileURL(compiledPath).href);
after(() => rm(temporary, {recursive: true, force: true}));

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(String(key)) ?? null,
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(String(key)),
  clear: () => memory.clear(),
};
globalThis.window = new EventTarget();
let sequence = 0;
const key = prefix => `${prefix}-${++sequence}`;
const clone = (title = 'Test itinerary', date = '') => m.clone('kyoto-slow-days', title, date, key('clone'));
const current = id => m.read().trips.find(t => t.id === id);
const error = (fn, code) => assert.throws(fn, e => e instanceof m.AppError && e.code === code, code);
const persisted = value => JSON.parse(JSON.stringify(value));
const full = currency => m.earningsView(currency, '2026-09-01', '2026-09-30');
const saveNote = (trip, note) => m.save({...structuredClone(trip), note}, trip.revision, key('save'));
beforeEach(() => {memory.clear(); m.fault('none'); m.session('owner');});

test('clone: stable retry, explicit dates, fresh IDs, and independent source content', () => {
  const source = structuredClone(m.fixtures[0]);
  const first = m.clone(source.slug, 'October Kyoto', '2026-10-15', 'stable-clone');
  const retry = m.clone(source.slug, 'October Kyoto', '2026-10-15', 'stable-clone');
  assert.deepEqual(retry, first);
  assert.equal(m.read().trips.length, 1);
  assert.equal(first.date, '2026-10-15');
  assert.equal(first.timezone, 'Asia/Tokyo');
  assert.equal(first.owner, 'demo-owner');
  assert.equal(first.purpose, 'personal');
  const sourceIds = new Set([source.id, ...source.days.flatMap(d => [d.id, ...d.stops.map(s => s.id)])]);
  const ids = [first.id, ...first.days.flatMap(d => [d.id, ...d.stops.map(s => s.id)])];
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.every(id => !sourceIds.has(id)));
  assert.ok(first.days.flatMap(d => d.stops).every(s => s.status === 'planned' && s.personalNote === '' && s.origin.version === 1));
  const edited = structuredClone(first);
  edited.days[0].stops[0].name = m.w('My independent edit', '我的修改');
  m.save(edited, first.revision, 'edit-copy');
  assert.deepEqual(m.fixtures[0], source);
  assert.equal(clone('Undated trip').date, '');
  error(() => m.clone(source.slug, 'Different payload', '2026-10-15', 'stable-clone'), 'IDEMPOTENCY_CONFLICT');
});

test('clone and private trips are scoped to each owner, including identical retry keys', () => {
  const first = m.clone('kyoto-slow-days', 'Same title', '', 'same-key');
  m.session('other');
  const other = m.clone('kyoto-slow-days', 'Same title', '', 'same-key');
  assert.notEqual(first.id, other.id);
  assert.equal(other.owner, 'demo-other');
  assert.deepEqual(m.tripsFor(m.read()).map(t => t.id), [other.id]);
  error(() => m.save(first, first.revision, 'foreign-save'), 'FORBIDDEN');
  error(() => m.publish(first, 'foreign-publish'), 'FORBIDDEN');
  m.session('owner');
  assert.deepEqual(m.tripsFor(m.read()).map(t => t.id), [first.id]);
});

test('save: optimistic revision checks and protected ownership/publication metadata', () => {
  const trip = clone();
  const publication = m.publish(trip, 'publish');
  const saved = m.save({...trip, owner: 'demo-other', publicationSlug: 'forged', publishedRevision: 999}, trip.revision, 'save');
  assert.equal(saved.owner, 'demo-owner');
  assert.equal(saved.publicationSlug, publication.slug);
  assert.equal(saved.publishedRevision, trip.revision);
  assert.equal(saved.revision, trip.revision + 1);
  error(() => m.save(trip, trip.revision, 'stale-save'), 'REVISION_CONFLICT');
  assert.deepEqual(current(trip.id), saved);
});

test('AI proposals: reviewed edits apply once and retain private defaults', () => {
  const trip = saveNote(clone(), 'First private idea\nSecond private idea');
  const proposal = m.propose(trip, 'organise', 'proposal');
  const reviewed = {...proposal, changes: proposal.changes.map((c, i) => ({...c, name: i ? c.name : 'Reviewed place', selected: i === 0}))};
  const applied = m.apply(reviewed, 'apply');
  assert.equal(m.count(applied), m.count(trip) + 1);
  const added = applied.days[0].stops.at(-1);
  assert.equal(added.name.en, 'Reviewed place');
  assert.equal(added.public, false);
  assert.equal(added.status, 'suggested');
  assert.equal(added.lat, null);
  assert.equal(added.lng, null);
  assert.deepEqual(m.apply(reviewed, 'apply'), applied);
  assert.equal(m.count(current(trip.id)), m.count(applied));
  error(() => m.apply(reviewed, 'another-apply'), 'APPROVAL_INVALID');
});

test('AI proposals: stale revisions cannot be repaired by modifying the submitted revision', () => {
  const trip = saveNote(clone(), 'Private idea');
  const proposal = m.propose(trip, 'organise', 'proposal');
  const changed = saveNote(trip, 'Changed private idea');
  error(() => m.apply(proposal, 'stale'), 'REVISION_CONFLICT');
  error(() => m.apply({...proposal, revision: changed.revision}, 'tampered-revision'), 'APPROVAL_INVALID');
  assert.deepEqual(current(trip.id), persisted(changed));
});

test('AI proposals: reject target/kind/change-ID tampering without mutating either trip', () => {
  const trip = saveNote(clone(), 'Private idea');
  const other = clone('Another owned trip');
  const proposal = m.propose(trip, 'organise', 'proposal');
  const changes = [
    {...proposal, tripId: other.id},
    {...proposal, kind: 'three'},
    {...proposal, changes: [{id: 'unknown', name: 'Injected', selected: true}]},
    {...proposal, changes: [proposal.changes[0], proposal.changes[0]]},
    {...proposal, changes: [{...proposal.changes[0], selected: 'false'}]},
  ];
  for (const tampered of changes) error(() => m.apply(tampered, key('tampered')), 'APPROVAL_INVALID');
  assert.deepEqual(current(trip.id), persisted(trip));
  assert.deepEqual(current(other.id), other);
});

test('AI proposals: expired and cancelled approvals cannot apply', () => {
  const trip = saveNote(clone(), 'Private idea');
  const expired = m.propose(trip, 'organise', 'expired');
  const state = m.read();
  state.proposals.find(p => p.id === expired.id).expires = Date.now() - 1;
  m.write(state);
  error(() => m.apply(expired, 'expired-apply'), 'APPROVAL_EXPIRED');
  const cancelled = m.propose(trip, 'organise', 'cancelled');
  m.cancelProposal(cancelled.id);
  error(() => m.apply(cancelled, 'cancelled-apply'), 'APPROVAL_INVALID');
  assert.deepEqual(current(trip.id), persisted(trip));
});

test('authorization runs before cached clone/save/publish/payout results are replayed', () => {
  const trip = m.clone('kyoto-slow-days', 'Cached trip', '', 'clone');
  const input = {...trip, note: 'Saved private note'};
  const saved = m.save(input, trip.revision, 'save');
  m.publish(saved, 'publish');
  m.payout('HKD', 'payout');
  m.session('viewer');
  error(() => m.clone('kyoto-slow-days', 'Cached trip', '', 'clone'), 'FORBIDDEN');
  error(() => m.save(input, trip.revision, 'save'), 'FORBIDDEN');
  error(() => m.publish(saved, 'publish'), 'FORBIDDEN');
  error(() => m.payout('HKD', 'payout'), 'FORBIDDEN');
  m.session('editor');
  assert.equal(m.clone('kyoto-slow-days', 'Cached trip', '', 'clone').id, trip.id);
  assert.equal(m.read().trips.length, 1, 'allowed role-change retry must not create a duplicate');
  assert.deepEqual(m.save(input, trip.revision, 'save'), persisted(saved));
  error(() => m.publish(saved, 'publish'), 'FORBIDDEN');
  error(() => m.payout('HKD', 'payout'), 'FORBIDDEN');
  m.session(null);
  error(() => m.clone('kyoto-slow-days', 'Cached trip', '', 'clone'), 'SIGN_IN_REQUIRED');
});

test('idempotency namespaces keep bookmarks and withdrawals independent', () => {
  const publication = m.publish(clone(), 'publish');
  m.bookmark(publication.slug, 'shared-key');
  const result = m.withdraw(publication.slug, 'shared-key');
  assert.deepEqual(result, {slug: publication.slug, active: false});
  assert.equal(m.findPublic(m.read(), publication.slug), undefined);
});

test('public allowlist excludes private notes, hidden stops, audio, metadata and unselected media', () => {
  const trip = clone();
  const publicStop = trip.days[0].stops[0];
  trip.note = 'SECRET_JOURNAL';
  trip.privateUnknownField = 'SECRET_TOP_LEVEL';
  publicStop.personalNote = 'SECRET_STOP_NOTE';
  publicStop.privateUnknownField = 'SECRET_STOP_FIELD';
  publicStop.origin.privateToken = 'SECRET_ORIGIN_FIELD';
  trip.days[0].stops[1].public = false;
  trip.days[0].stops[1].name = m.w('SECRET_HIDDEN_STOP', 'SECRET_HIDDEN_STOP');
  trip.media = [
    {id: 'audio', name: 'SECRET_AUDIO_NAME', url: 'data:audio/webm;base64,SECRET_AUDIO', public: true, status: 'ready', stopId: publicStop.id},
    {id: 'private-photo', name: 'SECRET_PHOTO_NAME', url: 'data:image/jpeg;base64,SECRET_PHOTO', public: false, status: 'ready'},
    {id: 'queued-photo', name: 'Queued', url: 'data:image/jpeg;base64,SECRET_QUEUED', public: true, status: 'processing'},
    {id: 'public-photo', name: 'SELECTED_FILE_METADATA', url: 'data:image/jpeg;base64,UFVCTElD', public: true, status: 'ready', stopId: publicStop.id, exif: 'SECRET_EXIF'},
  ];
  const publication = m.preview(trip);
  const serialized = JSON.stringify(publication);
  assert.ok(!serialized.includes('SECRET_'));
  assert.ok(!serialized.includes('SELECTED_FILE_METADATA'));
  assert.equal(publication.image, 'data:image/jpeg;base64,UFVCTElD');
  assert.equal(publication.days[0].stops[0].image, publication.image);
  assert.deepEqual(publication.days[0].stops[0].origin, {slug: 'kyoto-slow-days', version: 1, creator: 'mika', stopId: 'k-1'});
  assert.ok(publication.days.flatMap(d => d.stops).every(s => s.personalNote === ''));
  for (const field of ['owner', 'media', 'date', 'timezone', 'savedAt', 'note', 'privateUnknownField']) assert.ok(!(field in publication));
});

test('publication v1/v2 snapshots are separate from saved and unsaved private revisions', () => {
  const trip = clone('Original title');
  const unsaved = {...trip, title: 'UNSAVED_TITLE'};
  const v1 = m.publish(unsaved, 'v1');
  assert.equal(v1.title.en, 'Original title');
  const copied = m.clone(v1.slug, 'Version one copy', '', 'copy-v1');
  const edited = {...current(trip.id), title: 'Second title', note: 'SECRET_SAVED_NOTE'};
  edited.days = structuredClone(edited.days);
  edited.days[0].stops[0].name = m.w('Updated public place', '新地點');
  const saved = m.save(edited, edited.revision, 'save-v2');
  assert.equal(m.findPublic(m.read(), v1.slug).title.en, 'Original title');
  const v2 = m.publish(saved, 'v2');
  assert.equal(v2.slug, v1.slug);
  assert.equal(v2.version, 2);
  assert.equal(m.findPublic(m.read(), v1.slug).title.en, 'Second title');
  assert.equal(m.read().publications.find(p => p.slug === v1.slug && p.version === 1).title.en, 'Original title');
  assert.equal(copied.days[0].stops[0].origin.version, 1);
  assert.equal(copied.days[0].stops[0].name.en, 'Ginkaku-ji');
  assert.equal(m.effectiveStop(m.read(), copied.days[0].stops[0]).name.en, 'Ginkaku-ji');
  assert.ok(!JSON.stringify(v2).includes('SECRET_SAVED_NOTE'));
  v2.days[0].stops[0].name.en = 'Mutated returned snapshot';
  assert.equal(m.findPublic(m.read(), v1.slug).days[0].stops[0].name.en, 'Updated public place');
});

test('withdrawal removes public discovery, blocks reuse and preserves only personal notes on withdrawn references', () => {
  const publication = m.publish(clone(), 'publish-source');
  let copied = m.clone(publication.slug, 'Dependent copy', '', 'copy');
  copied.days[0].stops[0].personalNote = 'MY_OWN_NOTE';
  copied = m.save(copied, copied.revision, 'save-copy');
  assert.equal(m.preview(copied).days[0].stops[0].origin.slug, publication.slug);
  m.withdraw(publication.slug, 'withdraw');
  assert.equal(m.findPublic(m.read(), publication.slug), undefined);
  error(() => m.clone(publication.slug, '', '', 'new-copy'), 'SOURCE_UNAVAILABLE');
  error(() => m.addStop(publication.slug, publication.days[0].stops[0].id, copied.id, copied.days[0].id, copied.revision, 'new-stop'), 'SOURCE_UNAVAILABLE');
  const effective = m.effectiveStop(m.read(), copied.days[0].stops[0]);
  assert.equal(effective.name.en, 'Source withdrawn');
  assert.equal(effective.personalNote, 'MY_OWN_NOTE');
  assert.equal(effective.lat, null);
  assert.equal(effective.lng, null);
  assert.equal(effective.image, undefined);
  assert.equal(m.preview(copied).days.length, 0);
  error(() => m.publish(copied, 'republish-withdrawn'), 'PUBLICATION_INCOMPLETE');
});

test('earnings: currencies remain separate and refunds preserve original payment history', () => {
  const hkd = full('HKD');
  const jpy = full('JPY');
  assert.deepEqual({eligible: hkd.eligible, paid: hkd.paid, pending: hkd.pending, estimated: hkd.estimated, reserved: hkd.reserved, adjustment: hkd.adjustment}, {eligible: 240, paid: 1200, pending: 240, estimated: 150, reserved: 320, adjustment: -240});
  assert.deepEqual({eligible: jpy.eligible, paid: jpy.paid, adjustment: jpy.adjustment}, {eligible: 3000, paid: 8000, adjustment: -1200});
  assert.ok(hkd.entries.every(e => e.currency === 'HKD'));
  assert.ok(jpy.entries.every(e => e.currency === 'JPY'));
  for (const entry of m.earnings.filter(e => e.adjusts)) {
    const original = m.earnings.find(e => e.id === entry.adjusts);
    assert.equal(original.state, 'paid');
    assert.equal(original.currency, entry.currency);
    assert.ok(original.amount > 0 && entry.amount < 0);
    assert.ok(original.reference);
  }
  error(() => m.earningsView('USD', '2026-09-01', '2026-09-30'), 'CONTRACT_ERROR');
});

test('payout: atomic net reservations, stable retry, no double allocation, and independent currencies', () => {
  const paidBefore = structuredClone(m.earnings.filter(e => e.state === 'paid'));
  const request = m.payout('HKD', 'hkd');
  assert.equal(request.amount, 240);
  assert.equal(new Set(request.allocations).size, request.allocations.length);
  assert.equal(request.allocations.reduce((sum, id) => sum + m.earnings.find(e => e.id === id).amount, 0), request.amount);
  assert.deepEqual(m.payout('HKD', 'hkd'), request);
  assert.equal(m.read().payouts.length, 1);
  error(() => m.payout('HKD', 'second-hkd'), 'ALREADY_RESERVED');
  assert.equal(full('HKD').eligible, 0);
  assert.equal(full('HKD').reserved, 560);
  assert.equal(full('JPY').eligible, 3000);
  const japan = m.payout('JPY', 'jpy');
  assert.equal(japan.amount, 3000);
  assert.ok(japan.allocations.every(id => !request.allocations.includes(id)));
  assert.equal(full('JPY').eligible, 0);
  assert.equal(full('JPY').reserved, 3000);
  assert.deepEqual(m.earnings.filter(e => e.state === 'paid'), paidBefore);
  m.session('other');
  assert.equal(full('HKD').entries.length, 0);
  error(() => m.payout('HKD', 'other-owner'), 'NO_BALANCE');
});

test('payout: uncertain attempts remain reserved; a terminal failed attempt releases its allocations', () => {
  const request = m.payout('HKD', 'request');
  let state = m.read();
  state.payouts.find(p => p.id === request.id).state = 'uncertain';
  m.write(state);
  assert.equal(full('HKD').eligible, 0);
  error(() => m.payout('HKD', 'pay-again'), 'ALREADY_RESERVED');
  state = m.read();
  state.payouts.find(p => p.id === request.id).state = 'failed';
  m.write(state);
  assert.equal(full('HKD').eligible, 240);
  assert.equal(full('HKD').reserved, 320);
  const retry = m.payout('HKD', 'new-attempt');
  assert.notEqual(retry.id, request.id);
  assert.equal(full('HKD').eligible, 0);
  assert.equal(full('HKD').reserved, 560);
  assert.equal(full('HKD').paid, 1200);
});

const malformedTrips = [
  ['empty days', t => {t.days = [];}],
  ['invalid timezone', t => {t.timezone = 'Invalid/Timezone';}],
  ['invalid date format', t => {t.date = '15/10/2026';}],
  ['impossible calendar date', t => {t.date = '2026-02-30';}],
  ['invalid purpose', t => {t.purpose = 'public';}],
  ['fractional revision', t => {t.revision = 1.5;}],
  ['non-string ID', t => {t.id = 42;}],
  ['unpaired coordinates', t => {t.days[0].stops[0].lat = null;}],
  ['out-of-range coordinates', t => {t.days[0].stops[0].lat = 91;}],
  ['nested private translation field', t => {t.days[0].stops[0].name.privateNote = 'secret';}],
  ['non-boolean media visibility', t => {t.media = [{id: 'media', name: 'Photo', status: 'ready', url: 'data:image/jpeg;base64,eA==', public: 'false'}];}],
  ['null day', t => {t.days = [null];}],
  ['null stop', t => {t.days[0].stops = [null];}],
  ['null media', t => {t.media = [null];}],
];
for (const [name, mutate] of malformedTrips) test(`validation rejects ${name} as CONTRACT_ERROR`, () => {
  const trip = clone();
  mutate(trip);
  error(() => m.validateTrip(trip), 'CONTRACT_ERROR');
});

test('storage: invalid schemas/JSON fail explicitly and successful writes emit change events', () => {
  let events = 0;
  const onChange = () => events++;
  window.addEventListener('kinnso-change', onChange);
  m.write(m.read());
  window.removeEventListener('kinnso-change', onChange);
  assert.equal(events, 1);
  localStorage.setItem(m.KEY, JSON.stringify({...m.blank(), schema: 1}));
  error(() => m.read(), 'CONTRACT_ERROR');
  localStorage.setItem(m.KEY, '{invalid-json');
  error(() => m.read(), 'STORAGE_ERROR');
});

function seedAccount(role, label) {
  m.session(role);
  const trip = saveNote(clone(`${label}_TITLE`), `${label}_PRIVATE_NOTE`);
  const publication = m.publish(trip, key('publication'));
  const proposal = m.propose(current(trip.id), 'organise', key('proposal'));
  m.bookmark(label === 'JAMIE' ? 'kyoto-slow-days' : 'lisbon-beyond-the-postcard', key('bookmark'));
  const state = m.read();
  const owner = state.session.id;
  state.missions.push({id: `demo-${label}-mission`, owner, state: 'submitted', note: `${label}_MISSION_SECRET`});
  state.receipts.push({id: `demo-${label}-receipt`, owner, state: 'submitted', name: `${label}_RECEIPT_SECRET.pdf`});
  state.payouts.push({id: `demo-${label}-payout`, owner, currency: 'HKD', amount: 1, state: 'reserved', allocations: [`${label}_ALLOCATION`]});
  state.ops[`${owner}:private-cache`] = {hash: 'fixture', result: `${label}_CACHED_SECRET`};
  m.write(state);
  return {trip, publication, proposal, owner};
}

test('account backup contains only the current account and never exports operation caches or sessions', () => {
  const jamie = seedAccount('owner', 'JAMIE');
  const alex = seedAccount('other', 'ALEX');
  m.session('owner');
  const backup = m.exportAccount(m.read());
  assert.deepEqual(backup.trips.map(t => t.id), [jamie.trip.id]);
  assert.deepEqual(backup.publications.map(p => p.slug), [jamie.publication.slug]);
  assert.deepEqual(backup.proposals.map(p => p.id), [jamie.proposal.id]);
  assert.deepEqual(backup.bookmarks, ['kyoto-slow-days']);
  for (const field of ['missions', 'receipts', 'payouts']) assert.ok(backup[field].every(row => row.owner === jamie.owner));
  const serialized = JSON.stringify(backup);
  assert.ok(serialized.includes('JAMIE_PRIVATE_NOTE'));
  assert.ok(!serialized.includes('ALEX_'));
  assert.ok(!serialized.includes('CACHED_SECRET'));
  assert.ok(!('ops' in backup));
  assert.ok(!('session' in backup));
  m.session('other');
  const other = m.exportAccount(m.read());
  assert.deepEqual(other.trips.map(t => t.id), [alex.trip.id]);
  assert.ok(!JSON.stringify(other).includes('JAMIE_'));
  m.session(null);
  error(() => m.exportAccount(m.read()), 'SIGN_IN_REQUIRED');
});

test('leaving one account removes only its private records/publications/caches and signs out', () => {
  const jamie = seedAccount('owner', 'JAMIE');
  const alex = seedAccount('other', 'ALEX');
  m.session('owner');
  m.leaveAccount();
  const state = m.read();
  assert.equal(state.session, null);
  assert.deepEqual(state.trips.map(t => t.id), [alex.trip.id]);
  assert.deepEqual(state.publications.map(p => p.slug), [alex.publication.slug]);
  assert.deepEqual(state.proposals.map(p => p.id), [alex.proposal.id]);
  assert.equal(state.bookmarks[jamie.owner], undefined);
  assert.deepEqual(state.bookmarks[alex.owner], ['lisbon-beyond-the-postcard']);
  for (const field of ['missions', 'receipts', 'payouts']) assert.ok(state[field].every(row => row.owner === alex.owner));
  assert.ok(Object.keys(state.ops).every(k => !k.startsWith(jamie.owner + ':')));
  assert.ok(Object.keys(state.ops).some(k => k.startsWith(alex.owner + ':')));
  assert.ok(!JSON.stringify(state).includes('JAMIE_'));
});
