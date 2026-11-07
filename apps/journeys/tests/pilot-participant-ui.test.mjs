import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('participant workspace and intake compile as a client entry', async () => {
  const result = await build({
    entryPoints: ['./app/travel/pilot/PilotWorkspace.tsx'],
    bundle: true, packages: 'external', write: false, format: 'esm',
  });
  assert.match(result.outputFiles[0].text, /PilotWorkspace as PilotWorkspace|export\s*\{\s*PilotWorkspace/);
});
