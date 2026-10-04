// Pure release guards; this module never opens a database connection.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';

const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const refuse = reason => { throw new Error(reason); };

// Strip SQL literals, identifiers and comments before checking transaction controls.
// PL/pgSQL BEGIN/END live inside dollar quotes and must not be treated as SQL commits.
export function assertTransactionalSql(sql) {
  let visible = '', index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', index + 2);
      index = end < 0 ? sql.length : end;
      visible += ' ';
    } else if (rest.startsWith('/*')) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith('/*', index)) { depth++; index += 2; }
        else if (sql.startsWith('*/', index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) refuse('MIGRATION_UNTERMINATED_COMMENT');
      visible += ' ';
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      const escape = quote === "'" && index > 0 && /[eE]/.test(sql[index - 1]) && (index < 2 || !/[\w$]/.test(sql[index - 2]));
      let closed = false;
      index++;
      while (index < sql.length) {
        // Ordinary-string backslashes have two meanings depending on the server
        // setting. Refuse that ambiguity instead of guessing which quote closes.
        if (quote === "'" && !escape && sql[index] === '\\') refuse('MIGRATION_AMBIGUOUS_STRING_ESCAPE');
        if (escape && sql[index] === '\\') { index += 2; continue; }
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index++; closed = true; break;
        }
        index++;
      }
      if (!closed) refuse('MIGRATION_UNTERMINATED_QUOTE');
      visible += ' ';
    } else if (rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)) {
      const delimiter = rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)[0];
      const end = sql.indexOf(delimiter, index + delimiter.length);
      if (end < 0) refuse('MIGRATION_UNTERMINATED_DOLLAR_QUOTE');
      index = end + delimiter.length;
      visible += ' ';
    } else {
      if (sql[index] === '\\') refuse('MIGRATION_PSQL_CONTROL_REFUSED');
      visible += sql[index++];
    }
  }
  for (const statement of visible.split(';')) {
    if (/^\s*(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|ROLLBACK\b|END\b|ABORT\b|PREPARE\s+TRANSACTION\b)/i.test(statement) || /\bCOPY\b[\s\S]*\bFROM\s+STDIN\b/i.test(statement)) {
      refuse('MIGRATION_TRANSACTION_CONTROL_REFUSED');
    }
  }
}

export function freezeCandidate(entries, manifest) {
  if (!Array.isArray(entries) || !entries.length || !Array.isArray(manifest.files) || entries.length !== manifest.files.length) refuse('MIGRATION_FILE_LIST_REFUSED');
  const names = new Set();
  const fragments = entries.map((entry, index) => {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(entry.name) || names.has(entry.name) || entry.name !== manifest.files[index].name || !Buffer.isBuffer(entry.bytes) || sha(entry.bytes) !== manifest.files[index].sha256) refuse('MIGRATION_FILE_BYTES_REFUSED');
    names.add(entry.name);
    const sql = entry.bytes.toString('utf8');
    assertTransactionalSql(sql);
    return `-- ${entry.name}\n${sql}`;
  });
  const sql = fragments.join('\n');
  if (sha(sql) !== manifest.sha256) refuse('MIGRATION_ENVELOPE_REFUSED');
  return Object.freeze({ sql, sha256: manifest.sha256, files: entries.length });
}

// The caller must record the direct human answer. This function never creates approval.
export function authorizeReleaseApproval(approval, expected, now = Date.now()) {
  if (!approval || approval.authorized !== true || !['approve', 'approved', '授權'].includes(approval.humanReply?.trim().toLowerCase()) || !Number.isFinite(Date.parse(approval.acceptedAt)) || Date.parse(approval.acceptedAt) > now + 1000) refuse('MIGRATION_HUMAN_APPROVAL_REQUIRED');
  for (const key of ['head', 'project', 'scope', 'sha256', 'questionId']) {
    if (!expected[key] || approval[key] !== expected[key]) refuse('MIGRATION_APPROVAL_SCOPE_REFUSED');
  }
}

export function authorizeRecoveryEvidence(evidence, expected, now = Date.now()) {
  const backup = evidence?.backup, restoration = evidence?.restoration, rehearsal = evidence?.rehearsal;
  const age = now - Date.parse(backup?.observedAt);
  if (!evidence || ['head', 'project', 'sha256'].some(key => evidence[key] !== expected[key]) || !Number.isFinite(age) || age < -1000 || age > 3600000 || !backup?.id || backup.result !== 'PASS_CONSISTENT_DATABASE_EXPORT' || backup.filesVerified !== true || restoration?.backupId !== backup.id || restoration.result !== 'PASS_DATABASE_LOGICAL_RESTORE' || !restoration.checks?.length || restoration.checks.some(check => check.result !== 'PASS') || rehearsal?.backupId !== backup.id || rehearsal.result !== 'PASS_FAILURE_COMMIT_POSTCHECK_NO_REPLAY' || !digest(rehearsal.baselineCatalog) || !digest(rehearsal.committedCatalog) || rehearsal.baselineCatalog === rehearsal.committedCatalog) refuse('MIGRATION_FRESH_RECOVERY_EVIDENCE_REQUIRED');
}

export function assertCatalogPreflight(observation, expectedCatalog, now = Date.now()) {
  const age = now - Date.parse(observation?.observedAt);
  if (!digest(expectedCatalog) || observation?.catalog !== expectedCatalog || observation.readOnly !== true || !Number.isFinite(age) || age < -1000 || age > 300000) refuse('MIGRATION_CURRENT_CATALOG_REFUSED');
}

export function claimExecution(file, receipt) {
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
}

export function buildMigrationTransaction(candidate, { catalogQuery, baseline, committed, acknowledgment }) {
  if (sha(candidate.sql) !== candidate.sha256 || !digest(baseline) || !digest(committed) || baseline === committed || !/^KINNSO_COMMIT_ACK_[A-Za-z0-9_]+$/.test(acknowledgment) || !/^\s*(?:WITH\b|SELECT\b)/i.test(catalogQuery) || catalogQuery.includes(';')) refuse('MIGRATION_TRANSACTION_ARGUMENTS_REFUSED');
  assertTransactionalSql(candidate.sql);
  const check = (catalog, message) => `DO $kinnso_release_check$ BEGIN IF (${catalogQuery}) IS DISTINCT FROM '${catalog}' THEN RAISE EXCEPTION '${message}'; END IF; END $kinnso_release_check$;`;
  return `BEGIN;\nSET LOCAL ROLE postgres;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='2000ms';\nSET LOCAL statement_timeout='120000ms';\nSELECT pg_advisory_xact_lock(1885432935, 25);\n${check(baseline, 'MIGRATION_BASELINE_CHANGED')}\n${candidate.sql}\n${check(committed, 'MIGRATION_POSTCHECK_FAILED')}\nCOMMIT;\n\\echo ${acknowledgment}\n`;
}

export function classifyClientOutcome(result, acknowledgment) {
  if (result.status === 0 && !result.signal && /^COMMIT\s*$/m.test(result.stdout ?? '') && String(result.stdout).split(/\r?\n/).includes(acknowledgment)) return 'CLIENT_CONFIRMED_COMMIT_PENDING_READONLY_VERIFICATION';
  return 'UNKNOWN_OUTCOME_RECONCILE_READONLY_NO_REPLAY';
}
