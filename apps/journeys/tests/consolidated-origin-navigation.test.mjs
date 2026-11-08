import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files = [
  '../app/integration/WorkspacePanel.tsx',
  '../app/integration/CatalogPanel.tsx',
  '../app/travel/connected.tsx',
  '../app/travel/Workbench.tsx',
  '../app/travel/OpsWorkspace.tsx',
  '../app/travel/pilot/PilotWorkspace.tsx',
  '../app/travel/pilot/PilotControlRoom.tsx',
];

test('creator, merchant and operations navigation never sends users to the retired application host', async () => {
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /remix-kinnso-web\.vercel\.app/, file);
  }
});
