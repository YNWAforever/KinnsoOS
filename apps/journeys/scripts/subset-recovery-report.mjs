// Offline preparation only: hashes verify artifact bytes, not DB restore or authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolveCandidateRevision} from './pilot-preparation.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const shape = (x, names) => object(x) && Object.keys(x).length === names.length && names.every(k => Object.hasOwn(x, k));
const ref = x => typeof x === 'string' && /^(private|owned-ci):[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(x);
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const fields = ['version', 'sourceRevision', 'scope', 'target', 'ownerRef', 'backupOwnerRef', 'serviceObjective', 'rpoMinutes', 'rtoMinutes', 'artifacts', 'timing', 'readback'];
const initial = () => ({status: 'BLOCKED_INPUTS', evidenceLevel: 'LOCAL_ARTIFACT_INTEGRITY_ONLY', measurementLevel: 'DECLARED_TIMING_ARITHMETIC_ONLY',
  artifactsChecked: 0, declaredSubsetRpoMs: null, declaredSubsetRtoMs: null, rpoMinutes: null, rtoMinutes: null,
  runtimeStatus: 'NOT_RUN', fullRestoreStatus: 'NOT_RUN', sharedRemixStatus: 'BLOCKED', authorizedActions: [],
  notCovered: ['database restore correctness', 'Storage restore', 'Auth/session/roles', 'OAuth/SMTP/providers', 'keyring/secrets', 'production recovery'],
});

function artifactFile(root, relative, maxBytes) {
  if (typeof relative !== 'string' || !relative || relative.length > 240 || /[\\:\x00]/.test(relative)) throw Error();
  const parts = relative.split('/');
  if (parts.some(p => !p || p.startsWith('.') || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p))) throw Error();
  const absoluteRoot = path.resolve(root), canonicalRoot = fs.realpathSync(absoluteRoot);
  const ancestors = [{file: absoluteRoot, stat: fs.lstatSync(absoluteRoot)}];
  if (ancestors[0].stat.isSymbolicLink() || !ancestors[0].stat.isDirectory()) throw Error();
  let file = absoluteRoot;
  for (const part of parts) {
    file = path.join(file, part); const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error();
    ancestors.push({file, stat});
  }
  const canonicalFile = fs.realpathSync(file), relativeReal = path.relative(canonicalRoot, canonicalFile);
  if (!relativeReal || relativeReal.startsWith('..') || path.isAbsolute(relativeReal)) throw Error();
  const before = ancestors.at(-1).stat;
  if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) throw Error();
  const verifyPath = opened => {
    if (fs.realpathSync(absoluteRoot) !== canonicalRoot || fs.realpathSync(file) !== canonicalFile) throw Error();
    for (const item of ancestors) {
      const current = fs.lstatSync(item.file);
      if (current.isSymbolicLink() || current.ino !== item.stat.ino || current.dev !== item.stat.dev) throw Error();
    }
    const current = fs.lstatSync(file);
    if (!current.isFile() || current.nlink !== 1 || current.ino !== opened.ino || current.dev !== opened.dev) throw Error();
  };
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || before.ino !== opened.ino || before.dev !== opened.dev || opened.nlink !== 1 || opened.size > maxBytes) throw Error();
    verifyPath(opened);
    // One overflow byte detects growth without ever loading the enlarged file.
    const buffer = Buffer.allocUnsafe(opened.size + 1); let count = 0;
    while (count < buffer.length) {
      const n = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (n === 0) break;
      count += n;
    }
    if (count !== opened.size || count > maxBytes) throw Error();
    const bytes = buffer.subarray(0, count), after = fs.fstatSync(fd);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.nlink !== 1) throw Error();
    verifyPath(opened);
    return bytes;
  } finally { fs.closeSync(fd); }
}

function utc(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)) return NaN;
  const n = Date.parse(x); return Number.isFinite(n) && new Date(n).toISOString() === x ? n : NaN;
}

export function assessSubsetRecovery(packet, {root, sourceRevision} = {}) {
  const r = {...initial(), sourceRevision: sha(sourceRevision) ? sourceRevision : null}, p = packet;
  if (!shape(p, fields) || p.version !== 1 || !sha(sourceRevision) || p.sourceRevision !== sourceRevision || p.scope !== 'SYNTHETIC_SUBSET_ONLY') return r;
  if (!shape(p.target, ['kind', 'projectRef', 'unlinked', 'identityRef', 'ownershipRef']) || p.target.kind !== 'owned_local' || p.target.unlinked !== true ||
    typeof p.target.projectRef !== 'string' || !/^kinnsoos-rehearsal-[a-f0-9]{12}$/.test(p.target.projectRef) || !ref(p.target.identityRef) || !ref(p.target.ownershipRef)) return r;
  if (!ref(p.ownerRef) || !ref(p.backupOwnerRef) || p.ownerRef === p.backupOwnerRef || p.serviceObjective !== 'NOT_PROMISED' || p.rpoMinutes !== null || p.rtoMinutes !== null) return r;
  if (!shape(p.readback, ['status', 'evidenceRef']) || !['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED'].includes(p.readback.status) || !ref(p.readback.evidenceRef)) return r;
  try {
    if (!Array.isArray(p.artifacts) || p.artifacts.length < 1 || p.artifacts.length > 64 || typeof root !== 'string') throw Error();
    const names = new Set(); let size = 0, database = false;
    for (const a of p.artifacts) {
      if (!shape(a, ['path', 'kind', 'bytes', 'sha256']) || !['database_subset', 'storage_bytes'].includes(a.kind) ||
        !Number.isSafeInteger(a.bytes) || a.bytes < 0 || a.bytes > 16 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(a.sha256 ?? '') || typeof a.path !== 'string') throw Error();
      const key = a.path.toLowerCase();
      if (names.has(key) || (size += a.bytes) > 32 * 1024 * 1024) throw Error();
      names.add(key); database ||= a.kind === 'database_subset';
    }
    if (!database) throw Error();
    for (const a of p.artifacts) {
      const bytes = artifactFile(root, a.path, 16 * 1024 * 1024);
      if (bytes.length !== a.bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw Error();
    }
    r.artifactsChecked = p.artifacts.length;
  } catch { return {...r, status: 'BLOCKED_ARTIFACTS'}; }
  r.readbackStatus = p.readback.status;
  if (p.readback.status !== 'PASS') return {...r, status: `READBACK_${p.readback.status}`};
  if (!shape(p.timing, ['snapshotAt', 'faultAt', 'declaredAt', 'readbackAt'])) return {...r, status: 'BLOCKED_TIMING'};
  const [snapshot, fault, declared, readback] = ['snapshotAt', 'faultAt', 'declaredAt', 'readbackAt'].map(k => utc(p.timing[k]));
  if (![snapshot, fault, declared, readback].every(Number.isFinite) || snapshot > fault || fault > declared || declared > readback) return {...r, status: 'BLOCKED_TIMING'};
  return {...r, status: 'REVIEWABLE_NOT_EXECUTABLE', declaredSubsetRpoMs: fault - snapshot, declaredSubsetRtoMs: readback - declared};
}

async function main(args) {
  try {
    if (args.length !== 4 || args[0] !== '--root' || args[2] !== '--packet') throw Error();
    const bytes = artifactFile(args[1], args[3], 262144);
    const packet = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    const report = assessSubsetRecovery(packet, {root: args[1], sourceRevision: await resolveCandidateRevision()});
    console.log(JSON.stringify(report)); process.exitCode = report.status === 'REVIEWABLE_NOT_EXECUTABLE' ? 0 : 2;
  } catch { console.log(JSON.stringify({...initial(), status: 'INVALID_PACKET'})); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
