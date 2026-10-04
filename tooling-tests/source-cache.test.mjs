import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('a real Turbo cache hit restores the corresponding-source download with the Next build', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kinnso-source-cache-'));
  try {
    const app = path.join(root, 'apps', 'journeys');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'cache-check', private: true, packageManager: 'pnpm@11.6.0' }));
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: ["apps/*"]\n');
    writeFileSync(path.join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/journeys: {}\n");
    writeFileSync(path.join(root, '.gitignore'), '.next/\n.turbo/\npublic/source/\n');
    writeFileSync(path.join(root, 'turbo.json'), readFileSync(new URL('../turbo.json', import.meta.url)));
    writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: '@kinnso/journeys', scripts: { build: 'node build.mjs' } }));
    writeFileSync(path.join(app, 'build.mjs'), "import {mkdirSync,writeFileSync} from 'node:fs'; mkdirSync('.next',{recursive:true}); mkdirSync('public/source',{recursive:true}); writeFileSync('.next/server.txt','built'); writeFileSync('public/source/kinnsoos-source.zip','synthetic corresponding source');\n");
    const cli = fileURLToPath(new URL('../node_modules/turbo/bin/turbo', import.meta.url));
    const run = () => execFileSync(process.execPath, [cli, 'run', 'build', '--cache=local:rw'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    run();
    const zip = path.join(app, 'public/source/kinnsoos-source.zip');
    unlinkSync(zip);
    unlinkSync(path.join(app, '.next/server.txt'));
    const restored = run();
    assert.match(restored, /cache hit/);
    assert.equal(readFileSync(zip, 'utf8'), 'synthetic corresponding source');
    assert.equal(readFileSync(path.join(app, '.next/server.txt'), 'utf8'), 'built');
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('kinnso-source-cache-'));
    rmSync(root, { recursive: true, force: true });
  }
});
