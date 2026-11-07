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

const read = file => readFile(new URL(file, import.meta.url), 'utf8');

test('the locale page admits only the canonical participant path and maps the pilot flag', async () => {
  const page = await read('../app/[locale]/[[...route]]/page.tsx');
  assert.match(page, /\["en", "zh-HK"\]\.includes\(locale\)/);
  assert.match(page, /!isKnownRoute\(path\) && !\(!demo && path === "pilot"\)/);
  assert.match(page, /notFound\(\);\s*const actor=demo/);
  assert.equal([...page.matchAll(/pilot:capabilities\(process.env\)\.pilot\.mode==='connected'/g)].length, 2);
});

test('participant route renders the gated workspace without adding public navigation', async () => {
  const workbench = await read('../app/travel/Workbench.tsx');
  const pilot = await read('../app/travel/pilot/PilotWorkspace.tsx');
  assert.match(workbench, /path==='pilot'\)content=<PilotWorkspace actorId=\{workspaceActor\?\.id\?\?null\} enabled=\{features.pilot===true\}/);
  assert.match(pilot, /!enabled \? <p role="status">.*Pilot participation is unavailable/);
  assert.doesNotMatch(workbench, /href[=(][^\n]*(?:['"`]pilot['"`]|view=pilot)/);
});

test('only the exact ops page delegates the pilot query to the control room with both gates', async () => {
  const workbench = await read('../app/travel/Workbench.tsx');
  const ops = await read('../app/travel/OpsWorkspace.tsx');
  assert.match(workbench, /pilotEnabled=\{path==='ops'&&features.pilot===true\} allowPilotView=\{path==='ops'\}/);
  assert.match(ops, /pilotView=allowPilotView&&view==='pilot'/);
  assert.match(ops, /if\(pilotView\)return <PilotControlRoom .*enabled=\{enabled&&pilotEnabled\}/);
  assert.match(ops, /pilotEnabled&&page&&<Link[^\n]+view=pilot/);
});
