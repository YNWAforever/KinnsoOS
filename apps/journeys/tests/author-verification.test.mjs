import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationUrl} from './packaged-source.mjs';

const contracts = await import('../lib/content-honesty/contracts.ts');
const author = await import('../lib/content-honesty/author.ts');

const app = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => readFileSync(path.join(app, relative), 'utf8');
const migration = readFileSync(migrationUrl('20261109130000_author_verification.sql', import.meta.url), 'utf8');
const compact = migration.replace(/\s+/g, ' ');

const URL_PREFIX = 'https://';
const ATTESTED = '2026-11-09T00:00:00Z';
const PLACE = '2026-11-08T00:00:00Z';

const source = (title, url) => (url === undefined ? {title} : {title, url});

/** A complete creator payload for the status-parity checks. */
const honesty = (overrides = {}) => {
  const facts = {
    synthetic: false,
    sourceCount: 0,
    placeVerifiedAt: null,
    attestedAt: null,
    ...overrides,
  };
  return {
    id: '00000000-0000-4000-8000-000000000001',
    status: contracts.guideHonestyStatus(facts),
    synthetic: facts.synthetic,
    rightsBasis: 'original',
    sourceCount: facts.sourceCount,
    placeVerifiedAt: facts.placeVerifiedAt,
    attestedAt: facts.attestedAt,
    latestAttestedVersion: null,
    published: false,
    sources: [],
    ...overrides,
  };
};

// ---------------------------------------------------------------------------
// Source-reference parser (mirrors kinnso_guide_set_sources validation)
// ---------------------------------------------------------------------------

test('a source list is accepted as 0..20 {title, url?} entries and titles are trimmed', () => {
  assert.deepEqual(contracts.parseSourcesInput({sources: []}), {sources: []});
  assert.deepEqual(contracts.parseSourcesInput({sources: [source(' Field notes ')]}), {sources: [source('Field notes')]});
  assert.deepEqual(
    contracts.parseSourcesInput({sources: [source(' Official guide ', 'https://example.com/a?b=c#d')]}),
    {sources: [source('Official guide', 'https://example.com/a?b=c#d')]},
  );
  assert.equal(contracts.MAX_GUIDE_SOURCES, 20);
  assert.equal(contracts.SOURCE_TITLE_MAX, 200);
  assert.equal(contracts.SOURCE_URL_MAX, 500);
  const full = Array.from({length: 20}, (_, index) => source(`Source ${index}`, `https://example.com/${index}`));
  assert.equal(contracts.parseSourcesInput({sources: full})?.sources.length, 20);
  assert.equal(contracts.parseSourcesInput({sources: [...full, source('one too many', 'https://example.com/20')]}), null);
});

test('only https urls of 1..500 non-whitespace characters are accepted', () => {
  assert.ok(contracts.isValidSourceUrl(`${URL_PREFIX}example.com/x`));
  for (const url of [
    'http://example.com/x',
    'HTTP://example.com/x',
    'ftp://example.com/x',
    '//example.com/x',
    'example.com/x',
    `${URL_PREFIX}`,
    `${URL_PREFIX}exa mple.com`,
    `${URL_PREFIX}example.com/ x`,
    ` ${URL_PREFIX}example.com/x`,
    `${URL_PREFIX}example.com/x `,
    `${URL_PREFIX}example.com/x\n`,
  ]) assert.equal(contracts.isValidSourceUrl(url), false, url);
  assert.ok(contracts.isValidSourceUrl(URL_PREFIX + 'a'.repeat(500)), '500 characters fill the path bound');
  assert.equal(contracts.isValidSourceUrl(URL_PREFIX + 'a'.repeat(501)), false, '501 characters exceed it');
  assert.equal(contracts.isValidSourceUrl(42), false);
});

test('titles are trimmed of ASCII spaces and counted in PostgreSQL characters', () => {
  assert.ok(contracts.isValidSourceTitle('A'));
  assert.ok(contracts.isValidSourceTitle(`  ${'x'.repeat(200)}  `));
  assert.equal(contracts.isValidSourceTitle('  '), false);
  assert.equal(contracts.isValidSourceTitle(''), false);
  assert.equal(contracts.isValidSourceTitle('x'.repeat(201)), false);
  // char_length counts code points: 200 astral characters are 400 UTF-16 units.
  assert.ok(contracts.isValidSourceTitle('😀'.repeat(200)));
  assert.equal(contracts.isValidSourceTitle('😀'.repeat(201)), false);
  // btrim only removes ASCII spaces, so a newline still counts and is stored.
  assert.ok(contracts.isValidSourceTitle(`\n${'x'.repeat(199)}`));
  assert.ok(contracts.isValidSourceTitle('\n'));
});

test('the source parser rejects malformed items, unknown keys and non-array bodies', () => {
  const bad = [
    {sources: [null]},
    {sources: ['https://example.com']},
    {sources: [[]]},
    {sources: [{title: 7}]},
    {sources: [{title: null}]},
    {sources: [{title: 'x'.repeat(201)}]},
    {sources: [{title: ''}]},
    {sources: [{title: '   '}]},
    {sources: [{url: 'https://example.com'}]},
    {sources: [{title: 'ok', extra: true}]},
    {sources: [{title: 'ok', url: null}]},
    {sources: [{title: 'ok', url: 7}]},
    {sources: [{title: 'ok', url: 'http://example.com'}]},
    {sources: [{title: 'ok', url: 'https://example.com/' + 'a'.repeat(500)}]},
    {sources: 'https://example.com'},
    {sources: null},
    {sources: {}},
    {},
    {sources: [], extra: true},
    null,
    undefined,
    [],
    'sources',
    42,
    true,
  ];
  for (const value of bad) assert.equal(contracts.parseSourcesInput(value), null, JSON.stringify(value)?.slice(0, 120));
  assert.deepEqual(contracts.parseSourcesInput({sources: [source('b'), source('a'), source('b')]}), {
    sources: [source('b'), source('a'), source('b')],
  });
});

// ---------------------------------------------------------------------------
// Evidence parser (mirrors kinnso_ops_set_evidence arguments)
// ---------------------------------------------------------------------------

test('a valid evidence patch carries at least one effective field', () => {
  assert.deepEqual(contracts.parseEvidenceInput({synthetic: true}), {synthetic: true});
  assert.deepEqual(contracts.parseEvidenceInput({synthetic: false}), {synthetic: false});
  assert.deepEqual(contracts.parseEvidenceInput({placeVerifiedAt: '2026-11-09'}), {placeVerifiedAt: '2026-11-09'});
  assert.deepEqual(contracts.parseEvidenceInput({placeVerifiedAt: null}), {placeVerifiedAt: null});
  assert.deepEqual(contracts.parseEvidenceInput({clearPlace: true}), {clearPlace: true});
  assert.deepEqual(contracts.parseEvidenceInput({synthetic: true, placeVerifiedAt: '2026-11-09'}), {
    synthetic: true,
    placeVerifiedAt: '2026-11-09',
  });
  assert.deepEqual(contracts.parseEvidenceInput({synthetic: false, clearPlace: true}), {
    synthetic: false,
    clearPlace: true,
  });
});

test('an evidence patch requires a real YYYY-MM-DD calendar date', () => {
  for (const placeVerifiedAt of ['2028-02-29', '2000-02-29', '2026-01-01', '2026-12-31']) {
    assert.deepEqual(contracts.parseEvidenceInput({placeVerifiedAt}), {placeVerifiedAt}, placeVerifiedAt);
  }
  for (const placeVerifiedAt of [
    '1900-02-29', '2027-02-29', '2026-04-31', '2026-02-30', '2026-13-01', '2026-00-10', '2026-01-00',
    '0000-01-01', '2026-1-01', '26-01-01', '2026/01/01', '2026-01-01T00:00:00Z', '2026-01-01 ', ' 2026-01-01',
    '', 'today', 20260101, true, {},
  ]) assert.equal(contracts.parseEvidenceInput({placeVerifiedAt}), null, String(placeVerifiedAt));
  // null is not a format failure: alone it is the documented clear action.
  assert.deepEqual(contracts.parseEvidenceInput({placeVerifiedAt: null}), {placeVerifiedAt: null});
});

test('clearPlace conflicts with a dated verification and a no-op patch is rejected', () => {
  assert.equal(contracts.parseEvidenceInput({clearPlace: true, placeVerifiedAt: '2026-11-09'}), null);
  assert.deepEqual(contracts.parseEvidenceInput({clearPlace: true, placeVerifiedAt: null}), {
    clearPlace: true,
    placeVerifiedAt: null,
  });
  for (const value of [
    {},
    {clearPlace: false},
    {synthetic: 'true'},
    {synthetic: 1},
    {synthetic: null},
    {clearPlace: 'true'},
    {clearPlace: 1},
    {clearPlace: null},
    {synthetic: true, extra: true},
    {synthetic: true, placeVerifiedAt: '2026-02-30'},
    null,
    undefined,
    [],
    'synthetic',
    42,
    true,
  ]) assert.equal(contracts.parseEvidenceInput(value), null, JSON.stringify(value)?.slice(0, 120));
});

// ---------------------------------------------------------------------------
// Status parity: publishing is not an input of the honesty ladder
// ---------------------------------------------------------------------------

test('draft and published projections with the same facts report the same status', () => {
  for (const synthetic of [false, true]) {
    for (const attestedAt of [null, ATTESTED]) {
      for (const sourceCount of [0, 2]) {
        for (const placeVerifiedAt of [null, PLACE]) {
          const facts = {synthetic, attestedAt, sourceCount, placeVerifiedAt};
          const draft = honesty({...facts, published: false});
          const published = honesty({...facts, published: true, sources: [source('one', 'https://example.com')]});
          assert.equal(author.authorHonestyStatus(draft), contracts.guideHonestyStatus(facts));
          assert.equal(author.authorHonestyStatus(published), contracts.guideHonestyStatus(facts));
          assert.ok(author.statusParity(draft, published), JSON.stringify(facts));
          assert.equal(published.status, draft.status, 'publishing never re-derives the ladder');
        }
      }
    }
  }
  // A draft whose owner already attested+sourced the record can reach 'verified'
  // before it is published; nothing in the derivation treats drafts differently.
  assert.equal(author.authorHonestyStatus(honesty({
    attestedAt: ATTESTED, sourceCount: 1, placeVerifiedAt: PLACE, published: false,
  })), 'verified');
});

test('the author helper reports the remaining verification steps in ladder order', () => {
  assert.deepEqual(author.VERIFICATION_REQUIREMENTS, ['attestation', 'sources', 'placeVerification']);
  assert.deepEqual(author.missingVerifiedSteps(honesty({})), ['attestation', 'sources', 'placeVerification']);
  assert.deepEqual(author.missingVerifiedSteps(honesty({synthetic: true})), []);
  assert.deepEqual(author.missingVerifiedSteps(honesty({attestedAt: ATTESTED})), ['sources', 'placeVerification']);
  assert.deepEqual(author.missingVerifiedSteps(honesty({
    attestedAt: ATTESTED, sourceCount: 2,
  })), ['placeVerification']);
  assert.deepEqual(author.missingVerifiedSteps(honesty({
    attestedAt: ATTESTED, sourceCount: 2, placeVerifiedAt: PLACE,
  })), []);
  // Sources and place verification without an attestation still need the
  // attestation; the ladder never skips its first step.
  assert.deepEqual(author.missingVerifiedSteps(honesty({
    sourceCount: 2, placeVerifiedAt: PLACE,
  })), ['attestation']);
});

// ---------------------------------------------------------------------------
// Migration schema, RPCs and grant posture (static, never executed)
// ---------------------------------------------------------------------------

test('the migration keeps the RPC-only boundary: no table grants and no transaction control', () => {
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\./i);
  assert.doesNotMatch(migration, /^\s*(begin|commit|rollback|start transaction|savepoint)\s*;/im);
});

test('the migration adds exactly the four reviewed public RPC signatures', () => {
  for (const signature of [
    /create function public\.kinnso_creator_guide_honesty\(p_guide_id uuid\) returns jsonb/,
    /create function public\.kinnso_guide_set_sources\(p_guide_id uuid, p_sources jsonb\) returns jsonb/,
    /create function public\.kinnso_ops_set_evidence\( p_guide_id uuid, p_synthetic boolean default null, p_place_verified_at date default null, p_clear_place boolean default false \) returns jsonb/,
    /create function public\.kinnso_ops_published_guides\(p_limit integer default 50\) returns jsonb/,
  ]) assert.match(compact, signature);
  assert.equal((compact.match(/create function public\./g) ?? []).length, 4, 'exactly four new public entry points');
});

test('all four public entry points are security definer with an empty search_path', () => {
  for (const name of [
    'kinnso_creator_guide_honesty',
    'kinnso_guide_set_sources',
    'kinnso_ops_set_evidence',
    'kinnso_ops_published_guides',
  ]) {
    const pattern = new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\nlanguage plpgsql[\\s\\S]*?security definer set search_path=''`);
    assert.match(migration, pattern, name);
  }
});

test('the author projection reuses the single S2 derivation instead of repeating it', () => {
  assert.match(compact, /create function kinnso_internal\.guide_author_honesty_payload\(p_guide_id uuid\) returns jsonb/);
  assert.match(compact, /select kinnso_internal\.guide_honesty_payload\(g\.id\) \|\| jsonb_build_object\( 'published', g\.status = 'published', 'sources', g\.source_refs\)/);
  assert.match(compact, /revoke all on function kinnso_internal\.guide_author_honesty_payload\(uuid\) from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /when g\.synthetic then 'synthetic'/, 'the precedence must not be copied');
});

test('grants are narrow: authenticated only, never anon, revoke first for each RPC', () => {
  const grants = [
    ['kinnso_creator_guide_honesty', 'uuid'],
    ['kinnso_guide_set_sources', 'uuid, jsonb'],
    ['kinnso_ops_set_evidence', 'uuid, boolean, date, boolean'],
    ['kinnso_ops_published_guides', 'integer'],
  ];
  for (const [name, args] of grants) {
    const signature = `\\(${args}\\)`;
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}${signature} from public, anon;`), name);
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}${signature} to authenticated;`), name);
    assert.doesNotMatch(compact, new RegExp(`grant execute on function public\\.${name}${signature} to anon`), name);
  }
  assert.doesNotMatch(migration, /grant execute on function public\.[a-z_]+\([^)]*\) to [^;]*anon/);
});

test('creator RPCs repeat the active-creator ownership predicate of attestation', () => {
  const body = migration.slice(
    migration.indexOf('create function public.kinnso_creator_guide_honesty'),
    migration.indexOf('create function public.kinnso_ops_set_evidence'),
  );
  assert.equal((body.match(/select 1 from public\.creators where id = actor and status = 'active'/g) ?? []).length, 2);
  assert.match(body, /raise exception 'creator_required'/);
  assert.match(body, /select 1 from public\.guides where id = p_guide_id and creator_id = actor/);
  assert.match(body, /select \* into g from public\.guides where id = p_guide_id and creator_id = actor for update/);
  assert.match(body, /raise exception 'guide_not_found'/);
  assert.match(body, /if p_guide_id is null or not exists \(/);
});

test('the sources RPC validates the exact [{title, url?}] shape and is idempotent', () => {
  const body = migration.slice(
    migration.indexOf('create function public.kinnso_guide_set_sources'),
    migration.indexOf('create function public.kinnso_ops_set_evidence'),
  );
  const bodyCompact = body.replace(/\s+/g, ' ');
  assert.match(body, /p_sources is null or jsonb_typeof\(p_sources\) is distinct from 'array'/);
  assert.match(body, /jsonb_array_length\(p_sources\) > 20/);
  assert.match(body, /v_item - 'title' - 'url' <> '\{\}'::jsonb/);
  assert.match(body, /jsonb_typeof\(v_item->'title'\) is distinct from 'string'/);
  assert.match(body, /char_length\(v_title\) < 1 or char_length\(v_title\) > 200/);
  assert.match(body, /\(v_item->>'url'\) !~ '\^https:\/\/'/);
  assert.match(body, /\(v_item->>'url'\) ~ '\\s'/);
  assert.match(body, /char_length\(v_item->>'url'\) > 500/);
  assert.match(body, /raise exception 'invalid_sources'/);
  assert.match(bodyCompact, /jsonb_strip_nulls\(jsonb_build_object\( 'title', btrim\(e->>'title'\), 'url', case when e \? 'url' then e->>'url' end\)\)/);
  assert.match(bodyCompact, /update public\.guides set source_refs = v_normalized where id = g\.id/);
  assert.match(body, /if g\.source_refs is distinct from v_normalized then/, 'identical repeat skips the update and its updated_at trigger');
  assert.doesNotMatch(body, /set\s+status\s*=/, 'sources never publish or change visibility');
  assert.doesNotMatch(body, /(rights_basis|synthetic|place_verified_at)\s*=/, 'sources only write source_refs');
});

test('the ops evidence RPC is gated, writes only the two evidence columns and returns the author payload', () => {
  assert.equal((compact.match(/if not public\.is_active_ops\(\) then raise exception 'forbidden' using errcode = '42501'; end if;/g) ?? []).length, 2);
  const body = migration.slice(
    migration.indexOf('create function public.kinnso_ops_set_evidence'),
    migration.indexOf('create function public.kinnso_ops_published_guides'),
  );
  const bodyCompact = body.replace(/\s+/g, ' ');
  assert.match(bodyCompact, /update public\.guides set synthetic = coalesce\(p_synthetic, g\.synthetic\), place_verified_at = v_place where id = g\.id/);
  assert.match(body, /v_clear boolean := coalesce\(p_clear_place, false\)/);
  assert.match(body, /when v_clear then null/);
  assert.match(body, /p_place_verified_at::timestamp at time zone 'UTC'/, 'dates are stored as UTC midnight, not session-local time');
  assert.match(body, /raise exception 'invalid_evidence'/);
  assert.match(body, /raise exception 'guide_not_found'/);
  assert.match(body, /return kinnso_internal\.guide_author_honesty_payload\(g\.id\)/);
  assert.doesNotMatch(body, /(creator_id|source_refs|rights_basis|status)\s*=/, 'evidence changes no other guide column');
});

test('the ops corpus RPC clamps its limit, orders by title and exposes the derived projection', () => {
  const body = migration.slice(migration.indexOf('create function public.kinnso_ops_published_guides'));
  assert.match(body, /v_limit integer := least\(greatest\(coalesce\(p_limit, 50\), 1\), 200\)/);
  assert.match(body, /where g\.status = 'published'/);
  assert.match(body, /order by g\.title, g\.id/);
  assert.match(body, /'items', v_items/);
  for (const key of ["'id'", "'title'", "'status'", "'synthetic'", "'rightsBasis'", "'sourceCount'", "'placeVerifiedAt'", "'attestedAt'"]) {
    assert.ok(body.includes(key), `ops corpus exposes ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Server helpers and API routes (static gating assertions)
// ---------------------------------------------------------------------------

test('the server helpers call exactly the four reviewed RPCs with snake_case arguments', () => {
  const server = read('lib/content-honesty/server.ts');
  for (const needle of [
    'export function creatorGuideHonesty(guideId: string): Promise<AuthorHonesty>',
    "call<AuthorHonesty>('kinnso_creator_guide_honesty', { p_guide_id: guideId })",
    'export function setGuideSources(guideId: string, input: SourcesInput): Promise<AuthorHonesty>',
    "call<AuthorHonesty>('kinnso_guide_set_sources'",
    'p_sources: input.sources',
    'export function opsSetEvidence(guideId: string, input: EvidenceInput): Promise<AuthorHonesty>',
    "call<AuthorHonesty>('kinnso_ops_set_evidence'",
    'p_synthetic: input.synthetic ?? null',
    'p_place_verified_at:',
    'p_clear_place: input.clearPlace === true || input.placeVerifiedAt === null',
    'export function opsPublishedGuides(limit?: number): Promise<OpsGuideList>',
    "call<OpsGuideList>('kinnso_ops_published_guides', { p_limit: limit })",
  ]) assert.ok(server.includes(needle), `${needle} missing from content-honesty server`);
});

test('the creator honesty route is a session-gated read with explicit 400/403/404', () => {
  const route = read('app/api/creator/guides/[id]/honesty/route.ts');
  for (const needle of [
    'export async function GET',
    "apiContext(request, 'creator')",
    "ctx.actor.roles.includes('creator')",
    'if (!uuid(id)) return failure(',
    "failure('INVALID', 400)",
    "failure('FORBIDDEN', 403)",
    "failure('NOT_FOUND', 404)",
    'creatorGuideHonesty(id)',
    'creator_required',
    'guide_not_found',
    'reply({ ok: true, data: await creatorGuideHonesty(id) })',
  ]) assert.ok(route.includes(needle), `${needle} missing from creator honesty route`);
  assert.ok(!route.includes("apiContext(request, 'creator', true)"), 'the read must not require the same-origin write gate');
});

test('the sources route is a validated same-origin creator write that cannot publish', () => {
  const route = read('app/api/creator/guides/[id]/sources/route.ts');
  for (const needle of [
    'export async function PUT',
    "apiContext(request, 'creator', true)",
    "ctx.actor.roles.includes('creator')",
    'boundedBody(request, 16384)',
    'parseSourcesInput',
    'setGuideSources(id, input)',
    "failure('INVALID', 400)",
    "failure('FORBIDDEN', 403)",
    "failure('NOT_FOUND', 404)",
    "failure('UNAVAILABLE', 503)",
    'invalid_sources',
    'reply({ ok: true, data: await setGuideSources(id, input) })',
  ]) assert.ok(route.includes(needle), `${needle} missing from sources route`);
  assert.equal((route.match(/await setGuideSources\(/g) ?? []).length, 1, 'the route calls exactly the sources RPC');
});

test('the ops guides route gates on ops roles and bounds the limit query', () => {
  const route = read('app/api/ops/guides/route.ts');
  for (const needle of [
    'export async function GET',
    "apiContext(request, 'ops')",
    "ctx.actor.roles.includes('ops')",
    "failure('FORBIDDEN', 403)",
    "failure('INVALID', 400)",
    "new URL(request.url).searchParams.get('limit')",
    'Math.min(MAX_LIMIT, Math.max(1, Number(raw)))',
    'opsPublishedGuides(limit)',
    'reply({ ok: true, data: await opsPublishedGuides(limit) })',
  ]) assert.ok(route.includes(needle), `${needle} missing from ops guides route`);
  assert.ok(!route.includes("apiContext(request, 'ops', true)"), 'a list read is not a same-origin write');
});

test('the evidence route is a validated same-origin ops write with explicit 400/403/404/503', () => {
  const route = read('app/api/ops/guides/[id]/verification/route.ts');
  for (const needle of [
    'export async function PATCH',
    "apiContext(request, 'ops', true)",
    "ctx.actor.roles.includes('ops')",
    'boundedBody(request, 4096)',
    'parseEvidenceInput',
    'opsSetEvidence(id, input)',
    "failure('INVALID', 400)",
    "failure('FORBIDDEN', 403)",
    "failure('NOT_FOUND', 404)",
    "failure('UNAVAILABLE', 503)",
    'invalid_evidence',
    'reply({ ok: true, data: await opsSetEvidence(id, input) })',
  ]) assert.ok(route.includes(needle), `${needle} missing from evidence route`);
});
