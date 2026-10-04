import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as release from '../scripts/migration-release.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const files = [{ name: '20261001000000_example.sql', bytes: Buffer.from('CREATE TABLE public.example(id uuid);\n') }];
const sql = files.map(file => `-- ${file.name}\n${file.bytes}`).join('\n');
const manifest = { files: files.map(file => ({ name: file.name, sha256: sha(file.bytes) })), sha256: sha(sql) };
const head = 'a'.repeat(40), project = 'approved-project', scope = 'exact-reviewed-files';
const now = Date.now();
const expected = { head, project, scope, sha256: manifest.sha256, questionId: 'precise-question' };
const approval = { ...expected, authorized: true, humanReply: 'approve', acceptedAt: new Date(now).toISOString() };

test('frozen candidate rejects changed bytes, reordered files, duplicates and path escapes', () => {
  assert.equal(release.freezeCandidate(files, manifest).sql, sql);
  assert.throws(() => release.freezeCandidate([{ ...files[0], bytes: Buffer.from('SELECT 1;') }], manifest));
  assert.throws(() => release.freezeCandidate([...files, ...files], manifest));
  assert.throws(() => release.freezeCandidate([{ ...files[0], name: '../escape.sql' }], manifest));
  assert.throws(() => release.freezeCandidate(files, { ...manifest, sha256: '0'.repeat(64) }));
  assert.throws(() => release.freezeCandidate(files, { ...manifest, files: [] }));
});

test('transaction scanner distinguishes PL/pgSQL and quoted content from transaction and psql controls', () => {
  assert.doesNotThrow(() => release.assertTransactionalSql("/* outer /* COMMIT; */ still comment */ CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN RAISE NOTICE 'COMMIT;'; END $body$; SELECT 'rollback;', E'it\\\'s', \"COMMIT\";"));
  for (const value of ['BEGIN;', 'START TRANSACTION;', 'COMMIT;', 'END;', 'ABORT;', 'ROLLBACK TO x;', 'PREPARE TRANSACTION \'x\';', '\\connect other', 'COPY public.t FROM STDIN;', '/* unterminated', "SELECT 'unterminated", 'SELECT $body$unterminated']) {
    assert.throws(() => release.assertTransactionalSql(value), value);
  }
});

test('approval requires an explicit human reply to the exact scope; pending, continue and wrong heads are denied', () => {
  assert.doesNotThrow(() => release.authorizeReleaseApproval(approval, expected, now));
  for (const patch of [{ authorized: false }, { humanReply: 'continue' }, { questionId: 'other' }, { head: 'b'.repeat(40) }, { project: 'other' }, { scope: 'everything' }, { sha256: '0'.repeat(64) }, { acceptedAt: 'invalid' }]) {
    assert.throws(() => release.authorizeReleaseApproval({ ...approval, ...patch }, expected, now));
  }
  assert.throws(() => release.authorizeReleaseApproval(undefined, expected, now));
});

test('ordinary-string backslashes cannot hide a COMMIT after changing the PostgreSQL string mode', () => {
  assert.throws(() => release.assertTransactionalSql("SET standard_conforming_strings=off;\nSELECT '\\';' ; COMMIT; --'"));
  assert.throws(() => release.assertTransactionalSql("SELECT set_config('standard_conforming_strings','off',false); SELECT '\\';' ; COMMIT; --'"));
});

test('historical backup, failed restoration and not-run rehearsal cannot satisfy the recovery gate', () => {
  const evidence = { project, head, sha256: expected.sha256, backup: { id: 'backup', observedAt: new Date(now - 1000).toISOString(), result: 'PASS_CONSISTENT_DATABASE_EXPORT', filesVerified: true }, restoration: { backupId: 'backup', result: 'PASS_DATABASE_LOGICAL_RESTORE', checks: [{ result: 'PASS' }] }, rehearsal: { backupId: 'backup', result: 'PASS_FAILURE_COMMIT_POSTCHECK_NO_REPLAY', baselineCatalog: '1'.repeat(32), committedCatalog: '2'.repeat(32) } };
  assert.doesNotThrow(() => release.authorizeRecoveryEvidence(evidence, expected, now));
  for (const patch of [{ head: 'b'.repeat(40) }, { backup: { ...evidence.backup, observedAt: new Date(now - 3600001).toISOString() } }, { backup: { ...evidence.backup, filesVerified: false } }, { restoration: { ...evidence.restoration, result: 'NOT_RUN' } }, { restoration: { ...evidence.restoration, checks: [{ result: 'FAIL' }] } }, { rehearsal: { ...evidence.rehearsal, backupId: 'other' } }, { rehearsal: { ...evidence.rehearsal, result: 'NOT_RUN' } }]) {
    assert.throws(() => release.authorizeRecoveryEvidence({ ...evidence, ...patch }, expected, now));
  }
});

test('preflight refuses stale, future, changed or already committed catalogs', () => {
  const baseline = '1'.repeat(32);
  assert.doesNotThrow(() => release.assertCatalogPreflight({ catalog: baseline, observedAt: new Date(now).toISOString(), readOnly: true }, baseline, now));
  for (const patch of [{ catalog: '2'.repeat(32) }, { readOnly: false }, { observedAt: new Date(now - 300001).toISOString() }, { observedAt: new Date(now + 2000).toISOString() }]) {
    assert.throws(() => release.assertCatalogPreflight({ catalog: baseline, observedAt: new Date(now).toISOString(), readOnly: true, ...patch }, baseline, now));
  }
});

test('transaction verifies baseline and final catalogs before its single COMMIT', () => {
  const candidate = release.freezeCandidate(files, manifest);
  const query = "SELECT md5('catalog')";
  const text = release.buildMigrationTransaction(candidate, { catalogQuery: query, baseline: '1'.repeat(32), committed: '2'.repeat(32), acknowledgment: 'KINNSO_COMMIT_ACK_123' });
  assert.equal((text.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((text.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.ok(text.indexOf('MIGRATION_BASELINE_CHANGED') < text.indexOf('CREATE TABLE'));
  assert.ok(text.indexOf('CREATE TABLE') < text.indexOf('MIGRATION_POSTCHECK_FAILED'));
  assert.ok(text.indexOf('MIGRATION_POSTCHECK_FAILED') < text.indexOf('\nCOMMIT;'));
  assert.ok(text.endsWith('\\echo KINNSO_COMMIT_ACK_123\n'));
  assert.throws(() => release.buildMigrationTransaction(candidate, { catalogQuery: query, baseline: 'bad', committed: '2'.repeat(32), acknowledgment: 'ACK; DROP TABLE x' }));
});

test('all unconfirmed client exits require read-only reconciliation without replay', () => {
  const ack = 'KINNSO_COMMIT_ACK_123';
  assert.equal(release.classifyClientOutcome({ status: 0, stdout: `COMMIT\n${ack}\n` }, ack), 'CLIENT_CONFIRMED_COMMIT_PENDING_READONLY_VERIFICATION');
  for (const result of [{ status: 0, stdout: 'COMMIT\n' }, { status: 0, stdout: ack }, { status: 3, stdout: '' }, { status: 2, stdout: '' }, { status: null, signal: 'SIGTERM', stdout: `COMMIT\n${ack}\n` }]) {
    assert.equal(release.classifyClientOutcome(result, ack), 'UNKNOWN_OUTCOME_RECONCILE_READONLY_NO_REPLAY');
  }
});

test('persistent execution claim rejects a second attempt even after failure', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kinnso-release-test-'));
  const file = path.join(directory, 'receipt.json');
  try {
    release.claimExecution(file, { outcome: 'UNKNOWN' });
    assert.throws(() => release.claimExecution(file, { outcome: 'RETRY' }));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { outcome: 'UNKNOWN' });
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
