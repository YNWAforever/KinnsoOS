import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function connectedSource(app) {
  const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--untracked-files=normal')) throw Error('Connected build requires a clean worktree');
  return { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
}

export function connectedArtifact(app) {
  const source = connectedSource(app);
  const buildId = readFileSync(join(app, '.next/BUILD_ID'), 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(source.head) || !/^[0-9a-f]{40}$/.test(source.tree) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(buildId)) throw Error('Invalid connected build identity');
  return { ...source, buildId };
}

export function verifiedConnectedArtifact(app) {
  const actual = connectedArtifact(app);
  const expected = JSON.parse(readFileSync(join(app, '.next/connected-build.json'), 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('Connected build manifest does not match HEAD/tree/BUILD_ID');
  return actual;
}
