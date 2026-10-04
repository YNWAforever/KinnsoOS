import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const config = new URL('../apps/journeys/next.config.ts', import.meta.url).href;
function resolveRoot(cwd) {
  return execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
    `const {default:c}=await import(${JSON.stringify(config)}); process.stdout.write(c.turbopack.root);`],
    { cwd, encoding: 'utf8' });
}

test('a distributed archive nested in another pnpm checkout traces only its own application', () => {
  const outer = mkdtempSync(path.join(tmpdir(), 'kinnso-source-root-'));
  try {
    writeFileSync(path.join(outer, 'pnpm-workspace.yaml'), 'packages: ["apps/*"]\n');
    const extracted = path.join(outer, '.local-private', 'archive');
    mkdirSync(extracted, { recursive: true });
    writeFileSync(path.join(extracted, 'SOURCE_METADATA.json'), '{}');
    assert.equal(resolveRoot(extracted), extracted);
  } finally {
    assert.equal(path.dirname(outer), path.resolve(tmpdir()));
    assert.ok(path.basename(outer).startsWith('kinnso-source-root-'));
    rmSync(outer, { recursive: true, force: true });
  }
});
