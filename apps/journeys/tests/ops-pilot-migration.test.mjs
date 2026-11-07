import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrationUrl } from './packaged-source.mjs';

const PILOT_SCHEMA_MIGRATION = '20261107081531_kinnso_pilot_control_room_schema.sql';
const sql = readFileSync(migrationUrl(PILOT_SCHEMA_MIGRATION, import.meta.url), 'utf8');
const tables = ['runs', 'participants', 'invites', 'content_intakes', 'collaborations', 'checks', 'evidence'];
const PILOT_RPC_MIGRATION = '20261107085017_kinnso_pilot_control_room_rpcs.sql';
const rpcSql = readFileSync(migrationUrl(PILOT_RPC_MIGRATION, import.meta.url), 'utf8');
test('pilot RPC schema binds evidence to same-run slots and retains retired collaborations',()=>{
 assert.match(rpcSql,/alter table kinnso_internal\.pilot_evidence[\s\S]*?add column participant_id uuid/i);
 assert.match(rpcSql,/foreign key\s*\(run_id,\s*participant_id\)\s*references kinnso_internal\.pilot_participants\(run_id,\s*id\)/i);
 assert.match(rpcSql,/create index[^;]+on kinnso_internal\.pilot_evidence\s*\(run_id,\s*participant_id\)/i);
 assert.match(rpcSql,/alter table kinnso_internal\.pilot_collaborations[\s\S]*?drop constraint pilot_collaborations_run_id_key/i);
 assert.match(rpcSql,/create unique index[^;]+on kinnso_internal\.pilot_collaborations\s*\(run_id\)\s*where status\s*=\s*'active'/i);
 assert.match(rpcSql,/entity_type in\s*\([^;]+'manual'/i);
});

test('pilot RPC migration retains separate private participant attribution and protects delegates', () => {
  assert.match(rpcSql, /create table kinnso_internal\.pilot_participant_audit/);
  assert.match(rpcSql, /actor_user_id uuid not null references auth\.users/);
  assert.match(rpcSql, /revoke all on kinnso_internal\.pilot_participant_audit from public,anon,authenticated,service_role/);
  assert.doesNotMatch(rpcSql, /alter table public\.ops_audit_log|create or replace function public\.ops_audit_log_append/i);
  assert.match(rpcSql, /revoke all on function kinnso_internal\.publish_kinnso_guide_draft/);
  for (const name of ['get_kinnso_ops_pilot','admin_apply_kinnso_pilot_command','get_kinnso_pilot_self','apply_kinnso_pilot_participant_command','get_kinnso_pilot_publish_permission','publish_kinnso_pilot_guide_draft']) {
    assert.match(rpcSql, new RegExp(`create function public\\.${name}[^$]+security definer set search_path=''`));
  }
});

function table(name) {
  const body = sql.match(new RegExp(`create table kinnso_internal\\.pilot_${name} \\(([\\s\\S]*?)\\n\\);`, 'i'))?.[1];
  assert.ok(body, `Missing private pilot_${name} table`);
  return body;
}

test('pilot tables are private with RLS and explicit privilege revocation', () => {
  for (const name of tables) {
    table(name);
    assert.match(sql, new RegExp(`alter table kinnso_internal\\.pilot_${name} enable row level security;`, 'i'));
    assert.match(sql, new RegExp(`revoke all on (?:table )?kinnso_internal\\.pilot_${name} from public, anon, authenticated, service_role;`, 'i'));
  }
  assert.doesNotMatch(sql, /\b(?:create\s+(?:policy|trigger|function)|grant)\b/i);
});

test('run and participant uniqueness preserves replacement after withdrawal', () => {
  assert.match(sql, /create unique index[^;]+on kinnso_internal\.pilot_runs \(\(true\)\)\s+where status in \('recruiting', 'paused', 'running'\)/i);
  assert.match(sql, /create unique index\s+\w+\s+on kinnso_internal\.pilot_participants \(run_id, user_id\)\s+where user_id is not null;/i);
  assert.match(table('participants'), /pilot_cohort_role in \('required_traveller', 'required_creator', 'required_merchant', 'observer'\)/);
  assert.match(sql, /create unique index[^;]+\(run_id, pilot_cohort_role\)\s+where pilot_cohort_role <> 'observer' and status <> 'withdrawn'/i);
});

test('pilot schema records release, consent and review metadata without raw secrets', () => {
  for (const [name, fields] of Object.entries({
    runs: ['candidate_release_sha text', 'data_classification text', 'synthetic_rehearsal_run_id uuid',
      'participation_notice_version text', 'privacy_notice_version text', 'content_consent_version text',
      'coordinator_reference text', 'support_owner_reference text', 'privacy_owner_reference text',
      'alert_owner_reference text', 'private_channel_reference text', 'acceptance_started_at timestamptz'],
    participants: ['consented_at timestamptz', 'consent_version text'],
    invites: ['code_hash bytea', 'expires_at timestamptz', 'claimed_at timestamptz'],
    content_intakes: ['author_consented_at timestamptz', 'consent_digest text', 'reviewed_at timestamptz'],
    evidence: ['captured_at timestamptz'],
  })) for (const field of fields) assert.ok(table(name).includes(field), field);
  for (const name of ['runs', 'participants', 'content_intakes', 'collaborations', 'checks']) {
    assert.match(table(name), /revision integer/);
    assert.match(table(name), /updated_at timestamptz/);
  }
  for (const name of tables) assert.doesNotMatch(table(name), /^\s*\w*(?:raw_code|invite_code|token|password)\w*\s+(?:text|bytea|varchar)\b/im);
});

test('content constraints cover URLs, cover rights and exact review data', () => {
  const body = table('content_intakes');
  for (const pattern of [/cardinality\(source_urls\) <= 20/, /https\?/, /cover_rights_confirmed is true/,
    /content_digest[^\n]+\[0-9a-f\]/, /guide_draft_revision is not null/, /reviewed_by_ops_member_id is not null/,
    /reviewed_at is not null/, /reviewed_guide_version is not null/]) assert.match(body, pattern);
});

test('foreign keys have indexes with the referencing columns first', () => {
  for (const name of tables) {
    const body = table(name);
    const keys = [...body.matchAll(/^\s*(\w+) uuid[^\n]* references /gm)].map(match => match[1]);
    keys.push(...[...body.matchAll(/foreign key \(([^)]+)\)/g)].map(match => match[1]));
    assert.ok(keys.length, name);
    for (const key of keys) {
      const indexes = [body, ...sql.split(';').filter(s => new RegExp(`create (?:unique )?index[^;]+on kinnso_internal\\.pilot_${name} \\(`, 'i').test(s))];
      assert.ok(indexes.some(s => new RegExp(`(?:unique |pilot_${name} )\\(${key}[,)]`, 'i').test(s)), `${name}: ${key}`);
    }
  }
});
test('published content requires a reviewed version independent of the draft revision', () => {
  const body = table('content_intakes');
  assert.match(body, /status <> 'published' or reviewed_guide_version is not null/);
  assert.doesNotMatch(body, /reviewed_guide_version\s*=\s*guide_draft_revision/);
});

test('source URLs are bounded individually and in total', () => {
  const body = table('content_intakes');
  assert.match(body, /array_to_string\(source_urls, E'\\n'\) !~ E'\(\[\^\\n\]\{128\}\)\{16\}\[\^\\n\]'/);
  assert.match(body, /char_length\(array_to_string\(source_urls, ''\)\) <= 20000/);
});

test('a real run can reference a persisted rehearsal for Task 4 validation', () => {
  assert.match(table('runs'), /-- Task 4 validates[^\n]*same release[^\n]*\n\s*synthetic_rehearsal_run_id uuid references kinnso_internal\.pilot_runs\(id\)/);
});
