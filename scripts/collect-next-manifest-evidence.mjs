import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixed global manifest paths only: never enumerate route names, trace files,
// environment files, source maps or manifest contents into an artifact.
const names = [
  'routes-manifest.json', 'build-manifest.json', 'app-build-manifest.json',
  'app-path-routes-manifest.json', 'prerender-manifest.json', 'required-server-files.json',
  'server/app-paths-manifest.json', 'server/pages-manifest.json',
  'server/server-reference-manifest.json', 'server/middleware-manifest.json',
  'server/next-font-manifest.json', 'server/functions-config-manifest.json',
];
const paths = [...names, ...names.map((name) => `dev/${name}`)];
const maxBytes = 2 * 1024 * 1024;

function inspect(root, path) {
  const parts = ['apps', 'web', '.next', ...path.split('/')];
  let current = root;
  try {
    for (const part of parts) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) return { path, status: 'UNSAFE_PATH' };
    }
    const expected = lstatSync(current);
    if (!expected.isFile()) return { path, status: 'NOT_REGULAR_FILE' };
    const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile()) return { path, status: 'NOT_REGULAR_FILE' };
      if (before.dev !== expected.dev || before.ino !== expected.ino) return { path, status: 'CHANGED_DURING_READ' };
      if (before.size > maxBytes) return { path, status: 'TOO_LARGE' };
      const buffer = Buffer.alloc(maxBytes + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = readSync(fd, buffer, count, buffer.length - count, null);
        if (read === 0) break;
        count += read;
      }
      const bytes = buffer.subarray(0, count);
      const after = fstatSync(fd);
      if (bytes.length > maxBytes || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        return { path, status: 'CHANGED_DURING_READ' };
      }
      const metadata = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      try {
        JSON.parse(bytes.toString('utf8'));
        return { ...metadata, status: 'VALID_JSON' };
      } catch {
        // JSON.parse error messages can contain the offending private value.
        return { ...metadata, status: 'INVALID_JSON' };
      }
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    return { path, status: error.code === 'ENOENT' ? 'MISSING' : 'READ_ERROR' };
  }
}

function main() {
  const args = process.argv.slice(2);
  const phase = args[1];
  const outcome = args[3];
  if (args.length !== 4 || args[0] !== '--phase' || args[2] !== '--outcome'
    || !['booking-off', 'profile-enquiries', 'booking-on'].includes(phase)
    || !['success', 'failure', 'skipped', 'cancelled'].includes(outcome)) throw new Error('arguments');
  const root = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const workingTreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
  const { GITHUB_SHA: workflowSourceSha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt } = process.env;
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true'
    || !/^[a-f0-9]{40}$/.test(sourceSha) || sourceSha !== workflowSourceSha
    || !/^[1-9][0-9]*$/.test(runId ?? '') || !/^[1-9][0-9]*$/.test(runAttempt ?? '')) throw new Error('binding');
  const ran = outcome === 'success' || outcome === 'failure';
  const manifests = ran ? paths.map((path) => inspect(root, path)) : [];
  const statuses = manifests.map((m) => m.status);
  const snapshotStatus = !ran ? 'NOT_RUN'
    : statuses.includes('INVALID_JSON') ? 'INVALID_JSON_OBSERVED'
      : statuses.every((s) => s === 'MISSING') ? 'NO_MANIFESTS_OBSERVED'
        : statuses.some((s) => !['MISSING', 'VALID_JSON'].includes(s)) ? 'INCOMPLETE_SNAPSHOT'
          : 'JSON_PARSED_FOR_OBSERVED_FILES';
  const report = {
    schemaVersion: 1, scope: 'POST_SUITE_NEXT_MANIFEST_SNAPSHOT', sourceSha,
    workflowSourceSha, workingTreeDirty, runId, runAttempt, phase, suiteOutcome: outcome,
    snapshotStatus, manifests,
    runtimeAcceptance: 'NOT_RUN_DIAGNOSTIC_ONLY',
    limitation: 'After Playwright exits; transient writes may be missed. JSON validity does not prove browser, Auth, DB or runtime acceptance.',
  };
  const directory = join(root, 'evidence');
  try {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('output');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    mkdirSync(directory);
  }
  writeFileSync(join(directory, `next-manifests-${phase}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Collected ${phase} manifest metadata: ${snapshotStatus}`);
}

try {
  main();
} catch {
  console.error('Next manifest evidence collection failed; no raw error or manifest contents emitted.');
  process.exitCode = 1;
}
