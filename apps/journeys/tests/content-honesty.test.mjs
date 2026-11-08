import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrationUrl} from './packaged-source.mjs';

const contracts = await import('../lib/content-honesty/contracts.ts');

const app = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => readFileSync(path.join(app, relative), 'utf8');
const migration = readFileSync(migrationUrl('20261109120000_content_honesty.sql', import.meta.url), 'utf8');
const compact = migration.replace(/\s+/g, ' ');

const facts = (overrides = {}) => ({
  synthetic: false,
  sourceCount: 0,
  placeVerifiedAt: null,
  attestedAt: null,
  ...overrides,
});
const ATTESTED = '2026-11-09T00:00:00Z';
const VERIFIED_PLACE = '2026-11-08T00:00:00Z';

// ---------------------------------------------------------------------------
// Status derivation (mirrors kinnso_internal.guide_honesty_payload)
// ---------------------------------------------------------------------------

test('the status derivation covers every precedence combination', () => {
  for (const synthetic of [false, true]) {
    for (const attestedAt of [null, ATTESTED]) {
      for (const sourceCount of [0, 2]) {
        for (const placeVerifiedAt of [null, VERIFIED_PLACE]) {
          const expected = synthetic
            ? 'synthetic'
            : attestedAt !== null
              ? sourceCount > 0 && placeVerifiedAt !== null ? 'verified' : 'attested'
              : 'unverified';
          assert.equal(
            contracts.guideHonestyStatus(facts({synthetic, attestedAt, sourceCount, placeVerifiedAt})),
            expected,
            JSON.stringify({synthetic, attestedAt, sourceCount, placeVerifiedAt}),
          );
        }
      }
    }
  }
});

test('synthetic wins over a complete verified-looking record and unverified wins without an attestation', () => {
  assert.equal(contracts.guideHonestyStatus(facts({
    synthetic: true, attestedAt: ATTESTED, sourceCount: 20, placeVerifiedAt: VERIFIED_PLACE,
  })), 'synthetic');
  assert.equal(contracts.guideHonestyStatus(facts({synthetic: true})), 'synthetic');
  // Sources and a place verification without an attestation never upgrade.
  assert.equal(contracts.guideHonestyStatus(facts({sourceCount: 20, placeVerifiedAt: VERIFIED_PLACE})), 'unverified');
  // Verified needs all three facts; either one missing degrades to attested.
  assert.equal(contracts.guideHonestyStatus(facts({attestedAt: ATTESTED, sourceCount: 1})), 'attested');
  assert.equal(contracts.guideHonestyStatus(facts({attestedAt: ATTESTED, placeVerifiedAt: VERIFIED_PLACE})), 'attested');
  assert.equal(contracts.guideHonestyStatus(facts({
    attestedAt: ATTESTED, sourceCount: 1, placeVerifiedAt: VERIFIED_PLACE,
  })), 'verified');
});

test('the SQL derivation is the same ordered precedence the TypeScript helper implements', () => {
  const synthetic = compact.indexOf("when g.synthetic then 'synthetic'");
  const verified = compact.indexOf("and g.place_verified_at is not null then 'verified'");
  const attested = compact.indexOf("when a.attested_at is not null then 'attested'");
  const unverified = compact.indexOf("else 'unverified' end");
  assert.ok(synthetic >= 0, 'synthetic branch present');
  assert.ok(verified > synthetic, 'verified branch follows synthetic');
  assert.ok(attested > verified, 'attested branch follows verified');
  assert.ok(unverified > attested, 'unverified is the fallback');
  assert.match(compact, /when a\.attested_at is not null and jsonb_array_length\(g\.source_refs\) > 0 and g\.place_verified_at is not null then 'verified'/);
  assert.match(compact, /'sourceCount', jsonb_array_length\(g\.source_refs\)/);
});

// ---------------------------------------------------------------------------
// Attestation input parser (mirrors the RPC's 40..2000 statement bounds)
// ---------------------------------------------------------------------------

test('valid attestation inputs are trimmed of ASCII spaces and bounded', () => {
  assert.deepEqual(contracts.parseAttestInput({
    version: 1, rightsBasis: 'original', statement: 'x'.repeat(40),
  }), {version: 1, rightsBasis: 'original', statement: 'x'.repeat(40)});
  assert.deepEqual(contracts.parseAttestInput({
    version: 7, rightsBasis: 'licensed', statement: 'x'.repeat(2000),
  }), {version: 7, rightsBasis: 'licensed', statement: 'x'.repeat(2000)});
  assert.deepEqual(contracts.parseAttestInput({
    version: 3, rightsBasis: 'original', statement: `   ${'x'.repeat(40)}   `,
  }), {version: 3, rightsBasis: 'original', statement: 'x'.repeat(40)});
  assert.equal(contracts.ATTESTATION_STATEMENT_MIN, 40);
  assert.equal(contracts.ATTESTATION_STATEMENT_MAX, 2000);
  assert.deepEqual(contracts.ATTESTATION_RIGHTS_BASES, ['original', 'licensed']);
});

test('statement bounds count PostgreSQL characters, not UTF-16 units or trimmed whitespace', () => {
  // char_length counts code points: 40 astral characters are 80 UTF-16 units.
  assert.ok(contracts.parseAttestInput({version: 1, rightsBasis: 'licensed', statement: '😀'.repeat(40)}));
  assert.equal(contracts.parseAttestInput({version: 1, rightsBasis: 'licensed', statement: '😀'.repeat(39)}), null);
  // btrim only removes ASCII spaces, so a newline still counts as a character.
  assert.ok(contracts.parseAttestInput({version: 1, rightsBasis: 'original', statement: `\n${'x'.repeat(39)}`}));
  // 2000 code points accepted, 2001 rejected (independent of byte length).
  assert.ok(contracts.parseAttestInput({version: 1, rightsBasis: 'original', statement: '遊'.repeat(2000)}));
  assert.equal(contracts.parseAttestInput({version: 1, rightsBasis: 'original', statement: '遊'.repeat(2001)}), null);
});

test('the attestation parser rejects out-of-bounds values and unknown fields', () => {
  const base = {version: 1, rightsBasis: 'original', statement: 'x'.repeat(40)};
  for (const statement of ['x'.repeat(39), 'x'.repeat(2001), '', '   ', 'x'.repeat(39) + ' '.repeat(5), null, undefined, 7, {}, ['x']]) {
    assert.equal(contracts.parseAttestInput({...base, statement}), null, `statement=${String(statement).slice(0, 20)}`);
  }
  for (const rightsBasis of ['unknown', 'licence', 'permission', 'Original', 'LICENSED', '', null, 1, ['original']]) {
    assert.equal(contracts.parseAttestInput({...base, rightsBasis}), null, `rightsBasis=${String(rightsBasis)}`);
  }
  for (const version of [0, -1, 1.5, '1', null, undefined, NaN, Infinity, -Infinity, 2147483648, 2 ** 53]) {
    assert.equal(contracts.parseAttestInput({...base, version}), null, `version=${String(version)}`);
  }
  assert.equal(contracts.parseAttestInput({...base, version: 2147483647})?.version, 2147483647);
  for (const invalid of [null, undefined, 'statement', 42, [], true, {}, {version: 1, rightsBasis: 'original'}]) {
    assert.equal(contracts.parseAttestInput(invalid), null, JSON.stringify(invalid));
  }
  assert.equal(contracts.parseAttestInput({...base, extra: true}), null, 'unknown keys are rejected');
});

// ---------------------------------------------------------------------------
// Migration schema, RPCs and grant posture (static, never executed)
// ---------------------------------------------------------------------------

test('the migration adds defaulted provenance columns without breaking existing rows', () => {
  assert.match(compact, /alter table public\.guides add column if not exists synthetic boolean not null default false/);
  assert.match(compact, /add column if not exists rights_basis text not null default 'unknown' check \(rights_basis in \('original', 'licensed', 'unknown'\)\)/);
  assert.match(compact, /add column if not exists source_refs jsonb not null default '\[\]'::jsonb check \(jsonb_typeof\(source_refs\) = 'array' and jsonb_array_length\(source_refs\) <= 20\)/);
  assert.match(compact, /add column if not exists place_verified_at timestamptz/);
  assert.doesNotMatch(migration, /update public\.guides/i, 'existing guides rows must not be rewritten');
  assert.doesNotMatch(migration, /insert into public\.guides/i, 'the migration must not create guides');
});

test('attestations are an internal per-version receipt table with no client grants', () => {
  assert.match(compact, /create table kinnso_internal\.guide_version_attestations/);
  assert.match(compact, /guide_id uuid not null references public\.guides\(id\) on delete cascade/);
  assert.match(compact, /version integer not null check \(version > 0\)/);
  assert.match(compact, /attester_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(compact, /rights_basis text not null check \(rights_basis in \('original', 'licensed'\)\)/);
  assert.match(compact, /statement text not null check \(char_length\(statement\) between 40 and 2000\)/);
  assert.match(compact, /statement_hash text not null check \(statement_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(compact, /attested_at timestamptz not null default now\(\)/);
  assert.match(compact, /primary key \(guide_id, version\)/);
  assert.match(compact, /alter table kinnso_internal\.guide_version_attestations enable row level security/);
  assert.match(compact, /revoke all on kinnso_internal\.guide_version_attestations from public, anon, authenticated, service_role/);
});

test('the migration keeps the RPC-only boundary: no direct table grants, no transaction control', () => {
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\./i);
  assert.doesNotMatch(migration, /^\s*(begin|commit|rollback|start transaction|savepoint)\s*;/im);
});

test('all three public entry points are security definer with an empty search_path', () => {
  for (const name of ['kinnso_guide_honesty', 'kinnso_content_readiness', 'kinnso_attest_guide_version']) {
    const pattern = new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\nlanguage plpgsql[\\s\\S]*?security definer set search_path=''`);
    assert.match(migration, pattern, name);
  }
  assert.match(compact, /create function public\.kinnso_guide_honesty\(p_guide_id uuid\) returns jsonb/);
  assert.match(compact, /create function public\.kinnso_content_readiness\(\) returns jsonb/);
  assert.match(compact, /create function public\.kinnso_attest_guide_version\( p_guide_id uuid, p_version integer, p_rights_basis text, p_statement text \) returns jsonb/);
});

test('grants are narrow: public read for anon+authenticated, readiness/attest for authenticated only', () => {
  assert.match(compact, /revoke all on function public\.kinnso_guide_honesty\(uuid\) from public, anon;/);
  assert.match(compact, /grant execute on function public\.kinnso_guide_honesty\(uuid\) to anon, authenticated;/);
  assert.match(compact, /revoke all on function public\.kinnso_content_readiness\(\) from public, anon;/);
  assert.match(compact, /grant execute on function public\.kinnso_content_readiness\(\) to authenticated;/);
  assert.match(compact, /revoke all on function public\.kinnso_attest_guide_version\(uuid, integer, text, text\) from public, anon;/);
  assert.match(compact, /grant execute on function public\.kinnso_attest_guide_version\(uuid, integer, text, text\) to authenticated;/);
  assert.doesNotMatch(compact, /grant execute on function public\.kinnso_content_readiness\(\) to anon/);
  assert.doesNotMatch(compact, /grant execute on function public\.kinnso_attest_guide_version\(uuid, integer, text, text\) to anon/);
});

test('the public honesty read exposes only published guides and rejects drafts as guide_not_found', () => {
  const body = migration.slice(
    migration.indexOf('create function public.kinnso_guide_honesty'),
    migration.indexOf('create function public.kinnso_content_readiness'),
  );
  assert.match(body, /where id = p_guide_id and status = 'published'/);
  assert.match(body, /raise exception 'guide_not_found'/);
  for (const key of ["'id'", "'status'", "'synthetic'", "'rightsBasis'", "'sourceCount'", "'placeVerifiedAt'", "'attestedAt'", "'latestAttestedVersion'"]) {
    assert.ok(compact.includes(key), `honesty payload exposes ${key}`);
  }
  // The declared basis is the latest attestation's, falling back to the guide projection.
  assert.match(compact, /'rightsBasis', coalesce\(a\.rights_basis, g\.rights_basis\)/);
});

test('readiness is ops gated, reproducible from SQL and honest about unavailable article counts', () => {
  assert.match(migration, /if not public\.is_active_ops\(\) then\s+raise exception 'forbidden' using errcode = '42501';/);
  for (const key of ['published', 'synthetic', 'unverified', 'attested', 'verified', 'withSources', 'withPlaceVerification', 'attestedVersions']) {
    assert.ok(compact.includes(`'${key}'`), key);
  }
  assert.match(compact, /'articleRows', null,/);
  assert.match(compact, /'fixtureArticles', null/);
  // The two article fields are null because public.articles has no fixture marker.
  assert.match(migration, /public articles carry no synthetic\/fixture classification column/i);
});

test('attestation mirrors the creator ownership predicate, refuses synthetic and stale versions, and never publishes', () => {
  const body = migration.slice(migration.indexOf('create function public.kinnso_attest_guide_version'));
  assert.match(body, /select 1 from public\.creators where id = actor and status = 'active'/);
  assert.match(body, /raise exception 'creator_required'/);
  assert.match(body, /select \* into g from public\.guides where id = p_guide_id and creator_id = actor for update/);
  assert.match(body, /if not found then raise exception 'guide_not_found'; end if/);
  assert.match(body, /if g\.synthetic then raise exception 'synthetic_guide'; end if/);
  assert.match(body, /raise exception 'version_conflict'/);
  assert.match(body, /rights_basis not in \('original', 'licensed'\)/);
  assert.match(body, /char_length\(v_statement\) not between 40 and 2000/);
  assert.match(body, /kinnso_internal\.request_digest\(v_statement\)/);
  assert.match(body, /on conflict \(guide_id, version\) do nothing/);
  assert.match(body, /raise exception 'attestation_conflict'/);
  assert.doesNotMatch(body, /(update|insert into|delete from) public\.guides/i, 'attestation never publishes or mutates visibility');
  assert.doesNotMatch(body, /guide_versions.*insert/i, 'attestation never creates a published version');
});

// ---------------------------------------------------------------------------
// API routes and server helpers (static gating assertions)
// ---------------------------------------------------------------------------

test('the public honesty route is sessionless, catalog gated and maps 400/404', () => {
  const route = read('app/api/guides/[id]/honesty/route.ts');
  for (const needle of [
    'export async function GET',
    "capabilities(process.env)['catalog']?.mode !== 'connected'",
    "failure('UNAVAILABLE', 503)",
    "failure('INVALID', 400)",
    "failure('NOT_FOUND', 404)",
    'getGuideHonesty',
    'guide_not_found',
    'reply({ ok: true, data: await getGuideHonesty(id) })',
  ]) assert.ok(route.includes(needle), `${needle} missing from public honesty route`);
  assert.ok(!route.includes('await apiContext('), 'the public read must stay sessionless');
});

test('the readiness route is ops gated and the attest route is a validated creator write', () => {
  const readiness = read('app/api/ops/content-readiness/route.ts');
  for (const needle of [
    'export async function GET',
    "apiContext(request, 'ops')",
    "ctx.actor.roles.includes('ops')",
    "failure('FORBIDDEN', 403)",
    'contentReadiness',
    "reply({ ok: true, data: await contentReadiness() })",
  ]) assert.ok(readiness.includes(needle), `${needle} missing from readiness route`);

  const attest = read('app/api/creator/guides/[id]/attest/route.ts');
  for (const needle of [
    'export async function POST',
    "apiContext(request, 'creator', true)",
    "ctx.actor.roles.includes('creator')",
    'parseAttestInput',
    'attestGuideVersion(id, input)',
    ' 201)',
    "failure('CONFLICT', 409)",
    "failure('FORBIDDEN', 403)",
    "failure('INVALID', 400)",
    'attestation_conflict',
    'version_conflict',
    'synthetic_guide',
  ]) assert.ok(attest.includes(needle), `${needle} missing from attest route`);
});

test('the server helpers call exactly the three reviewed RPCs with snake_case arguments', () => {
  const server = read('lib/content-honesty/server.ts');
  for (const needle of [
    "export function getGuideHonesty(guideId: string): Promise<GuideHonesty>",
    "call<GuideHonesty>('kinnso_guide_honesty', { p_guide_id: guideId })",
    "export function contentReadiness(): Promise<ContentReadiness>",
    "call<ContentReadiness>('kinnso_content_readiness')",
    "export function attestGuideVersion(guideId: string, input: AttestInput): Promise<GuideAttestation>",
    "p_version: input.version",
    "p_rights_basis: input.rightsBasis",
    "p_statement: input.statement",
    "from '../supabase/server'",
  ]) assert.ok(server.includes(needle), `${needle} missing from content-honesty server`);
});
